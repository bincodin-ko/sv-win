// 에이전트 카탈로그(내장 5 + Shell + 카탈로그 29), 실행 파일 찾기, 실행 spec 만들기 (S-160~S-170)
// 찾기·spec 만들기는 환경(PATH 등)을 인자로 받는 순수 함수 — 시험이 전역 환경변수를 바꾸지 않게.
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ResumeKind {
    Own,
    Latest,
    None,
}

pub struct AgentDef {
    pub id: &'static str,
    pub name: &'static str,
    /// 공백으로 나뉜 명령 문자열 (첫 토큰 = 실행 파일, 나머지 = 늘 붙는 인자)
    pub command: &'static str,
    pub builtin: bool,
    pub yolo_args: &'static [&'static str],
    pub yolo_env: &'static [(&'static str, &'static str)],
    pub resume: ResumeKind,
}

const fn a(
    id: &'static str,
    name: &'static str,
    command: &'static str,
    yolo_args: &'static [&'static str],
) -> AgentDef {
    AgentDef { id, name, command, builtin: false, yolo_args, yolo_env: &[], resume: ResumeKind::None }
}

const fn b(
    id: &'static str,
    name: &'static str,
    command: &'static str,
    yolo_args: &'static [&'static str],
    resume: ResumeKind,
) -> AgentDef {
    AgentDef { id, name, command, builtin: true, yolo_args, yolo_env: &[], resume }
}

/// 내장 5(표 순서) + Shell, 그다음 카탈로그 29(이름 알파벳순). S-160·S-161
static CATALOG: [AgentDef; 35] = [
    b("claude", "Claude", "claude", &["--dangerously-skip-permissions"], ResumeKind::Own),
    b("codex", "Codex", "codex", &["--dangerously-bypass-approvals-and-sandbox"], ResumeKind::Own),
    b("gemini", "Gemini", "gemini", &["--yolo"], ResumeKind::Latest),
    b("grok", "Grok", "grok", &["--permission-mode", "bypassPermissions"], ResumeKind::None),
    b("opencode", "OpenCode", "opencode", &[], ResumeKind::Latest),
    b("shell", "Shell", "", &[], ResumeKind::None),
    a("aider", "Aider", "aider", &["--yes-always"]),
    a("amp", "Amp", "amp", &["--dangerously-allow-all"]),
    a("ante", "Ante", "ante", &["--yolo"]),
    a("antigravity", "Antigravity", "agy", &["--dangerously-skip-permissions"]),
    a("auggie", "Auggie", "auggie", &[]),
    a("autohand", "Autohand", "autohand", &["--unrestricted"]),
    a("cline", "Cline", "cline", &["--auto-approve", "true"]),
    a("codebuff", "Codebuff", "codebuff", &[]),
    a("command-code", "Command Code", "command-code --trust", &["--yolo"]),
    a("continue", "Continue", "cn", &["--allow", "*"]),
    a("crush", "Crush", "crush", &["--yolo"]),
    a("cursor", "Cursor", "cursor-agent", &["--yolo"]),
    a("devin", "Devin", "devin", &["--permission-mode", "bypass"]),
    a("droid", "Droid", "droid", &[]),
    a("copilot", "GitHub Copilot", "copilot", &["--yolo"]),
    AgentDef { yolo_env: &[("GOOSE_MODE", "auto")], ..a("goose", "Goose", "goose", &[]) },
    a("hermes", "Hermes", "hermes", &["--tui", "--yolo"]),
    a("kilocode", "Kilocode", "kilo", &[]),
    a("kimi", "Kimi", "kimi", &["--yolo"]),
    a("kiro", "Kiro", "kiro-cli chat", &["--tui", "--trust-all-tools"]),
    a("mimo", "MiMo Code", "mimo", &[]),
    a("mistral-vibe", "Mistral Vibe", "vibe", &["--agent", "auto-approve"]),
    a("openclaude", "OpenClaude", "openclaude", &["--dangerously-skip-permissions"]),
    a("openclaw", "OpenClaw", "openclaw", &[]),
    a("pi", "Pi", "pi", &[]),
    a("prime-agent", "Prime Agent", "prime-agent", &[]),
    a("qwen", "Qwen Code", "qwen", &["--approval-mode", "yolo"]),
    a("rovo", "Rovo Dev", "rovo", &["--yolo"]),
    a("trae", "Trae", "traecli", &["--yolo"]),
];

pub fn catalog() -> &'static [AgentDef] {
    &CATALOG
}

pub fn find_def(id: &str) -> Option<&'static AgentDef> {
    CATALOG.iter().find(|d| d.id == id)
}

/// 설정 경로(있는 파일이면) → dirs 순서대로 폴더 x pathext → 마지막에 .ps1 (S-163)
pub fn resolve(cmd: &str, custom: Option<&Path>, dirs: &[PathBuf], pathext: &[String]) -> Option<PathBuf> {
    if let Some(c) = custom.filter(|c| c.is_file()) {
        return Some(c.to_path_buf());
    }
    let exts: Vec<String> =
        pathext.iter().map(|e| e.to_lowercase()).chain(std::iter::once(".ps1".to_string())).collect();
    dirs.iter().find_map(|d| exts.iter().map(|e| d.join(format!("{cmd}{e}"))).find(|p| p.is_file()))
}

