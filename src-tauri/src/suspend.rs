//! S-620~S-623 일시 중지: 콘솔의 프로세스 트리를 PID 로만 찾아 NtSuspendProcess / NtResumeProcess.
//! 열기 직전 시작 시각을 맞춰 보아, PID 가 재사용돼 다른 프로세스가 되었으면 건드리지 않는다.

/// (PID, 시작 시각 FILETIME)
pub type Entry = (u32, u64);

#[cfg(windows)]
mod imp {
    use super::Entry;
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, HANDLE, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, TerminateProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SUSPEND_RESUME,
        PROCESS_TERMINATE,
    };

    #[link(name = "ntdll")]
    extern "system" {
        fn NtSuspendProcess(h: HANDLE) -> i32;
        fn NtResumeProcess(h: HANDLE) -> i32;
    }

    /// 열린 핸들의 시작 시각(FILETIME)
    unsafe fn start_of(h: HANDLE) -> Option<u64> {
        let z = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
        let (mut c, mut e, mut k, mut u) = (z, z, z, z);
        if GetProcessTimes(h, &mut c, &mut e, &mut k, &mut u) == 0 || e.dwHighDateTime != 0 || e.dwLowDateTime != 0 {
            return None; // 실패했거나 종료 시각이 있으면 이미 끝난 프로세스(핸들만 남은 것)
        }
        Some(((c.dwHighDateTime as u64) << 32) | c.dwLowDateTime as u64)
    }

    fn start_time(pid: u32) -> Option<u64> {
        // SAFETY: 핸들은 이 함수 안에서 열고 닫는다
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h.is_null() {
                return None;
            }
            let t = start_of(h);
            CloseHandle(h);
            t
        }
    }

    /// 모든 프로세스의 (PID, 부모 PID) 스냅샷
    fn parents() -> Vec<(u32, u32)> {
        let mut v = Vec::new();
        // SAFETY: PROCESSENTRY32W 는 dwSize 만 채우면 된다
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE {
                return v;
            }
            let mut e: PROCESSENTRY32W = std::mem::zeroed();
            e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut ok = Process32FirstW(snap, &mut e);
            while ok != 0 {
                v.push((e.th32ProcessID, e.th32ParentProcessID));
                ok = Process32NextW(snap, &mut e);
            }
            CloseHandle(snap);
        }
        v
    }

    pub fn tree(root: u32) -> Vec<Entry> {
        let Some(t0) = start_time(root) else { return Vec::new() };
        let all = parents();
        let mut out: Vec<Entry> = vec![(root, t0)];
        let mut i = 0;
        while i < out.len() {
            let (pid, pt) = out[i];
            i += 1;
            for &(c, pp) in &all {
                if pp != pid || out.iter().any(|e| e.0 == c) {
                    continue;
                }
                // 부모보다 먼저 태어난 "자식"은 PID 가 재사용된 가짜 부모 관계
                if let Some(ct) = start_time(c).filter(|&ct| ct >= pt) {
                    out.push((c, ct));
                }
            }
        }
        out
    }

    fn apply(list: &[Entry], f: unsafe extern "system" fn(HANDLE) -> i32) -> usize {
        let mut n = 0;
        for &(pid, t) in list {
            // SAFETY: 열기 직전 PID 의 시작 시각을 맞춰 보고(S-623), 핸들은 바로 닫는다
            unsafe {
                let h = OpenProcess(PROCESS_SUSPEND_RESUME | PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                if h.is_null() {
                    continue;
                }
                if start_of(h) == Some(t) && f(h) >= 0 {
                    n += 1;
                }
                CloseHandle(h);
            }
        }
        n
    }

    pub fn suspend_list(list: &[Entry]) -> usize {
        apply(list, NtSuspendProcess)
    }
    pub fn resume_list(list: &[Entry]) -> usize {
        apply(list, NtResumeProcess)
    }

    /// S-105: 목록의 프로세스를 강제 종료한다. 시작 시각이 다른 PID 는 건드리지 않는다
    pub fn kill_list(list: &[Entry]) -> usize {
        let mut n = 0;
        for &(pid, t) in list {
            // SAFETY: apply 와 같다 — 열기 직전 시작 시각을 맞춰 보고 핸들은 바로 닫는다
            unsafe {
                let h = OpenProcess(PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                if h.is_null() {
                    continue;
                }
                if start_of(h) == Some(t) && TerminateProcess(h, 1) != 0 {
                    n += 1;
                }
                CloseHandle(h);
            }
        }
        n
    }
}

#[cfg(windows)]
pub use imp::{kill_list, resume_list, suspend_list, tree};

// Windows 가 아니면 멈출 수 없다
#[cfg(not(windows))]
pub fn tree(_root: u32) -> Vec<Entry> {
    Vec::new() // 빈 구현
}
#[cfg(not(windows))]
pub fn suspend_list(_list: &[Entry]) -> usize {
    0 // 빈 구현
}
#[cfg(not(windows))]
pub fn resume_list(_list: &[Entry]) -> usize {
    0 // 빈 구현
}
#[cfg(not(windows))]
pub fn kill_list(_list: &[Entry]) -> usize {
    0 // 빈 구현
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use crate::pty::{DataFn, ExitFn, PtyManager};
    use std::sync::{mpsc, Arc, Mutex};
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME};
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, TerminateProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
    };

    fn ft(f: FILETIME) -> u64 {
        ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64
    }

    /// (시작 시각, 커널+사용자 CPU 시간) 100ns 단위. 없는 PID 면 None
    fn times(pid: u32) -> Option<(u64, u64)> {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h.is_null() {
                return None;
            }
            let z = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
            let (mut c, mut e, mut k, mut u) = (z, z, z, z);
            let ok = GetProcessTimes(h, &mut c, &mut e, &mut k, &mut u);
            CloseHandle(h);
            (ok != 0).then(|| (ft(c), ft(k) + ft(u)))
        }
    }

    fn terminate(pid: u32) {
        unsafe {
            let h = OpenProcess(PROCESS_TERMINATE, 0, pid);
            if !h.is_null() {
                TerminateProcess(h, 1);
                CloseHandle(h);
            }
        }
    }

    type Spawned = (u32, Arc<Mutex<Vec<u8>>>, mpsc::Receiver<Option<u32>>);

    /// ConPTY 는 커서 위치 질문(ESC[6n)에 답이 올 때까지 자식을 멈춘다. 앱에서는 xterm.js 가 답하므로 시험에서는 여기서 답한다.
    fn spawn(m: &Arc<PtyManager>, program: &str, args: &[&str]) -> Spawned {
        let buf = Arc::new(Mutex::new(Vec::new()));
        let b2 = buf.clone();
        let (tx, rx) = mpsc::channel();
        let (dsr_tx, dsr_rx) = mpsc::channel::<()>();
        let on_data: DataFn = Box::new(move |c: Vec<u8>| {
            if c.windows(4).any(|w| w == b"[6n") {
                let _ = dsr_tx.send(());
            }
            b2.lock().unwrap().extend(c);
        });
        let on_exit: ExitFn = Box::new(move |code| {
            let _ = tx.send(code);
        });
        let a: Vec<String> = args.iter().map(|s| s.to_string()).collect();
        let id = m.spawn(program, &a, &[], None, 200, 50, on_data, on_exit).unwrap();
        let m2 = m.clone();
        std::thread::spawn(move || {
            if dsr_rx.recv_timeout(Duration::from_secs(5)).is_ok() {
                let _ = m2.write(id, b"\x1b[1;1R");
            }
        });
        (id, buf, rx)
    }

    fn wait_until(secs: u64, mut f: impl FnMut() -> bool) -> bool {
        let t = Instant::now();
        while t.elapsed() < Duration::from_secs(secs) {
            if f() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        false
    }

    const BURN: &str = "$i=0; while($true){ $i++; if($i % 100000 -eq 0){ 'tick' } }";

    #[test]
    fn pause_stops_cpu_and_output_of_whole_tree_resume_continues() {
        let m = Arc::new(PtyManager::default());
        // cmd(루트) → powershell(자손): CPU 를 태우며 tick 을 계속 출력
        let (id, buf, rx) = spawn(&m, "cmd.exe", &["/c", "powershell", "-NoProfile", "-Command", BURN]);
        // 단언이 실패해도(패닉) 시험이 띄운 트리를 끈다. 실측 2026-10-24: 실패한 실행이 tick 루프 3개를 8시간 남겨 CPU 를 먹음
        struct Cleanup(Arc<PtyManager>, u32);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                if let Some(root) = self.0.pid(self.1) {
                    for e in tree(root) {
                        terminate(e.0);
                    }
                }
                let _ = self.0.kill(self.1);
            }
        }
        let _cleanup = Cleanup(m.clone(), id);
        let ticks = |b: &Arc<Mutex<Vec<u8>>>| String::from_utf8_lossy(&b.lock().unwrap()).matches("tick").count();
        // 부하 중엔 powershell 기동이 20초를 넘기도 한다(B11)
        assert!(wait_until(60, || ticks(&buf) >= 2), "자손이 출력을 안 냄: {:?}", String::from_utf8_lossy(&buf.lock().unwrap()));
        let root = m.pid(id).expect("루트 PID");
        let all = tree(root);
        assert!(all.len() >= 2, "자손까지 잡혀야 함: {all:?}");
        assert_eq!(all[0].0, root);

        m.pause(id).unwrap();
        // 이미 나가던 출력(멈추지 않는 conhost 가 그리던 것)이 빌 때까지: 0.5초 동안 그대로면 빈 것. 부하 중엔 고정 0.6초로 모자란다
        let mut last = (ticks(&buf), Instant::now());
        wait_until(10, || {
            let n = ticks(&buf);
            if n != last.0 {
                last = (n, Instant::now());
            }
            last.1.elapsed() >= Duration::from_millis(500)
        });
        let cpu0: Vec<u64> = all.iter().map(|e| times(e.0).unwrap().1).collect();
        let n0 = ticks(&buf);
        std::thread::sleep(Duration::from_millis(1500));
        let cpu1: Vec<u64> = all.iter().map(|e| times(e.0).unwrap().1).collect();
        assert_eq!(ticks(&buf), n0, "멈춘 동안 출력이 늘었다");
        for (i, (a, b)) in cpu0.iter().zip(&cpu1).enumerate() {
            assert!(b - a < 500_000, "멈춘 동안 {}번째(PID {}) CPU 가 {}x100ns 늘었다", i, all[i].0, b - a); // 50ms 미만
        }

        m.resume(id).unwrap();
        assert!(wait_until(30, || ticks(&buf) > n0 + 1), "재개 뒤 출력이 안 나온다");
        // 첫 tick 직후 바로 재면 부하 중엔 CPU 를 아직 100ms 못 받았을 수 있다 → 늘어날 때까지 기다린다
        let last_pid = all.last().unwrap().0;
        let cpu_after = || times(last_pid).unwrap().1 - cpu1.last().unwrap();
        assert!(wait_until(30, || cpu_after() > 1_000_000), "재개 뒤 자손 CPU 가 안 늘었다: {}x100ns", cpu_after()); // 100ms 초과

        // 정리: 시험이 띄운 PID 만
        m.kill(id).unwrap();
        for e in &all {
            terminate(e.0);
        }
        let _ = rx.recv_timeout(Duration::from_secs(5));
    }

    #[test]
    fn kill_list_ends_whole_tree_and_skips_reused_pid() {
        // S-105: cmd(루트) → ping(자손). 목록 전체를 끝내되 시작 시각이 다른 PID 는 건드리지 않는다
        let mut c = std::process::Command::new("cmd")
            .args(["/c", "ping", "-n", "60", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let root = c.id();
        assert!(wait_until(10, || tree(root).len() >= 2), "자손이 안 잡힘: {:?}", tree(root));
        let all = tree(root);
        let stale: Vec<Entry> = all.iter().map(|e| (e.0, e.1 + 1)).collect();
        assert_eq!(kill_list(&stale), 0, "시작 시각이 다르면 건너뛰어야 함");
        assert!(times(all[1].0).is_some());
        assert_eq!(kill_list(&all), all.len());
        assert!(wait_until(5, || all.iter().all(|e| tree(e.0).is_empty())), "트리가 안 끝남: {all:?}");
        let _ = c.wait();
    }

    #[test]
    fn finished_pid_is_ignored_without_error() {
        let mut c = std::process::Command::new("cmd").args(["/c", "exit"]).spawn().unwrap();
        let pid = c.id();
        c.wait().unwrap();
        assert!(tree(pid).is_empty(), "끝난 PID 의 트리는 비어야 함");
        assert_eq!(suspend_list(&[(pid, 1)]), 0);
        assert_eq!(resume_list(&[(pid, 1)]), 0);
    }

    #[test]
    fn pid_with_different_start_time_is_not_touched() {
        // PID 가 재사용돼 다른 프로세스가 된 경우를 흉내: 시작 시각이 다른 목록은 건드리지 않는다
        let mut c = std::process::Command::new("cmd")
            .args(["/c", "ping", "-n", "30", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let pid = c.id();
        assert!(wait_until(5, || times(pid).is_some()));
        let start = times(pid).unwrap().0;
        assert_eq!(suspend_list(&[(pid, start + 1)]), 0, "시작 시각이 다르면 건너뛰어야 함");
        assert_eq!(suspend_list(&[(pid, start)]), 1);
        assert_eq!(resume_list(&[(pid, start + 1)]), 0);
        assert_eq!(resume_list(&[(pid, start)]), 1);
        let _ = c.kill();
        let _ = c.wait();
    }
}
