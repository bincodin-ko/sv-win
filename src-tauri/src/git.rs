// 3묶음 C3 S-1000~S-1018: git 명령(읽기·commit/push/pull·discard·100MB·브랜치·publish).
// 시험은 git/tests.rs.
use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

/// 명령 종류별 제한 시간(S-1001)
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Read,
    Write,
    Net,
}

/// Wall = 전체 시간 상한, Idle = 출력이 이 시간 동안 없으면 멈춤
#[derive(Clone, Copy, Debug)]
pub enum Limit {
    Wall(Duration),
    Idle(Duration),
}

pub struct Out {
    pub ok: bool,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
}

#[derive(Serialize, Default, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitResult {
    pub ok: bool,
    pub message: String,
    pub not_git: bool,
    pub git_missing: bool,
    pub diverged: bool,
    pub oversize: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct GitFile {
    pub path: String,
    pub status: String,
    pub add: i64,
    pub del: i64,
}

#[derive(Default, Debug)]
pub struct Parsed {
    pub branch: String,
    pub detached: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFile>,
    pub total: usize,
    pub conflict: bool,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    #[serde(flatten)]
    pub res: GitResult,
    pub branch: String,
    pub detached: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub remote_url: Option<String>,
    pub web_url: Option<String>,
    pub files: Vec<GitFile>,
    pub total: usize,
    pub conflict: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Commit {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub time: String,
}

#[derive(Serialize, Default, Debug)]
pub struct GitLog {
    #[serde(flatten)]
    pub res: GitResult,
    pub commits: Vec<Commit>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Branch {
    pub name: String,
    pub current: bool,
}

#[derive(Serialize, Default, Debug)]
pub struct GitBranches {
    #[serde(flatten)]
    pub res: GitResult,
    pub branches: Vec<Branch>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct BigFile {
    pub path: String,
    pub size: u64,
}

#[derive(Serialize, Default, Debug)]
pub struct GitOversize {
    #[serde(flatten)]
    pub res: GitResult,
    pub files: Vec<BigFile>,
}

pub const MAX_FILES: usize = 400;
pub const OVERSIZE_LIMIT: u64 = 100 * 1024 * 1024;

// ---- 순수 함수 ----
fn header(p: &mut Parsed, h: &str) {
    if h.starts_with("HEAD (no branch)") {
        p.detached = true;
    } else if let Some(b) = h.strip_prefix("No commits yet on ").or_else(|| h.strip_prefix("Initial commit on ")) {
        p.branch = b.trim().to_string();
    } else {
        let (names, bracket) = h.split_once(" [").unwrap_or((h, ""));
        match names.split_once("...") {
            Some((b, u)) => {
                p.branch = b.to_string();
                p.upstream = Some(u.to_string());
            }
            None => p.branch = names.to_string(),
        }
        (p.ahead, p.behind) = ahead_behind(bracket);
    }
}

/// `status -b --porcelain=v1 -z` 출력 → 브랜치·파일 목록(max 개까지)·총 개수·충돌 여부. 줄 수는 -1(모름)로 둔다
pub fn parse_status(text: &str, max: usize) -> Parsed {
    let mut p = Parsed::default();
    let mut it = text.split('\0');
    while let Some(e) = it.next() {
        if let Some(h) = e.strip_prefix("## ") {
            header(&mut p, h);
            continue;
        }
        let (Some(xy), Some(path)) = (e.get(..2), e.get(3..)) else { continue };
        let (x, y) = (xy.as_bytes()[0] as char, xy.as_bytes()[1] as char);
        if x == 'U' || y == 'U' || (x, y) == ('A', 'A') || (x, y) == ('D', 'D') {
            p.conflict = true;
        }
        if x == 'R' || y == 'R' || x == 'C' || y == 'C' {
            it.next(); // 원래 이름
        }
        let status = if xy == "??" {
            "?"
        } else if x == 'R' || y == 'R' {
            "R"
        } else if x == 'A' || y == 'A' || x == 'C' || y == 'C' {
            "A"
        } else if x == 'D' || y == 'D' {
            "D"
        } else {
            "M"
        };
        p.total += 1;
        if p.files.len() < max {
            p.files.push(GitFile { path: path.to_string(), status: status.into(), add: -1, del: -1 });
        }
    }
    p
}

/// `diff --numstat -z` → 경로별 (추가, 삭제). 바이너리는 -1
pub fn parse_numstat(text: &str) -> HashMap<String, (i64, i64)> {
    let mut m = HashMap::new();
    let mut it = text.split('\0');
    while let Some(e) = it.next() {
        let mut f = e.splitn(3, '\t');
        let (Some(a), Some(d), Some(path)) = (f.next(), f.next(), f.next()) else { continue };
        let key = if path.is_empty() {
            it.next(); // 이름 바꾸기: 원래 이름, 새 이름 순
            match it.next() {
                Some(n) => n,
                None => break,
            }
        } else {
            path
        };
        m.insert(key.to_string(), (a.parse().unwrap_or(-1), d.parse().unwrap_or(-1)));
    }
    m
}

/// `log --format=%h%x1f%s%x1f%an%x1f%aI%x1e` 출력 → 커밋 목록
pub fn parse_log(text: &str) -> Vec<Commit> {
    text.split('\x1e')
        .filter_map(|r| {
            let mut f = r.trim_start_matches(['\n', '\r']).split('\x1f');
            let (hash, subject, author, time) = (f.next()?, f.next()?, f.next()?, f.next()?);
            Some(Commit { hash: hash.into(), subject: subject.into(), author: author.into(), time: time.into() })
        })
        .collect()
}

/// S-1015: GitHub 가 아니면 None
pub fn remote_to_web(url: &str) -> Option<String> {
    let u = url.trim();
    let rest = match u.strip_prefix("git@github.com:") {
        Some(r) => r,
        None => {
            let r = ["https://", "http://", "ssh://", "git://"].iter().find_map(|p| u.strip_prefix(p))?;
            let (host, path) = r.split_once('/')?;
            if host.rsplit('@').next()? != "github.com" {
                return None;
            }
            path
        }
    };
    let rest = rest.trim_end_matches('/');
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let mut parts = rest.split('/');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(o), Some(r), None) if !o.is_empty() && !r.is_empty() => Some(format!("https://github.com/{o}/{r}")),
        _ => None,
    }
}

/// "ahead 2, behind 1" 같은 글에서 (ahead, behind)
pub fn ahead_behind(text: &str) -> (u32, u32) {
    let num = |k: &str| {
        text.find(k).map_or(0, |i| text[i + k.len()..].chars().take_while(char::is_ascii_digit).collect::<String>().parse().unwrap_or(0))
    };
    (num("ahead "), num("behind "))
}

fn safe_rel(p: &str) -> bool {
    !p.is_empty() && Path::new(p).components().all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
}

fn walk_big(base: &Path, rel: &str, limit: u64, out: &mut Vec<BigFile>) {
    let rel = rel.trim_end_matches('/');
    let Ok(m) = std::fs::symlink_metadata(base.join(rel)) else { return };
    if m.is_file() {
        if m.len() > limit {
            out.push(BigFile { path: rel.to_string(), size: m.len() });
        }
    } else if m.is_dir() {
        let Ok(rd) = std::fs::read_dir(base.join(rel)) else { return };
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().into_owned();
            if n != ".git" {
                walk_big(base, &format!("{rel}/{n}"), limit, out);
            }
        }
    }
}

