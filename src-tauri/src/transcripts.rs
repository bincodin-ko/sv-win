// B15 S-661·S-662·S-665: 마지막 답 읽기(읽기 전용, 끝에서 2MB만) + outputs/ 저장.
// 홈 폴더는 인자로 받아 시험에서 임시 폴더를 쓴다.
use crate::resume::{home, project_dir_name, subdirs};
use serde_json::Value;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

/// 끝에서부터 읽는 최대 바이트
pub const TAIL_BYTES: u64 = 2 * 1024 * 1024;

/// 파일 끝 TAIL_BYTES 만 읽어 줄 목록으로. 잘렸으면 첫(조각난) 줄은 버린다
fn tail_lines(p: &Path) -> Option<Vec<String>> {
    let mut f = fs::File::open(p).ok()?;
    let len = f.metadata().ok()?.len();
    let cut = len > TAIL_BYTES;
    if cut {
        f.seek(SeekFrom::Start(len - TAIL_BYTES)).ok()?;
    }
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf);
    let mut lines = text.lines();
    if cut {
        lines.next();
    }
    Some(lines.map(str::to_string).collect())
}

fn safe_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Claude: 뒤에서부터 type=assistant 줄 중 글 블록(text)이 있는 첫 줄의 마지막 글 블록
fn claude_reply(lines: &[String]) -> Option<String> {
    lines.iter().rev().find_map(|l| {
        let v: Value = serde_json::from_str(l).ok()?;
        if v.get("type")?.as_str()? != "assistant" {
            return None;
        }
        let blocks = v.get("message")?.get("content")?.as_array()?;
        blocks.iter().rev().find_map(|b| (b.get("type")?.as_str()? == "text").then(|| b.get("text")?.as_str().map(str::to_string)).flatten())
    })
}

/// Codex: 뒤에서부터 event_msg/agent_message 의 message, 또는 response_item 의 assistant output_text
fn codex_reply(lines: &[String]) -> Option<String> {
    lines.iter().rev().find_map(|l| {
        let v: Value = serde_json::from_str(l).ok()?;
        let p = v.get("payload")?;
        match (v.get("type")?.as_str()?, p.get("type")?.as_str()?) {
            ("event_msg", "agent_message") => p.get("message")?.as_str().map(str::to_string),
            ("response_item", "message") if p.get("role")?.as_str()? == "assistant" => p
                .get("content")?
                .as_array()?
                .iter()
                .rev()
                .find_map(|b| (b.get("type")?.as_str()? == "output_text").then(|| b.get("text")?.as_str().map(str::to_string)).flatten()),
            _ => None,
        }
    })
}

fn codex_file(id: &str, ch: &Path) -> Option<PathBuf> {
    let suffix = format!("-{id}.jsonl");
    for y in subdirs(&ch.join("sessions")) {
        for m in subdirs(&y) {
            for d in subdirs(&m) {
                for f in fs::read_dir(&d).into_iter().flatten().flatten().map(|e| e.path()) {
                    let n = f.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if n.starts_with("rollout-") && n.ends_with(&suffix) {
                        return Some(f);
                    }
                }
            }
        }
    }
    None
}

/// agent = "claude" | "codex". 그 밖이거나 파일이 없거나 글이 없으면 None
pub fn last_reply(agent: &str, repo: &str, session_id: &str, home: &Path) -> Option<String> {
    last_reply_in(agent, repo, session_id, home, &home.join(".codex"))
}

/// codex_home 을 따로 받는 꼴 (CODEX_HOME 환경 변수를 쓰는 명령용)
pub fn last_reply_in(agent: &str, repo: &str, session_id: &str, home: &Path, codex_home: &Path) -> Option<String> {
    last_reply_dirs(agent, repo, session_id, &home.join(".claude"), codex_home)
}

/// D12 S-1628: 설정 폴더를 직접 받는 꼴. claude_dir = `CLAUDE_CONFIG_DIR`(없으면 `~/.claude`), codex_home = `CODEX_HOME`(없으면 `~/.codex`)
pub fn last_reply_dirs(agent: &str, repo: &str, session_id: &str, claude_dir: &Path, codex_home: &Path) -> Option<String> {
    if !safe_id(session_id) {
        return None;
    }
    let (file, pick): (PathBuf, fn(&[String]) -> Option<String>) = match agent {
        "claude" => (claude_dir.join("projects").join(project_dir_name(repo)).join(format!("{session_id}.jsonl")), claude_reply),
        "codex" => (codex_file(session_id, codex_home)?, codex_reply),
        _ => return None,
    };
    pick(&tail_lines(&file)?).filter(|t| !t.trim().is_empty())
}

