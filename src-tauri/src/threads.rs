// B9 S-554·S-555: 명령 바 스레드 저장. 폴더는 인자로 받는다(시험은 임시 폴더, 앱은 %APPDATA%/com.symvibe.win/Threads).
use std::path::{Path, PathBuf};

/// repo 식별자(경로)를 파일 이름으로: 안전한 글자만 남기고, 다른 경로가 같은 이름이 되지 않게 원본의 해시를 붙인다
pub fn file_name(key: &str) -> String {
    let safe: String = key.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
    let tail: String = safe.chars().rev().take(80).collect::<Vec<_>>().into_iter().rev().collect(); // 끝(폴더 이름)을 살린다
    // FNV-1a 64: Rust 버전이 바뀌어도 같은 값(DefaultHasher 는 보장 없음)
    let hash = key.bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ u64::from(b)).wrapping_mul(0x100000001b3));
    format!("{}-{hash:016x}.json", if tail.is_empty() { "repo" } else { &tail })
}

pub fn main_path(dir: &Path, key: &str) -> PathBuf {
    dir.join(file_name(key))
}
/// 쓰기용 임시 파일(S-555). 시험이 이 자리를 막아 "쓰기 중 실패"를 흉내 낸다.
pub fn tmp_path(dir: &Path, key: &str) -> PathBuf {
    dir.join(format!("{}.tmp", file_name(key)))
}

/// 임시 파일에 쓰고 이름을 바꾼다
pub fn save(dir: &Path, key: &str, json: &str) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = tmp_path(dir, key);
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?; // 실패하면 원본은 건드리지 않았다
    std::fs::rename(&tmp, main_path(dir, key)).map_err(|e| e.to_string())
}

/// 저장된 JSON 배열 글. 없거나 읽지 못하면 "[]"(깨진 파일은 Archive 로 옮긴다)
pub fn load(dir: &Path, key: &str, now: &str) -> String {
    let main = main_path(dir, key);
    let Ok(text) = std::fs::read_to_string(&main) else { return "[]".into() };
    if serde_json::from_str::<serde_json::Value>(&text).is_ok_and(|v| v.is_array()) {
        return text;
    }
    let arch = dir.join("Archive");
    let _ = std::fs::create_dir_all(&arch);
    let stem = file_name(key);
    let _ = std::fs::rename(&main, arch.join(format!("{}-{now}.json", stem.trim_end_matches(".json"))));
    "[]".into()
}

// ---- Tauri 명령 (폴더 = %APPDATA%/com.symvibe.win/Threads) ----
fn threads_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("Threads"))
}

#[tauri::command]
pub async fn thread_load(app: tauri::AppHandle, repo_key: String) -> Result<String, String> {
    Ok(load(&threads_dir(&app)?, &repo_key, &crate::boards::now_stamp()))
}

#[tauri::command]
pub async fn thread_save(app: tauri::AppHandle, repo_key: String, json: String) -> Result<(), String> {
    save(&threads_dir(&app)?, &repo_key, &json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-b9-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    const KEY: &str = r"C:\Users\me\repo";
    const T0: &str = "20261024-093015";

    // S-554: 저장하고 다시 읽으면 같다. 없으면 빈 배열
    #[test]
    fn roundtrip() {
        let d = tmp("rt");
        assert_eq!(load(&d, KEY, T0), "[]", "파일이 없으면 빈 스레드");
        let json = r#"[{"id":"m1","at":1,"role":"user","text":"안녕 \"x\""}]"#;
        save(&d, KEY, json).unwrap();
        assert_eq!(load(&d, KEY, T0), json);
        let json2 = r#"[]"#;
        save(&d, KEY, json2).unwrap();
        assert_eq!(load(&d, KEY, T0), json2, "덮어쓰기");
        assert_eq!(load(&d, r"C:\other", T0), "[]", "repo 마다 따로");
        let _ = fs::remove_dir_all(&d);
    }

    // S-555: 임시 파일에 쓰다 실패하면 원본은 그대로
    #[test]
    fn atomic_write() {
        let d = tmp("atomic");
        save(&d, KEY, "[1]").unwrap();
        assert!(!tmp_path(&d, KEY).exists(), "저장이 끝나면 임시 파일이 남지 않는다");
        fs::create_dir_all(tmp_path(&d, KEY)).unwrap(); // 임시 자리를 폴더로 막는다
        assert!(save(&d, KEY, "[2]").is_err());
        assert_eq!(fs::read_to_string(main_path(&d, KEY)).unwrap(), "[1]", "원본은 건드리지 않았다");
        let _ = fs::remove_dir_all(&d);
    }

    // S-555: 읽지 못하면 빈 스레드, 깨진 파일은 Archive 로
    #[test]
    fn unreadable_gives_empty() {
        let d = tmp("bad");
        fs::write(main_path(&d, KEY), "{not json").unwrap();
        assert_eq!(load(&d, KEY, T0), "[]");
        assert!(!main_path(&d, KEY).exists(), "깨진 파일은 제자리에서 치워진다");
        let n = fs::read_dir(d.join("Archive")).map(|r| r.count()).unwrap_or(0);
        assert_eq!(n, 1, "Archive 에 한 개");
        fs::write(main_path(&d, KEY), r#"{"a":1}"#).unwrap(); // JSON 이지만 배열이 아니면 역시 깨진 것
        assert_eq!(load(&d, KEY, T0), "[]");
        let _ = fs::remove_dir_all(&d);
    }

    // S-554: repo 식별자가 파일 이름이 되므로 경로 글자를 막고, 다른 repo 가 같은 파일이 되지 않는다
    #[test]
    fn safe_file_name() {
        for k in [r"C:\Users\me\repo", "/home/me/repo", r"..\..\evil", "a:b*c?d\"e<f>g|h", "한글 repo", ""] {
            let f = file_name(k);
            assert!(!f.is_empty() && f.len() <= 120, "{k:?} → {f:?}");
            assert!(!f.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|']), "{k:?} → {f:?}");
            assert!(!f.starts_with('.'), "{k:?} → {f:?}");
            assert!(f.ends_with(".json"), "{k:?} → {f:?}");
            assert_eq!(f, file_name(k), "같은 입력은 같은 이름");
        }
        assert_ne!(file_name("a/b"), file_name("a_b"), "글자를 바꿔 같아지는 경로도 서로 다른 파일");
        assert_ne!(file_name(r"C:\x\Repo"), file_name(r"C:\x\repo"));
    }
}