/// 고른 경로(폴더면 안쪽 전부) 중 limit 바이트를 넘는 파일
pub fn oversize(repo: &Path, paths: &[String], limit: u64) -> Vec<BigFile> {
    let mut out = vec![];
    for p in paths.iter().filter(|p| safe_rel(p)) {
        walk_big(repo, p, limit, &mut out);
    }
    out
}

/// .gitignore 새 내용. 경로는 저장소 루트 기준(`/경로`)으로 적고, 이미 있으면 더하지 않고, 끝 줄바꿈을 맞춘다
pub fn ignore_line_add(existing: &str, path: &str) -> String {
    let p = path.replace('\\', "/");
    let p = p.trim_start_matches('/');
    let anchored = format!("/{p}");
    let has = existing.lines().any(|l| l.trim() == p || l.trim() == anchored);
    let mut s = existing.to_string();
    if !s.is_empty() && !s.ends_with('\n') {
        s.push('\n');
    }
    if !has {
        s.push_str(&anchored);
        s.push('\n');
    }
    s
}

/// S-1014: stderr 의 마지막 의미 있는 줄(fatal:/error: 접두 제거, 400자)
pub fn shorten_error(stderr: &str) -> String {
    let line = stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with("hint:") && !l.eq_ignore_ascii_case("aborting"))
        .unwrap_or("");
    let line = line.strip_prefix("fatal: ").or_else(|| line.strip_prefix("error: ")).unwrap_or(line);
    line.chars().take(400).collect()
}

