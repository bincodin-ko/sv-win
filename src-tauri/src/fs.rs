// C2 S-966: 파일 Rust 명령(읽기·복사·저장·열기·휴지통)
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{ipc::Response, AppHandle, Manager};

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub exists: bool,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: u64,
}

/// file_text 결과: 글 / 바이너리 / 너무 큼 / 오류
#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileText {
    Text { text: String },
    Binary,
    TooLarge,
    Error { message: String },
}

/// dir 안에서 name 이 이미 있으면 확장자 앞에 -2, -3 … 을 붙인 겹치지 않는 경로
pub fn unique_name(dir: &Path, name: &str) -> PathBuf {
    let p = dir.join(name);
    if !p.exists() {
        return p;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => name.split_at(i),
        _ => (name, ""),
    };
    (2..).map(|n| dir.join(format!("{stem}-{n}{ext}"))).find(|p| !p.exists()).unwrap()
}

const HEAD: usize = 8192;

/// 앞 8KB 에 NUL 이 없고 UTF-8 이면 글 파일(8KB 에서 잘린 글자는 봐 준다)
pub fn is_text(bytes: &[u8]) -> bool {
    let head = &bytes[..bytes.len().min(HEAD)];
    if head.contains(&0) {
        return false;
    }
    match std::str::from_utf8(head) {
        Ok(_) => true,
        Err(e) => e.error_len().is_none() && bytes.len() > HEAD,
    }
}

fn head_is_text(path: &Path) -> bool {
    use std::io::Read;
    let mut buf = Vec::with_capacity(HEAD + 1);
    // 잘린 글자를 봐 주려고 1바이트 더 읽어 "뒤에 더 있음"을 알린다
    std::fs::File::open(path).and_then(|f| f.take(HEAD as u64 + 1).read_to_end(&mut buf)).is_ok() && is_text(&buf)
}

pub fn file_text_at(path: &Path, max_bytes: u64) -> FileText {
    let err = |e: std::io::Error| FileText::Error { message: e.to_string() };
    let md = match std::fs::metadata(path) {
        Ok(m) if m.is_file() => m,
        Ok(_) => return FileText::Error { message: "not a file".into() },
        Err(e) => return err(e),
    };
    if md.len() > max_bytes {
        return FileText::TooLarge;
    }
    match std::fs::read(path) {
        Ok(b) if is_text(&b) => String::from_utf8(b).map(|text| FileText::Text { text }).unwrap_or(FileText::Binary),
        Ok(_) => FileText::Binary,
        Err(e) => err(e),
    }
}

/// 폴더 바로 아래의 글 파일 경로를 이름순(대소문자 무시)으로 최대 max 개
pub fn dir_files_at(dir: &Path, max: usize) -> Vec<String> {
    let Ok(rd) = std::fs::read_dir(dir) else { return vec![] };
    let mut v: Vec<PathBuf> = rd.flatten().filter(|e| e.file_type().is_ok_and(|t| t.is_file())).map(|e| e.path()).collect();
    v.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()));
    v.into_iter().filter(|p| head_is_text(p)).take(max).map(|p| p.to_string_lossy().into_owned()).collect()
}

fn copy_rec(src: &Path, dst: &Path) -> std::io::Result<()> {
    if src.is_dir() {
        std::fs::create_dir_all(dst)?;
        for e in std::fs::read_dir(src)? {
            let e = e?;
            copy_rec(&e.path(), &dst.join(e.file_name()))?;
        }
        Ok(())
    } else {
        std::fs::copy(src, dst).map(|_| ())
    }
}

/// src 를 dest_dir 로 복사(덮어쓰지 않고 -2, -3). 만든 경로를 돌려준다
pub fn copy_into(src: &Path, dest_dir: &Path) -> Result<PathBuf, String> {
    let e = |e: std::io::Error| e.to_string();
    std::fs::metadata(src).map_err(e)?;
    let name = src.file_name().ok_or("no file name")?.to_string_lossy().into_owned();
    std::fs::create_dir_all(dest_dir).map_err(e)?;
    let to = unique_name(dest_dir, &name);
    copy_rec(src, &to).map_err(e)?;
    Ok(to)
}

pub fn save_image_in(dir: &Path, bytes: &[u8], hint: &str) -> Result<PathBuf, String> {
    let e = |e: std::io::Error| e.to_string();
    let name = Path::new(hint).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "image.png".into());
    std::fs::create_dir_all(dir).map_err(e)?;
    let to = unique_name(dir, &name);
    std::fs::write(&to, bytes).map_err(e)?;
    Ok(to)
}

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    std::os::windows::ffi::OsStrExt::encode_wide(std::ffi::OsStr::new(s)).chain(Some(0)).collect()
}