/// 정확한 파일 이름(pwsh.exe 등)을 dirs에서 찾는다
pub fn which(name: &str, dirs: &[PathBuf]) -> Option<PathBuf> {
    dirs.iter().map(|d| d.join(name)).find(|p| p.is_file())
}

/// S-164: .cmd/.bat → cmd.exe /d /c call, .ps1 → ps_program -File, 그 밖은 직접 실행
pub fn wrap(path: &Path, args: Vec<String>, ps_program: &str) -> (String, Vec<String>) {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let p = path.to_string_lossy().to_string();
    match ext.as_str() {
        "cmd" | "bat" => {
            // A4 실측(portable-pty): 한 문자열 `"<경로>" 인자`를 넘기면 PTY가 따옴표를 \" 로 다시 이스케이프해
            // cmd.exe 가 못 알아본다. 그래서 인자를 따로 넘기고(공백 든 것만 PTY가 알아서 감쌈), 첫 글자가 따옴표가
            // 되지 않게 `call` 을 앞에 둔다(cmd 의 첫·끝 따옴표 벗기기 규칙 회피).
            let mut v: Vec<String> = ["/d", "/c", "call"].iter().map(|s| s.to_string()).collect();
            v.push(p);
            v.extend(args);
            ("cmd.exe".into(), v)
        }
        "ps1" => {
            let mut v = vec!["-NoLogo".to_string(), "-File".into(), p];
            v.extend(args);
            (ps_program.into(), v)
        }
        _ => (p, args),
    }
}

fn is_powershell(program: &str) -> bool {
    let stem = Path::new(program).file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
    stem == "pwsh" || stem == "powershell"
}

/// S-166: defaultShell → pwsh.exe → powershell.exe → COMSPEC. lookup(이름) = 그 이름의 실행 파일 경로
pub fn find_shell(
    default_shell: Option<&str>,
    lookup: &dyn Fn(&str) -> Option<PathBuf>,
    comspec: Option<&str>,
) -> (String, Vec<String>) {
    let program = default_shell
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| lookup("pwsh.exe").map(|p| p.to_string_lossy().to_string()))
        .or_else(|| lookup("powershell.exe").map(|p| p.to_string_lossy().to_string()))
        .unwrap_or_else(|| comspec.filter(|s| !s.is_empty()).unwrap_or("cmd.exe").to_string());
    let args = if is_powershell(&program) { vec!["-NoLogo".to_string()] } else { vec![] };
    (program, args)
}

/// S-167
pub fn default_agent(setting: Option<&str>, installed: &dyn Fn(&str) -> bool) -> String {
    if let Some(s) = setting.filter(|s| !s.is_empty()) {
        return s.to_string();
    }
    CATALOG
        .iter()
        .filter(|d| d.id != "shell")
        .find(|d| installed(d.id))
        .map(|d| d.id)
        .unwrap_or("claude")
        .to_string()
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Spec {
    pub program: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub yolo: bool,
    pub not_found: bool,
    pub shell_fallback: bool,
}

#[derive(Clone, Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resume {
    pub kind: Option<String>,
    pub session_id: Option<String>,
}

fn resume_args(def: &AgentDef, r: Option<&Resume>) -> Vec<String> {
    let Some(r) = r else { return vec![] };
    if matches!(r.kind.as_deref(), None | Some("none")) {
        return vec![];
    }
    let id = r.session_id.clone().filter(|s| !s.is_empty());
    let v: Vec<&str> = match def.id {
        // S-237: kind "new" = 새로 시작하며 세션 id 지정
        "claude" if r.kind.as_deref() == Some("new") => id.as_deref().map_or(vec![], |i| vec!["--session-id", i]),
        _ if r.kind.as_deref() == Some("new") => vec![],
        "claude" => id.as_deref().map_or(vec![], |i| vec!["--resume", i]),
        "codex" => id.as_deref().map_or(vec![], |i| vec!["resume", i]),
        "gemini" => vec!["--resume", "latest"],
        "opencode" => vec!["--continue"],
        _ => vec![],
    };
    v.into_iter().map(String::from).collect()
}

/// S-170: 명령 문자열 + resume 인자 + Yolo 순서. found=None이면 S-166 셸 + not_found.
pub fn build_spec(
    def: &AgentDef,
    resume: Option<&Resume>,
    yolo: bool,
    found: Option<&Path>,
    shell: (String, Vec<String>),
    ps_program: &str,
) -> Spec {
    let mut spec = Spec {
        program: shell.0,
        args: shell.1,
        env: vec![],
        yolo: false,
        not_found: false,
        shell_fallback: false,
    };
    if def.id == "shell" {
        return spec;
    }
    let Some(path) = found else {
        spec.not_found = true;
        spec.shell_fallback = true;
        return spec;
    };
    let has_yolo = yolo && (!def.yolo_args.is_empty() || !def.yolo_env.is_empty());
    let mut args: Vec<String> = def.command.split_whitespace().skip(1).map(String::from).collect();
    args.extend(resume_args(def, resume));
    if has_yolo {
        args.extend(def.yolo_args.iter().map(|s| s.to_string()));
        spec.env = def.yolo_env.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
    }
    (spec.program, spec.args) = wrap(path, args, ps_program);
    spec.yolo = has_yolo;
    spec
}

