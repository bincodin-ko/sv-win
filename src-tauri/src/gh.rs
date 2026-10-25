// B6 S-384~S-388: GitHub CLI(gh) 연결 상태. 토큰·출력 원문은 화면에 돌려주지 않는다.
use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GhStatus {
    pub installed: bool,
    pub user: Option<String>,
}

/// `gh auth status` 출력에서 github.com 로그인 이름을 뽑는다(순수). 새 gh: "account NAME (..)", 옛 gh: "as NAME (..)"
pub fn parse_user(text: &str) -> Option<String> {
    let rest = &text[text.find("Logged in to github.com")? + "Logged in to github.com".len()..];
    let line = rest.lines().next()?;
    let mut w = line.split_whitespace();
    w.find(|x| *x == "account" || *x == "as")?;
    w.next().map(String::from)
}

/// gh 가 PATH 에 없으면 installed=false. 있으면 run(경로) 출력으로 로그인 이름을 읽는다
pub fn status_with(find: &dyn Fn() -> Option<PathBuf>, run: &dyn Fn(&Path) -> Option<String>) -> GhStatus {
    match find() {
        None => GhStatus { installed: false, user: None },
        Some(p) => GhStatus { installed: true, user: run(&p).and_then(|t| parse_user(&t)) },
    }
}

/// cmd 를 실행하고 timeout 안에 안 끝나면 그 자식(PID)만 끄고 None. 끝나면 (성공 여부, stdout+stderr)
pub fn run_timeout(cmd: &mut Command, timeout: Duration) -> Option<(bool, String)> {
    run_timeout_out(cmd, timeout).map(|(ok, o, e)| (ok, o + &e))
}

/// run_timeout 과 같되 (성공 여부, stdout, stderr) 를 따로 (F1 받아쓰기: 글은 stdout 에만)
pub fn run_timeout_out(cmd: &mut Command, timeout: Duration) -> Option<(bool, String, String)> {
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(cmd, 0x0800_0000); // CREATE_NO_WINDOW
    let mut child = cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().ok()?;
    // 출력은 따로 읽어 파이프가 꽉 차서 멈추는 일이 없게 한다
    fn rd<R: Read + Send + 'static>(mut r: R) -> std::thread::JoinHandle<String> {
        std::thread::spawn(move || {
            let mut s = String::new();
            let _ = r.read_to_string(&mut s);
            s
        })
    }
    let (h1, h2) = (rd(child.stdout.take()?), rd(child.stderr.take()?));
    let start = Instant::now();
    loop {
        match child.try_wait().ok()? {
            Some(st) => return Some((st.success(), h1.join().unwrap_or_default(), h2.join().unwrap_or_default())),
            None if start.elapsed() >= timeout => {
                let _ = child.kill(); // 이 자식 하나만
                let _ = child.wait();
                return None;
            }
            None => std::thread::sleep(Duration::from_millis(20)),
        }
    }
}

pub fn gh_path() -> Option<PathBuf> {
    crate::agents::which("gh.exe", &crate::agents::search_dirs())
}

pub fn status() -> GhStatus {
    status_with(&gh_path, &|p| run_timeout(Command::new(p).args(["auth", "status", "--hostname", "github.com"]), Duration::from_secs(3)).map(|(_, t)| t))
}

pub fn logout() -> Result<(), String> {
    let p = gh_path().ok_or("GitHub CLI not found")?;
    match run_timeout(Command::new(p).args(["auth", "logout", "--hostname", "github.com"]), Duration::from_secs(10)) {
        Some((true, _)) => Ok(()),
        Some(_) => Err("gh auth logout failed".into()), // 출력 원문은 돌려주지 않는다
        None => Err("gh auth logout timed out".into()),
    }
}

/// 내부 에이전트 "gh-auth-login": 목록에는 안 나오고, 콘솔이 `gh auth login` 을 실행한다(S-386)
pub const LOGIN_ID: &str = "gh-auth-login";
pub fn login_spec(found: Option<&Path>, shell: (String, Vec<String>), ps: &str) -> crate::agents::Spec {
    match found {
        Some(p) => {
            let (program, args) = crate::agents::wrap(p, vec!["auth".into(), "login".into()], ps);
            crate::agents::Spec { program, args, env: vec![], yolo: false, not_found: false, shell_fallback: false }
        }
        None => crate::agents::Spec { program: shell.0, args: shell.1, env: vec![], yolo: false, not_found: true, shell_fallback: true },
    }
}

#[tauri::command]
pub fn gh_status() -> GhStatus {
    status()
}

#[tauri::command]
pub fn gh_logout() -> Result<(), String> {
    logout()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_parses_logged_in() {
        // 새 gh 와 옛 gh 출력 모두(S-384)
        let new = "github.com\n  ✓ Logged in to github.com account octocat (keyring)\n  - Active account: true\n";
        let old = "github.com\n  ✓ Logged in to github.com as hubot (oauth_token)\n";
        assert_eq!(parse_user(new), Some("octocat".into()));
        assert_eq!(parse_user(old), Some("hubot".into()));
        assert_eq!(parse_user("You are not logged into any GitHub hosts. To log in, run: gh auth login\n"), None);
        assert_eq!(parse_user(""), None);
        // 토큰 줄이 있어도 이름만 돌려준다
        assert_eq!(parse_user("  ✓ Logged in to github.com account a-b (keyring)\n  - Token: gho_****\n"), Some("a-b".into()));
        let ok = status_with(&|| Some(PathBuf::from("gh.exe")), &|_| Some(new.to_string()));
        assert_eq!(ok, GhStatus { installed: true, user: Some("octocat".into()) });
        let out = status_with(&|| Some(PathBuf::from("gh.exe")), &|_| Some("not logged in".into()));
        assert_eq!(out, GhStatus { installed: true, user: None });
    }

    #[test]
    fn status_not_installed() {
        let ran = std::cell::Cell::new(false);
        let s = status_with(&|| None, &|_| {
            ran.set(true);
            None
        });
        assert_eq!(s, GhStatus { installed: false, user: None });
        assert!(!ran.get(), "gh 가 없으면 실행하지 않는다");
    }

    #[cfg(windows)]
    fn sleeper(secs: u32) -> Command {
        let mut c = Command::new("ping");
        c.args(["-n", &(secs + 1).to_string(), "127.0.0.1"]);
        c
    }

    #[cfg(windows)]
    #[test]
    fn timeout_kills_only_child() {
        // 다른 프로세스(bystander)는 살아 있고, 시간 안에 안 끝난 자식만 끊긴다
        let mut bystander = sleeper(20).stdout(std::process::Stdio::null()).spawn().unwrap();
        let t = Instant::now();
        let r = run_timeout(&mut sleeper(20), Duration::from_millis(400));
        assert!(r.is_none(), "시간 초과면 None");
        assert!(t.elapsed() < Duration::from_secs(5), "20초를 기다리지 않는다: {:?}", t.elapsed());
        assert!(bystander.try_wait().unwrap().is_none(), "다른 프로세스는 살아 있다");
        bystander.kill().unwrap();
        // 제때 끝나는 것은 출력과 성공 여부를 돌려준다
        let mut quick = Command::new("cmd");
        quick.args(["/c", "echo hello"]);
        let (ok, text) = run_timeout(&mut quick, Duration::from_secs(5)).unwrap();
        assert!(ok);
        assert!(text.contains("hello"));
    }
}
