// 5묶음 E1 S-1811~S-1814·S-1817: 스튜디오 파일 도구(트리·읽기·쓰기·만들기·이름 바꾸기·복제·vault·memory 폴더)와 초안 저장소.
// 모든 함수는 경로를 인자로 받는다(시험은 임시 폴더). Tauri 명령은 맨 아래.
use serde::Serialize;
use std::path::{Component, Path, PathBuf};

pub const MAX_READ: u64 = 5_000_000;

#[derive(Serialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Serialize, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReadOut {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub encoding: String,
    pub bom: bool,
    pub crlf: bool,
    pub mixed_eol: bool, // 빈 구현: FX7 S-1884 (CRLF 와 단독 LF 가 섞였나)
    pub bytes: u64,
    pub mtime_ms: u64,
    pub real_path: String,
    pub outside: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unreadable: Option<String>,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultOut {
    pub files: Vec<Entry>,
    pub truncated: bool,
}

#[derive(Serialize, serde::Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub path: String,
    pub text: String,
    pub saved_at: u64,
    pub base_mtime: u64,
}

const SKIP_DIRS: [&str; 20] = [
    ".git", "node_modules", "build", "dist", ".next", "venv", ".venv", "target", "vendor", "coverage", "DerivedData", "Pods", "__pycache__", "out", ".gradle", ".idea", ".vs", "bin", "obj", ".cache",
];
const KEEP_DOT: [&str; 7] = [".gitignore", ".gitattributes", ".env.example", ".editorconfig", ".prettierrc", ".nvmrc", ".dockerignore"];
const HEAD: usize = 8192;

/// S-1814: 건너뛰는 폴더(목록 + 점으로 시작하는 폴더 전부)
pub fn skip_dir(name: &str) -> bool {
    name.starts_with('.') || SKIP_DIRS.contains(&name)
}
/// 점 파일은 숨기되 쓸모 있는 몇 개만 보인다
pub fn show_file(name: &str) -> bool {
    !name.starts_with('.') || KEEP_DOT.contains(&name)
}

// ---- 경로 안전 (S-1813) ----
fn norm(p: &Path) -> String {
    let s = p.to_string_lossy().replace('/', "\\").to_lowercase();
    s.strip_prefix("\\\\?\\").unwrap_or(&s).trim_end_matches('\\').to_string()
}
fn within(child: &Path, root: &Path) -> bool {
    let (c, r) = (norm(child), norm(root));
    c == r || c.starts_with(&format!("{r}\\"))
}
/// (실제 경로, 링크라서 repo 밖인가). `..` 나 repo 밖 절대 경로는 Err("outside")
fn resolve(root: &Path, path: &Path) -> Result<(PathBuf, bool), String> {
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("outside".into());
    }
    let lex = if path.is_absolute() { path.to_path_buf() } else { root.join(path) };
    let croot = root.canonicalize().map_err(|e| e.to_string())?;
    let real = match lex.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            // 아직 없는 파일(만들기·새로 쓰기): 부모를 정규화하고 이름을 붙인다
            let parent = lex.parent().ok_or("outside")?.canonicalize().map_err(|e| e.to_string())?;
            parent.join(lex.file_name().ok_or("outside")?)
        }
    };
    if within(&real, &croot) {
        Ok((real, false))
    } else if within(&lex, root) || within(&lex, &croot) {
        Ok((real, true)) // 링크·정션이 repo 밖을 가리킨다
    } else {
        Err("outside".into())
    }
}

fn mtime_ms(md: &std::fs::Metadata) -> u64 {
    md.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64)
}
fn head_has_nul(path: &Path) -> bool {
    use std::io::Read;
    let mut buf = Vec::with_capacity(HEAD);
    std::fs::File::open(path).and_then(|f| f.take(HEAD as u64).read_to_end(&mut buf)).map_or(true, |_| buf.contains(&0))
}
#[cfg(windows)]
fn is_link(p: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    std::fs::symlink_metadata(p).is_ok_and(|m| m.file_attributes() & 0x400 != 0) // FILE_ATTRIBUTE_REPARSE_POINT
}
#[cfg(not(windows))]
fn is_link(p: &Path) -> bool {
    std::fs::symlink_metadata(p).is_ok_and(|m| m.file_type().is_symlink())
}

