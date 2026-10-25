// B16 라이브 에이전트 상태(S-680~S-693): Claude settings.json·Codex hooks.json 에 Symvibe hook 항목을 더하고/빼고,
// hook 스크립트를 쓰고, 루프백 HTTP 수신기로 이벤트를 받는다. 시험은 전부 임시 폴더(S-691) — 실제 ~/.claude·~/.codex 는 열지 않는다.
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Symvibe 항목을 알아보는 표시(hook 명령 안의 스크립트 이름)
pub const MARKER: &str = "hypervibe-hook";
pub const CLAUDE_EVENTS: &[&str] = &["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Notification", "Stop", "StopFailure"];
pub const CODEX_EVENTS: &[&str] = &["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Stop"];
pub const MAX_BODY: usize = 64 * 1024;

pub struct Paths {
    pub claude: PathBuf,
    pub codex: PathBuf,
    pub script: PathBuf,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Event {
    pub console: String,
    pub event: String,
    pub payload: Value,
}

fn load(json: &str) -> Result<Value, String> {
    if json.trim().is_empty() {
        return Ok(json!({}));
    }
    match serde_json::from_str::<Value>(json) {
        Ok(v @ Value::Object(_)) => Ok(v),
        Ok(_) => Err("settings file is not a JSON object".into()),
        Err(e) => Err(format!("settings file is not readable JSON: {e}")),
    }
}

/// 이벤트 배열마다 Symvibe hook 만 빼고, 비게 된 묶음·배열·hooks 칸을 치운다(다른 항목은 그대로)
fn strip(v: &mut Value) -> Result<(), String> {
    let Some(hooks) = v.get_mut("hooks") else { return Ok(()) };
    let hooks = hooks.as_object_mut().ok_or("hooks is not an object")?;
    for arr in hooks.values_mut() {
        let Some(groups) = arr.as_array_mut() else { continue };
        for g in groups.iter_mut() {
            if let Some(hs) = g.get_mut("hooks").and_then(|h| h.as_array_mut()) {
                hs.retain(|h| !h["command"].as_str().is_some_and(|c| c.contains(MARKER)));
            }
        }
        groups.retain(|g| g.get("hooks").and_then(|h| h.as_array()).map_or(true, |h| !h.is_empty()));
    }
    hooks.retain(|_, a| a.as_array().map_or(true, |x| !x.is_empty()));
    if hooks.is_empty() {
        v.as_object_mut().unwrap().remove("hooks");
    }
    Ok(())
}

/// 설정 문자열에 Symvibe hook 항목을 더한 새 문자열. 다른 항목 보존·중복 추가 안 함. 읽을 수 없으면 Err
pub fn add_entry(json: &str, command: &str, events: &[&str]) -> Result<String, String> {
    let mut v = load(json)?;
    strip(&mut v)?; // 이미 있던 Symvibe 항목은 새 명령으로 바꾼다(두 번 켜도 한 개)
    let root = v.as_object_mut().unwrap();
    let hooks = root.entry("hooks").or_insert_with(|| json!({}));
    let hooks = hooks.as_object_mut().ok_or("hooks is not an object")?;
    for e in events {
        let arr = hooks.entry(*e).or_insert_with(|| json!([]));
        arr.as_array_mut().ok_or("hook list is not an array")?.push(json!({ "hooks": [{ "type": "command", "command": command }] }));
    }
    serde_json::to_string_pretty(&v).map_err(|e| e.to_string())
}

/// Symvibe 항목만 뺀 새 문자열. 읽을 수 없으면 Err
pub fn remove_entry(json: &str) -> Result<String, String> {
    let mut v = load(json)?;
    strip(&mut v)?;
    serde_json::to_string_pretty(&v).map_err(|e| e.to_string())
}

/// env 조회 함수를 받아 경로를 정한다(시험이 덮어씀)
pub fn paths(env: &dyn Fn(&str) -> Option<String>) -> Paths {
    let get = |k: &str| env(k).filter(|s| !s.is_empty()).map(PathBuf::from);
    let home = get("USERPROFILE").or_else(|| get("HOME")).unwrap_or_default();
    Paths {
        claude: get("CLAUDE_CONFIG_DIR").unwrap_or_else(|| home.join(".claude")).join("settings.json"),
        codex: get("CODEX_HOME").unwrap_or_else(|| home.join(".codex")).join("hooks.json"),
        script: home.join(".hypervibe").join("agent-hooks").join("hypervibe-hook.cmd"),
    }
}

/// 파일이 있고 백업이 아직 없으면 `<파일>.hypervibe-backup` 으로 복사. 만들었으면 true
pub fn backup_once(file: &Path) -> std::io::Result<bool> {
    let mut name = file.file_name().unwrap_or_default().to_os_string();
    name.push(".hypervibe-backup");
    let b = file.with_file_name(name);
    if !file.exists() || b.exists() {
        return Ok(false);
    }
    std::fs::copy(file, b)?;
    Ok(true)
}

const SCRIPT: &str = "@echo off\r\nrem Symvibe live status hook. Forwards the agent's hook event (JSON on stdin) to the app on this PC. Nothing leaves this PC.\r\nif \"%SYMVIBE_HOOK_URL%\"==\"\" exit /b 0\r\ncurl.exe -s -m 3 -X POST -H \"X-Symvibe-Console: %SYMVIBE_CONSOLE%\" -H \"Content-Type: application/json\" --data-binary @- \"%SYMVIBE_HOOK_URL%\" >nul 2>&1\r\nexit /b 0\r\n";

/// hook 명령: 슬래시 경로(bash·cmd 어느 쪽이 실행해도 역슬래시가 깨지지 않게)
fn hook_command(script: &Path) -> String {
    format!("\"{}\"", script.to_string_lossy().replace('\\', "/"))
}

fn read_opt(p: &Path) -> Result<String, String> {
    match std::fs::read_to_string(p) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("{}: {e}", p.display())),
    }
}

