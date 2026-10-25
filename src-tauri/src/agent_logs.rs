// Q3 S-3141~S-3145: Gemini CLI·OpenCode 대화 기록 읽기. 홈 폴더는 인자로 받아 시험에서 임시 폴더를 쓴다.
use crate::resume::{home, norm};
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

/// 시작 시각보다 이만큼 일찍 만든 세션도 같은 콘솔의 것으로 본다 (시계·파일 기록 지연)
const SLACK_MS: u64 = 2000;
const RUN_LIMIT: Duration = Duration::from_secs(15);

/// slug 는 폴더 이름 하나여야 한다(경로 조각 거부)
fn safe_slug(s: &str) -> bool {
    !s.is_empty() && s != "." && s != ".." && !s.contains(['/', '\\', ':'])
}

/// `<gemini_home>/.gemini/projects.json` 의 `projects[normalize(cwd)]` → `tmp/<slug>`. 없으면 `tmp/*/.project_root` 내용이 같은 폴더
pub fn gemini_project_dir(gemini_home: &Path, cwd: &str) -> Option<PathBuf> {
    let g = gemini_home.join(".gemini");
    let want = norm(cwd);
    let by_table = fs::read_to_string(g.join("projects.json")).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|v| {
        v.get("projects")?.as_object()?.iter().find(|(k, _)| norm(k) == want).and_then(|(_, s)| s.as_str().map(str::to_string))
    });
    if let Some(d) = by_table.filter(|s| safe_slug(s)).map(|s| g.join("tmp").join(s)).filter(|d| d.is_dir()) {
        return Some(d);
    }
    fs::read_dir(g.join("tmp")).ok()?.flatten().map(|e| e.path()).find(|d| fs::read_to_string(d.join(".project_root")).is_ok_and(|t| norm(t.trim()) == want))
}

fn first_line(p: &Path) -> Option<Value> {
    let mut line = String::new();
    BufReader::new(fs::File::open(p).ok()?).read_line(&mut line).ok()?;
    serde_json::from_str(&line).ok()
}

fn chat_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(rd) = fs::read_dir(dir.join("chats")) else { return vec![] };
    rd.flatten().map(|e| e.path()).filter(|p| p.is_file() && p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("session-"))).collect()
}

/// `chats/session-*.jsonl` 중 시작 시각이 started_after_ms-2000 이후·subagent 아님·claimed 아님 중 가장 이른 것의 sessionId
pub fn gemini_find_session(gemini_home: &Path, cwd: &str, started_after_ms: u64, claimed: &[String]) -> Option<String> {
    let dir = gemini_project_dir(gemini_home, cwd)?;
    let floor = started_after_ms.saturating_sub(SLACK_MS) as i64;
    chat_files(&dir)
        .iter()
        .filter(|p| p.extension().is_some_and(|e| e == "jsonl"))
        .filter_map(|p| {
            let m = first_line(p)?;
            if m.get("kind").and_then(Value::as_str) == Some("subagent") {
                return None;
            }
            let t = chrono::DateTime::parse_from_rfc3339(m.get("startTime")?.as_str()?).ok()?.timestamp_millis();
            let id = m.get("sessionId")?.as_str()?.to_string();
            (t >= floor && !claimed.contains(&id)).then_some((t, id))
        })
        .min_by_key(|(t, _)| *t)
        .map(|(_, id)| id)
}

/// session id 의 기록 파일 경로 (`chats/session-*-<id 앞 8자>.jsonl|json`)
pub fn gemini_file(gemini_home: &Path, cwd: &str, id: &str) -> Option<PathBuf> {
    let tag: String = id.chars().take(8).collect();
    chat_files(&gemini_project_dir(gemini_home, cwd)?).into_iter().find(|p| {
        let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let Some(stem) = n.strip_suffix(".jsonl").or_else(|| n.strip_suffix(".json")) else { return false };
        // 이름 끝 8자가 같아도 jsonl 은 첫 줄 메타의 sessionId 로 한 번 더 확인한다
        stem.ends_with(&format!("-{tag}")) && (n.ends_with(".json") || first_line(p).and_then(|m| m.get("sessionId")?.as_str().map(|s| s == id)) == Some(true))
    })
}