// ---- Windows-1252 (0x80~0x9F 만 표가 다르다. 비어 있는 5칸은 같은 번호의 제어 문자) ----
const CP1252_HI: &str = "€\u{81}‚ƒ„…†‡ˆ‰Š‹Œ\u{8d}Ž\u{8f}\u{90}‘’“”•–—˜™š›œ\u{9d}žŸ";
fn decode_1252(b: &[u8]) -> String {
    let hi: Vec<char> = CP1252_HI.chars().collect();
    b.iter().map(|&x| if (0x80..0xA0).contains(&x) { hi[(x - 0x80) as usize] } else { char::from(x) }).collect()
}
fn encode_1252(s: &str) -> Result<Vec<u8>, String> {
    s.chars()
        .map(|c| {
            let u = c as u32;
            if u < 0x80 || (0xA0..=0xFF).contains(&u) {
                return Ok(u as u8);
            }
            CP1252_HI.chars().position(|h| h == c).map(|i| 0x80 + i as u8).ok_or_else(|| format!("unencodable: {c}"))
        })
        .collect()
}

// ---- 트리 (한 단계) ----
pub fn tree(root: &Path, dir: &Path) -> Result<Vec<Entry>, String> {
    let (real, _) = resolve(root, dir)?;
    let mut out: Vec<Entry> = vec![];
    for e in std::fs::read_dir(&real).map_err(|e| e.to_string())?.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let Ok(md) = std::fs::metadata(e.path()) else { continue }; // 끊긴 링크는 건너뛴다
        if md.is_dir() {
            if skip_dir(&name) {
                continue;
            }
        } else if !md.is_file() || !show_file(&name) || head_has_nul(&e.path()) {
            continue;
        }
        out.push(Entry { path: dir.join(&name).to_string_lossy().into_owned(), name, is_dir: md.is_dir(), size: if md.is_dir() { 0 } else { md.len() } });
    }
    out.sort_by_key(|e| (!e.is_dir, e.name.to_lowercase()));
    Ok(out)
}

// ---- 읽기 ----
pub fn read_file_max(root: &Path, path: &Path, max: u64) -> Result<ReadOut, String> {
    let (real, outside) = resolve(root, path)?;
    let md = std::fs::metadata(&real).map_err(|e| e.to_string())?;
    if !md.is_file() {
        return Err("not a file".into());
    }
    let mut out = ReadOut { bytes: md.len(), mtime_ms: mtime_ms(&md), real_path: real.to_string_lossy().into_owned(), outside, encoding: "utf-8".into(), ..Default::default() };
    if md.len() > max {
        out.unreadable = Some("large".into());
        return Ok(out);
    }
    let b = std::fs::read(&real).map_err(|e| e.to_string())?;
    // UTF-16 은 지원하지 않는다: BOM 이 있거나 NUL 이 있으면 바이너리 (S-1883)
    let (bom, body): (bool, &[u8]) = match b.as_slice() {
        [0xFF, 0xFE, ..] | [0xFE, 0xFF, ..] => {
            out.unreadable = Some("binary".into());
            return Ok(out);
        }
        [0xEF, 0xBB, 0xBF, r @ ..] => (true, r),
        r => (false, r),
    };
    if body[..body.len().min(HEAD)].contains(&0) {
        out.unreadable = Some("binary".into());
        return Ok(out);
    }
    let (enc, text) = match std::str::from_utf8(body) {
        Ok(t) => ("utf-8", t.to_string()),
        Err(_) => ("windows-1252", decode_1252(body)),
    };
    out.encoding = enc.into();
    out.bom = bom;
    // 많은 쪽을 따르고, 섞였으면 알린다 (S-1884)
    let crlf_n = text.matches("\r\n").count();
    let lf_n = text.matches('\n').count() - crlf_n;
    out.crlf = crlf_n > lf_n;
    out.mixed_eol = crlf_n > 0 && lf_n > 0;
    out.text = Some(if crlf_n > 0 { text.replace("\r\n", "\n") } else { text });
    Ok(out)
}
pub fn read_file(root: &Path, path: &Path) -> Result<ReadOut, String> {
    read_file_max(root, path, MAX_READ)
}

// ---- 쓰기 ----
#[allow(clippy::too_many_arguments)]
pub fn write_file(root: &Path, path: &Path, text: &str, encoding: &str, bom: bool, crlf: bool, expect_mtime: Option<u64>, force: bool, allow_outside: bool) -> Result<u64, String> {
    let (real, outside) = resolve(root, path)?;
    if outside && !allow_outside {
        return Err("outside".into());
    }
    if let (Some(m), false, Ok(md)) = (expect_mtime, force, std::fs::metadata(&real)) {
        if mtime_ms(&md) != m {
            return Err("changed".into());
        }
    }
    let t = text.replace("\r\n", "\n");
    let t = if crlf { t.replace('\n', "\r\n") } else { t };
    let mut bytes: Vec<u8> = vec![];
    match encoding {
        "utf-8" => {
            if bom {
                bytes.extend([0xEF, 0xBB, 0xBF]);
            }
            bytes.extend(t.as_bytes());
        }
        "windows-1252" => bytes = encode_1252(&t)?,
        other => return Err(format!("unknown encoding: {other}")),
    }
    std::fs::write(&real, bytes).map_err(|e| e.to_string())?;
    std::fs::metadata(&real).map(|m| mtime_ms(&m)).map_err(|e| e.to_string())
}

