// A9 Resume: Claude transcript 존재 확인(S-237), Codex 세션 찾기(S-238).
// 홈·CODEX_HOME 은 인자로 받아 시험에서 임시 폴더를 쓴다.
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// repo 경로 → Claude projects 폴더 이름: 영숫자(ASCII)가 아닌 글자는 전부 '-' (한글도)
pub fn project_dir_name(repo: &str) -> String {
    repo.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect()
}

/// `<home>\.claude\projects\<변환된 repo>\<id>.jsonl` 이 있는가
pub fn claude_transcript_exists(repo: &str, session_id: &str, home: &Path) -> bool {
    claude_transcript_exists_in(repo, session_id, &home.join(".claude"))
}

/// D12 S-1628: 설정 폴더(`CLAUDE_CONFIG_DIR` 또는 기본 `~/.claude`)를 직접 받는 꼴. `<claude_dir>\projects\<repo>\<id>.jsonl`
pub fn claude_transcript_exists_in(repo: &str, session_id: &str, claude_dir: &Path) -> bool {
    // id 는 UUID 모양만(경로 조각 거부)
    if session_id.is_empty() || !session_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return false;
    }
    claude_dir.join("projects").join(project_dir_name(repo)).join(format!("{session_id}.jsonl")).is_file()
}

/// Windows 경로 비교용: 소문자, '/'→'\', 끝 구분자 제거
fn norm(p: &str) -> String {
    p.to_lowercase().replace('/', "\\").trim_end_matches('\\').to_string()
}

fn created_ms(p: &Path) -> Option<u64> {
    let m = fs::metadata(p).ok()?;
    let t = m.created().or_else(|_| m.modified()).ok()?;
    Some(t.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

pub(crate) fn subdirs(p: &Path) -> Vec<PathBuf> {
    fs::read_dir(p).map(|d| d.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect()).unwrap_or_default()
}

/// 첫 줄 session_meta 의 (id, cwd). 옛 형식(payload 없이 최상위)도 받는다.
fn meta(p: &Path) -> Option<(String, String)> {
    let mut line = String::new();
    BufReader::new(fs::File::open(p).ok()?).read_line(&mut line).ok()?;
    let v: serde_json::Value = serde_json::from_str(&line).ok()?;
    let m = v.get("payload").unwrap_or(&v);
    Some((m.get("id")?.as_str()?.to_string(), m.get("cwd")?.as_str()?.to_string()))
}

/// codex_home/sessions/YYYY/MM/DD/rollout-*.jsonl 중 started_after_ms 뒤에 생기고 첫 줄 cwd 가 repo 와 같고 claimed 에 없는 것의 id.
/// 여럿이면 가장 먼저 생긴 것(콘솔 시작 직후 것).
pub fn codex_find_session(repo: &str, started_after_ms: u64, claimed: &[String], codex_home: &Path) -> Option<String> {
    let want = norm(repo);
    let mut best: Option<(u64, String)> = None;
    for y in subdirs(&codex_home.join("sessions")) {
        for m in subdirs(&y) {
            for d in subdirs(&m) {
                for f in fs::read_dir(&d).into_iter().flatten().flatten().map(|e| e.path()) {
                    let name = f.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if !(name.starts_with("rollout-") && name.ends_with(".jsonl")) {
                        continue;
                    }
                    let Some(t) = created_ms(&f).filter(|t| *t >= started_after_ms) else { continue };
                    let Some((id, cwd)) = meta(&f) else { continue };
                    if norm(&cwd) != want || claimed.contains(&id) {
                        continue;
                    }
                    if best.as_ref().map_or(true, |(bt, _)| t < *bt) {
                        best = Some((t, id));
                    }
                }
            }
        }
    }
    best.map(|(_, id)| id)
}

pub(crate) fn home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from)
}

#[tauri::command]
pub fn claude_transcript_exists_cmd(repo: String, session_id: String, config_dir: Option<String>) -> bool {
    match config_dir {
        Some(d) => claude_transcript_exists_in(&repo, &session_id, &PathBuf::from(d)),
        None => home().is_some_and(|h| claude_transcript_exists(&repo, &session_id, &h)),
    }
}