pub fn publish_args(name: &str, private: bool) -> Vec<String> {
    let vis = if private { "--private" } else { "--public" };
    ["repo", "create", name, vis, "--source", ".", "--remote", "origin", "--push"].map(String::from).to_vec()
}

// ---- 실행기 ----
fn quiet(c: &mut Command) {
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(c, 0x0800_0000); // CREATE_NO_WINDOW
    #[cfg(not(windows))]
    let _ = c;
}

/// S-1000: 창 없이, 암호를 묻지 않는 환경으로
pub fn git_cmd(repo: &Path, args: &[&str]) -> Command {
    let mut c = Command::new("git");
    c.current_dir(repo)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes")
        .env("LC_ALL", "C");
    quiet(&mut c);
    c
}

fn reader<R: Read + Send + 'static>(mut r: R, buf: Arc<Mutex<Vec<u8>>>, last: Arc<Mutex<Instant>>) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut chunk = [0u8; 8192];
        while let Ok(n) = r.read(&mut chunk) {
            if n == 0 {
                break;
            }
            buf.lock().unwrap().extend_from_slice(&chunk[..n]);
            *last.lock().unwrap() = Instant::now();
        }
    })
}

/// 명령을 돌리고 한도를 넘으면 그 자식(PID)만 끈다. 끝난 뒤 읽기 스레드는 최대 2초만 기다린다(손자가 파이프를 쥐고 있어도 멈추지 않게)
pub fn exec(mut cmd: Command, limit: Limit) -> std::io::Result<Out> {
    let mut child = cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;
    let last = Arc::new(Mutex::new(Instant::now()));
    let (ob, eb) = (Arc::new(Mutex::new(vec![])), Arc::new(Mutex::new(vec![])));
    let hs = [
        reader(child.stdout.take().unwrap(), ob.clone(), last.clone()),
        reader(child.stderr.take().unwrap(), eb.clone(), last.clone()),
    ];
    let start = Instant::now();
    let status = loop {
        if let Some(st) = child.try_wait()? {
            break Some(st);
        }
        let over = match limit {
            Limit::Wall(d) => start.elapsed() >= d,
            Limit::Idle(d) => last.lock().unwrap().elapsed() >= d,
        };
        if over {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    if status.is_some() {
        let deadline = Instant::now() + Duration::from_secs(2);
        for h in &hs {
            while !h.is_finished() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(5));
            }
        }
    }
    let s = |b: &Arc<Mutex<Vec<u8>>>| String::from_utf8_lossy(&b.lock().unwrap()).into_owned();
    Ok(Out { ok: status.is_some_and(|s| s.success()), stdout: s(&ob), stderr: s(&eb), timed_out: status.is_none() })
}

type R<T> = Result<T, GitResult>;

