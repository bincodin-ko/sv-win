// S-394~S-396: 첫 실행 카드의 clone / new repo. git 을 자식 프로세스로 실행한다.
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(tag = "state", content = "message")]
pub enum JobStatus {
    Running,
    Done,
    Failed(String),
}

struct Job {
    status: JobStatus,
    pid: u32,
    cancelled: bool,
}

#[derive(Default)]
pub struct Jobs {
    next: Mutex<u32>,
    jobs: Arc<Mutex<HashMap<u32, Job>>>,
}

/// 창을 띄우지 않고(Windows) 자식으로 실행할 준비
pub(crate) fn quiet(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

/// 그 PID(와 그 자식들)만 끈다. 이름으로 끄지 않는다
pub(crate) fn kill_pid(pid: u32) {
    #[cfg(windows)]
    {
        let mut c = Command::new("taskkill");
        c.args(["/PID", &pid.to_string(), "/T", "/F"]);
        let _ = quiet(&mut c).output();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
    }
}

impl Jobs {
    /// `git clone -- url dest`. dest 가 이미 있으면 받지 않는다(덮지 않음)
    pub fn start_git_clone(&self, url: &str, dest: &Path) -> Result<u32, String> {
        if dest.exists() {
            return Err(format!("{} already exists", dest.display()));
        }
        let mut cmd = Command::new("git");
        cmd.args(["clone", "--", url]).arg(dest);
        self.start_cmd(cmd)
    }

    /// 명령을 자식 프로세스로 띄우고 job id 를 돌려준다. stderr 의 마지막 줄을 실패 문구로 쓴다
    pub fn start_cmd(&self, mut cmd: Command) -> Result<u32, String> {
        cmd.env("GIT_TERMINAL_PROMPT", "0") // 암호를 기다리며 멈추지 않게
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        let mut child = quiet(&mut cmd).spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound && cmd.get_program() == "git" { "git not found".to_string() } else { e.to_string() }
        })?;
        let id = {
            let mut n = self.next.lock().unwrap();
            *n += 1;
            *n
        };
        self.jobs.lock().unwrap().insert(id, Job { status: JobStatus::Running, pid: child.id(), cancelled: false });
        let jobs = self.jobs.clone();
        let mut err = child.stderr.take();
        std::thread::spawn(move || {
            // git 은 진행 표시를 \r 로 갱신한다: \r·\n 모두 줄 끝으로 보고 비어 있지 않은 마지막 줄을 남긴다
            let mut buf = Vec::new();
            if let Some(e) = err.as_mut() {
                let _ = e.read_to_end(&mut buf);
            }
            let text = String::from_utf8_lossy(&buf);
            let lines: Vec<&str> = text.split(['\r', '\n']).map(str::trim).filter(|l| !l.is_empty()).collect();
            // 마지막 오류 줄: git 은 "fatal: …" 뒤에 안내 문장을 덧붙이므로 fatal·error 로 시작하는 마지막 줄을 먼저 본다
            let last = lines.iter().rev().find(|l| l.starts_with("fatal:") || l.starts_with("error:")).or(lines.last()).map(|l| l.to_string()).unwrap_or_default();
            let ok = child.wait().map(|s| s.success()).unwrap_or(false);
            if let Some(j) = jobs.lock().unwrap().get_mut(&id) {
                j.status = if j.cancelled {
                    JobStatus::Failed("Cancelled".into())
                } else if ok {
                    JobStatus::Done
                } else {
                    JobStatus::Failed(if last.is_empty() { "git failed".into() } else { last })
                };
            }
        });
        Ok(id)
    }

    pub fn status(&self, id: u32) -> Option<JobStatus> {
        self.jobs.lock().unwrap().get(&id).map(|j| j.status.clone())
    }

    /// job 의 PID 만 끈다. 이미 끝났으면 false
    pub fn cancel(&self, id: u32) -> bool {
        let pid = {
            let mut g = self.jobs.lock().unwrap();
            match g.get_mut(&id) {
                Some(j) if j.status == JobStatus::Running => {
                    j.cancelled = true;
                    j.pid
                }
                _ => return false,
            }
        };
        kill_pid(pid);
        true
    }
}

/// 폴더를 만들고 git init. branch_main 이면 `-b main`. 폴더가 이미 있으면 받지 않는다
pub fn init_repo(path: &Path, branch_main: bool) -> Result<(), String> {
    if path.exists() {
        return Err(format!("{} already exists", path.display()));
    }
    std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    run_init(path, branch_main)
}

/// S-1009: 이미 있는 폴더에서 git init. 폴더가 없거나 이미 저장소면 거절
pub fn init_repo_here(path: &Path, branch_main: bool) -> Result<(), String> {
    if !path.is_dir() {
        return Err(format!("{} not found", path.display()));
    }
    if path.join(".git").exists() {
        return Err("already a repository".into());
    }
    run_init(path, branch_main)
}

