// C3 시험. 기대값은 명세(spec/3묶음-3.md S-1000~S-1018)와 docs_git 문장에서만 가져왔다.
// 임시 저장소와 로컬 bare remote 만 쓴다. git 이 없으면 건너뛴다. 진짜 GitHub 는 부르지 않는다.
use super::*;
use std::fs;
use std::time::Instant;

fn git_ok() -> bool {
    Command::new("git").arg("--version").output().map(|o| o.status.success()).unwrap_or(false)
}
macro_rules! need_git {
    () => {
        if !git_ok() {
            eprintln!("git 없음 — 건너뜀");
            return;
        }
    };
}
fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("symvibe-c3-{}-{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}
fn gx(dir: &Path, args: &[&str]) -> std::process::Output {
    Command::new("git").current_dir(dir).args(args).output().unwrap()
}
fn g(dir: &Path, args: &[&str]) -> String {
    let o = gx(dir, args);
    assert!(o.status.success(), "git {:?}: {}", args, String::from_utf8_lossy(&o.stderr));
    String::from_utf8_lossy(&o.stdout).trim().to_string()
}
fn ident(dir: &Path) {
    g(dir, &["config", "user.name", "t"]);
    g(dir, &["config", "user.email", "t@t"]);
    g(dir, &["config", "commit.gpgsign", "false"]);
}
fn repo(name: &str) -> PathBuf {
    let d = tmp(name);
    g(&d, &["init", "-q", "-b", "main"]);
    ident(&d);
    d
}
fn put(dir: &Path, rel: &str, s: &str) {
    let p = dir.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, s).unwrap();
}
fn commit_all(dir: &Path, msg: &str) {
    g(dir, &["add", "-A"]);
    g(dir, &["commit", "-q", "-m", msg]);
}
/// work(origin=bare, 첫 커밋 push 전) 와 bare
fn with_remote(name: &str) -> (PathBuf, PathBuf) {
    let base = tmp(name);
    let bare = base.join("remote.git");
    fs::create_dir_all(&bare).unwrap();
    g(&bare, &["init", "-q", "--bare", "-b", "main"]);
    let work = base.join("work");
    fs::create_dir_all(&work).unwrap();
    g(&work, &["init", "-q", "-b", "main"]);
    ident(&work);
    g(&work, &["remote", "add", "origin", bare.to_str().unwrap()]);
    put(&work, "a.txt", "1\n");
    commit_all(&work, "first");
    (work, bare)
}
fn clone_of(bare: &Path, base: &Path) -> PathBuf {
    let other = base.join("other");
    g(base, &["clone", "-q", bare.to_str().unwrap(), "other"]);
    ident(&other);
    other
}
fn s(v: &[&str]) -> Vec<String> {
    v.iter().map(|x| x.to_string()).collect()
}
fn head_files(d: &Path) -> Vec<String> {
    g(d, &["show", "--name-only", "--format=", "HEAD"]).lines().map(String::from).collect()
}

// ---------- 순수 함수 ----------
#[test]
fn parse_status_codes_and_branch_header() {
    // S-1002 상태 코드 M/A/D/R/?, 이름 바꾸기는 다음 항목(원래 이름)을 건너뜀
    let t = "## main...origin/main [ahead 1, behind 2]\0 M a.txt\0A  b.txt\0 D c.txt\0R  new.txt\0old.txt\0?? u.txt\0";
    let p = parse_status(t, 400);
    assert_eq!(p.branch, "main");
    assert_eq!(p.upstream.as_deref(), Some("origin/main"));
    assert_eq!((p.ahead, p.behind), (1, 2));
    assert!(!p.detached && !p.conflict);
    let got: Vec<(&str, &str)> = p.files.iter().map(|f| (f.path.as_str(), f.status.as_str())).collect();
    assert_eq!(got, vec![("a.txt", "M"), ("b.txt", "A"), ("c.txt", "D"), ("new.txt", "R"), ("u.txt", "?")]);
    assert_eq!(p.total, 5);
}