fn failure(msg: impl Into<String>) -> GitResult {
    GitResult { message: msg.into(), ..Default::default() }
}
fn success() -> GitResult {
    GitResult { ok: true, ..Default::default() }
}
fn from_out(o: &Out) -> GitResult {
    let raw = if o.stderr.trim().is_empty() { &o.stdout } else { &o.stderr };
    let mut r = failure(match shorten_error(raw) {
        m if m.is_empty() => "git failed".to_string(),
        m => m,
    });
    r.not_git = raw.contains("not a git repository");
    r
}
fn io_failure(e: std::io::Error) -> GitResult {
    if e.kind() == std::io::ErrorKind::NotFound {
        GitResult { message: "Git not found".into(), git_missing: true, ..Default::default() }
    } else {
        failure(e.to_string())
    }
}
fn limit_of(kind: Kind) -> Limit {
    match kind {
        Kind::Read => Limit::Wall(Duration::from_secs(15)),
        Kind::Write => Limit::Wall(Duration::from_secs(60)),
        Kind::Net => Limit::Idle(Duration::from_secs(300)),
    }
}
fn finish(o: std::io::Result<Out>) -> R<Out> {
    let o = o.map_err(io_failure)?;
    if o.timed_out {
        return Err(failure("git timed out"));
    }
    Ok(o)
}

/// git 한 번. 실행 실패·시간 초과만 Err, 종료 코드는 Out.ok 로
fn run(repo: &Path, args: &[&str], kind: Kind) -> R<Out> {
    if !repo.is_dir() {
        return Err(failure("Folder not found"));
    }
    finish(exec(git_cmd(repo, args), limit_of(kind)))
}
/// run 에 더해 실패 종료도 Err
fn run_ok(repo: &Path, args: &[&str], kind: Kind) -> R<Out> {
    let o = run(repo, args, kind)?;
    if o.ok { Ok(o) } else { Err(from_out(&o)) }
}
fn out_line(o: &Out) -> String {
    o.stdout.trim().to_string()
}
fn flat(r: R<GitResult>) -> GitResult {
    r.unwrap_or_else(|e| e)
}

/// S-1016: 같은 저장소의 쓰기 명령은 한 번에 하나(읽기는 잠그지 않음)
fn locked<T>(repo: &Path, f: impl FnOnce() -> T) -> T {
    static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();
    let key = std::fs::canonicalize(repo).unwrap_or_else(|_| repo.to_path_buf());
    let l = LOCKS.get_or_init(Default::default).lock().unwrap_or_else(|e| e.into_inner()).entry(key).or_default().clone();
    let _g = l.lock().unwrap_or_else(|e| e.into_inner());
    f()
}

fn all_safe(paths: &[String]) -> R<()> {
    if paths.is_empty() {
        return Err(failure("No files selected"));
    }
    if paths.iter().all(|p| safe_rel(p)) { Ok(()) } else { Err(failure("Invalid path")) }
}

fn good_branch_name(repo: &Path, name: &str) -> R<()> {
    if name.is_empty() || name.starts_with('-') {
        return Err(failure("Invalid branch name"));
    }
    if run(repo, &["check-ref-format", "--branch", name], Kind::Read)?.ok { Ok(()) } else { Err(failure("Invalid branch name")) }
}

// ---- 명령 ----
fn status_r(repo: &Path) -> R<GitStatus> {
    let o = run_ok(repo, &["--no-optional-locks", "status", "-b", "--porcelain=v1", "-z", "--untracked-files=normal"], Kind::Read)?;
    let mut p = parse_status(&o.stdout, MAX_FILES);
    if p.detached {
        p.branch = run(repo, &["rev-parse", "--short", "HEAD"], Kind::Read).map(|o| out_line(&o)).unwrap_or_default();
    }
    if let Ok(n) = run_ok(repo, &["--no-optional-locks", "diff", "--numstat", "-z", "HEAD"], Kind::Read) {
        let m = parse_numstat(&n.stdout);
        for f in p.files.iter_mut().filter(|f| f.status != "?") {
            if let Some(&(a, d)) = m.get(&f.path) {
                (f.add, f.del) = (a, d);
            }
        }
    }
    let remote = p.upstream.as_deref().and_then(|u| u.split('/').next()).unwrap_or("origin").to_string();
    let remote_url = run(repo, &["config", "--get", &format!("remote.{remote}.url")], Kind::Read).ok().filter(|o| o.ok).map(|o| out_line(&o)).filter(|u| !u.is_empty());
    let web_url = remote_url.as_deref().and_then(remote_to_web);
    Ok(GitStatus {
        res: success(),
        branch: p.branch,
        detached: p.detached,
        upstream: p.upstream,
        ahead: p.ahead,
        behind: p.behind,
        remote_url,
        web_url,
        files: p.files,
        total: p.total,
        conflict: p.conflict,
    })
}
pub fn status(repo: &Path) -> GitStatus {
    status_r(repo).unwrap_or_else(|res| GitStatus { res, ..Default::default() })
}

