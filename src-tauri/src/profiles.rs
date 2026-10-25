// D3 계정 프로필 폴더 (S-1610~S-1614, S-1616). 폴더는 인자로 받는다(시험은 임시 폴더, 앱은 %APPDATA%/com.symvibe.win/Profiles).
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub agent: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Default)]
struct Index {
    profiles: Vec<Profile>,
}

fn index_path(root: &Path) -> std::path::PathBuf {
    root.join("profiles.json")
}

pub fn profile_list_in(root: &Path) -> Vec<Profile> {
    std::fs::read_to_string(index_path(root)).ok().and_then(|t| serde_json::from_str::<Index>(&t).ok()).unwrap_or_default().profiles
}

fn store(root: &Path, list: Vec<Profile>) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let (p, tmp) = (index_path(root), root.join("profiles.json.tmp"));
    std::fs::write(&tmp, serde_json::to_string_pretty(&Index { profiles: list }).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, p).map_err(|e| e.to_string())
}

fn check_agent(agent: &str) -> Result<(), String> {
    if agent == "claude" || agent == "codex" { Ok(()) } else { Err("agent must be claude or codex".into()) }
}

fn slug(name: &str) -> String {
    let s: String = name.to_lowercase().chars().map(|c| if c.is_alphanumeric() { c } else { '-' }).collect();
    let s = s.split('-').filter(|x| !x.is_empty()).collect::<Vec<_>>().join("-");
    if s.is_empty() { "account".into() } else { s }
}

/// FX1 d3: Windows 예약 장치 이름(con, nul, aux, prn, com1~9, lpt1~9)
fn reserved(id: &str) -> bool {
    let id = id.to_lowercase();
    matches!(id.as_str(), "con" | "nul" | "aux" | "prn")
        || ((id.starts_with("com") || id.starts_with("lpt")) && id.len() == 4 && matches!(id.as_bytes()[3], b'1'..=b'9'))
}

/// 앞뒤 공백 제거, 1~40자, 같은 agent 에 같은 이름 거절(skip 은 이름을 바꾸는 자기 자신)
fn valid_name(list: &[Profile], agent: &str, name: &str, skip: Option<&str>) -> Result<String, String> {
    let name = name.trim().to_string();
    if name.chars().count() > 40 {
        return Err("name must be 1-40 characters".into());
    }
    if list.iter().any(|p| p.agent == agent && Some(p.id.as_str()) != skip && p.name == name) {
        return Err("a profile with this name already exists".into());
    }
    Ok(name)
}

pub fn profile_create_in(root: &Path, agent: &str, name: &str, now: &str) -> Result<Profile, String> {
    check_agent(agent)?;
    let mut list = profile_list_in(root);
    let mut name = name.trim().to_string();
    if name.is_empty() {
        let mut n = list.iter().filter(|p| p.agent == agent).count() + 1;
        while list.iter().any(|p| p.agent == agent && p.name == format!("Account {n}")) {
            n += 1;
        }
        name = format!("Account {n}");
    }
    let name = valid_name(&list, agent, &name, None)?;
    let base = slug(&name);
    let base = if reserved(&base) { format!("account-{base}") } else { base };
    let (mut id, mut n) = (base.clone(), 1);
    while list.iter().any(|p| p.agent == agent && p.id == id) || root.join(agent).join(&id).exists() {
        n += 1;
        id = format!("{base}-{n}");
    }
    let dir = root.join(agent).join(&id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?; // 빈 폴더만
    if !dir.is_dir() {
        return Err("could not create profile folder".into()); // 성공한 척하고 폴더가 없는 경우: 목록에 넣지 않는다
    }
    let p = Profile { id, agent: agent.into(), name, created_at: now.into() };
    list.push(p.clone());
    store(root, list)?;
    Ok(p)
}

fn find(root: &Path, agent: &str, id: &str) -> Result<Profile, String> {
    check_agent(agent)?;
    profile_list_in(root).into_iter().find(|p| p.agent == agent && p.id == id).ok_or_else(|| "no such profile".into())
}

pub fn profile_env_in(root: &Path, agent: &str, id: &str) -> Result<(String, String), String> {
    find(root, agent, id)?;
    let dir = root.join(agent).join(id);
    if !dir.is_dir() {
        return Err("profile folder is missing".into());
    }
    let key = if agent == "claude" { "CLAUDE_CONFIG_DIR" } else { "CODEX_HOME" };
    Ok((key.into(), dir.to_string_lossy().into_owned()))
}

fn login_files(agent: &str) -> &'static [&'static str] {
    if agent == "claude" { &[".credentials.json", ".claude.json"] } else { &["auth.json"] }
}