#[test]
fn parse_status_detached_unborn_and_no_upstream() {
    let p = parse_status("## HEAD (no branch)\0 M a\0", 400);
    assert!(p.detached);
    assert_eq!(p.upstream, None);
    let p = parse_status("## No commits yet on main\0?? a\0", 400);
    assert_eq!(p.branch, "main");
    assert!(!p.detached);
    let p = parse_status("## dev\0", 400);
    assert_eq!((p.branch.as_str(), p.upstream, p.ahead, p.behind), ("dev", None, 0, 0));
}

#[test]
fn parse_status_caps_list_but_counts_all() {
    // S-1002 목록 400개까지, 총 개수는 전체
    let mut t = String::from("## main\0");
    for i in 0..450 {
        t.push_str(&format!("?? f{i}.txt\0"));
    }
    let p = parse_status(&t, 400);
    assert_eq!(p.files.len(), 400);
    assert_eq!(p.total, 450);
}

#[test]
fn parse_status_conflict_flag() {
    // S-1002 미해결 충돌 여부
    assert!(parse_status("## main\0UU x\0", 400).conflict);
    assert!(parse_status("## main\0AA x\0", 400).conflict);
    assert!(!parse_status("## main\0 M x\0", 400).conflict);
}

#[test]
fn numstat_parse_binary_is_minus_one_and_rename() {
    // S-1002·S-1018 바이너리는 -1
    let m = parse_numstat("1\t2\ta.txt\0-\t-\tbin.png\03\t4\t\0old.txt\0new.txt\0");
    assert_eq!(m["a.txt"], (1, 2));
    assert_eq!(m["bin.png"], (-1, -1));
    assert_eq!(m["new.txt"], (3, 4));
}

#[test]
fn log_parse() {
    // S-1003 {hash, subject, author, time}
    let t = "abc1234\x1fFix: thing\x1fAnn\x1f2026-10-24T10:00:00+09:00\x1edef5678\x1fSecond\x1fBob\x1f2026-10-23T09:00:00+09:00\x1e";
    let v = parse_log(t);
    assert_eq!(v.len(), 2);
    assert_eq!(v[0], Commit { hash: "abc1234".into(), subject: "Fix: thing".into(), author: "Ann".into(), time: "2026-10-24T10:00:00+09:00".into() });
    assert_eq!(v[1].subject, "Second");
    assert!(parse_log("").is_empty());
}

#[test]
fn ahead_behind_text() {
    assert_eq!(ahead_behind("ahead 2, behind 1"), (2, 1));
    assert_eq!(ahead_behind("[ahead 3]"), (3, 0));
    assert_eq!(ahead_behind("behind 4"), (0, 4));
    assert_eq!(ahead_behind("gone"), (0, 0));
    assert_eq!(ahead_behind(""), (0, 0));
}

#[test]
fn remote_to_web_cases() {
    // S-1015
    let want = Some("https://github.com/o/r".to_string());
    assert_eq!(remote_to_web("git@github.com:o/r.git"), want);
    assert_eq!(remote_to_web("https://github.com/o/r.git"), want);
    assert_eq!(remote_to_web("ssh://git@github.com/o/r"), want);
    assert_eq!(remote_to_web("https://github.com/o/r"), want);
    assert_eq!(remote_to_web("git@gitlab.com:o/r.git"), None);
    assert_eq!(remote_to_web("https://example.com/o/r.git"), None);
    assert_eq!(remote_to_web("C:/some/local.git"), None);
    assert_eq!(remote_to_web(""), None);
}

#[test]
fn shorten_error_last_meaningful_line() {
    // S-1014 fatal:/error: 접두 제거, 힌트·빈 줄 건너뜀, 400자까지
    assert_eq!(shorten_error("fatal: not a git repository\n"), "not a git repository");
    assert_eq!(shorten_error("To x\n ! [rejected] a -> a\nerror: failed to push some refs\nhint: Updates were rejected\nhint: more\n\n"), "failed to push some refs");
    assert_eq!(shorten_error(""), "");
    let long = format!("error: {}", "x".repeat(900));
    assert_eq!(shorten_error(&long).chars().count(), 400);
}