fn run_init(path: &Path, branch_main: bool) -> Result<(), String> {
    let mut cmd = Command::new("git");
    cmd.arg("init");
    if branch_main {
        cmd.args(["-b", "main"]);
    }
    cmd.arg(path);
    match quiet(&mut cmd).output() {
        Ok(o) if o.status.success() => Ok(()),
        Ok(o) => Err(String::from_utf8_lossy(&o.stderr).lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("git failed").trim().to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err("git not found".into()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeDirs {
    pub home: String,
    pub has_hypervibe: bool,
}

pub fn home_dirs_of(home: &str) -> HomeDirs {
    HomeDirs { home: home.to_string(), has_hypervibe: Path::new(home).join("hypervibe").is_dir() }
}

#[tauri::command]
pub async fn home_dirs() -> HomeDirs {
    home_dirs_of(&std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_default())
}

#[tauri::command]
pub async fn git_clone(jobs: tauri::State<'_, Jobs>, url: String, dest: String) -> Result<u32, String> {
    jobs.start_git_clone(&url, Path::new(&dest))
}

#[tauri::command]
pub fn git_clone_status(jobs: tauri::State<'_, Jobs>, job: u32) -> Option<JobStatus> {
    jobs.status(job)
}

#[tauri::command]
pub fn git_cancel(jobs: tauri::State<'_, Jobs>, job: u32) -> bool {
    jobs.cancel(job)
}

#[tauri::command]
pub async fn git_init(path: String, branch_main: bool) -> Result<(), String> {
    init_repo(Path::new(&path), branch_main)
}

#[tauri::command]
pub async fn git_init_here(path: String, branch_main: bool) -> Result<(), String> {
    init_repo_here(Path::new(&path), branch_main)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{Duration, Instant};

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-b17-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn git_ok() -> bool {
        Command::new("git").arg("--version").output().map(|o| o.status.success()).unwrap_or(false)
    }
    fn git(dir: &Path, args: &[&str]) {
        let o = Command::new("git").current_dir(dir).args(["-c", "user.name=t", "-c", "user.email=t@t"]).args(args).output().unwrap();
        assert!(o.status.success(), "git {:?}: {}", args, String::from_utf8_lossy(&o.stderr));
    }
    fn wait_done(j: &Jobs, id: u32) -> JobStatus {
        let t = Instant::now();
        loop {
            let s = j.status(id).expect("job 없음");
            if s != JobStatus::Running || t.elapsed() > Duration::from_secs(60) {
                return s;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }
    fn long_cmd() -> Command {
        if cfg!(windows) {
            let mut c = Command::new("ping");
            c.args(["-n", "60", "127.0.0.1"]);
            c
        } else {
            let mut c = Command::new("sleep");
            c.arg("60");
            c
        }
    }

    #[test]
    fn clone_local_repo() {
        if !git_ok() {
            eprintln!("건너뜀: git 없음");
            return;
        }
        let d = tmp("clone");
        let src = d.join("src");
        fs::create_dir_all(&src).unwrap();
        git(&src, &["init"]);
        fs::write(src.join("a.txt"), "hi").unwrap();
        git(&src, &["add", "."]);
        git(&src, &["commit", "-m", "x"]);
        let j = Jobs::default();
        let dest = d.join("dest");
        let id = j.start_git_clone(src.to_str().unwrap(), &dest).unwrap();
        assert_eq!(wait_done(&j, id), JobStatus::Done);
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "hi");
    }

    #[test]
    fn clone_fail_reports_last_line() {
        if !git_ok() {
            eprintln!("건너뜀: git 없음");
            return;
        }
        let d = tmp("fail");
        let j = Jobs::default();
        let id = j.start_git_clone(d.join("nope").to_str().unwrap(), &d.join("dest")).unwrap();
        match wait_done(&j, id) {
            JobStatus::Failed(m) => {
                assert!(m.starts_with("fatal:"), "마지막 오류 줄이어야 함: {m}");
                assert!(!m.contains('\n') && !m.contains('\r'), "한 줄이어야 함: {m:?}");
            }
            s => panic!("실패여야 함: {s:?}"),
        }
    }

    #[test]
    fn init_main_branch() {
        if !git_ok() {
            eprintln!("건너뜀: git 없음");
            return;
        }
        let d = tmp("init");
        let p = d.join("proj");
        init_repo(&p, true).unwrap();
        assert_eq!(fs::read_to_string(p.join(".git").join("HEAD")).unwrap().trim(), "ref: refs/heads/main");
    }

    #[test]
    fn cancel_kills_only_job_pid() {
        let j = Jobs::default();
        let id = j.start_cmd(long_cmd()).unwrap();
        let mut other = long_cmd().spawn().unwrap(); // 같은 프로그램의 다른 프로세스: 살아 있어야 한다
        assert_eq!(j.status(id), Some(JobStatus::Running));
        assert!(j.cancel(id));
        assert_eq!(wait_done(&j, id), JobStatus::Failed("Cancelled".into()));
        std::thread::sleep(Duration::from_millis(300));
        assert!(other.try_wait().unwrap().is_none(), "다른 프로세스가 같이 죽음");
        other.kill().unwrap();
        let _ = other.wait();
    }

    #[test]
    fn dest_exists_rejected() {
        let d = tmp("exists");
        let dest = d.join("taken");
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("keep.txt"), "x").unwrap();
        let j = Jobs::default();
        assert!(j.start_git_clone("https://example.invalid/a/b.git", &dest).unwrap_err().contains("already exists"));
        assert!(init_repo(&dest, true).unwrap_err().contains("already exists"));
        assert_eq!(fs::read_to_string(dest.join("keep.txt")).unwrap(), "x"); // 덮지 않음
    }

    #[test]
    fn init_here_in_existing_folder() {
        if !git_ok() {
            eprintln!("건너뜀: git 없음");
            return;
        }
        let d = tmp("here");
        fs::write(d.join("keep.txt"), "x").unwrap();
        init_repo_here(&d, true).unwrap();
        assert_eq!(fs::read_to_string(d.join(".git").join("HEAD")).unwrap().trim(), "ref: refs/heads/main");
        assert_eq!(fs::read_to_string(d.join("keep.txt")).unwrap(), "x");
        // 이미 저장소면 거절
        assert!(init_repo_here(&d, true).unwrap_err().contains("already a repository"));
    }

    #[test]
    fn init_here_rejects_missing_folder() {
        let d = tmp("here-missing");
        let p = d.join("nope");
        assert!(init_repo_here(&p, true).is_err());
        assert!(!p.exists(), "폴더를 만들면 안 됨");
    }
}