/// 로그인 파일은 영구 삭제, 나머지 폴더는 trash 로. trash 가 실패하면 목록은 그대로
pub fn profile_remove_in(root: &Path, agent: &str, id: &str, trash: &dyn Fn(&Path) -> Result<(), String>) -> Result<(), String> {
    find(root, agent, id)?;
    let dir = root.join(agent).join(id);
    for f in login_files(agent) {
        let _ = std::fs::remove_file(dir.join(f));
    }
    if dir.exists() {
        trash(&dir)?;
    }
    store(root, profile_list_in(root).into_iter().filter(|p| !(p.agent == agent && p.id == id)).collect())
}

/// 로그인 파일이 있는지만(내용은 읽지 않는다)
pub fn profile_status_in(root: &Path, agent: &str, id: &str) -> bool {
    find(root, agent, id).is_ok() && login_files(agent).iter().any(|f| root.join(agent).join(id).join(f).is_file())
}

pub fn profile_rename_in(root: &Path, agent: &str, id: &str, name: &str) -> Result<Profile, String> {
    find(root, agent, id)?;
    let mut list = profile_list_in(root);
    let name = valid_name(&list, agent, name, Some(id))?;
    if name.is_empty() {
        return Err("name must be 1-40 characters".into());
    }
    let p = list.iter_mut().find(|p| p.agent == agent && p.id == id).ok_or("no such profile")?;
    p.name = name;
    let out = p.clone();
    store(root, list)?;
    Ok(out)
}

pub fn root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("Profiles"))
}

