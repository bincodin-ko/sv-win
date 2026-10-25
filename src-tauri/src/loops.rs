// 4묶음 D5 S-1401: Loops 정의 loops.json(%APPDATA%/com.symvibe.win/loops.json) = { "<repo 경로>": [loop, ...] }.
// 정의만 둔다(실행 횟수·기록 없음). 불러올 때 모든 loop 를 enabled:false 로 돌려준다. 깨진 파일은 loops.json.bad 로 옮기고 빈 것.
use serde_json::{Map, Value};
use std::path::Path;

/// 파일 없음 = 빈 것. 깨졌거나 객체가 아니면 loops.json.bad 로 옮기고 빈 것
pub fn load_all(path: &Path) -> Map<String, Value> {
    let Ok(text) = std::fs::read_to_string(path) else { return Map::new() };
    match serde_json::from_str(&text) {
        Ok(Value::Object(m)) => m,
        _ => {
            let mut bad = path.as_os_str().to_owned();
            bad.push(".bad");
            let _ = std::fs::rename(path, bad);
            Map::new()
        }
    }
}

/// 그 repo 의 정의. 모두 enabled:false 로(S-1401)
pub fn get(path: &Path, repo: &str) -> Vec<Value> {
    let Some(Value::Array(list)) = load_all(path).remove(repo) else { return Vec::new() };
    list.into_iter()
        .map(|mut v| {
            if let Some(o) = v.as_object_mut() {
                o.insert("enabled".into(), Value::Bool(false));
            }
            v
        })
        .collect()
}

/// 그 repo 의 정의를 바꿔 쓴다(빈 목록이면 키를 뺀다). 쓰기는 presets 와 같은 임시 파일 → 이름 바꾸기
pub fn set(path: &Path, repo: &str, list: &[Value]) -> Result<(), String> {
    let mut all = load_all(path);
    if list.is_empty() {
        all.remove(repo);
    } else {
        all.insert(repo.to_string(), Value::Array(list.to_vec()));
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = std::path::PathBuf::from(tmp);
    std::fs::write(&tmp, serde_json::to_string_pretty(&Value::Object(all)).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("loops.json"))
}

#[tauri::command]
pub fn loops_get(app: tauri::AppHandle, repo: String) -> Result<Vec<Value>, String> {
    Ok(get(&file(&app)?, &repo))
}

#[tauri::command]
pub fn loops_set(app: tauri::AppHandle, repo: String, list: Vec<Value>) -> Result<(), String> {
    set(&file(&app)?, &repo, &list)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-d5-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn loops_roundtrip_disabled() {
        let p = tmp("rt").join("loops.json");
        assert!(get(&p, "C:/r").is_empty());
        let a = vec![json!({"id":"a","name":"A","enabled":true,"x":1}), json!({"id":"b","name":"B","enabled":false})];
        set(&p, "C:/r", &a).unwrap();
        set(&p, "C:/other", &[json!({"id":"c","enabled":true})]).unwrap();
        let got = get(&p, "C:/r");
        assert_eq!(got.len(), 2);
        assert_eq!(got[0]["enabled"], json!(false)); // 켤 때 모두 꺼짐
        assert_eq!(got[0]["x"], json!(1)); // 모르는 필드 보존
        assert_eq!(get(&p, "C:/other")[0]["id"], json!("c"));
        assert_eq!(load_all(&p).len(), 2);
        set(&p, "C:/r", &[]).unwrap();
        assert!(get(&p, "C:/r").is_empty());
        assert_eq!(get(&p, "C:/other").len(), 1);
    }

    #[test]
    fn loops_broken_file_goes_bad() {
        let d = tmp("bad");
        let p = d.join("loops.json");
        fs::write(&p, "{ not json").unwrap();
        assert!(get(&p, "C:/r").is_empty());
        assert_eq!(fs::read_to_string(d.join("loops.json.bad")).unwrap(), "{ not json");
        assert!(!p.exists());
        set(&p, "C:/r", &[json!({"id":"a"})]).unwrap();
        assert_eq!(get(&p, "C:/r").len(), 1);
    }
}