/// content: 문자열 그대로 / 배열은 thought 아닌 조각의 text 이음 / 객체 하나는 그 text
fn content_text(c: &Value) -> String {
    match c {
        Value::String(s) => s.clone(),
        Value::Array(a) => a.iter().map(content_text).collect(),
        Value::Object(o) if o.get("thought").and_then(Value::as_bool) != Some(true) => o.get("text").and_then(Value::as_str).unwrap_or("").to_string(),
        _ => String::new(),
    }
}

/// 기록 줄들(또는 옛 `.json` 한 덩어리)에서 마지막 gemini 답
pub fn gemini_reply(lines: &[String]) -> Option<String> {
    let mut msgs: Vec<Value> = vec![];
    let ids = |m: &Value| m.get("id").and_then(Value::as_str).map(str::to_string);
    let legacy = serde_json::from_str::<Value>(&lines.join("\n")).ok().and_then(|v| v.get("messages").cloned()).and_then(|m| m.as_array().cloned());
    let recs: Vec<Value> = legacy.unwrap_or_else(|| lines.iter().filter_map(|l| serde_json::from_str(l).ok()).collect());
    for v in recs {
        if let Some(p) = v.get("$patch") {
            let (Some(id), Some(c)) = (ids(p), p.get("content")) else { continue };
            if let Some(m) = msgs.iter_mut().find(|m| ids(m).as_deref() == Some(&id)) {
                m["content"] = c.clone();
            }
        } else if let Some(id) = v.get("$rewindTo").and_then(Value::as_str) {
            if let Some(pos) = msgs.iter().position(|m| ids(m).as_deref() == Some(id)) {
                msgs.truncate(pos);
            }
        } else if v.get("type").is_some() && v.get("$set").is_none() {
            match ids(&v).and_then(|id| msgs.iter().position(|m| ids(m).as_deref() == Some(&id))) {
                Some(pos) => msgs[pos] = v,
                None => msgs.push(v),
            }
        }
    }
    let m = msgs.iter().rev().find(|m| m.get("type").and_then(Value::as_str) == Some("gemini"))?;
    Some(content_text(m.get("content")?)).filter(|t| !t.trim().is_empty())
}

/// `opencode session list --format json` 결과에서 cwd·시작 시각이 맞는 가장 이른 세션 id
pub fn opencode_pick(list_json: &str, cwd: &str, started_ms: u64, claimed: &[String]) -> Option<String> {
    let want = norm(cwd);
    let floor = started_ms.saturating_sub(SLACK_MS);
    serde_json::from_str::<Value>(&list_json[list_json.find('[')?..]).ok()?
        .as_array()?
        .iter()
        .filter_map(|s| {
            let id = s.get("id")?.as_str()?;
            let created = s.get("created")?.as_u64()?;
            (created >= floor && norm(s.get("directory")?.as_str()?) == want && !claimed.iter().any(|c| c == id)).then(|| (created, id.to_string()))
        })
        .min_by_key(|(t, _)| *t)
        .map(|(_, id)| id)
}

/// `opencode export` JSON 에서 마지막 assistant 메시지의 글 (synthetic·reasoning 뺌)
pub fn opencode_reply(export_json: &str) -> Option<String> {
    let v: Value = serde_json::from_str(&export_json[export_json.find('{')?..]).ok()?;
    let m = v.get("messages")?.as_array()?.iter().rev().find(|m| m.pointer("/info/role").and_then(Value::as_str) == Some("assistant"))?;
    let text = m
        .get("parts")?
        .as_array()?
        .iter()
        .filter(|p| p.get("type").and_then(Value::as_str) == Some("text") && p.get("synthetic").and_then(Value::as_bool) != Some(true))
        .filter_map(|p| p.get("text")?.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    Some(text).filter(|t| !t.trim().is_empty())
}

/// 숨은 창 자식 프로세스로 opencode 를 15초 안에 돌려 stdout 을 받는다. 못 찾거나 실패하면 None
fn opencode_run(cwd: &str, args: &[&str]) -> Option<String> {
    let exe = crate::agents::resolve("opencode", None, &crate::agents::search_dirs(), &crate::agents::pathext())?;
    let (prog, argv) = crate::agents::wrap(&exe, args.iter().map(|s| s.to_string()).collect(), "powershell.exe");
    let mut c = Command::new(prog);
    c.args(argv).current_dir(cwd).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut c, 0x0800_0000); // CREATE_NO_WINDOW
    let mut child = c.spawn().ok()?;
    let mut out = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut s = String::new();
        let _ = out.read_to_string(&mut s);
        let _ = tx.send(s);
    });
    match rx.recv_timeout(RUN_LIMIT) {
        Ok(s) => {
            let ok = child.wait().is_ok_and(|st| st.success());
            ok.then_some(s)
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            None
        }
    }
}