/// FX1: 설정 yolo 와 호출한 쪽의 no_yolo(숨은 세션)를 합친 값. 숨은 세션은 권한 건너뛰기를 받지 않는다.
pub fn effective_yolo(setting: bool, no_yolo: Option<bool>) -> bool {
    setting && !no_yolo.unwrap_or(false)
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub command: String,
    pub builtin: bool,
    pub yolo_args: Vec<String>,
    pub yolo_env: BTreeMap<String, String>,
    pub resume_kind: ResumeKind,
    pub installed: bool,
    pub path: Option<String>,
    pub section: &'static str,
}

/// S-168·S-376·S-378: 목록 = 설치됨 → 내 에이전트 → 설치 안 됨. find(id, 명령 첫 토큰) = 실행 파일 경로.
/// 내 에이전트 목록에 든 카탈로그 에이전트(내장 아닌 것)는 "yours" 구역에 한 번만 나온다.
pub fn list_agents(
    find: &dyn Fn(&str, &str) -> Option<PathBuf>,
    customs: &[crate::custom_agents::CustomAgent],
) -> Vec<AgentInfo> {
    let first = |cmd: &str| cmd.split_whitespace().next().unwrap_or("").to_string();
    let mut list: Vec<AgentInfo> = CATALOG
        .iter()
        .map(|d| {
            let path = if d.id == "shell" { None } else { find(d.id, &first(d.command)) };
            let installed = d.id == "shell" || path.is_some();
            let yours = !d.builtin && customs.iter().any(|c| c.id == d.id);
            AgentInfo {
                id: d.id.into(),
                name: d.name.into(),
                command: d.command.into(),
                builtin: d.builtin,
                yolo_args: d.yolo_args.iter().map(|s| s.to_string()).collect(),
                yolo_env: d.yolo_env.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
                resume_kind: d.resume,
                installed,
                path: path.map(|p| p.to_string_lossy().to_string()),
                section: if yours { "yours" } else if installed { "detected" } else { "notInstalled" },
            }
        })
        .collect();
    for c in customs.iter().filter(|c| find_def(&c.id).is_none()) {
        let path = find(&c.id, &first(&c.command));
        list.push(AgentInfo {
            id: c.id.clone(),
            name: c.name.clone(),
            command: c.command.clone(),
            builtin: false,
            yolo_args: vec![],
            yolo_env: BTreeMap::new(),
            resume_kind: ResumeKind::None,
            installed: path.is_some(),
            path: path.map(|p| p.to_string_lossy().to_string()),
            section: "yours",
        });
    }
    // 같은 구역 안은 카탈로그 순서 → 내 에이전트는 저장한 순서(안정 정렬)
    list.sort_by_key(|i| match i.section {
        "detected" => 0,
        "yours" => 1,
        _ => 2,
    });
    list
}

/// 실행 spec. 카탈로그 id → 기존 build_spec, 내 에이전트 id → 명령을 공백으로 나눠 실행(Yolo 없음, S-379),
/// 지워진 "custom:" id → 일반 Shell(S-380), 그 밖 모르는 id → 오류
pub fn make_spec(
    agent_id: &str,
    customs: &[crate::custom_agents::CustomAgent],
    resume: Option<&Resume>,
    yolo: bool,
    find: &dyn Fn(&str, &str) -> Option<PathBuf>,
    shell: (String, Vec<String>),
    ps_program: &str,
) -> Result<Spec, String> {
    let first = |cmd: &str| cmd.split_whitespace().next().unwrap_or("").to_string();
    if agent_id == crate::gh::LOGIN_ID {
        return Ok(crate::gh::login_spec(find("gh", "gh").as_deref(), shell, ps_program));
    }
    if let Some(def) = find_def(agent_id) {
        let found = if def.id == "shell" { None } else { find(def.id, &first(def.command)) };
        return Ok(build_spec(def, resume, yolo, found.as_deref(), shell, ps_program));
    }
    let shell_def = find_def("shell").expect("shell");
    let Some(c) = customs.iter().find(|c| c.id == agent_id) else {
        if agent_id.starts_with("custom:") {
            return Ok(build_spec(shell_def, None, false, None, shell, ps_program));
        }
        return Err(format!("알 수 없는 에이전트: {agent_id}"));
    };
    let Some(path) = find(&c.id, &first(&c.command)) else {
        return Ok(Spec { not_found: true, shell_fallback: true, ..build_spec(shell_def, None, false, None, shell, ps_program) });
    };
    let args: Vec<String> = c.command.split_whitespace().skip(1).map(String::from).collect();
    let (program, args) = wrap(&path, args, ps_program);
    Ok(Spec { program, args, env: vec![], yolo: false, not_found: false, shell_fallback: false })
}

