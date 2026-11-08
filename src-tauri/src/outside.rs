// 바깥 Claude 가져오기: Symvibe 밖(바탕화면 터미널 등)에서 돌고 있는 대화형 Claude 목록과, 가져오기 전에 그 Claude 끄기.
// 근거(실측): Claude 2.x 는 `<설정>/sessions/<pid>.json` 에 pid·지금 대화 id·폴더·kind(interactive / -p 는 다름)를 쓴다.
use crate::resume::project_dir_name;
use crate::transcripts::tail_lines;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Outside {
    pub pid: u32,
    pub session_id: String,
    pub cwd: String,
    pub started_at: u64,
    /// 마지막으로 사람이 한 말(목록에서 알아보기용, 80자)
    pub last: String,
}

/// 대화 기록 끝에서 사람이 쓴 마지막 말
fn last_user(claude_dir: &Path, cwd: &str, sid: &str) -> String {
    let f = claude_dir.join("projects").join(project_dir_name(cwd)).join(format!("{sid}.jsonl"));
    let text = tail_lines(&f).unwrap_or_default().iter().rev().find_map(|l| {
        let v: Value = serde_json::from_str(l).ok()?;
        if v.get("type")?.as_str()? != "user" || v.get("isMeta").and_then(Value::as_bool) == Some(true) {
            return None;
        }
        let c = v.get("message")?.get("content")?;
        let t = match c {
            Value::String(s) => s.clone(),
            Value::Array(a) => a.iter().find_map(|b| (b.get("type")?.as_str()? == "text").then(|| b.get("text")?.as_str().map(str::to_string)).flatten())?,
            _ => return None,
        };
        let t = t.trim().to_string();
        (!t.is_empty() && !t.starts_with('<')).then_some(t)
    });
    text.map(|t| t.chars().take(80).collect()).unwrap_or_default()
}

/// sessions/*.json 중 대화형이고, 살아 있고, 우리(Symvibe) 자식이 아닌 것. 최근 시작한 것 먼저
pub fn scan(claude_dir: &Path, mine: &HashSet<u32>, alive: &dyn Fn(u32) -> bool) -> Vec<Outside> {
    let mut out: Vec<Outside> = std::fs::read_dir(claude_dir.join("sessions"))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|e| {
            let v: Value = serde_json::from_str(&std::fs::read_to_string(e.path()).ok()?).ok()?;
            let pid = v.get("pid")?.as_u64()? as u32;
            if v.get("kind").and_then(Value::as_str) != Some("interactive") || mine.contains(&pid) || !alive(pid) {
                return None;
            }
            let session_id = v.get("sessionId")?.as_str()?.to_string();
            let cwd = v.get("cwd")?.as_str()?.to_string();
            let last = last_user(claude_dir, &cwd, &session_id);
            Some(Outside { pid, session_id, cwd, started_at: v.get("startedAt").and_then(Value::as_u64).unwrap_or(0), last })
        })
        .collect();
    out.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    out
}

fn claude_dir() -> Option<std::path::PathBuf> {
    crate::resume::home().map(|h| h.join(".claude"))
}

fn mine() -> HashSet<u32> {
    crate::suspend::tree(std::process::id()).into_iter().map(|e| e.0).collect()
}

#[tauri::command]
pub async fn outside_claudes() -> Vec<Outside> {
    tauri::async_runtime::spawn_blocking(|| {
        let Some(d) = claude_dir() else { return vec![] };
        scan(&d, &mine(), &|p| !crate::suspend::tree(p).is_empty())
    })
    .await
    .unwrap_or_default()
}

/// 가져오기 전에 바깥 Claude(와 그 자식)를 끈다. 지금도 목록에 있고 같은 대화일 때만(다른 프로그램을 잘못 끄지 않게)
#[tauri::command]
pub async fn outside_claude_stop(pid: u32, session_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = claude_dir().ok_or("홈 폴더 없음")?;
        let ok = scan(&d, &mine(), &|p| !crate::suspend::tree(p).is_empty()).iter().any(|o| o.pid == pid && o.session_id == session_id);
        if ok {
            crate::suspend::kill_list(&crate::suspend::tree(pid));
        } // 아니면 이미 꺼졌거나 다른 대화로 바뀜: 끌 것 없음
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn scan_lists_only_live_interactive_outside_sessions() {
        let d = std::env::temp_dir().join(format!("sv-outside-{}", std::process::id()));
        let s = d.join("sessions");
        fs::create_dir_all(&s).unwrap();
        let w = |pid: u32, kind: &str, sid: &str, at: u64| fs::write(s.join(format!("{pid}.json")), format!(r#"{{"pid":{pid},"sessionId":"{sid}","cwd":"D:/w","kind":"{kind}","startedAt":{at}}}"#)).unwrap();
        w(10, "interactive", "aaa", 1); // 바깥
        w(11, "interactive", "bbb", 2); // 우리 자식
        w(12, "print", "ccc", 3); // claude -p
        w(13, "interactive", "ddd", 4); // 죽음
        w(14, "interactive", "eee", 5); // 바깥, 더 최근
        let p = d.join("projects").join(project_dir_name("D:/w"));
        fs::create_dir_all(&p).unwrap();
        fs::write(p.join("eee.jsonl"), "{\"type\":\"user\",\"message\":{\"content\":\"표 그려줘\"}}\n{\"type\":\"user\",\"message\":{\"content\":\"<command-name>/x</command-name>\"}}\n").unwrap();
        let mine: HashSet<u32> = [11].into();
        let got = scan(&d, &mine, &|p| p != 13);
        assert_eq!(got.iter().map(|o| o.pid).collect::<Vec<_>>(), vec![14, 10]);
        assert_eq!(got[0].last, "표 그려줘");
        assert_eq!(got[1].last, "");
        let _ = fs::remove_dir_all(&d);
    }
}