#[tauri::command]
pub fn codex_find_session_cmd(repo: String, started_after_ms: u64, claimed: Vec<String>, config_dir: Option<String>) -> Option<String> {
    let ch = config_dir.map(PathBuf::from).or_else(|| std::env::var_os("CODEX_HOME").map(PathBuf::from)).or_else(|| home().map(|h| h.join(".codex")))?;
    codex_find_session(&repo, started_after_ms, &claimed, &ch)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn now_ms() -> u64 {
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
    }
    fn tmp(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("symvibe-a9-{tag}-{}-{}", std::process::id(), now_ms()));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn path_name_replaces_non_alnum() {
        // S-237: 이 PC 에서 관찰한 C--Users-me-Desktop----- 와 같은 규칙(한글도 '-')
        assert_eq!(project_dir_name(r"C:\Users\a b\프로젝트"), "C--Users-a-b-----");
        assert_eq!(project_dir_name(r"C:\Users\me\Desktop\잡동사니"), "C--Users-me-Desktop-----");
        assert_eq!(project_dir_name("abc123"), "abc123");
    }

    #[test]
    fn transcript_present_and_absent() {
        let home = tmp("home");
        let repo = r"C:\Users\a b\프로젝트";
        let dir = home.join(".claude").join("projects").join("C--Users-a-b-----");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("11111111-2222-3333-4444-555555555555.jsonl"), "{}\n").unwrap();
        assert!(claude_transcript_exists(repo, "11111111-2222-3333-4444-555555555555", &home));
        assert!(!claude_transcript_exists(repo, "99999999-2222-3333-4444-555555555555", &home), "파일 없음");
        assert!(!claude_transcript_exists(r"C:\other", "11111111-2222-3333-4444-555555555555", &home), "다른 repo 폴더");
        assert!(!claude_transcript_exists(repo, r"..\x", &home), "경로 조각이 든 id 는 거부");
        let _ = fs::remove_dir_all(&home);
    }

    fn rollout(root: &Path, day: &str, name: &str, id: &str, cwd: &str) {
        let dir = root.join("sessions").join(day);
        fs::create_dir_all(&dir).unwrap();
        let first = serde_json::json!({"timestamp": "t", "type": "session_meta", "payload": {"id": id, "cwd": cwd}});
        fs::write(dir.join(name), format!("{first}\n{{\"type\":\"x\"}}\n")).unwrap();
    }

    #[test]
    fn codex_picks_matching_unclaimed_after_start() {
        let ch = tmp("codex");
        let repo = r"C:\work\repo";
        let t0 = now_ms() - 60_000; // 콘솔 시작 시각: 파일들보다 1분 전
        rollout(&ch, "2026/10/24", "rollout-2026-10-24T01-00-00-aaa.jsonl", "aaa", r"C:\work\repo");
        rollout(&ch, "2026/10/24", "rollout-2026-10-24T01-00-01-bbb.jsonl", "bbb", r"C:\work\other");
        // 맞는 것 하나
        assert_eq!(codex_find_session(repo, t0, &[], &ch).as_deref(), Some("aaa"));
        // 다른 cwd 는 제외: bbb 의 repo 로 찾으면 bbb
        assert_eq!(codex_find_session(r"C:\work\other", t0, &[], &ch).as_deref(), Some("bbb"));
        // 이미 다른 콘솔이 가져간 것 제외
        assert_eq!(codex_find_session(repo, t0, &["aaa".to_string()], &ch), None);
        // 시작 뒤에 생긴 것만: 시작 시각이 파일 생성보다 늦으면 제외
        assert_eq!(codex_find_session(repo, now_ms() + 60_000, &[], &ch), None, "시작 전 파일 제외");
        // 대소문자·슬래시 차이는 같은 폴더로 본다(Windows)
        assert_eq!(codex_find_session("c:/work/REPO", t0, &[], &ch).as_deref(), Some("aaa"));
        // 폴더 자체가 없으면 None
        assert_eq!(codex_find_session(repo, t0, &[], &ch.join("nope")), None);
        let _ = fs::remove_dir_all(&ch);
    }

    // D12 S-1628: 설정 폴더 인자
    #[test]
    fn transcript_in_profile_dir() {
        let dir = tmp("prof-claude");
        let repo = r"C:\Users\a b\프로젝트";
        let id = "11111111-2222-3333-4444-555555555555";
        let proj = dir.join("projects").join("C--Users-a-b-----");
        fs::create_dir_all(&proj).unwrap();
        fs::write(proj.join(format!("{id}.jsonl")), "{}\n").unwrap();
        assert!(claude_transcript_exists_in(repo, id, &dir));
        assert!(!claude_transcript_exists_in(repo, id, &dir.join("other")), "다른 프로필 폴더에는 없다");
        assert!(!claude_transcript_exists_in(repo, r"..\x", &dir), "경로 조각이 든 id 는 거부");
        let home = tmp("prof-home");
        assert!(!claude_transcript_exists(repo, id, &home), "홈 기반 꼴은 그대로");
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn codex_find_in_profile_home() {
        let a = tmp("prof-codex-a");
        let b = tmp("prof-codex-b");
        let t0 = now_ms() - 60_000;
        rollout(&a, "2026/10/24", "rollout-2026-10-24T01-00-00-aaa.jsonl", "aaa", r"C:\work\repo");
        assert_eq!(codex_find_session(r"C:\work\repo", t0, &[], &a).as_deref(), Some("aaa"));
        assert_eq!(codex_find_session(r"C:\work\repo", t0, &[], &b), None, "다른 프로필의 세션은 안 보인다");
        let _ = fs::remove_dir_all(&a);
        let _ = fs::remove_dir_all(&b);
    }
}