// ---- 실제 환경 (Tauri 명령) ----
fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('%') {
        out.push_str(&rest[..i]);
        match rest[i + 1..].find('%') {
            Some(j) => {
                out.push_str(&std::env::var(&rest[i + 1..i + 1 + j]).unwrap_or_default());
                rest = &rest[i + j + 2..];
            }
            None => {
                out.push_str(&rest[i..]);
                rest = "";
            }
        }
    }
    out + rest
}

/// 앱 프로세스 PATH + 레지스트리 사용자·시스템 PATH(오래된 PATH 보완) + 보통 설치 폴더 (S-163)
pub fn search_dirs() -> Vec<PathBuf> {
    let mut paths: Vec<String> = vec![std::env::var("PATH").unwrap_or_default()];
    #[cfg(windows)]
    {
        use winreg::{enums::*, RegKey};
        let get = |root: RegKey, sub: &str| root.open_subkey(sub).and_then(|k| k.get_value::<String, _>("Path")).ok();
        paths.extend(get(RegKey::predef(HKEY_CURRENT_USER), "Environment"));
        paths.extend(get(
            RegKey::predef(HKEY_LOCAL_MACHINE),
            "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
        ));
    }
    let mut dirs: Vec<PathBuf> = vec![];
    for p in paths {
        dirs.extend(std::env::split_paths(&expand_env(&p)).filter(|d| !d.as_os_str().is_empty()));
    }
    for t in [
        "%USERPROFILE%\\.local\\bin",
        "%APPDATA%\\npm",
        "%LOCALAPPDATA%\\pnpm",
        "%USERPROFILE%\\.bun\\bin",
        "%USERPROFILE%\\.cargo\\bin",
        "%LOCALAPPDATA%\\Volta\\bin",
        "%ProgramFiles%\\Volta",
        "%LOCALAPPDATA%\\mise\\shims",
        "%USERPROFILE%\\scoop\\shims",
        "%LOCALAPPDATA%\\Microsoft\\WinGet\\Links",
    ] {
        dirs.push(PathBuf::from(expand_env(t)));
    }
    let mut seen = std::collections::HashSet::new();
    dirs.retain(|d| seen.insert(d.to_string_lossy().to_lowercase()));
    dirs
}

pub fn pathext() -> Vec<String> {
    let v = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    v.split(';').filter(|e| e.starts_with('.')).map(String::from).collect()
}

fn find_agent(def: &AgentDef, s: &crate::settings::Settings, dirs: &[PathBuf]) -> Option<PathBuf> {
    if def.id == "shell" {
        return None;
    }
    let custom = s
        .get("agentPaths")
        .and_then(|m| m.get(def.id))
        .and_then(|v| v.as_str())
        .filter(|p| !p.is_empty())
        .map(PathBuf::from);
    resolve(def.command.split_whitespace().next().unwrap_or(""), custom.as_deref(), dirs, &pathext())
}

pub mod cmds {
    use super::*;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use crate::custom_agents::CustomAgent;

    type Found = HashMap<String, Option<PathBuf>>;

    /// 찾기 결과 캐시 (S-169): 시작 때 1번, agents_list 호출 때 백그라운드 갱신
    #[derive(Default, Clone)]
    pub struct AgentCache(Arc<Mutex<Option<Found>>>);

    impl AgentCache {
        pub fn refresh(&self, s: &crate::settings::Settings) {
            let dirs = search_dirs();
            let map = CATALOG.iter().map(|d| (d.id.to_string(), find_agent(d, s, &dirs))).collect();
            *self.0.lock().unwrap() = Some(map);
        }
        fn snapshot(&self) -> Option<Found> {
            self.0.lock().unwrap().clone()
        }
        /// 캐시가 비어 있으면 지금 찾는다
        fn get_or_scan(&self, s: &crate::settings::Settings) -> Found {
            if self.snapshot().is_none() {
                self.refresh(s);
            }
            self.snapshot().unwrap_or_default()
        }
    }

    fn load(app: &tauri::AppHandle) -> Result<crate::settings::Settings, String> {
        Ok(crate::settings::load(&crate::settings::file(app)?))
    }

    fn customs(app: &tauri::AppHandle) -> Vec<CustomAgent> {
        crate::custom_agents::file(app).map(|f| crate::custom_agents::load(&f)).unwrap_or_default()
    }

    #[tauri::command]
    pub fn agents_list(app: tauri::AppHandle, cache: tauri::State<'_, AgentCache>) -> Result<Vec<AgentInfo>, String> {
        let s = load(&app)?;
        let had_cache = cache.snapshot().is_some();
        let snap = cache.get_or_scan(&s);
        if had_cache {
            let c = cache.inner().clone();
            let s2 = s.clone();
            std::thread::spawn(move || c.refresh(&s2));
        }
        let (dirs, ext) = (search_dirs(), pathext());
        // 카탈로그는 캐시, 내 에이전트(카탈로그 아닌 것)는 지금 찾는다
        let find = |id: &str, cmd: &str| match find_def(id) {
            Some(_) => snap.get(id).cloned().flatten(),
            None => resolve(cmd, Some(Path::new(cmd)), &dirs, &ext),
        };
        Ok(list_agents(&find, &customs(&app)))
    }