fn write_with_dir(p: &Path, text: &str) -> Result<(), String> {
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, text).map_err(|e| format!("{}: {e}", p.display()))
}

/// 스크립트를 쓰고, 두 설정 파일을 백업한 뒤 항목을 더한다. 어느 한쪽이 읽을 수 없으면 아무것도 쓰지 않는다
pub fn install(p: &Paths) -> Result<(), String> {
    let cmd = hook_command(&p.script);
    let c = add_entry(&read_opt(&p.claude)?, &cmd, CLAUDE_EVENTS).map_err(|e| format!("{}: {e}", p.claude.display()))?;
    let x = add_entry(&read_opt(&p.codex)?, &cmd, CODEX_EVENTS).map_err(|e| format!("{}: {e}", p.codex.display()))?;
    write_with_dir(&p.script, SCRIPT)?;
    for (f, text) in [(&p.claude, c), (&p.codex, x)] {
        backup_once(f).map_err(|e| e.to_string())?;
        write_with_dir(f, &text)?;
    }
    Ok(())
}

/// 두 설정 파일에서 항목을 뺀다(스크립트는 남김). 읽을 수 없는 파일은 건드리지 않고 Err
pub fn uninstall(p: &Paths) -> Result<(), String> {
    let mut out = vec![];
    for f in [&p.claude, &p.codex] {
        let raw = read_opt(f)?;
        if raw.contains(MARKER) {
            out.push((f, remove_entry(&raw).map_err(|e| format!("{}: {e}", f.display()))?));
        }
    }
    for (f, text) in out {
        write_with_dir(f, &text)?;
    }
    Ok(())
}

/// 프로필 폴더 안의 hook 설정 파일과 이벤트 목록: claude = settings.json, codex = hooks.json
fn profile_file(agent: &str, dir: &Path) -> Result<(PathBuf, &'static [&'static str]), String> {
    match agent {
        "claude" => Ok((dir.join("settings.json"), CLAUDE_EVENTS)),
        "codex" => Ok((dir.join("hooks.json"), CODEX_EVENTS)),
        _ => Err(format!("no profiles for {agent}")),
    }
}

/// D12 S-1629: 프로필 폴더(`CLAUDE_CONFIG_DIR`/`CODEX_HOME`) 한 곳에 hook 항목을 더한다 — claude 는 settings.json, codex 는 hooks.json.
/// 없던 파일은 새로 만들고 처음 고치기 전에 백업 1번. script 도 쓴다
pub fn install_profile(agent: &str, dir: &Path, script: &Path) -> Result<(), String> {
    let (file, events) = profile_file(agent, dir)?;
    let text = add_entry(&read_opt(&file)?, &hook_command(script), events).map_err(|e| format!("{}: {e}", file.display()))?;
    write_with_dir(script, SCRIPT)?;
    backup_once(&file).map_err(|e| e.to_string())?;
    write_with_dir(&file, &text)
}

