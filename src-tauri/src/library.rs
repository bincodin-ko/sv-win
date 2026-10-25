// 5묶음 E6 S-1987: Documents 보관. %APPDATA%/com.symvibe.win/Documents/<repo 폴더 이름>-<경로 해시 6자>/index.json + <id>.md
// 폴더는 인자로 받는다(시험은 임시 폴더). Tauri 명령은 맨 아래.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub id: String,
    pub doc_id: String,
    pub title: String,
    pub agent: String,
    pub effort: String,
    pub started_at: u64,
    pub duration_ms: u64,
    pub status: String,
}

/// `<repo 폴더 이름>-<해시6>` (해시는 전체 경로를 정규화·소문자로 만든 뒤 FNV-1a)
pub fn repo_dir_name(repo: &str) -> String {
    let norm = repo.replace('\\', "/").trim_end_matches('/').to_lowercase();
    let mut h: u64 = 0xcbf29ce484222325;
    for b in norm.bytes() {
        h = (h ^ b as u64).wrapping_mul(0x100000001b3);
    }
    let folder = repo.split(['/', '\\']).filter(|s| !s.is_empty()).next_back().unwrap_or("repo");
    let folder: String = folder.chars().map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' ') { c } else { '_' }).collect();
    format!("{folder}-{}", &format!("{h:016x}")[..6])
}

fn dir(base: &Path, repo: &str) -> PathBuf {
    base.join(repo_dir_name(repo))
}
fn valid(id: &str) -> Result<(), String> {
    if !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') { Ok(()) } else { Err("bad id".into()) }
}
fn read_index(d: &Path) -> Vec<Meta> {
    std::fs::read_to_string(d.join("index.json")).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}
fn write_index(d: &Path, v: &[Meta]) -> Result<(), String> {
    std::fs::write(d.join("index.json"), serde_json::to_string_pretty(v).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// 최신 먼저
pub fn list(base: &Path, repo: &str) -> Result<Vec<Meta>, String> {
    let mut v = read_index(&dir(base, repo));
    v.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    Ok(v)
}
pub fn put(base: &Path, repo: &str, meta: &Meta, md: &str) -> Result<(), String> {
    valid(&meta.id)?;
    let d = dir(base, repo);
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    std::fs::write(d.join(format!("{}.md", meta.id)), md).map_err(|e| e.to_string())?;
    let mut v = read_index(&d);
    v.retain(|m| m.id != meta.id);
    v.push(meta.clone());
    write_index(&d, &v)
}
pub fn get(base: &Path, repo: &str, id: &str) -> Result<String, String> {
    valid(id)?;
    std::fs::read_to_string(dir(base, repo).join(format!("{id}.md"))).map_err(|e| e.to_string())
}
/// 영구 삭제(휴지통 아님)
pub fn delete(base: &Path, repo: &str, id: &str) -> Result<(), String> {
    valid(id)?;
    let d = dir(base, repo);
    let _ = std::fs::remove_file(d.join(format!("{id}.md")));
    let mut v = read_index(&d);
    v.retain(|m| m.id != id);
    if d.exists() { write_index(&d, &v)?; }
    Ok(())
}

// ---- Tauri 명령 (폴더 = %APPDATA%/com.symvibe.win/Documents) ----
pub mod cmds {
    use super::*;
    use tauri::{AppHandle, Manager};

    fn base(app: &AppHandle) -> Result<PathBuf, String> {
        Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("Documents"))
    }
    #[tauri::command]
    pub fn doc_list(app: AppHandle, repo: String) -> Result<Vec<Meta>, String> {
        super::list(&base(&app)?, &repo)
    }
    #[tauri::command]
    pub fn doc_put(app: AppHandle, repo: String, meta: Meta, md: String) -> Result<(), String> {
        super::put(&base(&app)?, &repo, &meta, &md)
    }
    #[tauri::command]
    pub fn doc_get(app: AppHandle, repo: String, id: String) -> Result<String, String> {
        super::get(&base(&app)?, &repo, &id)
    }
    #[tauri::command]
    pub fn doc_delete(app: AppHandle, repo: String, id: String) -> Result<(), String> {
        super::delete(&base(&app)?, &repo, &id)
    }
}

#[cfg(test)]
mod tests;