/// 파일 이름에 못 쓰는 글자는 '-' 로
fn safe_name(name: &str) -> String {
    let s: String = name.chars().map(|c| if c.is_control() || r#"\/:*?"<>|"#.contains(c) { '-' } else { c }).collect();
    let s = s.trim().trim_matches('.').to_string();
    if s.is_empty() { "output".into() } else { s }
}

/// `<repo>/outputs/<name>-<stamp>.md` 에 content 를 쓴다. 같은 이름이 있으면 `-2`, `-3`… (덮지 않는다)
pub fn outputs_save(repo: &str, name: &str, stamp: &str, content: &str) -> Result<PathBuf, String> {
    let dir = Path::new(repo).join("outputs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let base = format!("{}-{}", safe_name(name), safe_name(stamp));
    for n in 1u32.. {
        let p = dir.join(if n == 1 { format!("{base}.md") } else { format!("{base}-{n}.md") });
        // create_new: 이미 있으면 AlreadyExists (동시에 저장해도 덮지 않는다)
        match fs::OpenOptions::new().write(true).create_new(true).open(&p) {
            Ok(mut f) => return f.write_all(content.as_bytes()).map(|_| p).map_err(|e| e.to_string()),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    unreachable!()
}

#[tauri::command]
pub fn last_reply_cmd(agent: String, repo: String, session_id: String, config_dir: Option<String>) -> Option<String> {
    let h = home()?;
    let dir = config_dir.map(PathBuf::from);
    let claude = if agent == "claude" { dir.clone() } else { None }.unwrap_or_else(|| h.join(".claude"));
    let codex = if agent == "codex" { dir } else { None }.or_else(|| std::env::var_os("CODEX_HOME").map(PathBuf::from)).unwrap_or_else(|| h.join(".codex"));
    last_reply_dirs(&agent, &repo, &session_id, &claude, &codex)
}

#[tauri::command]
pub fn outputs_save_cmd(repo: String, name: String, stamp: String, content: String) -> Result<String, String> {
    outputs_save(&repo, &name, &stamp, &content).map(|p| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmp(tag: &str) -> PathBuf {
        let ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let p = std::env::temp_dir().join(format!("symvibe-b15-{tag}-{}-{ms}", std::process::id()));
        fs::create_dir_all(&p).unwrap();
        p
    }
    const ID: &str = "11111111-2222-3333-4444-555555555555";
    const REPO: &str = r"C:\Users\a b\프로젝트";

    fn claude_file(home: &Path) -> PathBuf {
        let dir = home.join(".claude").join("projects").join("C--Users-a-b-----");
        fs::create_dir_all(&dir).unwrap();
        dir.join(format!("{ID}.jsonl"))
    }
    fn asst(blocks: serde_json::Value) -> String {
        format!("{}\n", serde_json::json!({"type": "assistant", "message": {"role": "assistant", "content": blocks}}))
    }

    #[test]
    fn claude_last_assistant_text() {
        let home = tmp("claude");
        let mut s = String::new();
        s += &format!("{}\n", serde_json::json!({"type": "user", "message": {"role": "user", "content": "hi"}}));
        s += &asst(serde_json::json!([{"type": "text", "text": "first answer"}]));
        s += &asst(serde_json::json!([{"type": "thinking", "thinking": "hmm"}, {"type": "text", "text": "part one"}, {"type": "text", "text": "final answer\n\nwith two paragraphs"}]));
        // 마지막 assistant 줄이 글 없이 도구만 쓰면 그 앞의 글 블록을 쓴다
        s += &asst(serde_json::json!([{"type": "tool_use", "id": "t", "name": "Bash", "input": {}}]));
        s += &format!("{}\n", serde_json::json!({"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "content": "ok"}]}}));
        fs::write(claude_file(&home), s).unwrap();
        assert_eq!(last_reply("claude", REPO, ID, &home).as_deref(), Some("final answer\n\nwith two paragraphs"));
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn codex_last_agent_message() {
        let home = tmp("codex");
        let dir = home.join(".codex").join("sessions").join("2026").join("10").join("24");
        fs::create_dir_all(&dir).unwrap();
        let l = |v: serde_json::Value| format!("{v}\n");
        let mut s = l(serde_json::json!({"type": "session_meta", "payload": {"id": ID, "cwd": r"C:\work"}}));
        s += &l(serde_json::json!({"type": "event_msg", "payload": {"type": "user_message", "message": "do it"}}));
        s += &l(serde_json::json!({"type": "event_msg", "payload": {"type": "agent_message", "message": "old message"}}));
        s += &l(serde_json::json!({"type": "event_msg", "payload": {"type": "agent_message", "message": "final message"}}));
        s += &l(serde_json::json!({"type": "event_msg", "payload": {"type": "token_count"}}));
        fs::write(dir.join(format!("rollout-2026-10-24T01-00-00-{ID}.jsonl")), s).unwrap();
        // 다른 id 의 파일은 건드리지 않는다
        fs::write(dir.join("rollout-2026-10-24T01-00-01-other.jsonl"), l(serde_json::json!({"type": "event_msg", "payload": {"type": "agent_message", "message": "wrong"}}))).unwrap();
        assert_eq!(last_reply("codex", r"C:\work", ID, &home).as_deref(), Some("final message"));
        // response_item(assistant output_text) 형식도 읽는다
        let id2 = "99999999-2222-3333-4444-555555555555";
        let r = l(serde_json::json!({"type": "response_item", "payload": {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "via response item"}]}}));
        fs::write(dir.join(format!("rollout-2026-10-24T02-00-00-{id2}.jsonl")), r).unwrap();
        assert_eq!(last_reply("codex", r"C:\work", id2, &home).as_deref(), Some("via response item"));
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn missing_file_none() {
        let home = tmp("none");
        assert_eq!(last_reply("claude", REPO, ID, &home), None, "홈에 .claude 가 없다");
        assert_eq!(last_reply("codex", REPO, ID, &home), None, "홈에 .codex 가 없다");
        fs::write(claude_file(&home), "").unwrap();
        assert_eq!(last_reply("claude", REPO, ID, &home), None, "빈 파일");
        fs::write(claude_file(&home), "not json\n").unwrap();
        assert_eq!(last_reply("claude", REPO, ID, &home), None, "깨진 줄만");
        assert_eq!(last_reply("claude", REPO, r"..\x", &home), None, "경로 조각이 든 id 는 거부");
        assert_eq!(last_reply("gemini", REPO, ID, &home), None, "지원하지 않는 에이전트(화면 방식으로)");
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn reads_only_tail() {
        let home = tmp("tail");
        let filler = format!("{}\n", serde_json::json!({"type": "user", "message": {"role": "user", "content": "x".repeat(1000)}}));
        let big = filler.repeat((TAIL_BYTES as usize / filler.len()) + 100); // 2MB 보다 크다
        // 글이 맨 앞에만 있으면 끝 2MB 안에는 없다 → None
        fs::write(claude_file(&home), asst(serde_json::json!([{"type": "text", "text": "ancient"}])) + &big).unwrap();
        assert_eq!(last_reply("claude", REPO, ID, &home), None);
        // 글이 끝에 있으면 큰 파일에서도 찾는다 (잘린 첫 줄은 무시)
        fs::write(claude_file(&home), asst(serde_json::json!([{"type": "text", "text": "ancient"}])) + &big + &asst(serde_json::json!([{"type": "text", "text": "recent"}]))).unwrap();
        assert_eq!(last_reply("claude", REPO, ID, &home).as_deref(), Some("recent"));
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn outputs_save_dedups_name() {
        let repo = tmp("repo");
        let r = repo.to_str().unwrap();
        let a = outputs_save(r, "Otto", "20261024-1430", "one").unwrap();
        assert_eq!(a, repo.join("outputs").join("Otto-20261024-1430.md"));
        let b = outputs_save(r, "Otto", "20261024-1430", "two").unwrap();
        assert_eq!(b, repo.join("outputs").join("Otto-20261024-1430-2.md"));
        let c = outputs_save(r, "Otto", "20261024-1430", "three").unwrap();
        assert_eq!(c, repo.join("outputs").join("Otto-20261024-1430-3.md"));
        assert_eq!(fs::read_to_string(&a).unwrap(), "one", "먼저 쓴 파일을 덮지 않는다");
        assert_eq!(fs::read_to_string(&b).unwrap(), "two");
        // 파일 이름에 못 쓰는 글자는 '-' 로
        let d = outputs_save(r, "a/b:c", "20261024-1431", "x").unwrap();
        assert_eq!(d, repo.join("outputs").join("a-b-c-20261024-1431.md"));
        let _ = fs::remove_dir_all(&repo);
    }

    // D12 S-1628: 프로필 설정 폴더
    #[test]
    fn reads_from_profile_dirs() {
        let prof = tmp("prof");
        let home = tmp("prof-home");
        let dir = prof.join("projects").join("C--Users-a-b-----");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(format!("{ID}.jsonl")), asst(serde_json::json!([{"type": "text", "text": "from profile"}]))).unwrap();
        assert_eq!(last_reply_dirs("claude", REPO, ID, &prof, &home.join(".codex")).as_deref(), Some("from profile"));
        assert_eq!(last_reply_dirs("claude", REPO, ID, &home.join(".claude"), &home.join(".codex")), None, "기본 폴더에는 없다");
        let cx = prof.join("sessions").join("2026").join("10").join("24");
        fs::create_dir_all(&cx).unwrap();
        let l = serde_json::json!({"type": "event_msg", "payload": {"type": "agent_message", "message": "codex profile"}});
        fs::write(cx.join(format!("rollout-2026-10-24T01-00-00-{ID}.jsonl")), format!("{l}\n")).unwrap();
        assert_eq!(last_reply_dirs("codex", r"C:\work", ID, &home.join(".claude"), &prof).as_deref(), Some("codex profile"));
        assert_eq!(last_reply_dirs("gemini", REPO, ID, &prof, &prof), None);
        assert_eq!(last_reply("claude", REPO, ID, &prof), None, "홈 기반 꼴은 그대로");
        let _ = fs::remove_dir_all(&prof);
        let _ = fs::remove_dir_all(&home);
    }
}
