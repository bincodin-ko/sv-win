// 내 에이전트 custom-agents.json (S-376). 앱 데이터 폴더. 원자적 쓰기(임시 파일 → 바꿔치기).
use serde::{Deserialize, Serialize};
use std::path::Path;

/// id: "custom:<...>"(직접 만든 것) 또는 카탈로그 id(S-378로 자동 추가된 것). command: 공백으로 나뉜 실행 명령
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CustomAgent {
    pub id: String,
    pub name: String,
    pub command: String,
}

/// 없거나 깨졌으면 빈 목록
pub fn load(path: &Path) -> Vec<CustomAgent> {
    std::fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

pub fn save(path: &Path, list: &[CustomAgent]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string()) // Windows 도 기존 파일 위로 바꿔치기
}

pub fn file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("custom-agents.json"))
}

#[tauri::command]
pub fn custom_agents_get(app: tauri::AppHandle) -> Result<Vec<CustomAgent>, String> {
    Ok(load(&file(&app)?))
}

#[tauri::command]
pub fn custom_agents_set(app: tauri::AppHandle, list: Vec<CustomAgent>) -> Result<(), String> {
    save(&file(&app)?, &list)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-b5-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn custom_agents_file_roundtrip() {
        let dir = tmp("custom");
        let f = dir.join("sub").join("custom-agents.json"); // 폴더가 없어도 만든다
        assert!(load(&f).is_empty()); // 없는 파일
        let list = vec![
            CustomAgent { id: "custom:1".into(), name: "Mine".into(), command: "mytool --x".into() },
            CustomAgent { id: "aider".into(), name: "Aider".into(), command: "aider".into() },
        ];
        save(&f, &list).unwrap();
        assert_eq!(load(&f), list);
        // 덮어쓰기 + 임시 파일이 남지 않는다
        save(&f, &list[..1]).unwrap();
        assert_eq!(load(&f), list[..1].to_vec());
        let names: Vec<_> = std::fs::read_dir(f.parent().unwrap()).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(names.len(), 1, "남은 파일: {names:?}");
        // 깨진 파일 → 빈 목록
        std::fs::write(&f, "{깨짐").unwrap();
        assert!(load(&f).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
