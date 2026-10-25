// E3 S-2035·S-2040: 만들어진 다이어그램 명세 저장소(%APPDATA%/com.symvibe.win/Diagrams/<id>.json)와 내보내기 쓰기.
// 함수는 폴더를 인자로 받는다(시험은 임시 폴더). Tauri 명령은 맨 아래.
use std::path::Path;

/// 이름은 영숫자·하이픈만(경로 탈출 거절)
pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 80 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

fn file(dir: &Path, id: &str) -> Result<std::path::PathBuf, String> {
    if valid_id(id) { Ok(dir.join(format!("{id}.json"))) } else { Err("invalid diagram id".into()) }
}

pub fn put_at(dir: &Path, id: &str, json: &str) -> Result<(), String> {
    let f = file(dir, id)?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::write(f, json).map_err(|e| e.to_string())
}

pub fn get_at(dir: &Path, id: &str) -> Result<Option<String>, String> {
    match std::fs::read_to_string(file(dir, id)?) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_at(dir: &Path, id: &str) -> Result<(), String> {
    match std::fs::remove_file(file(dir, id)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

// ---- Tauri 명령 ----
fn dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("Diagrams"))
}

#[tauri::command]
pub fn diagram_put(app: tauri::AppHandle, id: String, json: String) -> Result<(), String> {
    put_at(&dir(&app)?, &id, &json)
}

#[tauri::command]
pub fn diagram_get(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    get_at(&dir(&app)?, &id)
}

#[tauri::command]
pub fn diagram_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    delete_at(&dir(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-e3-{}-{tag}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn put_get_delete() {
        let d = tmp("pgd").join("Diagrams"); // 폴더가 없어도 만든다
        put_at(&d, "dia-1", "{\"title\":\"한글\"}").unwrap();
        assert_eq!(get_at(&d, "dia-1").unwrap().as_deref(), Some("{\"title\":\"한글\"}"));
        put_at(&d, "dia-1", "{}").unwrap(); // 덮어쓰기
        assert_eq!(get_at(&d, "dia-1").unwrap().as_deref(), Some("{}"));
        delete_at(&d, "dia-1").unwrap();
        assert_eq!(get_at(&d, "dia-1").unwrap(), None);
        delete_at(&d, "dia-1").unwrap(); // 없는 것을 지워도 오류 아님
        let _ = fs::remove_dir_all(d.parent().unwrap());
    }

    #[test]
    fn get_missing_is_none() {
        let d = tmp("none");
        assert_eq!(get_at(&d, "nope").unwrap(), None);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn rejects_bad_names() {
        let d = tmp("names");
        for bad in ["../x", "a/b", "a\\b", "", "a.json", "a b", "..", "C:x"] {
            assert!(!valid_id(bad), "{bad}");
            assert!(put_at(&d, bad, "{}").is_err(), "put {bad}");
            assert!(get_at(&d, bad).is_err(), "get {bad}");
            assert!(delete_at(&d, bad).is_err(), "delete {bad}");
        }
        assert!(valid_id("dia-1a2B"));
        assert!(!d.join("x.json").exists());
        let _ = fs::remove_dir_all(&d);
    }
}