#[test]
fn ignore_line_add_dedup_and_newline() {
    // S-1010 중복 안 함, 파일 끝 줄바꿈 보장
    assert_eq!(ignore_line_add("", "big.bin"), "/big.bin\n");
    assert_eq!(ignore_line_add("node_modules", "big.bin"), "node_modules\n/big.bin\n");
    assert_eq!(ignore_line_add("a\n", "big.bin"), "a\n/big.bin\n");
    let once = ignore_line_add("a\n/big.bin\n", "big.bin");
    assert_eq!(once, "a\n/big.bin\n");
    assert_eq!(ignore_line_add("big.bin", "big.bin"), "big.bin\n"); // 이미 같은 경로 줄이 있으면 더하지 않음(끝 줄바꿈만 맞춤)
}

#[test]
fn publish_args_order() {
    // S-1012
    assert_eq!(publish_args("proj", true), s(&["repo", "create", "proj", "--private", "--source", ".", "--remote", "origin", "--push"]));
    assert_eq!(publish_args("proj", false)[3], "--public");
}

#[test]
fn publish_without_gh_says_not_installed() {
    // S-1012 gh 가 없으면 `gh not installed`
    let d = repo("pub-nogh");
    put(&d, "a.txt", "x");
    let r = publish(&d, "proj", true, None);
    assert!(!r.ok);
    assert_eq!(r.message, "gh not installed");
    assert!(gx(&d, &["log"]).stdout.is_empty(), "gh 가 없으면 커밋도 하지 않는다");
}

// ---------- 실행기 ----------
#[test]
fn exec_wall_limit_kills_slow_command() {
    need_git!();
    let d = tmp("wall");
    let t = Instant::now();
    let o = exec(git_cmd(&d, &["-c", "alias.slow=!sleep 5", "slow"]), Limit::Wall(Duration::from_millis(300))).unwrap();
    assert!(o.timed_out && !o.ok);
    assert!(t.elapsed() < Duration::from_secs(3), "{:?}", t.elapsed());
}

#[test]
fn exec_idle_limit_only_counts_silence() {
    need_git!();
    let d = tmp("idle");
    // 말없이 오래 → 멈춤
    let o = exec(git_cmd(&d, &["-c", "alias.slow=!sleep 5", "slow"]), Limit::Idle(Duration::from_millis(400))).unwrap();
    assert!(o.timed_out);
    // 계속 출력하면 전체 시간이 한도를 넘어도 안 멈춤(S-1001 push 는 길게 걸려도 허용)
    let o = exec(git_cmd(&d, &["-c", "alias.chat=!for i in 1 2 3 4 5 6; do echo x; sleep 0.3; done", "chat"]), Limit::Idle(Duration::from_millis(1000))).unwrap();
    assert!(!o.timed_out && o.ok, "{}", o.stderr);
    assert_eq!(o.stdout.matches('x').count(), 6);
}

#[test]
fn git_cmd_env_never_asks_password() {
    // S-1000
    let c = git_cmd(Path::new("."), &["status"]);
    let env: HashMap<String, String> = c.get_envs().filter_map(|(k, v)| Some((k.to_string_lossy().into(), v?.to_string_lossy().into()))).collect();
    assert_eq!(env.get("GIT_TERMINAL_PROMPT").map(String::as_str), Some("0"));
    assert_eq!(env.get("GCM_INTERACTIVE").map(String::as_str), Some("never"));
    assert_eq!(env.get("LC_ALL").map(String::as_str), Some("C"));
    assert!(env.get("GIT_SSH_COMMAND").unwrap().contains("BatchMode=yes"));
}