// ---- 만들기·이름 바꾸기·복제 ----
fn inside(root: &Path, path: &Path) -> Result<PathBuf, String> {
    match resolve(root, path)? {
        (_, true) => Err("outside".into()),
        (real, false) => Ok(real),
    }
}
/// 아직 없는 폴더 경로: 있는 가장 가까운 상위를 `inside` 로 검사하고 없는 이름들을 붙인다. 루트가 없으면 루트 안 경로일 때만 루트부터 만든다
fn dir_target(root: &Path, path: &Path) -> Result<PathBuf, String> {
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("outside".into());
    }
    let lex = if path.is_absolute() { path.to_path_buf() } else { root.join(path) };
    if !root.exists() {
        if !within(&lex, root) {
            return Err("outside".into());
        }
        if norm(&lex) == norm(root) {
            return Ok(lex); // 루트 자체를 만드는 것 — 아래 create 가 만든다
        }
        std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    }
    let (mut up, mut tail) = (lex.as_path(), vec![]);
    while !up.exists() {
        tail.push(up.file_name().ok_or("outside")?);
        up = up.parent().ok_or("outside")?;
    }
    let mut real = inside(root, up)?;
    real.extend(tail.into_iter().rev());
    Ok(real)
}
pub fn create(root: &Path, path: &Path, is_dir: bool) -> Result<(), String> {
    // 폴더는 상위(루트 자체 포함)가 없어도 만든다. 루트 밖 경로는 거절 (S-1925)
    let real = if is_dir { dir_target(root, path)? } else { inside(root, path)? };
    if real.exists() {
        return Err("exists".into());
    }
    if is_dir {
        std::fs::create_dir_all(&real)
    } else {
        std::fs::OpenOptions::new().write(true).create_new(true).open(&real).map(|_| ())
    }
    .map_err(|e| e.to_string())
}
pub fn rename(root: &Path, path: &Path, new_name: &str) -> Result<String, String> {
    if new_name.trim().is_empty() || new_name == "." || new_name == ".." || new_name.contains(['/', '\\']) {
        return Err("bad name".into());
    }
    let real = inside(root, path)?;
    let to = real.with_file_name(new_name);
    if to.exists() && norm(&to) != norm(&real) {
        return Err("exists".into());
    }
    std::fs::rename(&real, &to).map_err(|e| e.to_string())?;
    Ok(path.with_file_name(new_name).to_string_lossy().into_owned())
}
pub fn duplicate(root: &Path, path: &Path) -> Result<String, String> {
    let real = inside(root, path)?;
    if !real.is_file() {
        return Err("not a file".into());
    }
    let name = real.file_name().unwrap().to_string_lossy().into_owned();
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => name.split_at(i),
        _ => (name.as_str(), ""),
    };
    let cand = |n: u32| if n == 1 { format!("{stem} copy{ext}") } else { format!("{stem} copy {n}{ext}") };
    let n = (1..).find(|&n| !real.with_file_name(cand(n)).exists()).unwrap();
    std::fs::copy(&real, real.with_file_name(cand(n))).map_err(|e| e.to_string())?;
    Ok(path.with_file_name(cand(n)).to_string_lossy().into_owned())
}

// ---- vault (S-1921 이 쓴다): 마크다운 글 전부, 최대 max 개 ----
pub fn vault(root: &Path, max: usize) -> Result<VaultOut, String> {
    let mut out = VaultOut { files: vec![], truncated: false };
    let mut stack = vec![root.to_path_buf()];
    while let Some(d) = stack.pop() {
        let mut es: Vec<_> = std::fs::read_dir(&d).map_err(|e| e.to_string())?.flatten().collect();
        es.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());
        let mut dirs = vec![];
        for e in es {
            let (p, name) = (e.path(), e.file_name().to_string_lossy().into_owned());
            let Ok(ty) = e.file_type() else { continue };
            if ty.is_dir() && !is_link(&p) {
                if !skip_dir(&name) {
                    dirs.push(p);
                }
            } else if ty.is_file() && matches!(p.extension().map(|x| x.to_string_lossy().to_lowercase()).as_deref(), Some("md" | "markdown" | "mdx")) {
                if out.files.len() >= max {
                    out.truncated = true;
                    return Ok(out);
                }
                out.files.push(Entry { size: e.metadata().map_or(0, |m| m.len()), path: p.to_string_lossy().into_owned(), name, is_dir: false });
            }
        }
        stack.extend(dirs.into_iter().rev()); // 이름순으로 깊이 우선
    }
    Ok(out)
}