fn log_r(repo: &Path, n: usize) -> R<GitLog> {
    let o = run(repo, &["log", "-n", &n.to_string(), "--abbrev=7", "--format=%h%x1f%s%x1f%an%x1f%aI%x1e"], Kind::Read)?;
    if !o.ok && o.stderr.contains("does not have any commits") {
        return Ok(GitLog { res: success(), commits: vec![] });
    }
    if !o.ok {
        return Err(from_out(&o));
    }
    Ok(GitLog { res: success(), commits: parse_log(&o.stdout) })
}
pub fn log(repo: &Path, n: usize) -> GitLog {
    log_r(repo, n).unwrap_or_else(|res| GitLog { res, commits: vec![] })
}

fn commit_r(repo: &Path, paths: &[String], message: &str) -> R<GitResult> {
    if message.trim().is_empty() {
        return Err(failure("Commit message is required"));
    }
    all_safe(paths)?;
    locked(repo, || {
        if !run_ok(repo, &["ls-files", "-u"], Kind::Read)?.stdout.trim().is_empty() {
            return Err(failure("Resolve the merge conflicts first"));
        }
        let mut add = vec!["add", "-A", "--"];
        add.extend(paths.iter().map(String::as_str));
        run_ok(repo, &add, Kind::Write)?;
        let merging = run(repo, &["rev-parse", "-q", "--verify", "MERGE_HEAD"], Kind::Read)?.ok;
        let mut c = vec!["commit", "-m", message];
        if !merging {
            c.extend(["--only", "--"]);
            c.extend(paths.iter().map(String::as_str));
        }
        run_ok(repo, &c, Kind::Write)?;
        Ok(success())
    })
}
pub fn commit(repo: &Path, paths: &[String], message: &str) -> GitResult {
    flat(commit_r(repo, paths, message))
}

/// 잠금을 이미 쥔 채로 부른다(remove_oversize 도 씀)
fn push_unlocked(repo: &Path) -> R<GitResult> {
    let has_up = run(repo, &["rev-parse", "--verify", "-q", "@{u}"], Kind::Read)?.ok;
    let o = if has_up {
        run(repo, &["push"], Kind::Net)?
    } else {
        let remotes = run_ok(repo, &["remote"], Kind::Read)?.stdout;
        let mut names = remotes.lines().map(str::trim).filter(|l| !l.is_empty());
        let first = names.next().ok_or_else(|| failure("No remote configured"))?;
        let remote = if remotes.lines().any(|l| l.trim() == "origin") { "origin" } else { first };
        let branch = run(repo, &["symbolic-ref", "--short", "-q", "HEAD"], Kind::Read)?;
        if !branch.ok {
            return Err(failure("Cannot push a detached HEAD"));
        }
        run(repo, &["push", "-u", remote, &out_line(&branch)], Kind::Net)?
    };
    if o.ok {
        return Ok(success());
    }
    let mut r = from_out(&o);
    r.oversize = o.stderr.contains("GH001") || o.stderr.contains("file size limit");
    Err(r)
}
pub fn push(repo: &Path) -> GitResult {
    flat(locked(repo, || push_unlocked(repo)))
}

pub fn pull(repo: &Path) -> GitResult {
    flat(locked(repo, || {
        let o = run(repo, &["pull", "--ff-only"], Kind::Net)?;
        if o.ok {
            return Ok(success());
        }
        let mut r = from_out(&o);
        let t = o.stderr.to_lowercase();
        r.diverged = t.contains("fast-forward") || t.contains("diverg");
        Err(r)
    }))
}