// ---------- 읽기 ----------
#[test]
fn status_real_repo() {
    need_git!();
    let d = repo("status");
    put(&d, "a.txt", "l1\nl2\n");
    put(&d, "c.txt", "gone\n");
    commit_all(&d, "init");
    put(&d, "a.txt", "l1\nl2\nl3\n");
    put(&d, "u.txt", "new\n");
    fs::remove_file(d.join("c.txt")).unwrap();
    let st = status(&d);
    assert!(st.res.ok, "{}", st.res.message);
    assert_eq!(st.branch, "main");
    assert!(!st.detached && !st.conflict);
    assert_eq!(st.upstream, None);
    assert_eq!(st.total, 3);
    let f = |p: &str| st.files.iter().find(|f| f.path == p).unwrap().clone();
    assert_eq!((f("a.txt").status.as_str(), f("a.txt").add, f("a.txt").del), ("M", 1, 0));
    assert_eq!(f("c.txt").status, "D");
    assert_eq!((f("u.txt").status.as_str(), f("u.txt").add), ("?", -1)); // S-1018 추적 안 하는 파일은 줄 수 없음
}

#[test]
fn status_not_a_repo_and_detached() {
    need_git!();
    let d = tmp("notgit");
    let st = status(&d);
    assert!(!st.res.ok && st.res.not_git, "{:?}", st.res);
    let r = repo("detached");
    put(&r, "a", "1");
    commit_all(&r, "one");
    g(&r, &["checkout", "-q", "--detach"]);
    let st = status(&r);
    assert!(st.detached);
    assert_eq!(st.branch, g(&r, &["rev-parse", "--short", "HEAD"])); // 분리 HEAD 는 짧은 해시
}

#[test]
fn status_unborn_repo_ok() {
    need_git!();
    let d = repo("unborn");
    put(&d, "a", "1");
    let st = status(&d);
    assert!(st.res.ok, "{}", st.res.message);
    assert_eq!(st.branch, "main");
    assert_eq!(st.total, 1);
}

#[test]
fn log_lists_recent_and_empty_repo() {
    need_git!();
    let d = repo("log");
    assert!(log(&d, 100).commits.is_empty()); // 커밋이 없는 저장소는 빈 목록
    assert!(log(&d, 100).res.ok);
    for i in 0..5 {
        put(&d, "a", &format!("{i}"));
        commit_all(&d, &format!("c{i}"));
    }
    let l = log(&d, 3);
    assert_eq!(l.commits.iter().map(|c| c.subject.as_str()).collect::<Vec<_>>(), vec!["c4", "c3", "c2"]);
    assert_eq!(l.commits[0].author, "t");
    assert_eq!(l.commits[0].hash.len(), 7);
    assert!(l.commits[0].time.starts_with("20"));
}

// ---------- commit ----------
#[test]
fn commit_takes_only_chosen_files() {
    need_git!();
    let d = repo("commit");
    for f in ["a", "b", "c"] {
        put(&d, f, "0");
    }
    commit_all(&d, "init");
    put(&d, "a", "1");
    put(&d, "b", "1");
    put(&d, "c", "1");
    g(&d, &["add", "b"]); // 이미 스테이지된 다른 파일
    let r = commit(&d, &s(&["a"]), "only a");
    assert!(r.ok, "{}", r.message);
    assert_eq!(head_files(&d), vec!["a"]);
    // 고르지 않은 변경은 작업 폴더에 그대로 남음
    assert_eq!(fs::read_to_string(d.join("b")).unwrap(), "1");
    let st = status(&d);
    let left: Vec<&str> = st.files.iter().map(|f| f.path.as_str()).collect();
    assert_eq!(left, vec!["b", "c"]);
}

#[test]
fn commit_new_and_deleted_files_and_first_commit() {
    need_git!();
    let d = repo("commit2");
    put(&d, "x", "1");
    put(&d, "y", "1");
    let r = commit(&d, &s(&["x"]), "first only x"); // 첫 커밋(HEAD 없음)에서도 고른 것만
    assert!(r.ok, "{}", r.message);
    assert_eq!(head_files(&d), vec!["x"]);
    fs::remove_file(d.join("x")).unwrap();
    put(&d, "z", "different content");
    let r = commit(&d, &s(&["x", "z"]), "del x add z");
    assert!(r.ok, "{}", r.message);
    assert_eq!(g(&d, &["show", "--name-status", "--format=", "HEAD"]).lines().count(), 2);
    assert_eq!(status(&d).files.iter().map(|f| f.path.clone()).collect::<Vec<_>>(), vec!["y"]);
}