/// 기본 앱(파일) / 기본 브라우저(주소)로 연다
fn shell_open(target: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        let r = unsafe { ShellExecuteW(std::ptr::null_mut(), wide("open").as_ptr(), wide(target).as_ptr(), std::ptr::null(), std::ptr::null(), 1) };
        if (r as usize) > 32 { Ok(()) } else { Err(format!("열 수 없음 ({})", r as usize)) }
    }
    #[cfg(not(windows))]
    {
        let _ = target;
        Err("Windows 전용".into())
    }
}

// ---- Tauri 명령 ----
#[tauri::command]
pub async fn file_read(path: String) -> Result<Response, String> {
    std::fs::read(path).map(Response::new).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn file_stat(path: String) -> FileStat {
    match std::fs::metadata(&path) {
        Ok(m) => FileStat {
            exists: true,
            is_dir: m.is_dir(),
            size: m.len(),
            mtime: m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64),
        },
        Err(_) => FileStat { exists: false, is_dir: false, size: 0, mtime: 0 },
    }
}

#[tauri::command]
pub async fn file_text(path: String, max_bytes: u64) -> FileText {
    file_text_at(Path::new(&path), max_bytes)
}

#[tauri::command]
pub async fn dir_files(path: String, max: usize) -> Vec<String> {
    dir_files_at(Path::new(&path), max)
}

#[tauri::command]
pub async fn file_copy_into(src: String, dest_dir: String) -> Result<String, String> {
    copy_into(Path::new(&src), Path::new(&dest_dir)).map(|p| p.to_string_lossy().into_owned())
}

/// S-883: <앱 데이터>/Screenshots 에 저장하고 파일 이름만 돌려준다
pub fn save_shot(app_data: &Path, bytes: &[u8], hint: &str) -> Result<String, String> {
    let p = save_image_in(&app_data.join("Screenshots"), bytes, hint)?;
    Ok(p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default())
}

#[tauri::command]
pub async fn image_save(app: AppHandle, bytes: Vec<u8>, hint: String) -> Result<String, String> {
    save_shot(&app.path().app_data_dir().map_err(|e| e.to_string())?, &bytes, &hint)
}

#[tauri::command]
pub async fn fs_open(path: String) -> Result<(), String> {
    // F2 S-2233: Windows 설정 쪽지(ms-settings:privacy-microphone)는 파일이 아니라 주소 — 이것만 존재 검사 없이 연다
    if path.starts_with("ms-settings:") {
        return shell_open(&path);
    }
    if !Path::new(&path).exists() {
        return Err("not found".into());
    }
    shell_open(&path)
}

#[tauri::command]
pub async fn fs_reveal(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err("not found".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // explorer 는 / 를 모르고, 성공해도 종료 코드가 1 이라 띄우기만 한다
        let p = path.replace('/', "\\");
        std::process::Command::new("explorer.exe").raw_arg(format!("/select,\"{p}\"")).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    Err("Windows 전용".into())
}

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    crate::web::check_http(&url)?;
    shell_open(&url)
}

/// 휴지통으로 보낸다(복구 가능). 절대 경로만 — 상대 경로는 SHFileOperation 이 휴지통을 건너뛸 수 있다
#[tauri::command]
pub async fn trash_move(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || trash_move_sync(path)).await.map_err(|e| e.to_string())?
}

