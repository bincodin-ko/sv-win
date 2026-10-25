// 12묶음 Q5 S-3170·S-3171: Claude transcript 의 Agent/Task 도구 호출 → 하위 에이전트 목록(읽기 전용).
use crate::resume::{home, project_dir_name};
use crate::transcripts::tail_lines;
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Sub {
    pub id: String,
    pub name: String,
    pub title: String,
    /// "running" | "done" | "failed"
    pub state: String,
    pub started_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_at: Option<i64>,
}

fn ms(v: &Value) -> i64 {
    v.get("timestamp").and_then(Value::as_str).and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok()).map_or(0, |d| d.timestamp_millis())
}

/// `<tag>값</tag>` 의 값
fn tag<'a>(text: &'a str, name: &str) -> Option<&'a str> {
    let rest = &text[text.find(&format!("<{name}>"))? + name.len() + 2..];
    Some(rest[..rest.find(&format!("</{name}>"))?].trim())
}

fn finish(s: &mut Sub, state: &str, at: i64) {
    s.state = state.into();
    s.ended_at = Some(at);
}

/// transcript 줄들 → 하위 에이전트(시작 순서)
pub fn claude_subagents(lines: &[String]) -> Vec<Sub> {
    let mut subs: Vec<Sub> = vec![];
    for l in lines {
        let Ok(v) = serde_json::from_str::<Value>(l) else { continue };
        if v.get("isSidechain").and_then(Value::as_bool) == Some(true) {
            continue;
        }
        let at = ms(&v);
        let content = v.pointer("/message/content");
        let blocks = content.and_then(Value::as_array).map(Vec::as_slice).unwrap_or(&[]);
        match v.get("type").and_then(Value::as_str) {
            Some("assistant") => {
                for b in blocks {
                    let name = b.get("name").and_then(Value::as_str);
                    if b.get("type").and_then(Value::as_str) != Some("tool_use") || !matches!(name, Some("Agent" | "Task")) {
                        continue;
                    }
                    let Some(id) = b.get("id").and_then(Value::as_str) else { continue };
                    let inp = |k: &str| b.pointer(&format!("/input/{k}")).and_then(Value::as_str);
                    subs.push(Sub { id: id.into(), name: inp("subagent_type").unwrap_or("agent").into(), title: inp("description").unwrap_or("").into(), state: "running".into(), started_at: at, ended_at: None, agent_id: None, last_at: None });
                }
            }
            Some("user") => {
                for b in blocks.iter().filter(|b| b.get("type").and_then(Value::as_str) == Some("tool_result")) {
                    let Some(s) = b.get("tool_use_id").and_then(Value::as_str).and_then(|id| subs.iter_mut().find(|s| s.id == id)) else { continue };
                    let res = v.get("toolUseResult");
                    if b.get("is_error").and_then(Value::as_bool) == Some(true) {
                        finish(s, "failed", at);
                    } else if res.and_then(|r| r.get("status")).and_then(Value::as_str) == Some("async_launched") {
                        s.agent_id = res.and_then(|r| r.get("agentId")).and_then(Value::as_str).map(str::to_string);
                    } else {
                        finish(s, "done", at);
                    }
                }
                // 알림: content 가 글이거나 글 조각 배열
                let text = match content {
                    Some(Value::String(t)) => t.clone(),
                    _ => blocks.iter().filter_map(|b| b.get("text").and_then(Value::as_str)).collect::<Vec<_>>().join("
"),
                };
                if text.contains("<task-notification>") {
                    let (Some(id), Some(st)) = (tag(&text, "tool-use-id"), tag(&text, "status")) else { continue };
                    let Some(s) = subs.iter_mut().find(|s| s.id == id) else { continue };
                    match st {
                        "completed" => finish(s, "done", at),
                        "failed" | "killed" | "error" => finish(s, "failed", at),
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    subs
}

/// `<claude_dir>/projects/<repo>/<id>.jsonl` 끝 2MB 를 읽어 목록. running 은 agent 파일 수정 시각 = lastAt
/// ponytail: 끝 2MB 앞에서 띄운 하위 에이전트는 안 보임. 더 필요하면 파일을 앞에서부터 한 번 더 훑기
pub fn subagents_in(claude_dir: &Path, cwd: &str, session_id: &str) -> Vec<Sub> {
    if !safe(session_id) {
        return vec![];
    }
    let dir = claude_dir.join("projects").join(project_dir_name(cwd));
    let Some(lines) = tail_lines(&dir.join(format!("{session_id}.jsonl"))) else { return vec![] };
    let mut subs = claude_subagents(&lines);
    for s in subs.iter_mut().filter(|s| s.state == "running") {
        let Some(a) = s.agent_id.as_deref().filter(|a| safe(a)) else { continue };
        let m = fs::metadata(dir.join(session_id).join("subagents").join(format!("agent-{a}.jsonl"))).and_then(|m| m.modified()).ok();
        s.last_at = m.and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64);
    }
    let ms = |t: std::time::SystemTime| t.duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64);
    let session_ms = fs::metadata(dir.join(format!("{session_id}.jsonl"))).and_then(|m| m.modified()).map_or(0, ms);
    mark_stale(&mut subs, ms(std::time::SystemTime::now()), session_ms);
    subs
}

/// 마지막 기록이 이보다 오래된 running 은 "unknown"(부모 세션이 죽었거나 알림을 못 받음)
pub const STALE_MS: i64 = 30 * 60 * 1000;

/// running 이면서 (agent 파일·부모 세션 파일) 중 가장 최근 기록이 `now - STALE_MS` 보다 오래면 unknown + endedAt = 그 기록 시각
fn mark_stale(subs: &mut [Sub], now: i64, session_ms: i64) {
    for s in subs.iter_mut().filter(|s| s.state == "running") {
        let last = s.last_at.unwrap_or(0).max(session_ms);
        if now - last > STALE_MS {
            finish(s, "unknown", last);
        }
    }
}

fn safe(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

#[tauri::command]
pub async fn claude_subagents_cmd(cwd: String, session_id: String, config_dir: Option<String>) -> Vec<Sub> {
    let Some(dir) = config_dir.map(PathBuf::from).or_else(|| home().map(|h| h.join(".claude"))) else { return vec![] };
    subagents_in(&dir, &cwd, &session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    const T0: &str = "2026-10-25T01:00:00.000Z";
    const T1: &str = "2026-10-25T01:00:05.000Z";
    const T2: &str = "2026-10-25T01:03:00.000Z";
    const MS0: i64 = 1_792_890_000_000; // 2026-10-25T01:00:00Z

    fn start(ts: &str, id: &str, tool: &str, st: &str, desc: &str) -> String {
        format!(r#"{{"type":"assistant","timestamp":"{ts}","message":{{"content":[{{"type":"text","text":"ok"}},{{"type":"tool_use","id":"{id}","name":"{tool}","input":{{"description":"{desc}","subagent_type":"{st}","prompt":"p"}}}}]}}}}"#)
    }
    fn result(ts: &str, id: &str, extra: &str, err: bool) -> String {
        let e = if err { r#","is_error":true"# } else { "" };
        format!(r#"{{"type":"user","timestamp":"{ts}","message":{{"content":[{{"type":"tool_result","tool_use_id":"{id}","content":[{{"type":"text","text":"x"}}]{e}}}]}}{extra}}}"#)
    }
    fn notif(ts: &str, id: &str, status: &str) -> String {
        let body = format!("<task-notification>\\n<task-id>t</task-id>\\n<tool-use-id>{id}</tool-use-id>\\n<status>{status}</status>\\n<summary>s</summary>\\n</task-notification>");
        format!(r#"{{"type":"user","timestamp":"{ts}","message":{{"content":"{body}"}}}}"#)
    }
    const ASYNC: &str = r#","toolUseResult":{"isAsync":true,"status":"async_launched","agentId":"a3911","description":"d"}"#;
    const SYNC: &str = r#","toolUseResult":{"status":"completed"}"#;

    #[test]
    fn async_start_then_notification_completed() {
        let r = claude_subagents(&[start(T0, "toolu_A", "Agent", "mimic-planner", "Plan it"), result(T0, "toolu_A", ASYNC, false), notif(T2, "toolu_A", "completed")]);
        assert_eq!(r.len(), 1);
        assert_eq!((r[0].id.as_str(), r[0].name.as_str(), r[0].title.as_str(), r[0].state.as_str()), ("toolu_A", "mimic-planner", "Plan it", "done"));
        assert_eq!(r[0].started_at, MS0);
        assert_eq!(r[0].ended_at, Some(MS0 + 180_000));
        assert_eq!(r[0].agent_id.as_deref(), Some("a3911"));
    }
    #[test]
    fn async_without_notification_is_running() {
        let r = claude_subagents(&[start(T0, "toolu_A", "Agent", "x", "d"), result(T1, "toolu_A", ASYNC, false)]);
        assert_eq!(r[0].state, "running");
        assert_eq!(r[0].ended_at, None);
        assert_eq!(r[0].agent_id.as_deref(), Some("a3911"));
    }
    #[test]
    fn notification_failed_or_killed_is_failed() {
        for st in ["failed", "killed", "error"] {
            let r = claude_subagents(&[start(T0, "toolu_A", "Agent", "x", "d"), result(T0, "toolu_A", ASYNC, false), notif(T2, "toolu_A", st)]);
            assert_eq!(r[0].state, "failed", "{st}");
            assert_eq!(r[0].ended_at, Some(MS0 + 180_000));
        }
    }
    #[test]
    fn notification_text_inside_array_content() {
        let n = format!(r#"{{"type":"user","timestamp":"{T2}","message":{{"content":[{{"type":"text","text":"<task-notification>\n<tool-use-id>toolu_A</tool-use-id>\n<status>completed</status>\n</task-notification>"}}]}}}}"#);
        let r = claude_subagents(&[start(T0, "toolu_A", "Agent", "x", "d"), result(T0, "toolu_A", ASYNC, false), n]);
        assert_eq!(r[0].state, "done");
    }
    #[test]
    fn sync_completed_is_done() {
        let r = claude_subagents(&[start(T0, "toolu_B", "Agent", "x", "d"), result(T1, "toolu_B", SYNC, false)]);
        assert_eq!((r[0].state.as_str(), r[0].ended_at), ("done", Some(MS0 + 5000)));
    }
    #[test]
    fn is_error_is_failed() {
        let r = claude_subagents(&[start(T0, "toolu_B", "Agent", "x", "d"), result(T1, "toolu_B", "", true)]);
        assert_eq!((r[0].state.as_str(), r[0].ended_at), ("failed", Some(MS0 + 5000)));
    }
    #[test]
    fn no_result_is_running() {
        let r = claude_subagents(&[start(T0, "toolu_C", "Agent", "x", "d")]);
        assert_eq!((r[0].state.as_str(), r[0].started_at), ("running", MS0));
    }
    #[test]
    fn task_old_name_and_default_agent_name() {
        let line = r#"{"type":"assistant","timestamp":"2026-10-25T01:00:00.000Z","message":{"content":[{"type":"tool_use","id":"toolu_T","name":"Task","input":{"description":"옛 이름","prompt":"p"}}]}}"#.to_string();
        let r = claude_subagents(&[line]);
        assert_eq!((r[0].name.as_str(), r[0].title.as_str()), ("agent", "옛 이름"));
    }
    #[test]
    fn sidechain_and_other_tools_ignored_and_order_kept() {
        let side = start(T0, "toolu_S", "Agent", "x", "d").replacen(r#"{"type":"assistant""#, r#"{"isSidechain":true,"type":"assistant""#, 1);
        let bash = start(T0, "toolu_X", "Bash", "x", "d");
        let r = claude_subagents(&[side, bash, start(T0, "toolu_1", "Agent", "a", "first"), start(T1, "toolu_2", "Agent", "b", "second"), "not json".into()]);
        assert_eq!(r.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["toolu_1", "toolu_2"]);
    }

    fn tmp(tag: &str) -> PathBuf {
        let ns = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let p = std::env::temp_dir().join(format!("symvibe-q5-{tag}-{}-{ns}", std::process::id()));
        fs::create_dir_all(&p).unwrap();
        p
    }
    fn proj(dir: &Path, cwd: &str) -> PathBuf {
        let d = dir.join("projects").join(crate::resume::project_dir_name(cwd));
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn write_session(dir: &Path, cwd: &str, sid: &str, lines: &[String]) {
        fs::write(proj(dir, cwd).join(format!("{sid}.jsonl")), lines.join("\n")).unwrap();
    }
    #[test]
    fn cmd_reads_session_and_agent_file_mtime_as_last_at() {
        let dir = tmp("cmd");
        let cwd = "C:/fake/repo 한글";
        write_session(&dir, cwd, "sess-1", &[start(T0, "toolu_A", "Agent", "x", "d"), result(T1, "toolu_A", ASYNC, false), start(T0, "toolu_B", "Agent", "y", "e"), result(T1, "toolu_B", SYNC, false)]);
        let ag = proj(&dir, cwd).join("sess-1").join("subagents");
        fs::create_dir_all(&ag).unwrap();
        let af = ag.join("agent-a3911.jsonl");
        fs::write(&af, "{}").unwrap();
        let want = fs::metadata(&af).unwrap().modified().unwrap().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
        let r = subagents_in(&dir, cwd, "sess-1");
        assert_eq!(r.len(), 2);
        assert_eq!((r[0].state.as_str(), r[0].last_at), ("running", Some(want)));
        assert_eq!((r[1].state.as_str(), r[1].last_at), ("done", None));
        let _ = fs::remove_dir_all(&dir);
    }
    #[test]
    fn cmd_running_without_agent_file_has_no_last_at() {
        let dir = tmp("noagent");
        write_session(&dir, "C:/r", "s2", &[start(T0, "toolu_A", "Agent", "x", "d"), result(T1, "toolu_A", ASYNC, false)]);
        let r = subagents_in(&dir, "C:/r", "s2");
        assert_eq!((r.len(), r[0].last_at), (1, None));
        let _ = fs::remove_dir_all(&dir);
    }
    fn age(p: &Path, secs: u64) {
        fs::OpenOptions::new().write(true).open(p).unwrap().set_modified(SystemTime::now() - std::time::Duration::from_secs(secs)).unwrap();
    }
    // 1주일 전 세션의 비동기 에이전트: 실행 중 171h 로 남지 않는다
    #[test]
    fn cmd_stale_parent_and_agent_file_is_unknown() {
        let dir = tmp("stale");
        let cwd = "C:/r";
        write_session(&dir, cwd, "s3", &[start(T0, "toolu_A", "Agent", "x", "d"), result(T1, "toolu_A", ASYNC, false)]);
        let ag = proj(&dir, cwd).join("s3").join("subagents");
        fs::create_dir_all(&ag).unwrap();
        fs::write(ag.join("agent-a3911.jsonl"), "{}").unwrap();
        age(&ag.join("agent-a3911.jsonl"), 7 * 86400);
        age(&proj(&dir, cwd).join("s3.jsonl"), 7 * 86400);
        let r = subagents_in(&dir, cwd, "s3");
        assert_eq!(r[0].state, "unknown");
        assert!(r[0].ended_at.is_some());
        let _ = fs::remove_dir_all(&dir);
    }
    #[test]
    fn cmd_stale_without_agent_file_uses_session_mtime() {
        let dir = tmp("stale2");
        write_session(&dir, "C:/r", "s4", &[start(T0, "toolu_A", "Agent", "x", "d"), result(T1, "toolu_A", ASYNC, false)]);
        age(&proj(&dir, "C:/r").join("s4.jsonl"), 3600);
        assert_eq!(subagents_in(&dir, "C:/r", "s4")[0].state, "unknown");
        let _ = fs::remove_dir_all(&dir);
    }
    #[test]
    fn cmd_old_session_but_fresh_agent_file_stays_running() {
        let dir = tmp("fresh");
        write_session(&dir, "C:/r", "s5", &[start(T0, "toolu_A", "Agent", "x", "d"), result(T1, "toolu_A", ASYNC, false)]);
        age(&proj(&dir, "C:/r").join("s5.jsonl"), 3600);
        let ag = proj(&dir, "C:/r").join("s5").join("subagents");
        fs::create_dir_all(&ag).unwrap();
        fs::write(ag.join("agent-a3911.jsonl"), "{}").unwrap();
        assert_eq!(subagents_in(&dir, "C:/r", "s5")[0].state, "running");
        let _ = fs::remove_dir_all(&dir);
    }
    #[test]
    fn cmd_stale_done_stays_done() {
        let dir = tmp("staledone");
        write_session(&dir, "C:/r", "s6", &[start(T0, "toolu_B", "Agent", "y", "e"), result(T1, "toolu_B", SYNC, false)]);
        age(&proj(&dir, "C:/r").join("s6.jsonl"), 7 * 86400);
        assert_eq!(subagents_in(&dir, "C:/r", "s6")[0].state, "done");
        let _ = fs::remove_dir_all(&dir);
    }
    #[test]
    fn cmd_missing_file_or_bad_id_is_empty() {
        let dir = tmp("bad");
        write_session(&dir, "C:/r", "ok-id", &[start(T0, "toolu_A", "Agent", "x", "d")]);
        assert!(subagents_in(&dir, "C:/r", "nope").is_empty());
        assert!(subagents_in(&dir, "C:/r", "../ok-id").is_empty());
        assert!(subagents_in(&dir, "C:/r", "").is_empty());
        assert_eq!(subagents_in(&dir, "C:/r", "ok-id").len(), 1);
        let _ = fs::remove_dir_all(&dir);
    }
}
