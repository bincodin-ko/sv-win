// 설정 파일 settings.json (%APPDATA%/com.symvibe.win). 모르는 키도 지우지 않는다(뒤 묶음이 키를 더함).
use serde_json::{Map, Value};
use std::path::Path;

pub type Settings = Map<String, Value>;

pub fn defaults() -> Settings {
    let Value::Object(m) = serde_json::json!({
        "yolo": false,
        "agentPaths": {},
        "defaultShell": null,
        "defaultAgent": null,
        "armedAgent": null,
        "resumeAgentChats": true,
        "textSize": 100,
        "recentAgents": [],
        "theme": "og",
        "reopenLastRepo": true,
        "liveStatus": false,
        "altAsMeta": true,
        "keymap": {},
        "profileName": "",
        "avatarColor": 0,
        "firstRunDone": false
    }) else {
        unreachable!()
    };
    m
}

/// 파일을 읽어 기본값 위에 덮는다. 없거나 깨졌으면 기본값.
pub fn load(path: &Path) -> Settings {
    let mut s = defaults();
    if let Some(Value::Object(m)) = std::fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok()) {
        s.extend(m);
    }
    s
}

/// patch의 키만 덮어 저장하고 합쳐진 전체를 돌려준다.
pub fn patch(path: &Path, p: &Settings) -> Result<Settings, String> {
    let mut s = load(path);
    s.extend(p.clone());
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())?;
    Ok(s)
}

pub fn file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("settings.json"))
}

/// D10 S-1517: 사용량 확인용 빈 폴더 %APPDATA%/com.symvibe.win/UsageProbe (없으면 만든다)
#[tauri::command]
pub fn usage_probe_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("UsageProbe");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn settings_get(app: tauri::AppHandle) -> Result<Settings, String> {
    Ok(load(&file(&app)?))
}

#[tauri::command]
pub fn settings_set(
    app: tauri::AppHandle,
    cache: tauri::State<'_, crate::agents::cmds::AgentCache>,
    patch: Settings,
) -> Result<Settings, String> {
    let merged = self::patch(&file(&app)?, &patch)?;
    if patch.contains_key("agentPaths") {
        // S-375: 지정한 경로가 찾기 캐시에 바로 반영되게
        let (c, s) = (cache.inner().clone(), merged.clone());
        std::thread::spawn(move || c.refresh(&s));
    }
    Ok(merged)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-a3-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn defaults_and_patch() {
        let dir = tmp("settings");
        let f = dir.join("settings.json");
        // 없는 파일 → 기본값
        let s = load(&f);
        assert_eq!(s["yolo"], json!(false));
        assert_eq!(s["agentPaths"], json!({}));
        assert_eq!(s["defaultShell"], Value::Null);
        assert_eq!(s["defaultAgent"], Value::Null);
        assert_eq!(s["armedAgent"], Value::Null);
        assert_eq!(s["resumeAgentChats"], json!(true));
        assert_eq!(s["textSize"], json!(100));
        assert_eq!(s["recentAgents"], json!([]));
        // patch 저장 후 다시 읽기 (모르는 키 포함)
        let mut p = Settings::new();
        p.insert("yolo".into(), json!(true));
        p.insert("laterKey".into(), json!("x"));
        let merged = patch(&f, &p).unwrap();
        assert_eq!(merged["yolo"], json!(true));
        let again = load(&f);
        assert_eq!(again["yolo"], json!(true));
        assert_eq!(again["laterKey"], json!("x"));
        assert_eq!(again["textSize"], json!(100));
        // 두 번째 patch가 앞서 더한 모르는 키를 지우지 않는다
        let mut p2 = Settings::new();
        p2.insert("yolo".into(), json!(false));
        patch(&f, &p2).unwrap();
        let last = load(&f);
        assert_eq!(last["yolo"], json!(false));
        assert_eq!(last["laterKey"], json!("x"));
        // 깨진 파일 → 기본값
        std::fs::write(&f, "{깨짐").unwrap();
        assert_eq!(load(&f)["textSize"], json!(100));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn defaults_have_batch2_keys() {
        let s = defaults();
        let want = json!({
            "theme": "og", "textSize": 100, "reopenLastRepo": true, "resumeAgentChats": true, "yolo": false,
            "liveStatus": false, "altAsMeta": true, "defaultShell": null, "defaultAgent": null, "agentPaths": {},
            "keymap": {}, "profileName": "", "avatarColor": 0, "firstRunDone": false
        });
        for (k, v) in want.as_object().unwrap() {
            assert_eq!(s.get(k), Some(v), "키 {k}");
        }
    }
}