#[test]
fn commit_rejects_empty_message_or_paths() {
    need_git!();
    let d = repo("commit3");
    put(&d, "a", "1");
    let r = commit(&d, &s(&["a"]), "   ");
    assert!(!r.ok);
    assert!(!r.message.is_empty());
    assert!(!commit(&d, &[], "msg").ok);
    assert!(gx(&d, &["log"]).stdout.is_empty(), "거절됐으니 커밋 없음");
}

#[test]
fn commit_refused_while_merge_conflicts() {
    need_git!();
    let d = repo("conflict");
    put(&d, "a", "1\n");
    commit_all(&d, "base");
    g(&d, &["checkout", "-q", "-b", "other"]);
    put(&d, "a", "2\n");
    commit_all(&d, "other");
    g(&d, &["checkout", "-q", "main"]);
    put(&d, "a", "3\n");
    commit_all(&d, "main");
    assert!(!gx(&d, &["merge", "other"]).status.success());
    assert!(status(&d).conflict);
    let r = commit(&d, &s(&["a"]), "try");
    assert!(!r.ok);
    assert_eq!(r.message, "Resolve the merge conflicts first"); // S-1007
}

#[test]
fn commit_without_identity_returns_git_error() {
    need_git!();
    // 앱이 대신 설정하지 않는다(S-1004): 이 저장소에 user 설정이 없고 전역도 없게 환경을 비움
    let d = tmp("noident");
    g(&d, &["init", "-q", "-b", "main"]);
    put(&d, "a", "1");
    let mut c = git_cmd(&d, &["commit", "-m", "x"]);
    c.env("GIT_CONFIG_GLOBAL", "NUL").env("GIT_CONFIG_NOSYSTEM", "1").env("GIT_AUTHOR_NAME", "").env("GIT_COMMITTER_NAME", "");
    // 실행기가 만든 명령으로 직접 확인할 수 있는 것: 실패하면 ok=false 와 git 문구가 나옴
    let o = exec(c, Limit::Wall(Duration::from_secs(15))).unwrap();
    assert!(!o.ok);
    assert!(!shorten_error(&o.stderr).is_empty());
}

// ---------- push / pull ----------
#[test]
fn push_sets_upstream_then_ahead_behind() {
    need_git!();
    let (w, bare) = with_remote("push");
    let r = push(&w); // upstream 이 없고 remote 가 있으면 -u origin <브랜치>
    assert!(r.ok, "{}", r.message);
    let st = status(&w);
    assert_eq!(st.upstream.as_deref(), Some("origin/main"));
    assert_eq!((st.ahead, st.behind), (0, 0));
    assert_eq!(st.remote_url.as_deref(), Some(bare.to_str().unwrap()));
    assert_eq!(st.web_url, None); // 로컬 경로는 GitHub 가 아님
    put(&w, "b.txt", "1");
    commit_all(&w, "second");
    assert_eq!(status(&w).ahead, 1);
    assert!(push(&w).ok); // upstream 있으면 그냥 push
    assert_eq!(g(&bare, &["rev-list", "--count", "main"]), "2");
}

#[test]
fn push_without_remote_fails_with_message() {
    need_git!();
    let d = repo("push-none");
    put(&d, "a", "1");
    commit_all(&d, "one");
    let r = push(&d);
    assert!(!r.ok);
    assert!(!r.message.is_empty());
}

#[test]
fn push_rejected_returns_last_git_line() {
    need_git!();
    let (w, bare) = with_remote("push-rej");
    assert!(push(&w).ok);
    let other = clone_of(&bare, w.parent().unwrap());
    put(&other, "o.txt", "1");
    commit_all(&other, "other");
    g(&other, &["push", "-q"]);
    put(&w, "w.txt", "1");
    commit_all(&w, "mine");
    let r = push(&w); // 앞서가지 못함 → 거절
    assert!(!r.ok);
    assert!(r.message.contains("failed to push") || r.message.contains("rejected"), "{}", r.message);
    assert!(!r.message.starts_with("error:") && !r.message.starts_with("fatal:"));
}

