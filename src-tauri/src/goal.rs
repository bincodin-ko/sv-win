// D3 loop 목표 명령 (S-1412·S-1419): repo 폴더에서 셸 명령을 실행해 종료 코드 0이면 달성.
use serde::Serialize;
use std::path::Path;
use std::time::Duration;

#[derive(Serialize, Debug, PartialEq)]
pub struct GoalResult {
    /// "met" | "not_met" | "timeout"
    pub status: String,
    /// 출력 마지막 200자
    pub tail: String,
}

const TAIL: usize = 200;

fn tail_of(s: &str) -> String {
    let t = s.trim_end();
    let n = t.chars().count();
    t.chars().skip(n.saturating_sub(TAIL)).collect()
}

/// shell 은 프로그램 경로. on_pid 는 자식이 뜬 직후 PID 를 알린다(시험이 남은 프로세스를 확인한다)
pub fn goal_run_with(shell: &Path, cmd: &str, cwd: &Path, timeout: Duration, on_pid: &dyn Fn(u32)) -> Result<GoalResult, String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    let is_cmd = shell.file_stem().map(|s| s.eq_ignore_ascii_case("cmd")).unwrap_or(false);
    let mut c = Command::new(shell);
    if is_cmd { c.args(["/C", cmd]) } else { c.args(["-NoProfile", "-Command", cmd]) };
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut c, 0x0800_0000); // CREATE_NO_WINDOW
    let mut child = c.current_dir(cwd).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    let pid = child.id();
    on_pid(pid);
    fn rd<R: Read + Send + 'static>(mut r: R) -> std::thread::JoinHandle<String> {
        std::thread::spawn(move || {
            let mut b = Vec::new();
            let _ = r.read_to_end(&mut b);
            String::from_utf8_lossy(&b).into_owned()
        })
    }
    let (h1, h2) = (rd(child.stdout.take().ok_or("no stdout")?), rd(child.stderr.take().ok_or("no stderr")?));
    let start = std::time::Instant::now();
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(st) => {
                let out = h1.join().unwrap_or_default() + &h2.join().unwrap_or_default();
                return Ok(GoalResult { status: if st.success() { "met" } else { "not_met" }.into(), tail: tail_of(&out) });
            }
            None if start.elapsed() >= timeout => {
                // 그 PID(와 그 아래 자식)만 끈다. 이름으로 끄지 않는다
                #[cfg(windows)]
                {
                    let mut k = Command::new("taskkill");
                    k.args(["/PID", &pid.to_string(), "/T", "/F"]);
                    std::os::windows::process::CommandExt::creation_flags(&mut k, 0x0800_0000);
                    let _ = k.stdout(Stdio::null()).stderr(Stdio::null()).status();
                }
                let _ = child.kill();
                let _ = child.wait();
                return Ok(GoalResult { status: "timeout".into(), tail: String::new() }); // 읽기 스레드는 파이프가 닫히면 저절로 끝난다
            }
            None => std::thread::sleep(Duration::from_millis(20)),
        }
    }
}

/// 1묶음 셸 순서: pwsh → powershell → cmd
pub fn find_shell() -> Option<std::path::PathBuf> {
    let dirs = crate::agents::search_dirs();
    ["pwsh.exe", "powershell.exe", "cmd.exe"].iter().find_map(|n| crate::agents::which(n, &dirs))
}

#[tauri::command]
pub async fn goal_run(cmd: String, cwd: String, timeout_secs: u64) -> Result<GoalResult, String> {
    let shell = find_shell().ok_or("no shell found")?;
    tauri::async_runtime::spawn_blocking(move || goal_run_with(&shell, &cmd, Path::new(&cwd), Duration::from_secs(timeout_secs.clamp(1, 3600)), &|_| {}))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::time::Instant;

    fn dir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-d3-goal-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }
    fn alive(pid: u32) -> bool {
        let o = std::process::Command::new("tasklist").args(["/FI", &format!("PID eq {pid}"), "/NH"]).output().unwrap();
        String::from_utf8_lossy(&o.stdout).contains(&pid.to_string())
    }

    struct Kill<'a>(&'a Cell<u32>);
    impl Drop for Kill<'_> {
        fn drop(&mut self) {
            if self.0.get() != 0 && alive(self.0.get()) {
                let _ = std::process::Command::new("taskkill").args(["/PID", &self.0.get().to_string(), "/T", "/F"]).output();
            }
        }
    }

    // S-1419
    #[test]
    fn exit_codes() {
        let sh = find_shell().expect("셸");
        let d = dir("exit");
        let met = goal_run_with(&sh, "exit 0", &d, Duration::from_secs(20), &|_| {}).unwrap();
        assert_eq!(met.status, "met");
        let not = goal_run_with(&sh, "Write-Output hello; exit 1", &d, Duration::from_secs(20), &|_| {}).unwrap();
        assert_eq!(not.status, "not_met");
        assert!(not.tail.contains("hello"));
    }

    #[test]
    fn runs_in_cwd_and_tail_is_last_200() {
        let sh = find_shell().unwrap();
        let d = dir("cwd");
        let r = goal_run_with(&sh, "1..300 | ForEach-Object { 'x' }; 'END'", &d, Duration::from_secs(20), &|_| {}).unwrap();
        assert!(r.tail.chars().count() <= 200);
        assert!(r.tail.trim_end().ends_with("END"));
        let r = goal_run_with(&sh, "(Get-Location).Path", &d, Duration::from_secs(20), &|_| {}).unwrap();
        assert!(r.tail.to_lowercase().contains(&d.file_name().unwrap().to_string_lossy().to_lowercase()));
    }

    // S-1412: 제한 시간이 지나면 그 PID 만 끄고 timeout. 자식이 남지 않는다
    #[test]
    fn timeout_kills_child() {
        let sh = find_shell().unwrap();
        let d = dir("to");
        let pid = Cell::new(0u32);
        let t = Instant::now();
        let _guard = Kill(&pid); // 시험이 실패해도 그 PID 만 끈다
        let r = goal_run_with(&sh, "Start-Sleep 60", &d, Duration::from_secs(1), &|p| pid.set(p)).unwrap();
        assert_eq!(r.status, "timeout");
        assert!(t.elapsed() < Duration::from_secs(15));
        assert!(pid.get() != 0);
        std::thread::sleep(Duration::from_millis(300));
        assert!(!alive(pid.get()), "자식이 남았다");
    }

    #[test]
    fn missing_shell_is_error() {
        let d = dir("nosh");
        assert!(goal_run_with(Path::new("C:/no/such/shell.exe"), "exit 0", &d, Duration::from_secs(1), &|_| {}).is_err());
    }
}