/// 실제 실행(`opencode export <id>`, 실패하면 `opencode session export <id>`) 뒤 `opencode_reply`
pub fn opencode_run_reply(cwd: &str, id: &str) -> Option<String> {
    if !crate::transcripts::safe_id(id) {
        return None;
    }
    let out = opencode_run(cwd, &["export", id]).or_else(|| opencode_run(cwd, &["session", "export", id]))?;
    opencode_reply(&out)
}

/// Gemini 홈 = 환경 `GEMINI_CLI_HOME` 또는 사용자 홈
pub(crate) fn gemini_home() -> Option<PathBuf> {
    std::env::var_os("GEMINI_CLI_HOME").map(PathBuf::from).or_else(home)
}

#[tauri::command]
pub async fn agent_find_session(agent: String, cwd: String, started_after_ms: u64, claimed: Vec<String>) -> Option<String> {
    let started = started_after_ms;
    tauri::async_runtime::spawn_blocking(move || match agent.as_str() {
        "gemini" => gemini_find_session(&gemini_home()?, &cwd, started, &claimed),
        "opencode" => opencode_pick(&opencode_run(&cwd, &["session", "list", "--format", "json", "--max-count", "20"])?, &cwd, started, &claimed),
        _ => None,
    })
    .await
    .ok()
    .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmp(tag: &str) -> PathBuf {
        let ns = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let p = std::env::temp_dir().join(format!("symvibe-q3-{tag}-{}-{ns}", std::process::id()));
        fs::create_dir_all(&p).unwrap();
        p
    }
    const CWD: &str = r"C:\Work\MyRepo";
    fn lines(v: &[serde_json::Value]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }
    /// 예시 session 파일: 첫 줄 메타(startTime ISO)
    fn session(chats: &Path, name: &str, id: &str, start: &str, kind: Option<&str>) {
        fs::create_dir_all(chats).unwrap();
        let mut meta = json!({"sessionId": id, "projectHash": "h", "startTime": start, "lastUpdated": start});
        if let Some(k) = kind {
            meta["kind"] = json!(k);
        }
        fs::write(chats.join(name), format!("{meta}\n")).unwrap();
    }
    /// 2026-10-25T10:00:00.000Z 의 epoch ms
    const T0: u64 = 1_792_922_400_000;

    // S-3141
    #[test]
    fn gemini_project_dir_by_table_or_root_file() {
        let home = tmp("pd");
        let g = home.join(".gemini");
        fs::create_dir_all(g.join("tmp").join("myrepo")).unwrap();
        fs::create_dir_all(g.join("tmp").join("other")).unwrap();
        // 표 없음·.project_root 없음 → None
        assert_eq!(gemini_project_dir(&home, CWD), None);
        // .project_root 만 있음 (앞뒤 공백·대소문자·슬래시 차이 무시)
        fs::write(g.join("tmp").join("other").join(".project_root"), "  c:/work/MYREPO \n").unwrap();
        assert_eq!(gemini_project_dir(&home, CWD), Some(g.join("tmp").join("other")));
        // projects.json 표가 있으면 표가 먼저 (소문자 키)
        fs::write(g.join("projects.json"), json!({"projects": {r"c:\work\myrepo": "myrepo"}}).to_string()).unwrap();
        assert_eq!(gemini_project_dir(&home, CWD), Some(g.join("tmp").join("myrepo")));
        // 대소문자 다른 경로도 같은 항목
        assert_eq!(gemini_project_dir(&home, r"C:\WORK\MYREPO"), Some(g.join("tmp").join("myrepo")));
        // 표에 없는 경로는 None
        assert_eq!(gemini_project_dir(&home, r"C:\elsewhere"), None);
        // slug 폴더가 없으면 .project_root 로
        fs::write(g.join("projects.json"), json!({"projects": {r"c:\work\myrepo": "gone"}}).to_string()).unwrap();
        assert_eq!(gemini_project_dir(&home, CWD), Some(g.join("tmp").join("other")));
        // 경로 조각이 든 slug 는 거부 (표 항목을 버리고 .project_root 로)
        fs::write(g.join("projects.json"), json!({"projects": {r"c:\work\myrepo": "..\\x"}}).to_string()).unwrap();
        assert_eq!(gemini_project_dir(&home, CWD), Some(g.join("tmp").join("other")));
        let _ = fs::remove_dir_all(&home);
    }

    // S-3142
    #[test]
    fn gemini_find_session_rules() {
        let home = tmp("fs");
        let g = home.join(".gemini");
        fs::create_dir_all(&g).unwrap();
        fs::write(g.join("projects.json"), json!({"projects": {r"c:\work\myrepo": "myrepo"}}).to_string()).unwrap();
        let chats = g.join("tmp").join("myrepo").join("chats");
        // 시작(10:00:00) 뒤 두 개, 시작 3초 전 하나(제외), subagent 하나(제외), 하위 폴더 안 하나(무시)
        session(&chats, "session-2026-10-25T10-00-aaaaaaaa.jsonl", "aaaaaaaa-1", "2026-10-25T10:00:30.000Z", None);
        session(&chats, "session-2026-10-25T10-00-bbbbbbbb.jsonl", "bbbbbbbb-2", "2026-10-25T10:00:10.000Z", None);
        session(&chats, "session-2026-10-25T09-59-cccccccc.jsonl", "cccccccc-3", "2026-10-25T09:59:57.000Z", None);
        session(&chats, "session-2026-10-25T10-00-dddddddd.jsonl", "dddddddd-4", "2026-10-25T10:00:01.000Z", Some("subagent"));
        session(&chats.join("sub"), "session-2026-10-25T10-00-eeeeeeee.jsonl", "eeeeeeee-5", "2026-10-25T10:00:02.000Z", None);
        // 가장 이른 것 = bbbbbbbb-2
        assert_eq!(gemini_find_session(&home, CWD, T0, &[]).as_deref(), Some("bbbbbbbb-2"));
        // 이미 고른 것 제외 → 다음
        assert_eq!(gemini_find_session(&home, CWD, T0, &["bbbbbbbb-2".into()]).as_deref(), Some("aaaaaaaa-1"));
        // 경계: 시작−2초(09:59:58)부터 포함 — 09:59:57 은 제외, 09:59:58 이면 포함
        session(&chats, "session-2026-10-25T09-59-ffffffff.jsonl", "ffffffff-6", "2026-10-25T09:59:58.000Z", None);
        assert_eq!(gemini_find_session(&home, CWD, T0, &[]).as_deref(), Some("ffffffff-6"));
        // 폴더를 모르면 None
        assert_eq!(gemini_find_session(&home, r"C:\none", T0, &[]), None);
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn gemini_file_by_id_prefix() {
        let home = tmp("gf");
        let g = home.join(".gemini");
        fs::create_dir_all(&g).unwrap();
        fs::write(g.join("projects.json"), json!({"projects": {r"c:\work\myrepo": "myrepo"}}).to_string()).unwrap();
        let chats = g.join("tmp").join("myrepo").join("chats");
        session(&chats, "session-2026-10-25T10-00-bbbbbbbb.jsonl", "bbbbbbbb-2", "2026-10-25T10:00:10.000Z", None);
        assert_eq!(gemini_file(&home, CWD, "bbbbbbbb-2"), Some(chats.join("session-2026-10-25T10-00-bbbbbbbb.jsonl")));
        assert_eq!(gemini_file(&home, CWD, "zzzzzzzz-9"), None);
        let _ = fs::remove_dir_all(&home);
    }

    // S-3143
    #[test]
    fn gemini_reply_patch_rewind_thought() {
        let meta = json!({"sessionId": "s", "startTime": "2026-10-25T10:00:00.000Z"});
        let user = |id: &str| json!({"id": id, "timestamp": "t", "type": "user", "content": "q"});
        let gem = |id: &str, c: serde_json::Value| json!({"id": id, "timestamp": "t", "type": "gemini", "content": c});
        // 사용자 → gemini → patch(내용 바꿈)
        let v = lines(&[meta.clone(), user("u1"), gem("g1", json!("draft")), json!({"$patch": {"id": "g1", "content": "patched"}})]);
        assert_eq!(gemini_reply(&v).as_deref(), Some("patched"));
        let v = lines(&[meta.clone(), user("u1"), gem("g1", json!("first")), user("u2"), gem("g2", json!("second"))]);
        assert_eq!(gemini_reply(&v).as_deref(), Some("second"));
        // 같은 id 로 다시 쓰면 바꿈
        let v = lines(&[meta.clone(), user("u1"), gem("g1", json!("old")), gem("g1", json!("new"))]);
        assert_eq!(gemini_reply(&v).as_deref(), Some("new"));
        // rewind: u2 부터 지움 → 마지막 gemini 는 g1
        let v = lines(&[meta.clone(), user("u1"), gem("g1", json!("first")), user("u2"), gem("g2", json!("second")), json!({"$rewindTo": "u2"})]);
        assert_eq!(gemini_reply(&v).as_deref(), Some("first"));
        // $set·info 는 무시
        let v = lines(&[meta.clone(), user("u1"), gem("g1", json!("ans")), json!({"$set": {"summary": "x"}}), json!({"id": "i1", "type": "info", "content": "note"})]);
        assert_eq!(gemini_reply(&v).as_deref(), Some("ans"));
        // content 배열: thought 조각은 뺀다, 객체 하나면 그 text
        let v = lines(&[meta.clone(), gem("g1", json!([{"text": "think", "thought": true}, {"text": "part A "}, {"text": "part B"}]))]);
        assert_eq!(gemini_reply(&v).as_deref(), Some("part A part B"));
        let v = lines(&[meta.clone(), gem("g1", json!({"text": "obj"}))]);
        assert_eq!(gemini_reply(&v).as_deref(), Some("obj"));
        // 빈 글·gemini 없음·깨진 줄 → None
        assert_eq!(gemini_reply(&lines(&[meta.clone(), gem("g1", json!("  "))])), None);
        assert_eq!(gemini_reply(&lines(&[meta.clone(), user("u1")])), None);
        assert_eq!(gemini_reply(&["not json".to_string()]), None);
        // 옛 .json 한 덩어리(줄 여러 개로 쪼개져도)
        let old = serde_json::to_string_pretty(&json!({"sessionId": "s", "messages": [user("u1"), gem("g1", json!("legacy answer"))]})).unwrap();
        let v: Vec<String> = old.lines().map(str::to_string).collect();
        assert_eq!(gemini_reply(&v).as_deref(), Some("legacy answer"));
    }

    // S-3144
    #[test]
    fn opencode_pick_rules() {
        let list = json!([
            {"id": "ses_old", "created": T0 - 60_000, "directory": CWD},
            {"id": "ses_b", "created": T0 + 9_000, "directory": r"c:\work\myrepo"},
            {"id": "ses_a", "created": T0 + 3_000, "directory": CWD},
            {"id": "ses_x", "created": T0 + 1_000, "directory": r"C:\other"},
            {"id": "ses_edge", "created": T0 - 2_000, "directory": CWD},
        ])
        .to_string();
        // 시작−2초 경계 포함, 다른 폴더·너무 이른 것 제외 → 가장 이른 ses_edge
        assert_eq!(opencode_pick(&list, CWD, T0, &[]).as_deref(), Some("ses_edge"));
        assert_eq!(opencode_pick(&list, CWD, T0, &["ses_edge".into()]).as_deref(), Some("ses_a"));
        assert_eq!(opencode_pick(&list, CWD, T0 + 6_000, &[]).as_deref(), Some("ses_b"));
        assert_eq!(opencode_pick(&list, r"C:\none", T0, &[]), None);
        assert_eq!(opencode_pick("not json", CWD, T0, &[]), None);
    }

    #[test]
    fn opencode_reply_last_assistant_text() {
        let ex = json!({
            "info": {"id": "ses_a"},
            "messages": [
                {"info": {"role": "user"}, "parts": [{"type": "text", "text": "q"}]},
                {"info": {"role": "assistant"}, "parts": [{"type": "text", "text": "old"}]},
                {"info": {"role": "user"}, "parts": [{"type": "text", "text": "q2"}]},
                {"info": {"role": "assistant"}, "parts": [
                    {"type": "reasoning", "text": "hmm"},
                    {"type": "text", "text": "line one"},
                    {"type": "tool", "tool": "bash"},
                    {"type": "text", "text": "injected", "synthetic": true},
                    {"type": "text", "text": "line two"}
                ]}
            ]
        })
        .to_string();
        assert_eq!(opencode_reply(&ex).as_deref(), Some("line one\nline two"));
        // 실행 파일이 앞에 안내 줄을 찍어도 첫 { 부터 읽는다
        assert_eq!(opencode_reply(&format!("Exporting session...\n{ex}")).as_deref(), Some("line one\nline two"));
        assert_eq!(opencode_reply(r#"{"messages":[]}"#), None);
        assert_eq!(opencode_reply("garbage"), None);
    }
}