#[test]
fn pull_fast_forward_ok_and_behind_without_fetch() {
    need_git!();
    let (w, bare) = with_remote("pull-ff");
    assert!(push(&w).ok);
    let other = clone_of(&bare, w.parent().unwrap());
    put(&other, "o.txt", "from other");
    commit_all(&other, "other");
    g(&other, &["push", "-q"]);
    assert_eq!(status(&w).behind, 0); // 스스로 fetch 하지 않는다(S-1002)
    g(&w, &["fetch", "-q"]);
    assert_eq!(status(&w).behind, 1);
    let r = pull(&w);
    assert!(r.ok, "{}", r.message);
    assert!(!r.diverged);
    assert_eq!(fs::read_to_string(w.join("o.txt")).unwrap(), "from other");
    assert!(pull(&w).ok); // behind 0 이어도 실행한다(S-1006)
}

#[test]
fn pull_diverged_reports_flag() {
    need_git!();
    let (w, bare) = with_remote("pull-div");
    assert!(push(&w).ok);
    let other = clone_of(&bare, w.parent().unwrap());
    put(&other, "o.txt", "1");
    commit_all(&other, "other");
    g(&other, &["push", "-q"]);
    put(&w, "w.txt", "1");
    commit_all(&w, "mine");
    g(&w, &["fetch", "-q"]);
    let r = pull(&w);
    assert!(!r.ok);
    assert!(r.diverged, "{}", r.message);
    assert!(!w.join("o.txt").exists(), "병합하지 않는다(ff-only)");
}

// ---------- discard ----------
#[test]
fn discard_tracked_sends_copy_to_trash_hook_and_restores_head() {
    need_git!();
    let d = repo("discard");
    put(&d, "a.txt", "committed\n");
    commit_all(&d, "init");
    put(&d, "a.txt", "my edit\n");
    let bin = tmp("discard-bin");
    let hook = |p: &Path| -> Result<(), String> {
        fs::copy(p, bin.join("copy.txt")).map_err(|e| e.to_string())?; // 가짜 휴지통: 사본을 받고
        fs::remove_file(p).map_err(|e| e.to_string()) // 파일을 옮긴다
    };
    let r = discard(&d, "a.txt", true, &hook);
    assert!(r.ok, "{}", r.message);
    assert_eq!(fs::read_to_string(bin.join("copy.txt")).unwrap(), "my edit\n");
    assert_eq!(fs::read_to_string(d.join("a.txt")).unwrap().replace("\r\n", "\n"), "committed\n"); // autocrlf 로 줄바꿈이 달라질 수 있음
    assert!(status(&d).files.is_empty());
}

#[test]
fn discard_untracked_only_trashes() {
    need_git!();
    let d = repo("discard-u");
    put(&d, "a", "1");
    commit_all(&d, "init");
    put(&d, "u.txt", "temp");
    let called = std::cell::RefCell::new(vec![]);
    let hook = |p: &Path| -> Result<(), String> {
        called.borrow_mut().push(p.to_path_buf());
        fs::remove_file(p).map_err(|e| e.to_string())
    };
    let r = discard(&d, "u.txt", false, &hook);
    assert!(r.ok, "{}", r.message);
    assert_eq!(called.borrow().len(), 1);
    assert!(!d.join("u.txt").exists());
}

#[test]
fn discard_trash_failure_leaves_file_and_changes() {
    need_git!();
    let d = repo("discard-f");
    put(&d, "a.txt", "committed\n");
    commit_all(&d, "init");
    put(&d, "a.txt", "my edit\n");
    let hook = |_: &Path| -> Result<(), String> { Err("no trash".into()) };
    let r = discard(&d, "a.txt", true, &hook);
    assert!(!r.ok);
    assert_eq!(fs::read_to_string(d.join("a.txt")).unwrap(), "my edit\n"); // 사본을 못 남겼으면 지우지 않는다
}

