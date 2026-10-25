// D3 Memory 저장 (S-1350~S-1354). 폴더는 인자로 받는다(시험은 임시 폴더, 앱은 %APPDATA%/com.symvibe.win/Memory).
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Fact {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub scope: String,
    pub at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refreshed_at: Option<String>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Loaded {
    pub repo: Vec<Fact>,
    pub all: Vec<Fact>,
    /// 알 수 없는 version 파일이 있어 저장하지 않는다
    pub read_only: bool,
}

/// S-1350: repo 경로(소문자·`/` 통일) FNV-1a 64비트 16자리 hex
pub fn key(repo: &str) -> String {
    let norm = repo.replace('\\', "/").to_lowercase();
    let norm = if norm.len() > 1 { norm.trim_end_matches('/') } else { &norm };
    format!("{:016x}", norm.bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ u64::from(b)).wrapping_mul(0x100000001b3)))
}

const KINDS: [&str; 6] = ["Architecture", "Structure", "Commands", "Conventions", "Gotchas", "Context"];
const MAX_FACTS: usize = 200;

#[derive(Serialize, Deserialize)]
struct MemFile {
    version: u32,
    repo: String,
    facts: Vec<Fact>,
}

fn path_of(dir: &Path, repo: &str, scope: &str) -> std::path::PathBuf {
    if scope == "all" { dir.join("_all.json") } else { dir.join(format!("{}.json", key(repo))) }
}

/// (사실, 읽기 전용). 깨진 파일은 `.bad` 로 옮기고 빈 목록
fn read_file(path: &Path) -> (Vec<Fact>, bool) {
    let Ok(text) = std::fs::read_to_string(path) else { return (Vec::new(), false) };
    match serde_json::from_str::<MemFile>(&text) {
        Ok(f) if f.version == 1 => (f.facts, false),
        Ok(_) => (Vec::new(), true), // 모르는 version: 읽기 전용, 파일은 그대로
        Err(_) => {
            let mut bad = path.as_os_str().to_owned();
            bad.push(".bad");
            let bad = std::path::PathBuf::from(bad);
            let _ = std::fs::remove_file(&bad); // 이미 있으면 바꿔치기가 막히므로 먼저 치운다
            let _ = std::fs::rename(path, bad);
            (Vec::new(), false)
        }
    }
}

pub fn memory_load_in(dir: &Path, repo: &str) -> Loaded {
    let (repo_facts, r1) = read_file(&path_of(dir, repo, "repo"));
    let (all, r2) = read_file(&path_of(dir, repo, "all"));
    Loaded { repo: repo_facts, all, read_only: r1 || r2 }
}