/// 프로필 폴더의 파일에서 항목을 뺀다(파일이 없거나 항목이 없으면 그대로)
pub fn uninstall_profile(agent: &str, dir: &Path) -> Result<(), String> {
    let (file, _) = profile_file(agent, dir)?;
    let raw = read_opt(&file)?;
    if !raw.contains(MARKER) {
        return Ok(());
    }
    write_with_dir(&file, &remove_entry(&raw).map_err(|e| format!("{}: {e}", file.display()))?)
}

pub struct Receiver {
    port: u16,
    stop: Arc<AtomicBool>,
    th: Option<std::thread::JoinHandle<()>>,
}

fn respond(s: &mut TcpStream, code: u16, text: &str) {
    let _ = write!(s, "HTTP/1.1 {code} {text}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    let _ = s.flush();
}

/// 요청 하나를 처리한다
fn handle(s: &mut TcpStream, token: &str, on_event: &(dyn Fn(Event) + Send + Sync)) {
    let _ = s.set_nonblocking(false);
    let _ = s.set_read_timeout(Some(Duration::from_secs(1)));
    let mut buf: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 4096];
    let head_end = loop {
        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break i;
        }
        if buf.len() > 16 * 1024 {
            return respond(s, 431, "Header Too Large");
        }
        match s.read(&mut chunk) {
            Ok(0) | Err(_) => return,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
        }
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let mut lines = head.split("\r\n");
    let mut first = lines.next().unwrap_or("").split_whitespace();
    let (method, path) = (first.next().unwrap_or(""), first.next().unwrap_or(""));
    let (mut len, mut console) = (0usize, String::new());
    for l in lines {
        if let Some((k, v)) = l.split_once(':') {
            match k.trim().to_ascii_lowercase().as_str() {
                "content-length" => len = v.trim().parse().unwrap_or(0),
                "x-symvibe-console" => console = v.trim().to_string(),
                _ => {}
            }
        }
    }
    let have = buf.len() - head_end - 4;
    // 거절할 때도 보낸 쪽이 쓰다 막히지 않게 본문을 (상한까지) 비운 뒤 닫는다
    let reject = |s: &mut TcpStream, code: u16, text: &str| {
        respond(s, code, text);
        let mut left = len.saturating_sub(have).min(4 * MAX_BODY);
        let mut sink = [0u8; 8192];
        while left > 0 {
            match s.read(&mut sink[..left.min(8192)]) {
                Ok(0) | Err(_) => break,
                Ok(n) => left -= n,
            }
        }
    };
    if path != format!("/{token}") {
        return reject(s, 403, "Forbidden");
    }
    if method != "POST" {
        return reject(s, 405, "Method Not Allowed");
    }
    if len > MAX_BODY {
        return reject(s, 413, "Payload Too Large");
    }
    let mut body = buf[head_end + 4..].to_vec();
    while body.len() < len {
        match s.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => body.extend_from_slice(&chunk[..n]),
        }
    }
    body.truncate(len);
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else { return respond(s, 400, "Bad Request") };
    let event = payload["hook_event_name"].as_str().unwrap_or("").to_string();
    if event.is_empty() {
        return respond(s, 400, "Bad Request");
    }
    on_event(Event { console, event, payload });
    respond(s, 200, "OK");
}

impl Receiver {
    /// 127.0.0.1 임의 포트에서 수신 시작. 토큰은 경로(`/<token>`). 켜진 동안 스레드 1개
    pub fn start(token: &str, on_event: Box<dyn Fn(Event) + Send + Sync>) -> std::io::Result<Receiver> {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        listener.set_nonblocking(true)?;
        let port = listener.local_addr()?.port();
        let stop = Arc::new(AtomicBool::new(false));
        let (flag, token) = (stop.clone(), token.to_string());
        let th = std::thread::spawn(move || {
            while !flag.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((mut s, _)) => handle(&mut s, &token, &*on_event),
                    Err(_) => std::thread::sleep(Duration::from_millis(25)), // ponytail: 25ms 간격 확인. 수신이 잦아지면 블로킹 accept + 깨우기 연결로
                }
            }
        });
        Ok(Receiver { port, stop, th: Some(th) })
    }
    pub fn port(&self) -> u16 {
        self.port
    }
    pub fn stop(mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.th.take() {
            let _ = t.join();
        }
    }
}