#[test]
fn discard_rejects_paths_outside_repo() {
    need_git!();
    let d = repo("discard-esc");
    put(&d, "a", "1");
    commit_all(&d, "init");
    let outside = d.parent().unwrap().join("outside-c3.txt");
    fs::write(&outside, "keep").unwrap();
    let hook = |p: &Path| -> Result<(), String> { fs::remove_file(p).map_err(|e| e.to_string()) };
    assert!(!discard(&d, "../outside-c3.txt", false, &hook).ok);
    assert!(!discard(&d, outside.to_str().unwrap(), false, &hook).ok);
    assert!(outside.exists());
}

// ---------- 100MB ----------
#[test]
fn oversize_finds_files_over_limit() {
    let d = tmp("oversize");
    put(&d, "big.bin", &"x".repeat(2000));
    put(&d, "small.txt", "x");
    put(&d, "dir/inner.bin", &"x".repeat(3000));
    put(&d, "dir/ok.txt", "x");
    let mut got = oversize(&d, &s(&["big.bin", "small.txt", "dir/", "missing"]), 1000);
    got.sort_by(|a, b| a.path.cmp(&b.path));
    assert_eq!(got, vec![BigFile { path: "big.bin".into(), size: 2000 }, BigFile { path: "dir/inner.bin".into(), size: 3000 }]);
    assert!(oversize(&d, &s(&["big.bin"]), 2000).is_empty()); // 한도와 같으면 넘은 것이 아님
    assert_eq!(OVERSIZE_LIMIT, 100 * 1024 * 1024);
}

#[test]
fn keep_off_untracks_and_ignores_once() {
    need_git!();
    let d = repo("keepoff");
    put(&d, "big.bin", "12345");
    put(&d, "a", "1");
    commit_all(&d, "init");
    put(&d, "new.bin", "9");
    let r = keep_off(&d, &s(&["big.bin", "new.bin"]));
    assert!(r.ok, "{}", r.message);
    assert!(d.join("big.bin").exists(), "작업 폴더의 파일은 지우지 않는다");
    assert!(!g(&d, &["ls-files"]).contains("big.bin"));
    let ig = fs::read_to_string(d.join(".gitignore")).unwrap();
    assert!(ig.ends_with('\n'));
    assert_eq!(ig.matches("big.bin").count(), 1);
    assert_eq!(ig.matches("new.bin").count(), 1);
    assert!(keep_off(&d, &s(&["big.bin"])).ok);
    assert_eq!(fs::read_to_string(d.join(".gitignore")).unwrap().matches("big.bin").count(), 1);
    // 이제 상태에 big.bin 이 새 파일로 안 뜬다
    assert!(!status(&d).files.iter().any(|f| f.path == "big.bin" && f.status == "?"));
}

#[test]
fn remove_oversize_rewrites_unpushed_with_backup_branch() {
    need_git!();
    let (w, bare) = with_remote("rmover");
    assert!(push(&w).ok);
    let pushed = g(&w, &["rev-parse", "HEAD"]);
    put(&w, "keep.txt", "k1");
    put(&w, "big.bin", &"x".repeat(5000));
    commit_all(&w, "add big and keep");
    put(&w, "keep.txt", "k2");
    commit_all(&w, "edit keep");
    let before = g(&w, &["rev-parse", "HEAD"]);
    let r = remove_oversize(&w, 1000);
    assert!(r.ok, "{}", r.message);
    assert_eq!(g(&w, &["rev-parse", "hv-oversize-backup"]), before); // 먼저 HEAD 를 백업 브랜치로
    let files = g(&w, &["ls-tree", "-r", "--name-only", "HEAD"]);
    assert!(files.contains("keep.txt") && files.contains("a.txt"));
    assert!(!files.contains("big.bin"), "큰 파일이 새 커밋에 없음");
    assert!(w.join("big.bin").exists());
    assert!(fs::read_to_string(w.join(".gitignore")).unwrap().contains("big.bin"));
    assert_eq!(g(&w, &["rev-parse", "HEAD~1"]), pushed, "이미 올라간 커밋은 건드리지 않음");
    assert_eq!(g(&w, &["rev-list", "--count", "HEAD"]), "2", "올라가지 않은 커밋은 하나로 합쳐짐");
    let msg = g(&w, &["log", "-1", "--format=%B"]);
    assert!(msg.contains("add big and keep") && msg.contains("edit keep"), "{msg}");
    // push 까지: 서버 쪽에도 큰 파일이 없다
    assert_eq!(g(&bare, &["rev-parse", "main"]), g(&w, &["rev-parse", "HEAD"]));
    assert!(!g(&bare, &["ls-tree", "-r", "--name-only", "main"]).contains("big.bin"));
    // 한 번 더 하면 -2
    put(&w, "big2.bin", &"y".repeat(5000));
    commit_all(&w, "again");
    assert!(remove_oversize(&w, 1000).ok);
    assert!(gx(&w, &["rev-parse", "--verify", "-q", "hv-oversize-backup-2"]).status.success());
}