fn cut(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

pub fn memory_save_in(dir: &Path, repo: &str, scope: &str, mut facts: Vec<Fact>) -> Result<(), String> {
    if scope != "repo" && scope != "all" {
        return Err("scope must be repo or all".into());
    }
    if facts.len() > MAX_FACTS {
        return Err(format!("too many facts (max {MAX_FACTS})"));
    }
    if let Some(f) = facts.iter().find(|f| !KINDS.contains(&f.kind.as_str())) {
        return Err(format!("unknown kind: {}", f.kind));
    }
    for f in &mut facts {
        f.title = cut(&f.title, 80);
        f.body = cut(&f.body, 2000);
        f.scope = scope.into();
    }
    let path = path_of(dir, repo, scope);
    if read_file(&path).1 {
        return Err("memory file has an unknown version (read-only)".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let file = MemFile { version: 1, repo: if scope == "all" { String::new() } else { repo.into() }, facts };
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = std::path::PathBuf::from(tmp);
    std::fs::write(&tmp, serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

pub fn dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("Memory"))
}

#[tauri::command]
pub async fn memory_load(app: tauri::AppHandle, repo: String) -> Result<Loaded, String> {
    Ok(memory_load_in(&dir(&app)?, &repo))
}

#[tauri::command]
pub async fn memory_save(app: tauri::AppHandle, repo: String, scope: String, facts: Vec<Fact>) -> Result<(), String> {
    memory_save_in(&dir(&app)?, &repo, &scope, facts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-d3-mem-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn fact(id: &str, scope: &str) -> Fact {
        Fact { id: id.into(), kind: "Gotchas".into(), title: format!("t-{id}"), body: "b".into(), scope: scope.into(), at: "2026-10-24".into(), refreshed_at: None }
    }

    // S-1350: FNV-1a 64 16자리 hex, 대소문자·슬래시 무관
    #[test]
    fn key_ignores_case_and_slashes() {
        let k = key("C:\\Users\\Me\\Repo");
        assert_eq!(k.len(), 16);
        assert!(k.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(k, key("c:/users/me/repo"));
        assert_ne!(k, key("c:/users/me/repo2"));
        // FNV-1a 64("a") = af63dc4c8601ec8c
        assert_eq!(key("a"), "af63dc4c8601ec8c");
    }

    // S-1351
    #[test]
    fn roundtrip_and_missing() {
        let d = tmp("rt");
        let l = memory_load_in(&d, "c:/r");
        assert!(l.repo.is_empty() && l.all.is_empty() && !l.read_only); // 파일 없음 = 빈 목록
        memory_save_in(&d, "c:/r", "repo", vec![fact("1", "repo")]).unwrap();
        memory_save_in(&d, "c:/r", "all", vec![fact("2", "all")]).unwrap();
        let l = memory_load_in(&d, "C:\\R");
        assert_eq!(l.repo, vec![fact("1", "repo")]);
        assert_eq!(l.all, vec![fact("2", "all")]);
        assert!(d.join("_all.json").exists());
        assert!(d.join(format!("{}.json", key("c:/r"))).exists());
        let v: serde_json::Value = serde_json::from_str(&fs::read_to_string(d.join("_all.json")).unwrap()).unwrap();
        assert_eq!(v["version"], 1);
        assert!(!d.join("_all.json.tmp").exists());
    }

    // S-1351: 쓰기 중 실패해도 옛 파일이 남는다(임시 파일 자리를 폴더로 막는다)
    #[test]
    fn failed_write_keeps_old_file() {
        let d = tmp("atomic");
        memory_save_in(&d, "c:/r", "repo", vec![fact("1", "repo")]).unwrap();
        let p = d.join(format!("{}.json.tmp", key("c:/r")));
        fs::create_dir_all(&p).unwrap();
        assert!(memory_save_in(&d, "c:/r", "repo", vec![fact("2", "repo")]).is_err());
        assert_eq!(memory_load_in(&d, "c:/r").repo, vec![fact("1", "repo")]);
    }

    // S-1352
    #[test]
    fn broken_json_moves_to_bad() {
        let d = tmp("bad");
        let f = d.join("_all.json");
        fs::write(&f, "{ not json").unwrap();
        let l = memory_load_in(&d, "c:/r");
        assert!(l.all.is_empty() && !l.read_only);
        assert!(!f.exists());
        assert_eq!(fs::read_to_string(d.join("_all.json.bad")).unwrap(), "{ not json");
        // 두 번째 깨짐도 막히지 않는다
        fs::write(&f, "xx").unwrap();
        memory_load_in(&d, "c:/r");
        assert!(d.join("_all.json.bad").exists());
    }

    // S-1352
    #[test]
    fn unknown_version_is_read_only() {
        let d = tmp("ver");
        let f = d.join("_all.json");
        let raw = r#"{"version":9,"repo":"","facts":[]}"#;
        fs::write(&f, raw).unwrap();
        let l = memory_load_in(&d, "c:/r");
        assert!(l.read_only);
        assert!(memory_save_in(&d, "c:/r", "all", vec![fact("1", "all")]).is_err());
        assert_eq!(fs::read_to_string(&f).unwrap(), raw); // 그대로
    }

    // S-1353
    #[test]
    fn limits_and_kinds() {
        let d = tmp("lim");
        let mut f = fact("1", "repo");
        f.title = "가".repeat(100);
        f.body = "x".repeat(2500);
        memory_save_in(&d, "c:/r", "repo", vec![f]).unwrap();
        let got = &memory_load_in(&d, "c:/r").repo[0];
        assert_eq!(got.title.chars().count(), 80);
        assert_eq!(got.body.chars().count(), 2000);
        let many: Vec<Fact> = (0..201).map(|i| fact(&i.to_string(), "repo")).collect();
        assert!(memory_save_in(&d, "c:/r", "repo", many).is_err());
        let ok: Vec<Fact> = (0..200).map(|i| fact(&i.to_string(), "repo")).collect();
        assert!(memory_save_in(&d, "c:/r", "repo", ok).is_ok());
        let mut bad = fact("1", "repo");
        bad.kind = "Nope".into();
        assert!(memory_save_in(&d, "c:/r", "repo", vec![bad]).is_err());
        assert!(memory_save_in(&d, "c:/r", "world", vec![]).is_err()); // scope 는 repo·all 만
    }
}