/// 휴지통은 `trash` 로 받는다(C2 의 fs::trash_move 를 합칠 때 cmds 에서 연결)
pub fn discard(repo: &Path, path: &str, tracked: bool, trash: &dyn Fn(&Path) -> Result<(), String>) -> GitResult {
    if !safe_rel(path) {
        return failure("Invalid path");
    }
    flat(locked(repo, || {
        let full = repo.join(path);
        if full.symlink_metadata().is_ok() {
            trash(&full).map_err(failure)?; // 사본을 못 남기면 아무것도 안 건드린다
        } else if !tracked {
            return Err(failure("File not found"));
        }
        if tracked {
            run_ok(repo, &["restore", "--source=HEAD", "--staged", "--worktree", "--", path], Kind::Write)?;
        }
        Ok(success())
    }))
}

pub fn oversize_check(repo: &Path, paths: &[String], limit: u64) -> GitOversize {
    match all_safe(paths) {
        Ok(()) => GitOversize { res: success(), files: oversize(repo, paths, limit) },
        Err(res) => GitOversize { res, files: vec![] },
    }
}

fn add_ignore(repo: &Path, paths: &[String]) -> R<()> {
    let f = repo.join(".gitignore");
    let old = std::fs::read_to_string(&f).unwrap_or_default();
    let new = paths.iter().fold(old.clone(), |s, p| ignore_line_add(&s, p));
    if new != old {
        std::fs::write(&f, new).map_err(|e| failure(e.to_string()))?;
    }
    Ok(())
}

pub fn keep_off(repo: &Path, paths: &[String]) -> GitResult {
    flat(all_safe(paths).and_then(|_| {
        locked(repo, || {
            for p in paths {
                let p = p.trim_end_matches('/');
                if run(repo, &["ls-files", "--error-unmatch", "--", p], Kind::Read)?.ok {
                    run_ok(repo, &["rm", "--cached", "-r", "-q", "--", p], Kind::Write)?;
                }
            }
            add_ignore(repo, paths)?;
            Ok(success())
        })
    }))
}

fn remove_oversize_r(repo: &Path, limit: u64) -> R<GitResult> {
    locked(repo, || {
        run_ok(repo, &["rev-parse", "--verify", "-q", "HEAD"], Kind::Read)?;
        let base = if run(repo, &["rev-parse", "--verify", "-q", "@{u}"], Kind::Read)?.ok {
            Some(out_line(&run_ok(repo, &["merge-base", "@{u}", "HEAD"], Kind::Read)?))
        } else {
            None
        };
        let range = base.as_ref().map_or("HEAD".to_string(), |b| format!("{b}..HEAD"));
        if out_line(&run_ok(repo, &["rev-list", "--count", &range], Kind::Read)?) == "0" {
            return Err(failure("No unpushed commits"));
        }
        // 올라가지 않은 범위에서 바뀐 파일 중 한도를 넘는 것(크기는 ls-tree -l 한 번으로)
        let changed: Option<Vec<String>> = match &base {
            Some(b) => Some(run_ok(repo, &["diff", "--name-only", "-z", "--diff-filter=AM", b, "HEAD"], Kind::Read)?.stdout.split('\0').map(String::from).collect()),
            None => None,
        };
        let tree = run_ok(repo, &["ls-tree", "-r", "-l", "-z", "HEAD"], Kind::Read)?.stdout;
        let big: Vec<String> = tree
            .split('\0')
            .filter_map(|e| {
                let (meta, path) = e.split_once('\t')?;
                let size: u64 = meta.split_whitespace().nth(3)?.parse().ok()?;
                (size > limit && changed.as_ref().is_none_or(|c| c.iter().any(|x| x == path))).then(|| path.to_string())
            })
            .collect();
        if big.is_empty() {
            return Err(failure("No files over the limit in the unpushed commits"));
        }
        let msgs = run_ok(repo, &["log", "-z", "--reverse", "--format=%B", &range], Kind::Read)?.stdout;
        let msg = msgs.split('\0').map(str::trim).filter(|m| !m.is_empty()).collect::<Vec<_>>().join("\n\n");
        // 백업 브랜치
        let backup = (1..)
            .map(|n| if n == 1 { "hv-oversize-backup".to_string() } else { format!("hv-oversize-backup-{n}") })
            .find(|b| !run(repo, &["rev-parse", "--verify", "-q", &format!("refs/heads/{b}")], Kind::Read).is_ok_and(|o| o.ok))
            .unwrap();
        run_ok(repo, &["branch", &backup, "HEAD"], Kind::Write)?;
        // 올라가지 않은 커밋을 풀어(인덱스는 그대로) 큰 파일만 빼고 하나로 다시 커밋
        match &base {
            Some(b) => run_ok(repo, &["reset", "--soft", b], Kind::Write)?,
            None => run_ok(repo, &["update-ref", "-d", "HEAD"], Kind::Write)?,
        };
        let undo = |e: GitResult| {
            let _ = run(repo, &["reset", "--soft", &backup], Kind::Write);
            GitResult { message: format!("{} (your commits are safe on {backup})", e.message), ..e }
        };
        let mut rm = vec!["rm", "--cached", "-r", "-q", "--ignore-unmatch", "--"];
        rm.extend(big.iter().map(String::as_str));
        run_ok(repo, &rm, Kind::Write).map_err(undo)?;
        add_ignore(repo, &big).map_err(undo)?;
        run_ok(repo, &["add", ".gitignore"], Kind::Write).map_err(undo)?;
        let c = run(repo, &["commit", "-m", &msg], Kind::Write).map_err(undo)?;
        if !c.ok && !format!("{}{}", c.stdout, c.stderr).contains("nothing to commit") {
            return Err(undo(from_out(&c)));
        }
        push_unlocked(repo)
    })
}
pub fn remove_oversize(repo: &Path, limit: u64) -> GitResult {
    flat(remove_oversize_r(repo, limit))
}