    /// Default shell 칸 안내(S-373): 지금 Shell 콘솔이 쓰는 셸
    #[tauri::command]
    pub fn current_shell(app: tauri::AppHandle) -> Result<String, String> {
        let s = load(&app)?;
        let dirs = search_dirs();
        Ok(find_shell(s.get("defaultShell").and_then(|v| v.as_str()), &|n| which(n, &dirs), std::env::var("COMSPEC").ok().as_deref()).0)
    }

    #[tauri::command]
    pub fn agent_spawn_spec(app: tauri::AppHandle, agent_id: String, resume: Option<Resume>, no_yolo: Option<bool>) -> Result<Spec, String> {
        let s = load(&app)?;
        let (dirs, ext) = (search_dirs(), pathext());
        let yolo = effective_yolo(s.get("yolo").and_then(|v| v.as_bool()).unwrap_or(false), no_yolo); // 숨은 세션은 no_yolo
        let find = |id: &str, cmd: &str| match find_def(id) {
            Some(d) => find_agent(d, &s, &dirs),
            None => resolve(cmd, Some(Path::new(cmd)), &dirs, &ext),
        };
        let shell = find_shell(
            s.get("defaultShell").and_then(|v| v.as_str()),
            &|n| which(n, &dirs),
            std::env::var("COMSPEC").ok().as_deref(),
        );
        let ps = if which("pwsh.exe", &dirs).is_some() { "pwsh" } else { "powershell" };
        make_spec(&agent_id, &customs(&app), resume.as_ref(), yolo, &find, shell, ps)
    }

