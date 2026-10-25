// A8 보드 저장 (S-200~S-207, S-209). 폴더는 인자로 받는다(시험은 임시 폴더, 앱은 %APPDATA%/com.symvibe.win/Boards).
// 시각 `now` 는 "YYYYMMDD-HHMMSS" 문자열로 주입한다(시 단위 스냅샷 이름 = 앞 11글자).
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct LoadResult {
    pub json: Option<String>,
    /// "main" | "prev" | "empty"
    pub source: String,
    pub archived: bool,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone, Default)]
pub struct Workspace {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone, Default)]
pub struct Repo {
    pub path: String,
    pub name: String,
    pub workspaces: Vec<Workspace>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Repos {
    pub repos: Vec<Repo>,
    pub last_repo: Option<String>,
    /// B2 S-307: repo 경로 → 마지막으로 본 워크스페이스 id. 필드가 없는 옛 파일도 읽어야 한다
    #[serde(default)] // S-307: 옛 파일에는 없어도 읽는다
    pub last_workspace: std::collections::HashMap<String, String>,
}

pub fn main_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.json"))
}
pub fn prev_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.prev.json"))
}
/// 쓰기용 임시 파일(S-203). 시험이 이 자리를 막아 "쓰기 중 실패"를 흉내 낸다.
pub fn tmp_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.json.tmp"))
}
pub fn snapshot_dir(dir: &Path, id: &str) -> PathBuf {
    dir.join("Snapshots").join(id)
}
pub fn archive_dir(dir: &Path) -> PathBuf {
    dir.join("Archive")
}

fn node_count(json: &str) -> usize {
    serde_json::from_str::<serde_json::Value>(json)
        .ok()
        .and_then(|v| v.get("nodes").and_then(|n| n.as_array().map(|a| a.len())))
        .unwrap_or(0)
}

fn readable(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text).is_ok()
}

fn e<T: ToString>(x: T) -> String {
    x.to_string()
}

/// S-203~S-205: 임시 파일에 쓰고 → (비우기면 직전 내용 Archive) → 본 파일을 .prev 로 → 이름 바꾸기 → 시 단위 스냅샷(최신 24)
pub fn save(dir: &Path, id: &str, json: &str, now: &str) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(e)?;
    let (main, tmp) = (main_path(dir, id), tmp_path(dir, id));
    std::fs::write(&tmp, json).map_err(e)?; // 실패하면 원본은 건드리지 않았다
    if let Ok(old) = std::fs::read_to_string(&main) {
        if node_count(json) == 0 && node_count(&old) > 0 {
            std::fs::create_dir_all(archive_dir(dir)).map_err(e)?;
            std::fs::write(archive_dir(dir).join(format!("{id}-{now}.json")), &old).map_err(e)?;
        }
        std::fs::write(prev_path(dir, id), &old).map_err(e)?;
    }
    std::fs::rename(&tmp, &main).map_err(e)?;
    let snaps = snapshot_dir(dir, id);
    std::fs::create_dir_all(&snaps).map_err(e)?;
    std::fs::write(snaps.join(format!("{}.json", &now[..now.len().min(11)])), json).map_err(e)?;
    let mut names: Vec<_> = std::fs::read_dir(&snaps).map_err(e)?.filter_map(|x| x.ok()).map(|x| x.file_name()).collect();
    names.sort();
    for old in names.iter().take(names.len().saturating_sub(24)) {
        let _ = std::fs::remove_file(snaps.join(old));
    }
    Ok(())
}

/// S-207: 본 파일 → 깨졌으면 Archive 로 옮기고 .prev → 둘 다 안 되면 빈 보드
pub fn load(dir: &Path, id: &str, now: &str) -> LoadResult {
    let main = main_path(dir, id);
    let mut archived = false;
    if let Ok(t) = std::fs::read_to_string(&main) {
        if readable(&t) {
            return LoadResult { json: Some(t), source: "main".into(), archived };
        }
        let _ = std::fs::create_dir_all(archive_dir(dir));
        archived = std::fs::rename(&main, archive_dir(dir).join(format!("{id}-{now}.json"))).is_ok();
    }
    match std::fs::read_to_string(prev_path(dir, id)) {
        Ok(t) if readable(&t) => LoadResult { json: Some(t), source: "prev".into(), archived },
        _ => LoadResult { json: None, source: "empty".into(), archived },
    }
}