fn publish_r(repo: &Path, name: &str, private: bool, gh: Option<PathBuf>) -> R<GitResult> {
    let gh = gh.ok_or_else(|| failure("gh not installed"))?;
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c)) {
        return Err(failure("Invalid repository name"));
    }
    locked(repo, || {
        if !run_ok(repo, &["remote"], Kind::Read)?.stdout.trim().is_empty() {
            return Err(failure("This folder already has a remote"));
        }
        if !run_ok(repo, &["status", "--porcelain"], Kind::Read)?.stdout.trim().is_empty() {
            run_ok(repo, &["add", "-A"], Kind::Write)?;
            run_ok(repo, &["commit", "-m", "Initial commit"], Kind::Write)?;
        }
        let mut c = Command::new(gh);
        c.current_dir(repo).args(publish_args(name, private)).env("GH_PROMPT_DISABLED", "1").env("GIT_TERMINAL_PROMPT", "0").env("GCM_INTERACTIVE", "never");
        quiet(&mut c);
        let o = finish(exec(c, limit_of(Kind::Net)))?;
        if o.ok { Ok(success()) } else { Err(from_out(&o)) }
    })
}
pub fn publish(repo: &Path, name: &str, private: bool, gh: Option<PathBuf>) -> GitResult {
    flat(publish_r(repo, name, private, gh))
}

fn branches_r(repo: &Path) -> R<GitBranches> {
    let o = run_ok(repo, &["for-each-ref", "--count=200", "--format=%(HEAD)%(refname:short)", "refs/heads"], Kind::Read)?;
    let branches = o
        .stdout
        .lines()
        .filter(|l| l.len() > 1)
        .map(|l| Branch { name: l[1..].trim().to_string(), current: l.starts_with('*') })
        .collect();
    Ok(GitBranches { res: success(), branches })
}
pub fn branches(repo: &Path) -> GitBranches {
    branches_r(repo).unwrap_or_else(|res| GitBranches { res, branches: vec![] })
}