#[tauri::command]
pub fn profile_list(app: tauri::AppHandle) -> Result<Vec<Profile>, String> {
    Ok(profile_list_in(&root(&app)?))
}
#[tauri::command]
pub fn profile_create(app: tauri::AppHandle, agent: String, name: String) -> Result<Profile, String> {
    profile_create_in(&root(&app)?, &agent, &name, &crate::boards::now_stamp())
}
#[tauri::command]
pub fn profile_env(app: tauri::AppHandle, agent: String, id: String) -> Result<(String, String), String> {
    profile_env_in(&root(&app)?, &agent, &id)
}
#[tauri::command]
pub fn profile_remove(app: tauri::AppHandle, agent: String, id: String) -> Result<(), String> {
    profile_remove_in(&root(&app)?, &agent, &id, &|p| crate::fs::trash_move(p.to_string_lossy().into_owned()))
}
#[tauri::command]
pub fn profile_status(app: tauri::AppHandle, agent: String, id: String) -> Result<bool, String> {
    Ok(profile_status_in(&root(&app)?, &agent, &id))
}
#[tauri::command]
pub fn profile_rename(app: tauri::AppHandle, agent: String, id: String, name: String) -> Result<Profile, String> {
    profile_rename_in(&root(&app)?, &agent, &id, &name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::fs;
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-d3-prof-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    // S-1610·S-1611
    #[test]
    fn create_makes_empty_folder_and_list() {
        let r = tmp("create");
        assert!(profile_list_in(&r).is_empty());
        let p = profile_create_in(&r, "claude", "  Work Account  ", "2026-10-24T00:00:00Z").unwrap();
        assert_eq!((p.id.as_str(), p.name.as_str(), p.agent.as_str()), ("work-account", "Work Account", "claude"));
        let dir = r.join("claude").join("work-account");
        assert!(dir.is_dir());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0); // 파일을 만들지 않는다
        assert_eq!(profile_list_in(&r), vec![p]);
        let v: serde_json::Value = serde_json::from_str(&fs::read_to_string(r.join("profiles.json")).unwrap()).unwrap();
        assert_eq!(v["profiles"][0]["createdAt"], "2026-10-24T00:00:00Z");
    }

    // FX1 S-1610·S-1611 (d3): 예약 이름이면 id 에 account- 접두사, 폴더가 실제로 생긴다
    #[test]
    fn reserved_names_get_prefix_and_real_folder() {
        let r = tmp("reserved");
        for (name, id) in [("con", "account-con"), ("nul", "account-nul"), ("COM1", "account-com1"), ("Lpt9", "account-lpt9"), ("aux", "account-aux"), ("prn", "account-prn")] {
            let p = profile_create_in(&r, "claude", name, "t").unwrap();
            assert_eq!(p.id, id, "{name}");
            assert!(r.join("claude").join(id).is_dir(), "{name} 폴더");
            assert!(profile_env_in(&r, "claude", id).is_ok());
        }
        // 예약 이름이 아닌 비슷한 이름은 그대로
        assert_eq!(profile_create_in(&r, "claude", "console", "t").unwrap().id, "console");
        assert_eq!(profile_create_in(&r, "claude", "com10", "t").unwrap().id, "com10");
    }

    // S-1611: 이름 규칙·중복·agent
    #[test]
    fn name_rules() {
        let r = tmp("names");
        assert!(profile_create_in(&r, "gemini", "x", "t").is_err());
        assert!(profile_create_in(&r, "claude", &"a".repeat(41), "t").is_err());
        profile_create_in(&r, "claude", "Work", "t").unwrap();
        assert!(profile_create_in(&r, "claude", "Work", "t").is_err()); // 같은 agent 같은 이름
        let c = profile_create_in(&r, "codex", "Work", "t").unwrap(); // 다른 agent 는 허용
        assert_eq!(c.id, "work");
        // 비면 Account N
        let a = profile_create_in(&r, "claude", "   ", "t").unwrap();
        assert_eq!(a.name, "Account 2");
        // id 가 겹치면 숫자: "Work!" -> work -> work-2
        let w2 = profile_create_in(&r, "claude", "Work!", "t").unwrap();
        assert_eq!(w2.id, "work-2");
        assert!(r.join("claude").join("work-2").is_dir());
    }

    // S-1612
    #[test]
    fn env_pair() {
        let r = tmp("env");
        let c = profile_create_in(&r, "claude", "A", "t").unwrap();
        let x = profile_create_in(&r, "codex", "B", "t").unwrap();
        let (k, v) = profile_env_in(&r, "claude", &c.id).unwrap();
        assert_eq!(k, "CLAUDE_CONFIG_DIR");
        assert_eq!(PathBuf::from(&v), r.join("claude").join("a"));
        assert_eq!(profile_env_in(&r, "codex", &x.id).unwrap().0, "CODEX_HOME");
        fs::remove_dir_all(r.join("claude").join("a")).unwrap();
        assert!(profile_env_in(&r, "claude", "a").is_err()); // 폴더 없음
        assert!(profile_env_in(&r, "claude", "nope").is_err());
    }

    // S-1613
    #[test]
    fn remove_deletes_login_files_then_trashes_rest() {
        let r = tmp("rm");
        let p = profile_create_in(&r, "claude", "A", "t").unwrap();
        let dir = r.join("claude").join(&p.id);
        fs::write(dir.join(".credentials.json"), "secret").unwrap();
        fs::write(dir.join(".claude.json"), "secret").unwrap();
        fs::write(dir.join("history.txt"), "keep").unwrap();
        let other = profile_create_in(&r, "claude", "B", "t").unwrap();
        let seen: RefCell<Vec<(PathBuf, bool, bool)>> = RefCell::new(vec![]);
        let trash = |q: &Path| -> Result<(), String> {
            seen.borrow_mut().push((q.to_path_buf(), q.join(".credentials.json").exists() || q.join(".claude.json").exists(), q.join("history.txt").exists()));
            Ok(())
        };
        profile_remove_in(&r, "claude", &p.id, &trash).unwrap();
        // 휴지통 함수는 그 폴더 하나만, 로그인 파일은 이미 사라졌고 나머지는 남은 채로 불린다
        assert_eq!(*seen.borrow(), vec![(dir.clone(), false, true)]);
        assert_eq!(profile_list_in(&r).iter().map(|x| x.id.clone()).collect::<Vec<_>>(), vec![other.id]);
        // 휴지통이 실패하면 목록에서 빼지 않는다
        let p2 = profile_create_in(&r, "codex", "C", "t").unwrap();
        fs::write(r.join("codex").join(&p2.id).join("auth.json"), "s").unwrap();
        assert!(profile_remove_in(&r, "codex", &p2.id, &|_| Err("no".into())).is_err());
        assert_eq!(profile_list_in(&r).len(), 2);
        assert!(profile_remove_in(&r, "codex", "ghost", &|_| Ok(())).is_err());
    }

    // S-1614: 파일이 있는지만
    #[test]
    fn status_is_file_presence_only() {
        let r = tmp("st");
        let p = profile_create_in(&r, "codex", "A", "t").unwrap();
        assert!(!profile_status_in(&r, "codex", &p.id));
        fs::write(r.join("codex").join(&p.id).join("auth.json"), "").unwrap(); // 빈 파일이어도 "있음"(내용을 읽지 않는다)
        assert!(profile_status_in(&r, "codex", &p.id));
        let c = profile_create_in(&r, "claude", "A", "t").unwrap();
        fs::write(r.join("claude").join(&c.id).join(".claude.json"), "x").unwrap();
        assert!(profile_status_in(&r, "claude", &c.id));
        assert!(!profile_status_in(&r, "claude", "ghost"));
    }

    #[test]
    fn rename_checks_rules_keeps_folder() {
        let r = tmp("ren");
        let a = profile_create_in(&r, "claude", "A", "t").unwrap();
        profile_create_in(&r, "claude", "B", "t").unwrap();
        assert!(profile_rename_in(&r, "claude", &a.id, "B").is_err());
        assert!(profile_rename_in(&r, "claude", &a.id, &"z".repeat(41)).is_err());
        let n = profile_rename_in(&r, "claude", &a.id, "  Main ").unwrap();
        assert_eq!((n.id.as_str(), n.name.as_str()), ("a", "Main")); // 폴더 이름(id)은 그대로
        assert_eq!(profile_list_in(&r).iter().find(|x| x.id == "a").unwrap().name, "Main");
        assert!(profile_rename_in(&r, "claude", "ghost", "X").is_err());
    }
}