/// 닫힌 보드: Archive 로 복사(원본은 지우지 않는다)
pub fn archive(dir: &Path, id: &str, now: &str) -> Result<(), String> {
    let Ok(t) = std::fs::read_to_string(main_path(dir, id)) else { return Ok(()) };
    std::fs::create_dir_all(archive_dir(dir)).map_err(e)?;
    std::fs::write(archive_dir(dir).join(format!("{id}-{now}.json")), t).map_err(e)
}

pub fn repos_load(file: &Path) -> Repos {
    std::fs::read_to_string(file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

pub fn repos_store(file: &Path, r: &Repos) -> Result<(), String> {
    if let Some(d) = file.parent() {
        std::fs::create_dir_all(d).map_err(e)?;
    }
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(r).map_err(e)?).map_err(e)?;
    std::fs::rename(&tmp, file).map_err(e)
}

/// 지금 시각(UTC) "YYYYMMDD-HHMMSS". ponytail: 시간대 없이 UTC — 이름 정렬만 쓰므로 충분, 지역 시각이 필요하면 windows-sys GetLocalTime.
pub fn now_stamp() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let (days, rem) = (secs.div_euclid(86400), secs.rem_euclid(86400));
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}{m:02}{d:02}-{:02}{:02}{:02}", rem / 3600, rem % 3600 / 60, rem % 60)
}

// ---- Tauri 명령 (폴더 = %APPDATA%/com.symvibe.win/Boards) ----
fn boards_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(e)?.join("Boards"))
}

/// id 는 파일 이름이 되므로 경로 문자를 막는다
fn check_id(id: &str) -> Result<(), String> {
    if !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        Ok(())
    } else {
        Err(format!("잘못된 보드 id: {id}"))
    }
}

#[tauri::command]
pub fn board_load(app: tauri::AppHandle, id: String) -> Result<LoadResult, String> {
    check_id(&id)?;
    Ok(load(&boards_dir(&app)?, &id, &now_stamp()))
}

#[tauri::command]
pub fn board_save(app: tauri::AppHandle, id: String, json: String) -> Result<(), String> {
    check_id(&id)?;
    save(&boards_dir(&app)?, &id, &json, &now_stamp())
}

#[tauri::command]
pub fn board_archive(app: tauri::AppHandle, id: String) -> Result<(), String> {
    check_id(&id)?;
    archive(&boards_dir(&app)?, &id, &now_stamp())
}

#[tauri::command]
pub fn repos_get(app: tauri::AppHandle) -> Result<Repos, String> {
    Ok(repos_load(&boards_dir(&app)?.join("repos.json")))
}

#[tauri::command]
pub fn repos_set(app: tauri::AppHandle, repos: Repos) -> Result<(), String> {
    repos_store(&boards_dir(&app)?.join("repos.json"), &repos)
}

