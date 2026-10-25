// H1 대화 목록 읽기 (S-2800~S-2811). 원본(~/.claude, ~/.codex, 프로필)은 읽기만. 시험은 임시 폴더.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::resume::{home, meta, norm, subdirs};
use std::path::{Path, PathBuf};

/// 훑을 설정 폴더 하나. cli = "claude" | "codex", profile = 프로필 id(기본 폴더면 None)
#[derive(Clone, Debug)]
pub struct Source {
    pub cli: String,
    pub dir: PathBuf,
    pub profile: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Conv {
    pub cli: String,
    pub session_id: String,
    pub cwd: Option<String>,
    pub cwd_exists: bool,
    pub title: String,
    pub first_prompt: String,
    pub last_at: u64,
    pub messages: u32,
    pub profile: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub size: u64,
    pub mtime_ms: u64,
    pub scanned_to: u64,
    pub cwd: Option<String>,
    pub first_prompt: String,
    pub custom_title: Option<String>,
    pub ai_title: Option<String>,
    pub messages: u32,
    pub session_id: String,
    /// 지금까지 본 줄의 가장 늦은 timestamp(ms). 0 = 없음 → lastAt 은 mtime
    #[serde(default)]
    pub last_ts_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Cache {
    pub files: HashMap<String, Entry>,
}

/// 캐시 파일을 읽는다. 없거나 깨졌으면 빈 캐시.
pub fn load_cache(path: &Path) -> Cache {
    std::fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

/// tmp 에 쓰고 rename
pub fn save_cache(path: &Path, cache: &Cache) -> Result<(), String> {
    let e = |e: std::io::Error| e.to_string();
    if let Some(d) = path.parent() {
        std::fs::create_dir_all(d).map_err(e)?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    std::fs::write(&tmp, serde_json::to_string(cache).map_err(|e| e.to_string())?).map_err(e)?;
    std::fs::rename(&tmp, path).map_err(e)
}

fn fold(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(200).collect()
}

fn uuid_like(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn files_of(s: &Source) -> Vec<PathBuf> {
    let jsonl = |d: &Path, pre: &str| -> Vec<PathBuf> {
        std::fs::read_dir(d)
            .map(|r| r.flatten().map(|e| e.path()).filter(|p| p.is_file() && p.extension().is_some_and(|x| x == "jsonl") && p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with(pre))).collect())
            .unwrap_or_default()
    };
    if s.cli == "claude" {
        subdirs(&s.dir.join("projects")).iter().flat_map(|p| jsonl(p, "")).collect()
    } else {
        let root = s.dir.join("sessions");
        subdirs(&root).iter().flat_map(|y| subdirs(y)).flat_map(|m| subdirs(&m)).flat_map(|d| jsonl(&d, "rollout-")).collect()
    }
}

fn user_text(v: &serde_json::Value) -> Option<String> {
    let c = v.get("message")?.get("content")?;
    let t = match c {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(a) => a.iter().find(|b| b.get("type").and_then(|x| x.as_str()) == Some("text"))?.get("text")?.as_str()?.to_string(),
        _ => return None,
    };
    let t = t.trim();
    (!t.is_empty() && !t.starts_with('<')).then(|| t.to_string())
}

fn add_message(e: &mut Entry, text: &str) {
    if e.messages == 0 {
        e.first_prompt = fold(text);
    }
    e.messages += 1;
}

/// 완성된 한 줄을 보고 항목을 갱신한다. 싼 contains 로 거른 뒤 필요한 줄만 파싱.
fn apply_line(e: &mut Entry, claude: bool, line: &str) {
    e.last_ts_ms = e.last_ts_ms.max(ts_ms(line));
    if claude {
        let (ct, at) = (line.contains("\"type\":\"custom-title\""), line.contains("\"type\":\"ai-title\""));
        let um = line.contains("\"type\":\"user\"") && !line.contains("tool_use_id");
        let want_cwd = e.cwd.is_none() && line.contains("\"cwd\":\"");
        if !(ct || at || um || want_cwd) {
            return;
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { return };
        if want_cwd {
            e.cwd = v.get("cwd").and_then(|c| c.as_str()).map(String::from);
        }
        let s = |k: &str| v.get(k).and_then(|x| x.as_str()).map(fold).filter(|x| !x.is_empty());
        match v.get("type").and_then(|t| t.as_str()) {
            Some("custom-title") => e.custom_title = s("customTitle").or(e.custom_title.take()),
            Some("ai-title") => e.ai_title = s("aiTitle").or(e.ai_title.take()),
            Some("user") if v.get("isMeta").and_then(|x| x.as_bool()) != Some(true) && v.get("isSidechain").and_then(|x| x.as_bool()) != Some(true) => {
                if let Some(t) = user_text(&v) {
                    add_message(e, &t);
                }
            }
            _ => {}
        }
    } else if line.contains("\"user_message\"") {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { return };
        let p = v.get("payload");
        if v.get("type").and_then(|t| t.as_str()) == Some("event_msg") && p.and_then(|p| p.get("type")).and_then(|t| t.as_str()) == Some("user_message") {
            add_message(e, p.and_then(|p| p.get("message")).and_then(|m| m.as_str()).unwrap_or(""));
        }
    }
}

/// `scanned_to` 부터 줄 단위로 읽는다. 줄바꿈 없는 마지막 조각은 처리하지 않는다(S-2807). 읽은 바이트를 돌려준다.
fn read_from(path: &Path, claude: bool, e: &mut Entry) -> u64 {
    use std::io::{BufRead, Seek, SeekFrom};
    let Ok(mut f) = std::fs::File::open(path) else { return 0 };
    if f.seek(SeekFrom::Start(e.scanned_to)).is_err() {
        return 0;
    }
    let (mut r, mut buf, mut total) = (std::io::BufReader::new(f), Vec::new(), 0u64);
    loop {
        buf.clear();
        let n = r.read_until(b'\n', &mut buf).unwrap_or(0);
        total += n as u64;
        if n == 0 || buf.last() != Some(&b'\n') {
            return total;
        }
        apply_line(e, claude, &String::from_utf8_lossy(&buf));
        e.scanned_to += n as u64;
    }
}

/// 줄의 첫 `"timestamp":"…"`(RFC3339) → ms. 없거나 깨졌으면 0
fn ts_ms(line: &str) -> u64 {
    const K: &str = "\"timestamp\":\"";
    let Some(i) = line.find(K) else { return 0 };
    let r = &line[i + K.len()..];
    let t = &r[..r.find('"').unwrap_or(r.len())];
    chrono::DateTime::parse_from_rfc3339(t).map_or(0, |d| d.timestamp_millis().max(0) as u64)
}

fn mtime_ms(m: &std::fs::Metadata) -> u64 {
    m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64)
}

/// 모든 출처를 훑어 (lastAt 내림차순 목록, 이번에 읽은 바이트).
pub fn scan(sources: &[Source], skip_under: &Path, cache: &mut Cache) -> (Vec<Conv>, u64) {
    use std::collections::HashSet;
    let skip = norm(&skip_under.to_string_lossy());
    let (mut seen, mut exists, mut out, mut bytes) = (HashSet::new(), HashMap::<String, bool>::new(), Vec::new(), 0u64);
    for s in sources {
        let claude = s.cli == "claude";
        for p in files_of(s) {
            let key = p.to_string_lossy().into_owned();
            if !seen.insert(key.clone()) {
                continue;
            }
            let Ok(m) = std::fs::metadata(&p) else { continue };
            let (size, mt) = (m.len(), mtime_ms(&m));
            let id = p.file_stem().and_then(|n| n.to_str()).unwrap_or("").to_string();
            if claude && !uuid_like(&id) {
                continue;
            }
            let mut e = cache.files.remove(&key).unwrap_or_default();
            if e.size != size || e.mtime_ms != mt || e.session_id.is_empty() && !claude {
                if size < e.scanned_to {
                    e = Entry::default();
                }
                if claude {
                    e.session_id = id;
                } else if e.scanned_to == 0 {
                    // Codex: 첫 줄 session_meta 가 있어야 대화로 친다(없으면 다음 호출에서 다시 본다)
                    let Some((sid, cwd)) = meta(&p) else {
                        cache.files.insert(key, Entry { size, mtime_ms: mt, ..Default::default() });
                        continue;
                    };
                    e.session_id = sid;
                    e.cwd = Some(cwd);
                }
                bytes += read_from(&p, claude, &mut e);
                e.size = size;
                e.mtime_ms = mt;
            }
            if e.messages > 0 && !e.session_id.is_empty() {
                let under = e.cwd.as_deref().map(norm).is_some_and(|c| !skip.is_empty() && (c == skip || c.starts_with(&format!("{skip}\\"))));
                if !under {
                    let cwd_exists = e.cwd.as_ref().is_some_and(|c| *exists.entry(norm(c)).or_insert_with(|| Path::new(c).is_dir()));
                    out.push(Conv {
                        cli: s.cli.clone(),
                        session_id: e.session_id.clone(),
                        cwd: e.cwd.clone(),
                        cwd_exists,
                        title: e.custom_title.clone().or_else(|| e.ai_title.clone()).unwrap_or_else(|| e.first_prompt.clone()),
                        first_prompt: e.first_prompt.clone(),
                        last_at: if e.last_ts_ms > 0 { e.last_ts_ms } else { mt }, // ponytail: 옛 캐시(last_ts_ms 0)는 파일이 바뀔 때까지 mtime. 새로 고침(force)하면 채워짐
                        messages: e.messages,
                        profile: s.profile.clone(),
                    });
                }
            }
            cache.files.insert(key, e);
        }
    }
    cache.files.retain(|k, _| seen.contains(k));
    out.sort_by(|a, b| b.last_at.cmp(&a.last_at));
    (out, bytes)
}

static CACHE: std::sync::Mutex<Option<Cache>> = std::sync::Mutex::new(None);

/// S-2800: 대화 목록. 훑기는 spawn_blocking, 캐시는 Mutex 하나(S-2808).
#[tauri::command]
pub async fn conversations_list(app: tauri::AppHandle, force: bool) -> Result<Vec<Conv>, String> {
    use tauri::Manager;
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut src = Vec::new();
    let home = home();
    if let Some(h) = &home {
        src.push(Source { cli: "claude".into(), dir: h.join(".claude"), profile: None });
    }
    if let Some(c) = std::env::var_os("CODEX_HOME").map(PathBuf::from).or_else(|| home.map(|h| h.join(".codex"))) {
        src.push(Source { cli: "codex".into(), dir: c, profile: None });
    }
    if let Ok(root) = crate::profiles::root(&app) {
        for p in crate::profiles::profile_list_in(&root) {
            let dir = root.join(&p.agent).join(&p.id);
            if dir.is_dir() {
                src.push(Source { cli: p.agent, dir, profile: Some(p.id) });
            }
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
        let cp = data.join("conversations-cache.json");
        let mut g = CACHE.lock().unwrap_or_else(|e| e.into_inner());
        if force {
            *g = Some(Cache::default());
        }
        let cache = g.get_or_insert_with(|| load_cache(&cp));
        let (list, read) = scan(&src, &data, cache);
        if read > 0 || force {
            let _ = save_cache(&cp, cache);
        }
        list
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    const U1: &str = "11111111-2222-3333-4444-555555555555";
    const U2: &str = "22222222-2222-3333-4444-555555555555";
    const U3: &str = "33333333-2222-3333-4444-555555555555";
    const U4: &str = "44444444-2222-3333-4444-555555555555";

    fn tmp(tag: &str) -> PathBuf {
        let n = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let p = std::env::temp_dir().join(format!("symvibe-h1-{tag}-{}-{n}", std::process::id()));
        fs::create_dir_all(&p).unwrap();
        p
    }
    fn user(text: &str) -> String {
        serde_json::json!({"type":"user","message":{"role":"user","content":text}}).to_string()
    }
    fn user_cwd(text: &str, cwd: &str) -> String {
        serde_json::json!({"type":"user","cwd":cwd,"message":{"role":"user","content":text}}).to_string()
    }
    fn write(p: &Path, lines: &[String]) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        let mut s = lines.join("\n");
        s.push('\n');
        fs::write(p, s).unwrap();
    }
    fn append(p: &Path, text: &str) {
        fs::OpenOptions::new().append(true).open(p).unwrap().write_all(text.as_bytes()).unwrap();
    }
    fn set_mtime(p: &Path, t: SystemTime) {
        fs::OpenOptions::new().write(true).open(p).unwrap().set_modified(t).unwrap();
    }
    fn claude_src(dir: &Path) -> Vec<Source> {
        vec![Source { cli: "claude".into(), dir: dir.to_path_buf(), profile: None }]
    }
    fn cfile(dir: &Path, id: &str) -> PathBuf {
        dir.join("projects").join("p1").join(format!("{id}.jsonl"))
    }
    fn one(dir: &Path, skip: &Path) -> Vec<Conv> {
        scan(&claude_src(dir), skip, &mut Cache::default()).0
    }

    // S-2800 S-2801: cwd 가 4번째 줄 / cwd 없음 / subagents·UUID 아닌 이름은 목록에 없음
    #[test]
    fn claude_files_cwd_and_subagents() {
        let (d, skip, work) = (tmp("c1"), tmp("c1skip"), tmp("c1work"));
        let w = work.to_string_lossy().to_string();
        write(&cfile(&d, U1), &[r#"{"type":"summary"}"#.into(), r#"{"type":"x"}"#.into(), r#"{"type":"y"}"#.into(), user_cwd("hello", &w)]);
        write(&cfile(&d, U2), &[user("no cwd here")]);
        write(&d.join("projects").join("p1").join(U1).join("subagents").join(format!("{U3}.jsonl")), &[user_cwd("sub", &w)]);
        write(&d.join("projects").join("p1").join("not a uuid.jsonl"), &[user_cwd("bad name", &w)]);
        let r = one(&d, &skip);
        assert_eq!(r.len(), 2, "{r:?}");
        let a = r.iter().find(|c| c.session_id == U1).unwrap();
        assert_eq!((a.cli.as_str(), a.cwd.as_deref(), a.cwd_exists, a.profile.clone()), ("claude", Some(w.as_str()), true, None));
        let b = r.iter().find(|c| c.session_id == U2).unwrap();
        assert_eq!((b.cwd.clone(), b.cwd_exists), (None, false));
        assert!(r.iter().all(|c| c.session_id != U3));
    }

    // S-2809 폴더가 디스크에 없으면 cwdExists=false
    #[test]
    fn cwd_missing_on_disk() {
        let (d, skip) = (tmp("c2"), tmp("c2skip"));
        write(&cfile(&d, U1), &[user_cwd("hi", r"C:\no\such\folder\symvibe-h1")]);
        let r = one(&d, &skip);
        assert_eq!(r.len(), 1);
        assert!(!r[0].cwd_exists);
    }

    // S-2803 메시지 수: 도구 결과·isMeta·isSidechain·<command-name> 줄 제외, 블록 배열 글은 센다
    #[test]
    fn message_count_rules() {
        let (d, skip) = (tmp("m"), tmp("mskip"));
        let tool = serde_json::json!({"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"x"}]}}).to_string();
        let meta = serde_json::json!({"type":"user","isMeta":true,"message":{"role":"user","content":"meta"}}).to_string();
        let side = serde_json::json!({"type":"user","isSidechain":true,"message":{"role":"user","content":"side"}}).to_string();
        let cmd = user("<command-name>/clear</command-name>");
        let blocks = serde_json::json!({"type":"user","message":{"role":"user","content":[{"type":"text","text":"block text"}]}}).to_string();
        let asst = serde_json::json!({"type":"assistant","message":{"role":"assistant","content":"hi"}}).to_string();
        write(&cfile(&d, U1), &[user_cwd("first", "C:\\x"), asst, tool, meta, side, cmd, blocks, user("third")]);
        let r = one(&d, &skip);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].messages, 3);
        assert_eq!(r[0].first_prompt, "first");
    }

    // S-2803 제목: custom > ai > 첫 메시지(공백 접고 200자), 마지막 것이 이긴다
    #[test]
    fn title_priority() {
        let (d, skip) = (tmp("t"), tmp("tskip"));
        let long = format!("a   b\n{}", "x".repeat(300));
        write(&cfile(&d, U1), &[user(&long)]);
        let t = one(&d, &skip)[0].title.clone();
        assert_eq!(t.chars().count(), 200);
        assert!(t.starts_with("a b xxx"), "{t}");
        write(&cfile(&d, U1), &[user("first"), r#"{"type":"ai-title","aiTitle":"AI one"}"#.into(), r#"{"type":"ai-title","aiTitle":"AI two"}"#.into()]);
        assert_eq!(one(&d, &skip)[0].title, "AI two");
        write(&cfile(&d, U1), &[user("first"), r#"{"type":"custom-title","customTitle":"Mine"}"#.into(), r#"{"type":"ai-title","aiTitle":"AI two"}"#.into()]);
        assert_eq!(one(&d, &skip)[0].title, "Mine");
    }

    fn codex_file(root: &Path, name: &str, lines: &[String]) -> PathBuf {
        let p = root.join("sessions").join("2026").join("10").join("25").join(name);
        write(&p, lines);
        p
    }
    fn umsg(m: &str) -> String {
        serde_json::json!({"type":"event_msg","payload":{"type":"user_message","message":m}}).to_string()
    }

    // S-2802 Codex 새 형식(payload)·옛 형식(맨 위) + user_message 수, cwd 없는 파일·rollout- 아닌 이름은 뺌
    #[test]
    fn codex_new_and_old_format() {
        let (d, skip) = (tmp("x"), tmp("xskip"));
        let new_meta = serde_json::json!({"type":"session_meta","payload":{"id":"cx-new","cwd":"C:\\w1"}}).to_string();
        let old_meta = serde_json::json!({"id":"cx-old","cwd":"C:\\w2"}).to_string();
        codex_file(&d, "rollout-a.jsonl", &[new_meta, umsg("hello codex"), r#"{"type":"event_msg","payload":{"type":"agent_message"}}"#.into(), umsg("two")]);
        codex_file(&d, "rollout-b.jsonl", &[old_meta, umsg("old one")]);
        codex_file(&d, "rollout-c.jsonl", &[serde_json::json!({"type":"session_meta","payload":{"id":"cx-nocwd"}}).to_string(), umsg("x")]);
        codex_file(&d, "other.jsonl", &[serde_json::json!({"id":"cx-x","cwd":"C:\\w3"}).to_string(), umsg("x")]);
        let src = vec![Source { cli: "codex".into(), dir: d.clone(), profile: None }];
        let r = scan(&src, &skip, &mut Cache::default()).0;
        assert_eq!(r.len(), 2, "{r:?}");
        let a = r.iter().find(|c| c.session_id == "cx-new").unwrap();
        assert_eq!((a.cli.as_str(), a.cwd.as_deref(), a.messages, a.first_prompt.as_str(), a.title.as_str()), ("codex", Some("C:\\w1"), 2, "hello codex", "hello codex"));
        let b = r.iter().find(|c| c.session_id == "cx-old").unwrap();
        assert_eq!((b.cwd.as_deref(), b.messages), (Some("C:\\w2"), 1));
    }

    // S-2805 두 번째 0바이트 / 덧붙이면 그 바이트만 / 짧아지면 처음부터 / 사라진 파일 항목 삭제(S-2806)
    #[test]
    fn cache_incremental() {
        let (d, skip) = (tmp("k"), tmp("kskip"));
        let f = cfile(&d, U1);
        write(&f, &[user_cwd("one", "C:\\x"), user("two")]);
        let size = fs::metadata(&f).unwrap().len();
        let mut cache = Cache::default();
        let (r, b1) = scan(&claude_src(&d), &skip, &mut cache);
        assert_eq!((r.len(), r[0].messages, b1), (1, 2, size));
        let (r, b2) = scan(&claude_src(&d), &skip, &mut cache);
        assert_eq!((r[0].messages, b2), (2, 0));
        let add = format!("{}\n", user("three"));
        append(&f, &add);
        let (r, b3) = scan(&claude_src(&d), &skip, &mut cache);
        assert_eq!((r[0].messages, b3), (3, add.len() as u64));
        append(&f, "{\"type\":\"ai-title\",\"aiTitle\":\"Later\"}\n");
        let (r, _) = scan(&claude_src(&d), &skip, &mut cache);
        assert_eq!(r[0].title, "Later");
        write(&f, &[user_cwd("short", "C:\\x")]);
        let size = fs::metadata(&f).unwrap().len();
        let (r, b4) = scan(&claude_src(&d), &skip, &mut cache);
        assert_eq!((r[0].messages, b4), (1, size));
        fs::remove_file(&f).unwrap();
        let (r, _) = scan(&claude_src(&d), &skip, &mut cache);
        assert!(r.is_empty() && cache.files.is_empty());
    }

    // S-2807 쓰는 중인 마지막 줄(줄바꿈 없음)은 안 셈 → 줄바꿈이 붙으면 셈
    #[test]
    fn partial_last_line() {
        let (d, skip) = (tmp("p"), tmp("pskip"));
        let f = cfile(&d, U1);
        write(&f, &[user_cwd("one", "C:\\x")]);
        let tail = user("two");
        append(&f, &tail);
        let mut cache = Cache::default();
        let (r, _) = scan(&claude_src(&d), &skip, &mut cache);
        assert_eq!(r[0].messages, 1);
        let first_line = user_cwd("one", "C:\\x").len() as u64 + 1;
        assert_eq!(cache.files.values().next().unwrap().scanned_to, first_line);
        append(&f, "\n");
        let (r, b) = scan(&claude_src(&d), &skip, &mut cache);
        assert_eq!((r[0].messages, b), (2, tail.len() as u64 + 1));
    }

    // S-2804 원본 바이트·mtime 그대로, lastAt = 파일 mtime(ms)
    #[test]
    fn source_untouched() {
        let (d, skip) = (tmp("u"), tmp("uskip"));
        let f = cfile(&d, U1);
        write(&f, &[user_cwd("one", "C:\\x")]);
        let t = UNIX_EPOCH + Duration::from_millis(1_760_000_000_000);
        set_mtime(&f, t);
        let before = (fs::read(&f).unwrap(), fs::metadata(&f).unwrap().modified().unwrap());
        let mut cache = Cache::default();
        let r = scan(&claude_src(&d), &skip, &mut cache).0;
        scan(&claude_src(&d), &skip, &mut cache);
        assert_eq!((fs::read(&f).unwrap(), fs::metadata(&f).unwrap().modified().unwrap()), before);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].last_at, 1_760_000_000_000);
    }

    fn user_ts(text: &str, ts: &str) -> String {
        serde_json::json!({"type":"user","timestamp":ts,"cwd":"C:/x","message":{"role":"user","content":text}}).to_string()
    }
    // claude 가 대화를 열면 mtime 만 바뀐다: lastAt·정렬은 마지막 메시지 timestamp 기준
    #[test]
    fn last_at_is_last_message_timestamp_not_mtime() {
        let (d, skip) = (tmp("ts"), tmp("tsskip"));
        write(&cfile(&d, U1), &[user_ts("a", "2026-10-01T00:00:00.000Z"), user_ts("b", "2026-10-02T00:00:00.000Z")]);
        write(&cfile(&d, U2), &[user_ts("c", "2026-10-10T00:00:00.000Z")]);
        // 오래된 U1 이 방금 열려 mtime 이 더 새로움
        set_mtime(&cfile(&d, U2), UNIX_EPOCH + Duration::from_millis(1_000));
        let r = one(&d, &skip);
        assert_eq!(r.iter().map(|c| c.session_id.as_str()).collect::<Vec<_>>(), vec![U2, U1]);
        assert_eq!((r[0].last_at, r[1].last_at), (1_791_590_400_000, 1_790_899_200_000));
    }
    // 캐시 키는 mtime·크기 그대로: 이어붙이면 timestamp 가 갱신된다
    #[test]
    fn last_at_updates_on_append() {
        let (d, skip) = (tmp("tsa"), tmp("tsaskip"));
        let f = cfile(&d, U1);
        write(&f, &[user_ts("a", "2026-10-01T00:00:00.000Z")]);
        let mut cache = Cache::default();
        assert_eq!(scan(&claude_src(&d), &skip, &mut cache).0[0].last_at, 1_790_812_800_000);
        append(&f, &(user_ts("b", "2026-10-03T00:00:00.000Z") + "\n"));
        assert_eq!(scan(&claude_src(&d), &skip, &mut cache).0[0].last_at, 1_790_985_600_000);
    }

    // S-2803 앱 데이터 아래 cwd 와 메시지 0개는 뺌, 정렬은 lastAt 내림차순
    #[test]
    fn filters_and_order() {
        let (d, skip) = (tmp("f"), tmp("fskip"));
        let inside = skip.join("Studio").to_string_lossy().to_string();
        write(&cfile(&d, U1), &[user_cwd("hidden probe", &inside)]);
        write(&cfile(&d, U2), &[r#"{"type":"assistant","message":{"content":"x"}}"#.into()]);
        write(&cfile(&d, U3), &[user_cwd("keep", "C:\\x")]);
        write(&cfile(&d, U4), &[user_cwd("older", "C:\\y")]);
        set_mtime(&cfile(&d, U4), SystemTime::now() - Duration::from_secs(7200));
        let r = one(&d, &skip);
        assert_eq!(r.iter().map(|c| c.session_id.as_str()).collect::<Vec<_>>(), vec![U3, U4]);
    }

    // S-2810 1800개: 결과 1800, 두 번째 0바이트
    #[test]
    fn many_files_second_call_zero_bytes() {
        let (d, skip) = (tmp("n"), tmp("nskip"));
        for i in 0..1800u32 {
            write(&cfile(&d, &format!("{i:08}-2222-3333-4444-555555555555")), &[user_cwd(&format!("m{i}"), "C:\\x")]);
        }
        let mut cache = Cache::default();
        let (r, b1) = scan(&claude_src(&d), &skip, &mut cache);
        assert_eq!(r.len(), 1800);
        assert!(b1 > 0);
        let (r, b2) = scan(&claude_src(&d), &skip, &mut cache);
        assert_eq!((r.len(), b2), (1800, 0));
    }

    // 프로필 출처의 profile 값
    #[test]
    fn profile_source_value() {
        let (d, p, skip) = (tmp("d"), tmp("pr"), tmp("prskip"));
        write(&cfile(&d, U1), &[user_cwd("a", "C:\\x")]);
        write(&cfile(&p, U2), &[user_cwd("b", "C:\\x")]);
        let src = vec![
            Source { cli: "claude".into(), dir: d, profile: None },
            Source { cli: "claude".into(), dir: p, profile: Some("work".into()) },
        ];
        let r = scan(&src, &skip, &mut Cache::default()).0;
        assert_eq!(r.len(), 2);
        assert_eq!(r.iter().find(|c| c.session_id == U1).unwrap().profile, None);
        assert_eq!(r.iter().find(|c| c.session_id == U2).unwrap().profile.as_deref(), Some("work"));
    }

    // S-2806 캐시 저장·다시 읽기, 깨진 캐시는 빈 캐시(오류 아님)
    #[test]
    fn cache_file_roundtrip_and_broken() {
        let (d, skip, app) = (tmp("s"), tmp("sskip"), tmp("sapp"));
        write(&cfile(&d, U1), &[user_cwd("a", "C:\\x")]);
        let cp = app.join("conversations-cache.json");
        let mut cache = Cache::default();
        scan(&claude_src(&d), &skip, &mut cache);
        save_cache(&cp, &cache).unwrap();
        assert!(cp.is_file() && !app.join("conversations-cache.json.tmp").exists());
        let mut again = load_cache(&cp);
        let (r, b) = scan(&claude_src(&d), &skip, &mut again);
        assert_eq!((r.len(), b), (1, 0), "다시 켜도 캐시를 쓴다");
        fs::write(&cp, "{not json").unwrap();
        let mut broken = load_cache(&cp);
        assert!(broken.files.is_empty());
        assert_eq!(scan(&claude_src(&d), &skip, &mut broken).0.len(), 1);
    }
}