// ---------- 브랜치 ----------
#[test]
fn branches_switch_new_delete() {
    need_git!();
    let d = repo("branches");
    put(&d, "a", "1");
    commit_all(&d, "init");
    let b = branches(&d);
    assert_eq!(b.branches, vec![Branch { name: "main".into(), current: true }]);
    assert!(branch_new(&d, "feat/x").ok);
    assert!(!branch_new(&d, "bad name").ok, "잘못된 이름 거절");
    assert!(!branch_new(&d, "-d").ok);
    assert!(!branch_new(&d, "feat/x").ok, "이미 있는 이름");
    let b = branches(&d);
    assert_eq!(b.branches.iter().find(|x| x.current).unwrap().name, "feat/x");
    assert_eq!(b.branches.len(), 2);
    assert!(!branch_delete(&d, "feat/x").ok, "현재 브랜치는 삭제 불가");
    assert!(switch(&d, "main").ok);
    assert_eq!(status(&d).branch, "main");
    assert!(branch_delete(&d, "feat/x").ok);
    assert_eq!(branches(&d).branches.len(), 1);
}

#[test]
fn branch_delete_refuses_unmerged_and_switch_refuses_overwrite() {
    need_git!();
    let d = repo("branches2");
    put(&d, "a", "1");
    commit_all(&d, "init");
    g(&d, &["switch", "-q", "-c", "u"]);
    put(&d, "a", "2");
    commit_all(&d, "on u");
    g(&d, &["switch", "-q", "main"]);
    let r = branch_delete(&d, "u");
    assert!(!r.ok);
    assert!(r.message.contains("not fully merged"), "{}", r.message);
    // 미커밋 변경을 덮어쓰게 되면 git 이 거절하고 그 문구를 돌려줌
    put(&d, "a", "local");
    let r = switch(&d, "u");
    assert!(!r.ok);
    assert!(!r.message.is_empty());
    assert_eq!(fs::read_to_string(d.join("a")).unwrap(), "local");
}

// ---------- 쓰기 뮤텍스 ----------
#[test]
fn concurrent_commits_do_not_collide_on_index_lock() {
    need_git!();
    let d = repo("mutex");
    put(&d, "seed", "0");
    commit_all(&d, "seed");
    for i in 0..6 {
        put(&d, &format!("p{i}"), "1");
        put(&d, &format!("q{i}"), "1");
    }
    let (d1, d2) = (d.clone(), d.clone());
    let t1 = std::thread::spawn(move || (0..6).map(|i| commit(&d1, &[format!("p{i}")], &format!("p{i}"))).collect::<Vec<_>>());
    let t2 = std::thread::spawn(move || (0..6).map(|i| commit(&d2, &[format!("q{i}")], &format!("q{i}"))).collect::<Vec<_>>());
    for r in t1.join().unwrap().into_iter().chain(t2.join().unwrap()) {
        assert!(r.ok, "{}", r.message);
    }
    assert_eq!(g(&d, &["rev-list", "--count", "HEAD"]), "13");
}