impl Drop for Receiver {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

/// Tauri 명령. 실제 경로(USERPROFILE·CLAUDE_CONFIG_DIR·CODEX_HOME)는 여기서만 읽는다 — 시험은 이 모듈을 안 부른다
pub mod cmds {
    use super::*;
    use std::sync::Mutex;
    use tauri::{AppHandle, Emitter, State};

    #[derive(Default)]
    pub struct LiveState(Mutex<Option<(Receiver, String)>>);

    fn real_paths() -> Paths {
        paths(&|k| std::env::var(k).ok())
    }

    fn token() -> String {
        use std::hash::{BuildHasher, Hasher};
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0);
        let mut a = std::collections::hash_map::RandomState::new().build_hasher();
        a.write_u64(nanos);
        let mut b = std::collections::hash_map::RandomState::new().build_hasher();
        b.write_u32(std::process::id());
        format!("{:016x}{:016x}", a.finish(), b.finish())
    }

    /// 수신기가 없으면 열고 `http://127.0.0.1:포트/토큰` 을 돌려준다
    fn ensure(app: &AppHandle, st: &LiveState) -> Result<String, String> {
        let mut g = st.0.lock().map_err(|e| e.to_string())?;
        if let Some((_, url)) = g.as_ref() {
            return Ok(url.clone());
        }
        let tok = token();
        let app = app.clone();
        let r = Receiver::start(
            &tok,
            Box::new(move |e| {
                let _ = app.emit("agent-status", json!({ "console": e.console, "event": e.event, "payload": e.payload }));
            }),
        )
        .map_err(|e| e.to_string())?;
        let url = format!("http://127.0.0.1:{}/{tok}", r.port());
        *g = Some((r, url.clone()));
        Ok(url)
    }

    fn close_receiver(st: &LiveState) {
        if let Ok(mut g) = st.0.lock() {
            if let Some((r, _)) = g.take() {
                r.stop();
            }
        }
    }

    #[derive(serde::Serialize)]
    pub struct PathInfo {
        claude: String,
        codex: String,
        script: String,
    }

    /// 켜기 전 안내에 보일 파일 경로
    #[tauri::command]
    pub fn live_status_paths() -> PathInfo {
        let p = real_paths();
        let s = |x: &Path| x.to_string_lossy().into_owned();
        PathInfo { claude: s(&p.claude), codex: s(&p.codex), script: s(&p.script) }
    }

    /// 설정은 안 건드리고 수신기만 연다(앱 시작 때 이미 켜져 있던 경우)
    #[tauri::command]
    pub fn live_status_url(app: AppHandle, st: State<'_, LiveState>) -> Result<String, String> {
        ensure(&app, &st)
    }

    /// 저장된 모든 프로필 폴더 (agent, 폴더) — D12 S-1629
    fn profile_dirs(app: &AppHandle) -> Vec<(String, PathBuf)> {
        let Ok(root) = crate::profiles::root(app) else { return vec![] };
        crate::profiles::profile_list_in(&root).into_iter().map(|p| (p.agent.clone(), root.join(&p.agent).join(&p.id))).filter(|(_, d)| d.is_dir()).collect()
    }

    /// 두 설정 파일(과 저장된 프로필 폴더들)에 항목을 더하고 수신기를 연다
    #[tauri::command]
    pub fn live_status_enable(app: AppHandle, st: State<'_, LiveState>) -> Result<String, String> {
        let url = ensure(&app, &st)?;
        let p = real_paths();
        let r = install(&p).and_then(|_| profile_dirs(&app).iter().try_for_each(|(a, d)| install_profile(a, d, &p.script)));
        if let Err(e) = r {
            close_receiver(&st);
            return Err(e);
        }
        Ok(url)
    }

    /// 항목을 빼고(프로필 폴더 포함) 수신기를 닫는다
    #[tauri::command]
    pub fn live_status_disable(app: AppHandle, st: State<'_, LiveState>) -> Result<(), String> {
        let r = uninstall(&real_paths()).and_then(|_| profile_dirs(&app).iter().try_for_each(|(a, d)| uninstall_profile(a, d)));
        close_receiver(&st);
        r
    }

