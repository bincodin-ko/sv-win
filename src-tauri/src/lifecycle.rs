// A9 종료: 창 닫기를 가로채 프론트에 묻고(S-230), 확정되면 모든 PTY 를 끝내고 앱을 끈다(S-231).
use crate::pty::PtyManager;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{Emitter, State};

/// 창 닫기(X·Alt+F4)를 막고 프론트에 "quit-requested" 를 보낸다.
/// ponytail: 프론트가 죽어 있으면 창을 못 닫는다(작업 관리자로 끔) — 필요해지면 응답 시간 제한을 둔다.
pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.emit("quit-requested", ());
    }
}

/// 프론트가 확정한 종료(보드 저장 뒤): 모든 PTY 에 kill 절차(S-105)를 하고 끝나길 최대 2.5초 기다린 뒤 앱 종료.
/// 그래도 남은 것은 Job Object(KILL_ON_JOB_CLOSE, S-232)가 앱이 끝날 때 정리한다.
#[tauri::command]
pub fn app_quit(app: tauri::AppHandle, state: State<'_, PtyManager>) {
    let flags = state.kill_all();
    std::thread::spawn(move || {
        let t = Instant::now();
        while t.elapsed() < Duration::from_millis(2500) && !flags.iter().all(|f| f.load(Ordering::SeqCst)) {
            std::thread::sleep(Duration::from_millis(25));
        }
        app.exit(0);
    });
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    #[test]
    fn job_kills_children() {
        // S-232: 시험 안에서 별도 Job(KILL_ON_JOB_CLOSE)을 만들어 자식을 넣고 job 을 닫으면 자식이 끝난다. 앱 자신은 넣지 않는다.
        use std::os::windows::io::AsRawHandle;
        use std::process::{Command, Stdio};
        use std::time::{Duration, Instant};
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::JobObjects::*;
        let mut child = Command::new("cmd").args(["/c", "ping", "-n", "60", "127.0.0.1"]).stdout(Stdio::null()).spawn().unwrap();
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            assert!(!job.is_null());
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_BREAKAWAY_OK;
            let ok = SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info as *const _ as *const _, std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32);
            assert_ne!(ok, 0);
            assert_ne!(AssignProcessToJobObject(job, child.as_raw_handle() as _), 0, "자식을 job 에 넣지 못함");
            std::thread::sleep(Duration::from_millis(300));
            assert!(child.try_wait().unwrap().is_none(), "job 을 닫기 전에는 살아 있어야 함");
            CloseHandle(job);
        }
        let t = Instant::now();
        while t.elapsed() < Duration::from_secs(5) {
            if child.try_wait().unwrap().is_some() {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let _ = child.kill();
        panic!("job 을 닫았는데 5초 안에 자식이 안 끝남");
    }
}