pub fn trash_move_sync(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Shell::{SHFileOperationW, SHFILEOPSTRUCTW};
        let p = path.replace('/', "\\");
        if !Path::new(&p).is_absolute() || !Path::new(&p).exists() {
            return Err("not an existing absolute path".into());
        }
        let mut from = wide(&p);
        from.push(0); // 이중 NUL
        let mut op: SHFILEOPSTRUCTW = unsafe { std::mem::zeroed() };
        op.wFunc = 3; // FO_DELETE
        op.pFrom = from.as_ptr();
        op.fFlags = (0x40 | 0x10 | 0x4 | 0x400) as _; // ALLOWUNDO | NOCONFIRMATION | SILENT | NOERRORUI
        let r = unsafe { SHFileOperationW(&mut op) };
        if r != 0 || op.fAnyOperationsAborted != 0 { Err(format!("휴지통 실패 ({r})")) } else { Ok(()) }
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Windows 전용".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-c2-{}-{tag}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn unique_name_suffixes_before_extension() {
        let d = tmp("uniq");
        assert_eq!(unique_name(&d, "a.png"), d.join("a.png"));
        fs::write(d.join("a.png"), b"x").unwrap();
        assert_eq!(unique_name(&d, "a.png"), d.join("a-2.png"));
        fs::write(d.join("a-2.png"), b"x").unwrap();
        assert_eq!(unique_name(&d, "a.png"), d.join("a-3.png"));
        fs::write(d.join("noext"), b"x").unwrap();
        assert_eq!(unique_name(&d, "noext"), d.join("noext-2"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn is_text_rules() {
        assert!(is_text("안녕 hello".as_bytes()));
        assert!(is_text(b""));
        assert!(!is_text(b"ab\0cd"));
        assert!(!is_text(&[0xff, 0xfe, 0x41]));
        // 8KB 경계에서 잘린 한글은 글로 본다
        let mut v = vec![b'a'; 8191];
        v.extend("가".as_bytes());
        assert!(is_text(&v));
        // 8KB 뒤의 NUL 은 보지 않는다
        let mut w = vec![b'a'; 8192];
        w.push(0);
        assert!(is_text(&w));
    }

    #[test]
    fn file_text_kinds() {
        let d = tmp("ft");
        fs::write(d.join("t.txt"), "hi 안녕").unwrap();
        fs::write(d.join("b.bin"), [1u8, 0, 2]).unwrap();
        fs::write(d.join("big.txt"), vec![b'a'; 800 * 1024 + 1]).unwrap();
        assert_eq!(file_text_at(&d.join("t.txt"), 800 * 1024), FileText::Text { text: "hi 안녕".into() });
        assert_eq!(file_text_at(&d.join("b.bin"), 800 * 1024), FileText::Binary);
        assert_eq!(file_text_at(&d.join("big.txt"), 800 * 1024), FileText::TooLarge);
        assert!(matches!(file_text_at(&d.join("none.txt"), 800 * 1024), FileText::Error { .. }));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn dir_files_sorted_limited_text_only() {
        let d = tmp("df");
        for n in ["b.md", "a.md", "c.md", "d.md"] {
            fs::write(d.join(n), "x").unwrap();
        }
        fs::write(d.join("0.bin"), [0u8, 1]).unwrap();
        fs::create_dir_all(d.join("sub")).unwrap();
        fs::write(d.join("sub").join("z.md"), "x").unwrap();
        let all = dir_files_at(&d, 10);
        let names: Vec<_> = all.iter().map(|p| Path::new(p).file_name().unwrap().to_str().unwrap().to_string()).collect();
        assert_eq!(names, ["a.md", "b.md", "c.md", "d.md"]);
        assert_eq!(dir_files_at(&d, 2).len(), 2);
        assert_eq!(dir_files_at(&d, 2)[0], d.join("a.md").to_string_lossy());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn copy_into_never_overwrites() {
        let d = tmp("cp");
        let dest = d.join("dest");
        fs::create_dir_all(&dest).unwrap();
        fs::write(d.join("f.txt"), "new").unwrap();
        fs::write(dest.join("f.txt"), "old").unwrap();
        let p = copy_into(&d.join("f.txt"), &dest).unwrap();
        assert_eq!(p, dest.join("f-2.txt"));
        assert_eq!(fs::read_to_string(dest.join("f.txt")).unwrap(), "old");
        assert_eq!(fs::read_to_string(&p).unwrap(), "new");
        assert_eq!(copy_into(&d.join("f.txt"), &dest).unwrap(), dest.join("f-3.txt"));
        assert!(copy_into(&d.join("none.txt"), &dest).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn image_save_under_dir_without_overwrite() {
        let d = tmp("img");
        let shots = d.join("Screenshots");
        let a = save_image_in(&shots, b"one", "shot.png").unwrap();
        let b = save_image_in(&shots, b"two", "shot.png").unwrap();
        assert_eq!(a, shots.join("shot.png"));
        assert_eq!(b, shots.join("shot-2.png"));
        assert_eq!(fs::read(&a).unwrap(), b"one");
        // 힌트에 경로가 섞여도 폴더 밖으로 나가지 않는다
        let c = save_image_in(&shots, b"x", "../../evil.png").unwrap();
        assert_eq!(c.parent().unwrap(), shots);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn save_shot_returns_file_name_under_app_data() {
        let d = tmp("shot");
        assert_eq!(save_shot(&d, b"one", "shot-1.png").unwrap(), "shot-1.png");
        assert_eq!(save_shot(&d, b"two", "shot-1.png").unwrap(), "shot-1-2.png");
        assert_eq!(fs::read(d.join("Screenshots").join("shot-1.png")).unwrap(), b"one");
        assert_eq!(fs::read(d.join("Screenshots").join("shot-1-2.png")).unwrap(), b"two");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn open_url_rejects_non_http() {
        assert!(tauri::async_runtime::block_on(open_url("file:///C:/Windows/notepad.exe".into())).is_err());
        assert!(tauri::async_runtime::block_on(open_url("javascript:alert(1)".into())).is_err());
        assert!(tauri::async_runtime::block_on(open_url("C:\\Windows\\notepad.exe".into())).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn trash_move_removes_temp_file() {
        let d = tmp("trash");
        let f = d.join("gone.txt");
        fs::write(&f, "x").unwrap();
        trash_move_sync(f.to_string_lossy().into_owned()).unwrap();
        assert!(!f.exists());
        let _ = fs::remove_dir_all(&d);
    }
}