    /// 새 프로필 폴더 하나에 설치(라이브 상태가 켜져 있을 때 프론트가 부른다) — D12 S-1629
    #[tauri::command]
    pub fn live_status_install_profile(app: AppHandle, agent: String, id: String) -> Result<(), String> {
        let dir = crate::profiles::root(&app)?.join(&agent).join(&id);
        install_profile(&agent, &dir, &real_paths().script)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::sync::mpsc;
    use std::time::Duration;

    const CMD: &str = "\"C:/Users/x/.hypervibe/agent-hooks/hypervibe-hook.cmd\"";

    fn tmp(name: &str) -> PathBuf {
        let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let d = std::env::temp_dir().join(format!("hv-{name}-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }
    fn parse(s: &str) -> Value {
        serde_json::from_str(s).unwrap()
    }
    fn commands(v: &Value, event: &str) -> Vec<String> {
        v["hooks"][event]
            .as_array()
            .map(|a| a.iter().flat_map(|g| g["hooks"].as_array().cloned().unwrap_or_default()).filter_map(|h| h["command"].as_str().map(String::from)).collect())
            .unwrap_or_default()
    }
    const OTHER: &str = r#"{"model":"x","hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"my-lint.sh"}]}],"Stop":[{"hooks":[{"type":"command","command":"notify.sh"}]}]}}"#;

    #[test]
    fn add_entry_keeps_other_hooks() {
        let out = parse(&add_entry(OTHER, CMD, CLAUDE_EVENTS).unwrap());
        assert_eq!(out["model"], "x");
        assert!(commands(&out, "PreToolUse").contains(&"my-lint.sh".to_string()));
        assert!(commands(&out, "PreToolUse").contains(&CMD.to_string()));
        assert!(commands(&out, "Stop").contains(&"notify.sh".to_string()));
        assert!(commands(&out, "Stop").contains(&CMD.to_string()));
        for e in CLAUDE_EVENTS {
            assert!(commands(&out, e).contains(&CMD.to_string()), "{e}");
        }
    }

    #[test]
    fn add_twice_no_duplicate() {
        let once = add_entry(OTHER, CMD, CLAUDE_EVENTS).unwrap();
        let twice = add_entry(&once, CMD, CLAUDE_EVENTS).unwrap();
        assert_eq!(parse(&once), parse(&twice));
        assert_eq!(commands(&parse(&twice), "Stop").iter().filter(|c| c.contains(MARKER)).count(), 1);
    }

    #[test]
    fn remove_entry_restores_other_hooks() {
        let added = add_entry(OTHER, CMD, CLAUDE_EVENTS).unwrap();
        assert_eq!(parse(&remove_entry(&added).unwrap()), parse(OTHER));
        // 빈 설정에 더했다 빼면 hooks 칸이 남지 않는다
        let from_empty = add_entry("", CMD, CODEX_EVENTS).unwrap();
        assert_eq!(parse(&remove_entry(&from_empty).unwrap()), json!({}));
    }

    #[test]
    fn unreadable_json_left_alone() {
        assert!(add_entry("{ not json", CMD, CLAUDE_EVENTS).is_err());
        assert!(add_entry("[1,2]", CMD, CLAUDE_EVENTS).is_err());
        assert!(remove_entry("{ not json").is_err());
        // install 도 한쪽이 깨졌으면 다른 쪽을 쓰지 않는다
        let home = tmp("unreadable");
        let env: HashMap<&str, String> = HashMap::from([("USERPROFILE", home.to_string_lossy().into_owned())]);
        let p = paths(&|k| env.get(k).cloned());
        std::fs::create_dir_all(p.claude.parent().unwrap()).unwrap();
        std::fs::create_dir_all(p.codex.parent().unwrap()).unwrap();
        std::fs::write(&p.claude, "{}").unwrap();
        std::fs::write(&p.codex, "{ broken").unwrap();
        assert!(install(&p).is_err());
        assert_eq!(std::fs::read_to_string(&p.claude).unwrap(), "{}");
        assert_eq!(std::fs::read_to_string(&p.codex).unwrap(), "{ broken");
        assert!(!p.claude.with_file_name("settings.json.hypervibe-backup").exists());
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn backup_made_once() {
        let d = tmp("backup");
        let f = d.join("settings.json");
        assert!(!backup_once(&f).unwrap()); // 파일이 없으면 백업할 것도 없다
        std::fs::write(&f, "first").unwrap();
        assert!(backup_once(&f).unwrap());
        std::fs::write(&f, "second").unwrap();
        assert!(!backup_once(&f).unwrap());
        assert_eq!(std::fs::read_to_string(d.join("settings.json.hypervibe-backup")).unwrap(), "first");
        let _ = std::fs::remove_dir_all(d);
    }

    #[test]
    fn statusline_untouched() {
        let src = r#"{"statusLine":{"type":"command","command":"ccstatusline"},"hooks":{}}"#;
        let added = parse(&add_entry(src, CMD, CLAUDE_EVENTS).unwrap());
        assert_eq!(added["statusLine"], json!({"type":"command","command":"ccstatusline"}));
        let removed = parse(&remove_entry(&serde_json::to_string(&added).unwrap()).unwrap());
        assert_eq!(removed["statusLine"], added["statusLine"]);
    }

    #[test]
    fn paths_follow_env_overrides() {
        let env: HashMap<&str, String> = HashMap::from([("USERPROFILE", "C:/Users/u".to_string())]);
        let p = paths(&|k| env.get(k).cloned());
        assert_eq!(p.claude, PathBuf::from("C:/Users/u").join(".claude").join("settings.json"));
        assert_eq!(p.codex, PathBuf::from("C:/Users/u").join(".codex").join("hooks.json"));
        assert_eq!(p.script, PathBuf::from("C:/Users/u").join(".hypervibe").join("agent-hooks").join("hypervibe-hook.cmd"));
        let env2: HashMap<&str, String> = HashMap::from([("USERPROFILE", "C:/Users/u".to_string()), ("CLAUDE_CONFIG_DIR", "D:/cc".to_string()), ("CODEX_HOME", "D:/cx".to_string())]);
        let p2 = paths(&|k| env2.get(k).cloned());
        assert_eq!(p2.claude, PathBuf::from("D:/cc").join("settings.json"));
        assert_eq!(p2.codex, PathBuf::from("D:/cx").join("hooks.json"));
    }

    #[test]
    fn install_and_uninstall_in_temp_home() {
        let home = tmp("install");
        let env: HashMap<&str, String> = HashMap::from([("USERPROFILE", home.to_string_lossy().into_owned())]);
        let p = paths(&|k| env.get(k).cloned());
        std::fs::create_dir_all(p.claude.parent().unwrap()).unwrap();
        std::fs::write(&p.claude, OTHER).unwrap();
        install(&p).unwrap();
        install(&p).unwrap(); // 두 번 켜도 한 번만
        let c = parse(&std::fs::read_to_string(&p.claude).unwrap());
        assert_eq!(commands(&c, "Stop").iter().filter(|x| x.contains(MARKER)).count(), 1);
        assert!(commands(&c, "Stop").contains(&"notify.sh".to_string()));
        assert!(commands(&parse(&std::fs::read_to_string(&p.codex).unwrap()), "Stop").iter().any(|x| x.contains(MARKER))); // 없던 hooks.json 은 새로 만든다
        assert_eq!(std::fs::read_to_string(p.claude.with_file_name("settings.json.hypervibe-backup")).unwrap(), OTHER);
        let script = std::fs::read_to_string(&p.script).unwrap();
        assert!(script.contains("curl.exe") && script.contains("SYMVIBE_HOOK_URL") && script.contains("SYMVIBE_CONSOLE"));
        uninstall(&p).unwrap();
        assert_eq!(parse(&std::fs::read_to_string(&p.claude).unwrap()), parse(OTHER));
        let _ = std::fs::remove_dir_all(home);
    }

    fn post(port: u16, path: &str, console: &str, body: &[u8]) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        let head = format!("POST {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Symvibe-Console: {console}\r\nContent-Length: {}\r\n\r\n", body.len());
        s.write_all(head.as_bytes()).unwrap();
        let _ = s.write_all(body);
        let mut out = String::new();
        let _ = s.read_to_string(&mut out);
        out
    }

    #[test]
    fn receiver_rejects_bad_token() {
        let (tx, rx) = mpsc::channel();
        let tx = std::sync::Mutex::new(tx);
        let r = Receiver::start("good", Box::new(move |e| tx.lock().unwrap().send(e).unwrap())).unwrap();
        let resp = post(r.port(), "/bad", "c", br#"{"hook_event_name":"Stop"}"#);
        assert!(resp.starts_with("HTTP/1.1 403"), "{resp}");
        assert!(rx.recv_timeout(Duration::from_millis(300)).is_err());
        r.stop();
    }

    #[test]
    fn receiver_limits_body() {
        let (tx, rx) = mpsc::channel();
        let tx = std::sync::Mutex::new(tx);
        let r = Receiver::start("good", Box::new(move |e| tx.lock().unwrap().send(e).unwrap())).unwrap();
        let big = vec![b'a'; MAX_BODY + 1];
        let resp = post(r.port(), "/good", "c", &big);
        assert!(resp.starts_with("HTTP/1.1 413"), "{resp}");
        assert!(rx.recv_timeout(Duration::from_millis(300)).is_err());
        r.stop();
    }

    #[test]
    fn event_roundtrip_to_channel() {
        let (tx, rx) = mpsc::channel();
        let tx = std::sync::Mutex::new(tx);
        let r = Receiver::start("good", Box::new(move |e| tx.lock().unwrap().send(e).unwrap())).unwrap();
        let resp = post(r.port(), "/good", "ws1|n2", br#"{"hook_event_name":"PreToolUse","tool_name":"Bash"}"#);
        assert!(resp.starts_with("HTTP/1.1 200"), "{resp}");
        let e = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(e.console, "ws1|n2");
        assert_eq!(e.event, "PreToolUse");
        assert_eq!(e.payload["tool_name"], "Bash");
        r.stop();
    }

    // D12 S-1629: 프로필 폴더에도 설치·제거 (임시 폴더만)
    #[test]
    fn profile_install_and_uninstall() {
        let root = tmp("prof");
        let script = root.join("hooks").join("hypervibe-hook.cmd");
        let cl = root.join("claude").join("work");
        let cx = root.join("codex").join("main");
        std::fs::create_dir_all(&cl).unwrap();
        std::fs::create_dir_all(&cx).unwrap();
        std::fs::write(cl.join("settings.json"), OTHER).unwrap();
        install_profile("claude", &cl, &script).unwrap();
        install_profile("claude", &cl, &script).unwrap(); // 두 번 켜도 한 번만
        let c = parse(&std::fs::read_to_string(cl.join("settings.json")).unwrap());
        assert_eq!(commands(&c, "Stop").iter().filter(|x| x.contains(MARKER)).count(), 1);
        assert!(commands(&c, "Stop").contains(&"notify.sh".to_string()), "다른 hook 은 남는다");
        assert_eq!(std::fs::read_to_string(cl.join("settings.json.hypervibe-backup")).unwrap(), OTHER, "처음 고치기 전 백업 1번");
        assert!(std::fs::read_to_string(&script).unwrap().contains("SYMVIBE_HOOK_URL"), "스크립트도 쓴다");
        // 없던 hooks.json 은 새로 만든다(백업은 없다)
        install_profile("codex", &cx, &script).unwrap();
        assert!(commands(&parse(&std::fs::read_to_string(cx.join("hooks.json")).unwrap()), "Stop").iter().any(|x| x.contains(MARKER)));
        assert!(!cx.join("hooks.json.hypervibe-backup").exists());
        assert!(!cx.join("settings.json").exists(), "codex 폴더에 settings.json 을 만들지 않는다");
        // 제거
        uninstall_profile("claude", &cl).unwrap();
        assert_eq!(parse(&std::fs::read_to_string(cl.join("settings.json")).unwrap()), parse(OTHER));
        uninstall_profile("codex", &cx).unwrap();
        assert!(!std::fs::read_to_string(cx.join("hooks.json")).unwrap().contains(MARKER));
        uninstall_profile("claude", &root.join("nope")).unwrap(); // 폴더가 없어도 오류 아님
        assert!(install_profile("gemini", &cl, &script).is_err(), "프로필이 없는 에이전트");
        let _ = std::fs::remove_dir_all(root);
    }
}
