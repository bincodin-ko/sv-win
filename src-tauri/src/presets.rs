// B13 내가 저장한 layout 목록 presets.json (S-647). 앱 전체가 공유한다(%APPDATA%/com.symvibe.win/presets.json).
// 내용은 화면 쪽이 정한 JSON 목록 그대로 둔다(모르는 필드를 지우지 않는다).
use serde_json::Value;
use std::path::Path;

/// 없거나 깨졌거나 목록이 아니면 빈 목록
pub fn load(path: &Path) -> Vec<Value> {
    match std::fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok()) {
        Some(Value::Array(a)) => a,
        _ => Vec::new(),
    }
}

/// 임시 파일에 쓴 뒤 이름을 바꾼다. 쓰기가 실패하면 원본은 그대로
pub fn save(path: &Path, list: &[Value]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = std::path::PathBuf::from(tmp);
    let text = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

pub fn file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("presets.json"))
}

#[tauri::command]
pub async fn presets_get(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    Ok(load(&file(&app)?))
}

#[tauri::command]
pub async fn presets_set(app: tauri::AppHandle, list: Vec<Value>) -> Result<(), String> {
    save(&file(&app)?, &list)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-b13-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    // S-647
    #[test]
    fn roundtrip() {
        let p = tmp("rt").join("presets.json");
        assert!(load(&p).is_empty()); // 파일 없음 = 빈 목록
        let list = vec![json!({"name":"Set 1","nodes":[{"kind":"console","x":1,"y":2,"w":3,"h":4,"agentId":"claude"}]}), json!({"name":"Set 2","nodes":[]})];
        save(&p, &list).unwrap();
        assert_eq!(load(&p), list);
    }

    #[test]
    fn unreadable_gives_empty() {
        let d = tmp("bad");
        let p = d.join("presets.json");
        fs::write(&p, "{ not json").unwrap();
        assert!(load(&p).is_empty());
        fs::write(&p, "{\"name\":\"not a list\"}").unwrap();
        assert!(load(&p).is_empty());
    }

    #[test]
    fn atomic_write() {
        let d = tmp("atomic");
        let p = d.join("presets.json");
        let old = vec![json!({"name":"Set 1","nodes":[]})];
        save(&p, &old).unwrap();
        // 임시 파일 자리를 폴더로 막으면 쓰기가 실패하고 원본은 그대로
        fs::create_dir_all(d.join("presets.json.tmp")).unwrap();
        assert!(save(&p, &[json!({"name":"Set 9","nodes":[]})]).is_err());
        assert_eq!(load(&p), old);
        // 성공하면 임시 파일이 남지 않는다
        fs::remove_dir_all(d.join("presets.json.tmp")).unwrap();
        save(&p, &[json!({"name":"Set 2","nodes":[]})]).unwrap();
        assert!(!d.join("presets.json.tmp").exists());
    }
}