/// 그 repo 의 Claude Code memory 폴더(만들지는 않는다). claude_dir = CLAUDE_CONFIG_DIR 또는 ~/.claude
pub fn claude_dir(config_dir: Option<&str>) -> PathBuf {
    if let Some(d) = config_dir.filter(|d| !d.is_empty()) {
        return PathBuf::from(d);
    }
    let get = |k: &str| std::env::var_os(k).filter(|v| !v.is_empty()).map(PathBuf::from);
    get("CLAUDE_CONFIG_DIR").or_else(|| get("USERPROFILE").or_else(|| get("HOME")).map(|h| h.join(".claude"))).unwrap_or_default()
}
pub fn memory_dir(claude_dir: &Path, repo: &str) -> PathBuf {
    claude_dir.join("projects").join(crate::resume::project_dir_name(repo)).join("memory")
}

// ---- 초안 (S-1811): <dir>/<경로 해시>.json ----
fn draft_file(dir: &Path, path: &str) -> PathBuf {
    let key = path.replace('\\', "/").to_lowercase();
    let h = key.bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100000001b3)); // FNV-1a
    dir.join(format!("{h:016x}.json"))
}
pub fn draft_put(dir: &Path, path: &str, text: &str, base_mtime: u64) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let saved_at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64);
    let d = Draft { path: path.into(), text: text.into(), saved_at, base_mtime };
    std::fs::write(draft_file(dir, path), serde_json::to_vec(&d).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
pub fn draft_get(dir: &Path, path: &str) -> Option<Draft> {
    serde_json::from_slice(&std::fs::read(draft_file(dir, path)).ok()?).ok()
}
pub fn draft_clear(dir: &Path, path: &str) -> Result<(), String> {
    match std::fs::remove_file(draft_file(dir, path)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

// ---- Tauri 명령 (파일 명령은 async = UI 스레드가 아닌 곳에서 돈다, S-1817) ----
pub mod cmds {
use super::*;
use tauri::{AppHandle, Manager};

fn drafts_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("Drafts"))
}

#[tauri::command]
pub async fn studio_tree(root: String, dir: String) -> Result<Vec<Entry>, String> {
    super::tree(Path::new(&root), Path::new(&dir))
}
#[tauri::command]
pub async fn studio_read(root: String, path: String) -> Result<ReadOut, String> {
    super::read_file(Path::new(&root), Path::new(&path))
}
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn studio_write(root: String, path: String, text: String, encoding: String, bom: bool, crlf: bool, expect_mtime: Option<u64>, force: Option<bool>, allow_outside: Option<bool>) -> Result<u64, String> {
    super::write_file(Path::new(&root), Path::new(&path), &text, &encoding, bom, crlf, expect_mtime, force.unwrap_or(false), allow_outside.unwrap_or(false))
}
#[tauri::command]
pub async fn studio_create(root: String, path: String, is_dir: bool) -> Result<(), String> {
    super::create(Path::new(&root), Path::new(&path), is_dir)
}
#[tauri::command]
pub async fn studio_rename(root: String, path: String, new_name: String) -> Result<String, String> {
    super::rename(Path::new(&root), Path::new(&path), &new_name)
}
#[tauri::command]
pub async fn studio_duplicate(root: String, path: String) -> Result<String, String> {
    super::duplicate(Path::new(&root), Path::new(&path))
}
#[tauri::command]
pub async fn studio_vault(root: String, max: usize) -> Result<VaultOut, String> {
    super::vault(Path::new(&root), max)
}
#[tauri::command]
pub async fn studio_memory_dir(repo: String, config_dir: Option<String>) -> String {
    super::memory_dir(&super::claude_dir(config_dir.as_deref()), &repo).to_string_lossy().into_owned()
}
#[tauri::command]
pub async fn draft_put(app: AppHandle, path: String, text: String, base_mtime: u64) -> Result<(), String> {
    super::draft_put(&drafts_dir(&app)?, &path, &text, base_mtime)
}
#[tauri::command]
pub async fn draft_get(app: AppHandle, path: String) -> Result<Option<Draft>, String> {
    Ok(super::draft_get(&drafts_dir(&app)?, &path))
}
#[tauri::command]
pub async fn draft_clear(app: AppHandle, path: String) -> Result<(), String> {
    super::draft_clear(&drafts_dir(&app)?, &path)
}
}

#[cfg(test)]
mod tests;