fn simple_write(repo: &Path, args: &[&str]) -> R<GitResult> {
    locked(repo, || run_ok(repo, args, Kind::Write).map(|_| success()))
}
pub fn switch(repo: &Path, name: &str) -> GitResult {
    flat(good_branch_name(repo, name).and_then(|_| simple_write(repo, &["switch", name])))
}
pub fn branch_new(repo: &Path, name: &str) -> GitResult {
    flat(good_branch_name(repo, name).and_then(|_| simple_write(repo, &["switch", "-c", name])))
}
fn branch_delete_r(repo: &Path, name: &str) -> R<GitResult> {
    good_branch_name(repo, name)?;
    if branches_r(repo)?.branches.iter().any(|b| b.current && b.name == name) {
        return Err(failure("Cannot delete the current branch"));
    }
    simple_write(repo, &["branch", "-d", name])
}
pub fn branch_delete(repo: &Path, name: &str) -> GitResult {
    flat(branch_delete_r(repo, name))
}

/// Tauri 명령(lib.rs 에서 git::cmds::… 로 등록). 오래 걸릴 수 있어 블로킹 스레드에서 돈다
pub mod cmds {
    use super::*;

    async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
        tauri::async_runtime::spawn_blocking(f).await.expect("git 작업 스레드")
    }

    #[tauri::command]
    pub async fn git_status(repo: String) -> GitStatus {
        blocking(move || status(Path::new(&repo))).await
    }
    #[tauri::command]
    pub async fn git_log(repo: String, n: usize) -> GitLog {
        blocking(move || log(Path::new(&repo), n)).await
    }
    #[tauri::command]
    pub async fn git_commit(repo: String, paths: Vec<String>, message: String) -> GitResult {
        blocking(move || commit(Path::new(&repo), &paths, &message)).await
    }
    #[tauri::command]
    pub async fn git_push(repo: String) -> GitResult {
        blocking(move || push(Path::new(&repo))).await
    }
    #[tauri::command]
    pub async fn git_pull(repo: String) -> GitResult {
        blocking(move || pull(Path::new(&repo))).await
    }
    #[tauri::command]
    pub async fn git_discard(repo: String, path: String, tracked: bool) -> GitResult {
        // C2 합친 뒤 연결: 아래 훅을 `|p| crate::fs::trash_move_sync(p.to_string_lossy().into_owned())` 로 바꾼다.
        // 그 전에는 휴지통이 없으므로 아무것도 지우지 않고 거절한다.
        blocking(move || discard(Path::new(&repo), &path, tracked, &|p| crate::fs::trash_move_sync(p.to_string_lossy().into_owned()))).await
    }
    #[tauri::command]
    pub async fn git_oversize(repo: String, paths: Vec<String>) -> GitOversize {
        blocking(move || oversize_check(Path::new(&repo), &paths, OVERSIZE_LIMIT)).await
    }
    #[tauri::command]
    pub async fn git_keep_off(repo: String, paths: Vec<String>) -> GitResult {
        blocking(move || keep_off(Path::new(&repo), &paths)).await
    }
    #[tauri::command]
    pub async fn git_remove_oversize(repo: String) -> GitResult {
        blocking(move || remove_oversize(Path::new(&repo), OVERSIZE_LIMIT)).await
    }
    #[tauri::command]
    pub async fn git_publish(repo: String, name: String, private: bool) -> GitResult {
        blocking(move || publish(Path::new(&repo), &name, private, crate::gh::gh_path())).await
    }
    #[tauri::command]
    pub async fn git_branches(repo: String) -> GitBranches {
        blocking(move || branches(Path::new(&repo))).await
    }
    #[tauri::command]
    pub async fn git_switch(repo: String, name: String) -> GitResult {
        blocking(move || switch(Path::new(&repo), &name)).await
    }
    #[tauri::command]
    pub async fn git_branch_new(repo: String, name: String) -> GitResult {
        blocking(move || branch_new(Path::new(&repo), &name)).await
    }
    #[tauri::command]
    pub async fn git_branch_delete(repo: String, name: String) -> GitResult {
        blocking(move || branch_delete(Path::new(&repo), &name)).await
    }
}

#[cfg(test)]
mod tests;