#[tauri::command]
pub fn dir_exists(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-a8-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    const T0: &str = "20261024-093015";
    fn names(d: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(d)
            .map(|r| r.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect())
            .unwrap_or_default();
        v.sort();
        v
    }
    fn board(n: usize) -> String {
        let nodes: Vec<String> = (0..n).map(|i| format!("{{\"id\":\"c{i}\"}}")).collect();
        format!("{{\"formatVersion\":1,\"nodes\":[{}]}}", nodes.join(","))
    }

    // S-203
    #[test]
    fn save_keeps_prev() {
        let d = tmp("prev");
        save(&d, "ws1", &board(1), T0).unwrap();
        assert_eq!(fs::read_to_string(main_path(&d, "ws1")).unwrap(), board(1), "첫 저장 → 본 파일");
        assert!(!prev_path(&d, "ws1").exists(), "첫 저장에는 이전 파일이 없다");
        save(&d, "ws1", &board(2), T0).unwrap();
        assert_eq!(fs::read_to_string(main_path(&d, "ws1")).unwrap(), board(2));
        assert_eq!(fs::read_to_string(prev_path(&d, "ws1")).unwrap(), board(1), "덮기 전 내용이 .prev.json");
        let _ = fs::remove_dir_all(&d);
    }

    // S-203: 임시 파일에 쓰다 실패 → 원본 그대로
    #[test]
    fn atomic_write_no_partial() {
        let d = tmp("atomic");
        fs::write(main_path(&d, "ws1"), board(1)).unwrap(); // 저장 구현과 무관하게 원본을 만든다
        fs::create_dir_all(tmp_path(&d, "ws1")).unwrap(); // 임시 파일 자리를 폴더로 막아 쓰기 실패
        assert!(save(&d, "ws1", &board(3), T0).is_err(), "쓰기 실패는 오류로 알린다");
        assert_eq!(fs::read_to_string(main_path(&d, "ws1")).unwrap(), board(1), "원본은 그대로");
        let _ = fs::remove_dir_all(&d);
    }

    // S-204: 시 단위 1개, 최신 24개만
    #[test]
    fn hourly_snapshot_keeps_24() {
        let d = tmp("snap");
        // 같은 시간에 두 번 → 파일 1개, 내용은 마지막
        save(&d, "ws1", &board(1), "20260101-001000").unwrap();
        save(&d, "ws1", &board(2), "20260101-005959").unwrap();
        assert_eq!(names(&snapshot_dir(&d, "ws1")), vec!["20260101-00.json"]);
        assert_eq!(fs::read_to_string(snapshot_dir(&d, "ws1").join("20260101-00.json")).unwrap(), board(2));
        // 30개 시간(2026-01-01 00시 ~ 01-02 05시)
        for h in 0..30 {
            let now = format!("202601{:02}-{:02}0000", 1 + h / 24, h % 24);
            save(&d, "ws1", &board(1), &now).unwrap();
        }
        let got = names(&snapshot_dir(&d, "ws1"));
        assert_eq!(got.len(), 24, "최신 24개만: {got:?}");
        assert_eq!(got.first().unwrap(), "20260101-06.json", "오래된 6개가 지워짐");
        assert_eq!(got.last().unwrap(), "20260102-05.json");
        let _ = fs::remove_dir_all(&d);
    }

    // S-205: 노드 있던 보드가 0개로 저장되면 직전 내용을 Archive 로. 처음부터 빈 보드는 해당 없음.
    #[test]
    fn cleared_board_archived() {
        let d = tmp("cleared");
        save(&d, "ws1", &board(0), T0).unwrap();
        save(&d, "ws1", &board(0), T0).unwrap();
        assert!(names(&archive_dir(&d)).is_empty(), "계속 비어 있던 보드는 아카이브하지 않는다");
        save(&d, "ws1", &board(2), T0).unwrap();
        save(&d, "ws1", &board(0), "20261024-101112").unwrap();
        assert_eq!(names(&archive_dir(&d)), vec!["ws1-20261024-101112.json"]);
        assert_eq!(fs::read_to_string(archive_dir(&d).join("ws1-20261024-101112.json")).unwrap(), board(2), "비우기 직전 내용");
        assert_eq!(fs::read_to_string(main_path(&d, "ws1")).unwrap(), board(0), "비운 보드도 저장은 된다");
        // 닫힌 보드(board_archive): 아카이브로 옮기고 지우지 않는다
        save(&d, "ws2", &board(1), T0).unwrap();
        archive(&d, "ws2", "20261024-120000").unwrap();
        assert_eq!(fs::read_to_string(archive_dir(&d).join("ws2-20261024-120000.json")).unwrap(), board(1));
        let _ = fs::remove_dir_all(&d);
    }

    // S-207, S-205
    #[test]
    fn unreadable_goes_to_archive_then_prev() {
        let d = tmp("unreadable");
        // 파일이 없다 → 빈 보드, 아카이브 없음
        let r = load(&d, "ws1", T0);
        assert_eq!((r.json.as_deref(), r.source.as_str(), r.archived), (None, "empty", false));
        // 본 파일 정상
        fs::write(main_path(&d, "ws1"), board(1)).unwrap();
        let r = load(&d, "ws1", T0);
        assert_eq!((r.json.as_deref(), r.source.as_str(), r.archived), (Some(board(1).as_str()), "main", false));
        // 본 파일 깨짐 + prev 정상 → 깨진 파일은 아카이브로, prev 를 연다
        fs::write(main_path(&d, "ws1"), "{깨짐").unwrap();
        fs::write(prev_path(&d, "ws1"), board(2)).unwrap();
        let r = load(&d, "ws1", "20261024-130000");
        assert_eq!((r.json.as_deref(), r.source.as_str(), r.archived), (Some(board(2).as_str()), "prev", true));
        assert_eq!(fs::read_to_string(archive_dir(&d).join("ws1-20261024-130000.json")).unwrap(), "{깨짐");
        // 둘 다 깨짐 → 빈 보드
        fs::write(main_path(&d, "ws1"), "{깨짐2").unwrap();
        fs::write(prev_path(&d, "ws1"), "{깨짐3").unwrap();
        let r = load(&d, "ws1", "20261024-140000");
        assert_eq!((r.json.as_deref(), r.source.as_str(), r.archived), (None, "empty", true));
        assert!(archive_dir(&d).join("ws1-20261024-140000.json").exists());
        let _ = fs::remove_dir_all(&d);
    }

    // S-200: repos.json
    #[test]
    fn repos_roundtrip() {
        let d = tmp("repos");
        let f = d.join("repos.json");
        assert_eq!(repos_load(&f), Repos::default(), "파일이 없으면 빈 목록, lastRepo 없음");
        let r = Repos {
            repos: vec![Repo {
                path: "C:/work/app".into(),
                name: "app".into(),
                workspaces: vec![Workspace { id: "ws1".into(), name: "Workspace 1".into() }],
            }],
            last_repo: Some("C:/work/app".into()),
            ..Default::default() // B2: lastWorkspace 필드가 늘어서(기대값은 그대로)
        };
        repos_store(&f, &r).unwrap();
        assert_eq!(repos_load(&f), r);
        let text = fs::read_to_string(&f).unwrap();
        assert!(text.contains("\"lastRepo\""), "파일 키는 lastRepo: {text}");
        let _ = fs::remove_dir_all(&d);
    }

    // B2 S-307: repos.json 의 lastWorkspace (repo 경로 → 마지막으로 본 워크스페이스 id)
    #[test]
    fn repos_last_workspace_roundtrip() {
        let d = tmp("lastws");
        let f = d.join("repos.json");
        let mut r = Repos {
            repos: vec![Repo { path: "C:/work/app".into(), name: "app".into(), workspaces: vec![Workspace { id: "ws1".into(), name: "Workspace 1".into() }, Workspace { id: "ws2".into(), name: "Workspace 2".into() }] }],
            last_repo: Some("C:/work/app".into()),
            ..Default::default()
        };
        r.last_workspace.insert("C:/work/app".into(), "ws2".into());
        repos_store(&f, &r).unwrap();
        let text = fs::read_to_string(&f).unwrap();
        assert!(text.contains("\"lastWorkspace\""), "파일 키는 lastWorkspace: {text}");
        let back = repos_load(&f);
        assert_eq!(back.last_workspace.get("C:/work/app").map(String::as_str), Some("ws2"));
        assert_eq!(back, r);
        let _ = fs::remove_dir_all(&d);
    }

    // B2 S-307: lastWorkspace 가 없는 옛 파일도 repos·lastRepo 는 그대로 읽고 lastWorkspace 는 빈 맵
    #[test]
    fn repos_old_file_without_last_workspace_reads() {
        let d = tmp("oldrepos");
        let f = d.join("repos.json");
        fs::write(&f, r#"{"repos":[{"path":"C:/work/app","name":"app","workspaces":[{"id":"ws1","name":"Workspace 1"}]}],"lastRepo":"C:/work/app"}"#).unwrap();
        let r = repos_load(&f);
        assert_eq!(r.repos.len(), 1, "옛 파일의 repo 목록을 읽는다");
        assert_eq!(r.repos[0].workspaces[0].id, "ws1");
        assert_eq!(r.last_repo.as_deref(), Some("C:/work/app"));
        assert!(r.last_workspace.is_empty(), "필드가 없으면 빈 맵");
        let _ = fs::remove_dir_all(&d);
    }
}