    #[tauri::command]
    pub fn default_agent(app: tauri::AppHandle, cache: tauri::State<'_, AgentCache>) -> Result<String, String> {
        let s = load(&app)?;
        let snap = cache.get_or_scan(&s);
        let setting = s.get("defaultAgent").and_then(|v| v.as_str());
        Ok(super::default_agent(setting, &|id| snap.get(id).is_some_and(|p| p.is_some())))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn def(id: &str) -> &'static AgentDef {
        catalog().iter().find(|d| d.id == id).unwrap_or_else(|| panic!("카탈로그에 {id} 없음"))
    }
    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }
    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-a3-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }
    fn ext() -> Vec<String> {
        s(&[".COM", ".EXE", ".BAT", ".CMD"])
    }
    fn no_shell() -> (String, Vec<String>) {
        ("pwsh.exe".into(), s(&["-NoLogo"]))
    }

    // ---- catalog ----
    #[test]
    fn catalog_counts_and_builtin_order() {
        let all = catalog();
        assert_eq!(all.iter().filter(|d| d.id != "shell").count(), 34);
        assert!(all.iter().any(|d| d.id == "shell"));
        let builtin: Vec<_> = all.iter().filter(|d| d.builtin).map(|d| d.id).collect();
        assert_eq!(builtin, ["claude", "codex", "gemini", "grok", "opencode", "shell"]);
        // 내장이 맨 앞, 나머지는 이름 알파벳순
        assert!(all.iter().take(6).all(|d| d.builtin));
        let rest: Vec<String> = all.iter().skip(6).map(|d| d.name.to_lowercase()).collect();
        let mut sorted = rest.clone();
        sorted.sort();
        assert_eq!(rest, sorted);
        // id 중복 없음
        let mut ids: Vec<_> = all.iter().map(|d| d.id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 35);
    }

    #[test]
    fn catalog_flags() {
        assert_eq!(def("claude").yolo_args, ["--dangerously-skip-permissions"]);
        assert_eq!(def("codex").yolo_args, ["--dangerously-bypass-approvals-and-sandbox"]);
        assert_eq!(def("grok").yolo_args, ["--permission-mode", "bypassPermissions"]);
        assert!(def("opencode").yolo_args.is_empty());
        assert_eq!(def("goose").yolo_env, [("GOOSE_MODE", "auto")]);
        assert!(def("goose").yolo_args.is_empty());
        assert_eq!(def("kiro").command, "kiro-cli chat");
        assert_eq!(def("command-code").command, "command-code --trust");
        assert_eq!(def("claude").resume, ResumeKind::Own);
        assert_eq!(def("gemini").resume, ResumeKind::Latest);
        assert_eq!(def("grok").resume, ResumeKind::None);
    }

    // ---- resolve ----
    #[test]
    fn resolve_order_pathext_and_custom() {
        let a = tmp("res-a");
        let b = tmp("res-b");
        std::fs::write(a.join("foo.cmd"), "").unwrap();
        std::fs::write(b.join("foo.exe"), "").unwrap();
        std::fs::write(a.join("bar.exe"), "").unwrap();
        std::fs::write(a.join("baz.ps1"), "").unwrap();
        // 폴더 순서가 먼저: a의 foo.cmd가 b의 foo.exe보다 앞
        let dirs = vec![a.clone(), b.clone()];
        assert_eq!(resolve("foo", None, &dirs, &ext()), Some(a.join("foo.cmd")));
        assert_eq!(resolve("foo", None, &[b.clone(), a.clone()], &ext()), Some(b.join("foo.exe")));
        assert_eq!(resolve("bar", None, &dirs, &ext()), Some(a.join("bar.exe")));
        // .ps1은 PATHEXT에 없어도 마지막으로 찾는다
        assert_eq!(resolve("baz", None, &dirs, &ext()), Some(a.join("baz.ps1")));
        assert_eq!(resolve("nope", None, &dirs, &ext()), None);
        // 같은 폴더에 .exe와 .ps1이 있으면 PATHEXT 순서가 앞
        std::fs::write(a.join("both.ps1"), "").unwrap();
        std::fs::write(a.join("both.exe"), "").unwrap();
        assert_eq!(resolve("both", None, &dirs, &ext()), Some(a.join("both.exe")));
        // 설정 경로가 우선, 없는 파일이면 무시하고 PATH로
        let custom = b.join("foo.exe");
        assert_eq!(resolve("foo", Some(&custom), &dirs, &ext()), Some(custom.clone()));
        assert_eq!(resolve("foo", Some(&b.join("없음.exe")), &dirs, &ext()), Some(a.join("foo.cmd")));
        let _ = std::fs::remove_dir_all(&a);
        let _ = std::fs::remove_dir_all(&b);
    }

    #[test]
    fn resolve_wrap_cmd_ps1_exe() {
        let (p, a) = wrap(Path::new("C:\\n\\claude.cmd"), s(&["--resume", "x"]), "pwsh");
        assert_eq!(p, "cmd.exe");
        assert_eq!(a, s(&["/d", "/c", "call", "C:\\n\\claude.cmd", "--resume", "x"]));
        let (p, a) = wrap(Path::new("C:\\n\\a.BAT"), vec![], "pwsh");
        assert_eq!((p.as_str(), a), ("cmd.exe", s(&["/d", "/c", "call", "C:\\n\\a.BAT"])));
        let (p, a) = wrap(Path::new("C:\\n\\x.ps1"), s(&["-a"]), "powershell");
        assert_eq!(p, "powershell");
        assert_eq!(a, s(&["-NoLogo", "-File", "C:\\n\\x.ps1", "-a"]));
        let (p, a) = wrap(Path::new("C:\\n\\y.exe"), s(&["-b"]), "pwsh");
        assert_eq!((p.as_str(), a), ("C:\\n\\y.exe", s(&["-b"])));
    }

    // ---- default agent ----
    #[test]
    fn default_agent_rules() {
        // 아무것도 없으면 claude
        assert_eq!(default_agent(None, &|_| false), "claude");
        // 설정이 있으면 그것(설치 여부 무관)
        assert_eq!(default_agent(Some("aider"), &|_| false), "aider");
        // 내장 우선 (codex·aider 둘 다 있으면 codex)
        assert_eq!(default_agent(None, &|id| id == "aider" || id == "codex"), "codex");
        // 나머지는 알파벳순 (Aider < Amp)
        assert_eq!(default_agent(None, &|id| id == "amp" || id == "aider"), "aider");
        // Shell은 기본 에이전트 후보가 아니다
        assert_eq!(default_agent(None, &|id| id == "shell"), "claude");
    }

    // ---- spawn spec ----
    #[test]
    fn spawn_spec_new_session_id() {
        // S-237: 새 Claude 시작은 --session-id, 다른 에이전트는 인자 없음
        let exe = Path::new(r"C:\bin\claude.exe");
        let n = Resume { kind: Some("new".into()), session_id: Some("u1".into()) };
        let sp = build_spec(def("claude"), Some(&n), false, Some(exe), no_shell(), "pwsh");
        assert_eq!(sp.args, s(&["--session-id", "u1"]));
        let sp = build_spec(def("codex"), Some(&n), false, Some(exe), no_shell(), "pwsh");
        assert!(sp.args.is_empty());
    }
    #[test]
    fn spawn_spec_resume_and_yolo_order() {
        let exe = Path::new("C:\\bin\\claude.exe");
        let r = Resume { kind: Some("own".into()), session_id: Some("abc".into()) };
        let sp = build_spec(def("claude"), Some(&r), true, Some(exe), no_shell(), "pwsh");
        assert_eq!(sp.program, "C:\\bin\\claude.exe");
        assert_eq!(sp.args, s(&["--resume", "abc", "--dangerously-skip-permissions"]));
        assert!(sp.yolo && !sp.not_found && !sp.shell_fallback);
        // Yolo 꺼짐 → 플래그 없음
        let sp = build_spec(def("claude"), Some(&r), false, Some(exe), no_shell(), "pwsh");
        assert_eq!(sp.args, s(&["--resume", "abc"]));
        assert!(!sp.yolo);
        // codex: 하위 명령 resume
        let sp = build_spec(def("codex"), Some(&r), false, Some(exe), no_shell(), "pwsh");
        assert_eq!(sp.args, s(&["resume", "abc"]));
        // gemini latest, opencode continue
        let l = Resume { kind: Some("latest".into()), session_id: None };
        let sp = build_spec(def("gemini"), Some(&l), true, Some(exe), no_shell(), "pwsh");
        assert_eq!(sp.args, s(&["--resume", "latest", "--yolo"]));
        let sp = build_spec(def("opencode"), Some(&l), true, Some(exe), no_shell(), "pwsh");
        assert_eq!(sp.args, s(&["--continue"]));
        assert!(!sp.yolo, "Yolo 플래그가 없는 에이전트는 yolo=false");
        // 이어가기 없음(none)·grok은 resume 인자 없음
        let n = Resume { kind: Some("none".into()), session_id: None };
        let sp = build_spec(def("grok"), Some(&n), false, Some(exe), no_shell(), "pwsh");
        assert!(sp.args.is_empty());
        // own인데 세션 id가 없으면 인자 없음
        let own = Resume { kind: Some("own".into()), session_id: None };
        assert!(build_spec(def("claude"), Some(&own), false, Some(exe), no_shell(), "pwsh").args.is_empty());
    }

    // FX1 S-1978·S-2026: 숨은 세션(no_yolo)은 설정 yolo 가 켜져 있어도 Yolo 인자·env 가 없다
    #[test]
    fn hidden_session_gets_no_yolo() {
        let exe = Path::new("C:\\bin\\x.exe");
        assert!(!effective_yolo(true, Some(true)));
        assert!(effective_yolo(true, None) && effective_yolo(true, Some(false)));
        assert!(!effective_yolo(false, Some(false)));
        let n = Resume { kind: Some("new".into()), session_id: Some("u1".into()) };
        let y = effective_yolo(true, Some(true));
        let sp = build_spec(def("claude"), Some(&n), y, Some(exe), no_shell(), "pwsh");
        assert_eq!(sp.args, s(&["--session-id", "u1"]));
        assert!(!sp.args.contains(&"--dangerously-skip-permissions".to_string()) && !sp.yolo);
        let sp = build_spec(def("goose"), None, y, Some(exe), no_shell(), "pwsh");
        assert!(sp.env.is_empty() && sp.args.is_empty() && !sp.yolo);
        // 콘솔(no_yolo 없음)은 그대로 Yolo
        let sp = build_spec(def("claude"), None, effective_yolo(true, None), Some(exe), no_shell(), "pwsh");
        assert!(sp.yolo && sp.args.contains(&"--dangerously-skip-permissions".to_string()));
    }

    #[test]
    fn spawn_spec_command_code_kiro_goose() {
        let exe = Path::new("C:\\bin\\x.exe");
        let sp = build_spec(def("command-code"), None, false, Some(exe), no_shell(), "pwsh");
        assert_eq!(sp.args, s(&["--trust"]), "Yolo 꺼도 --trust");
        let sp = build_spec(def("command-code"), None, true, Some(exe), no_shell(), "pwsh");
        assert_eq!(sp.args, s(&["--trust", "--yolo"]));
        let sp = build_spec(def("kiro"), None, true, Some(exe), no_shell(), "pwsh");
        assert_eq!(sp.args, s(&["chat", "--tui", "--trust-all-tools"]));
        let sp = build_spec(def("goose"), None, true, Some(exe), no_shell(), "pwsh");
        assert!(sp.args.is_empty());
        assert_eq!(sp.env, vec![("GOOSE_MODE".to_string(), "auto".to_string())]);
        assert!(sp.yolo);
        let sp = build_spec(def("goose"), None, false, Some(exe), no_shell(), "pwsh");
        assert!(sp.env.is_empty());
    }

    #[test]
    fn spawn_spec_wraps_cmd_and_falls_back_to_shell() {
        let sp = build_spec(def("claude"), None, true, Some(Path::new("C:\\n\\claude.cmd")), no_shell(), "pwsh");
        assert_eq!(sp.program, "cmd.exe");
        assert_eq!(sp.args[..4], s(&["/d", "/c", "call", "C:\\n\\claude.cmd"]));
        assert_eq!(sp.args[4], "--dangerously-skip-permissions");
        // 못 찾음 → 셸 + notFound, yolo 없음
        let sp = build_spec(def("claude"), None, true, None, no_shell(), "pwsh");
        assert_eq!((sp.program.as_str(), sp.args.clone()), ("pwsh.exe", s(&["-NoLogo"])));
        assert!(sp.not_found && sp.shell_fallback && !sp.yolo && sp.env.is_empty());
        // Shell 에이전트는 못 찾음이 아니다
        let sp = build_spec(def("shell"), None, true, None, no_shell(), "pwsh");
        assert_eq!(sp.program, "pwsh.exe");
        assert!(!sp.not_found && !sp.shell_fallback && !sp.yolo);
    }

    #[test]
    fn spawn_spec_shell_choice() {
        let has = |names: &'static [&'static str]| {
            move |n: &str| names.contains(&n).then(|| PathBuf::from(format!("C:\\sh\\{n}")))
        };
        // pwsh 있음
        let (p, a) = find_shell(None, &has(&["pwsh.exe", "powershell.exe"]), Some("C:\\Windows\\cmd.exe"));
        assert_eq!((p.as_str(), a), ("C:\\sh\\pwsh.exe", s(&["-NoLogo"])));
        // pwsh 없음 → powershell
        let (p, a) = find_shell(None, &has(&["powershell.exe"]), Some("C:\\Windows\\cmd.exe"));
        assert_eq!((p.as_str(), a), ("C:\\sh\\powershell.exe", s(&["-NoLogo"])));
        // 둘 다 없음 → COMSPEC, -NoLogo 없음
        let (p, a) = find_shell(None, &has(&[]), Some("C:\\Windows\\cmd.exe"));
        assert_eq!((p.as_str(), a), ("C:\\Windows\\cmd.exe", Vec::<String>::new()));
        // COMSPEC도 없으면 cmd.exe
        assert_eq!(find_shell(None, &has(&[]), None).0, "cmd.exe");
        // defaultShell이 먼저
        let (p, a) = find_shell(Some("C:\\git\\bash.exe"), &has(&["pwsh.exe"]), None);
        assert_eq!((p.as_str(), a), ("C:\\git\\bash.exe", Vec::<String>::new()));
        let (p, a) = find_shell(Some("C:\\x\\pwsh.exe"), &has(&[]), None);
        assert_eq!((p.as_str(), a), ("C:\\x\\pwsh.exe", s(&["-NoLogo"])));
    }

    // ---- B5 내 에이전트 (S-376~S-380) ----
    use crate::custom_agents::CustomAgent;
    fn ca(id: &str, name: &str, command: &str) -> CustomAgent {
        CustomAgent { id: id.into(), name: name.into(), command: command.into() }
    }
    /// claude 와 mytool 만 설치된 것으로 본다
    fn finder(id: &str, cmd: &str) -> Option<PathBuf> {
        match (id, cmd) {
            ("claude", _) => Some(PathBuf::from(r"C:\bin\claude.exe")),
            (_, "mytool") => Some(PathBuf::from(r"C:\bin\mytool.exe")),
            _ => None,
        }
    }

    #[test]
    fn custom_agent_listed_in_yours_section() {
        let customs = [ca("custom:1", "Mine", "mytool --x"), ca("aider", "Aider", "aider")];
        let list = list_agents(&finder, &customs);
        let mine = list.iter().find(|a| a.id == "custom:1").expect("내 에이전트가 목록에 있다");
        assert_eq!((mine.section, mine.builtin, mine.command.as_str(), mine.installed), ("yours", false, "mytool --x", true));
        // 카탈로그 에이전트(S-378)는 yours 에 한 번만
        assert_eq!(list.iter().filter(|a| a.id == "aider").count(), 1);
        assert_eq!(list.iter().find(|a| a.id == "aider").unwrap().section, "yours");
        // 내장은 이름이 같아도 yours 로 안 간다
        let with_builtin = list_agents(&finder, &[ca("claude", "Claude", "claude")]);
        assert_eq!(with_builtin.iter().find(|a| a.id == "claude").unwrap().section, "detected");
        // 구역 순서: detected → yours → notInstalled, 전체 개수 = 35 + 내 에이전트 1
        let rank = |s: &str| ["detected", "yours", "notInstalled"].iter().position(|x| *x == s).unwrap();
        let ranks: Vec<_> = list.iter().map(|a| rank(a.section)).collect();
        assert!(ranks.windows(2).all(|w| w[0] <= w[1]), "구역 순서 {ranks:?}");
        assert_eq!(list.len(), 36);
        // 내 에이전트가 없으면 구역이 비어 있다(S-168)
        assert!(list_agents(&finder, &[]).iter().all(|a| a.section != "yours"));
    }

    #[test]
    fn custom_agent_spawn_splits_args_on_spaces() {
        let customs = [ca("custom:1", "Mine", "mytool --a  \"b c\" d")];
        let sp = make_spec("custom:1", &customs, None, true, &finder, no_shell(), "pwsh").unwrap();
        assert_eq!(sp.program, r"C:\bin\mytool.exe");
        assert_eq!(sp.args, s(&["--a", "\"b", "c\"", "d"])); // 공백으로만 나눈다. 따옴표는 해석 안 함
        assert!(!sp.yolo && sp.env.is_empty() && !sp.not_found); // 직접 만든 것은 Yolo 없음(S-379)
        // 못 찾으면 셸 폴백 + 못 찾음
        let sp = make_spec("custom:1", &[ca("custom:1", "Mine", "nothere -q")], None, false, &finder, no_shell(), "pwsh").unwrap();
        assert!(sp.not_found && sp.shell_fallback);
        // 카탈로그 에이전트는 기존 규칙 그대로(Yolo 플래그)
        let sp = make_spec("claude", &[], None, true, &finder, no_shell(), "pwsh").unwrap();
        assert!(sp.yolo && sp.args.contains(&"--dangerously-skip-permissions".to_string()));
    }

    #[test]
    fn deleted_custom_agent_falls_back_to_shell() {
        let sp = make_spec("custom:gone", &[ca("custom:1", "Mine", "mytool")], None, true, &finder, no_shell(), "pwsh").unwrap();
        assert_eq!((sp.program.as_str(), sp.args), ("pwsh.exe", s(&["-NoLogo"])));
        assert!(!sp.not_found && !sp.shell_fallback && !sp.yolo);
        // 카탈로그에도 내 목록에도 없는 그냥 id 는 오류
        assert!(make_spec("nope", &[], None, false, &finder, no_shell(), "pwsh").is_err());
    }
}
