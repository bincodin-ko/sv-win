// 5묶음 E2 S-1849~S-1850, S-1853: Edge 헤드리스 print-to-pdf 자식 프로세스 + 파일 쓰기.
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const NO_EDGE: &str = "Microsoft Edge was not found. Export Markdown instead.";
const EDGE_REL: &str = "Microsoft/Edge/Application/msedge.exe";

/// Edge 위치: SYMVIBE_EDGE → 레지스트리 App Paths → Program Files (x86). 있는 파일만 인정한다
pub fn find_edge_with(env: Option<String>, reg: &dyn Fn() -> Option<PathBuf>, pf86: &Path) -> Option<PathBuf> {
    env.map(PathBuf::from).filter(|p| p.is_file()).or_else(|| reg().filter(|p| p.is_file())).or_else(|| Some(pf86.to_path_buf()).filter(|p| p.is_file()))
}

pub fn find_edge() -> Option<PathBuf> {
    let pf = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:/Program Files (x86)".into());
    find_edge_with(std::env::var("SYMVIBE_EDGE").ok(), &registry_edge, &Path::new(&pf).join(EDGE_REL))
}

#[cfg(windows)]
fn registry_edge() -> Option<PathBuf> {
    use winreg::{enums::*, RegKey};
    let k = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe").ok()?;
    k.get_value::<String, _>("").ok().map(PathBuf::from)
}
#[cfg(not(windows))]
fn registry_edge() -> Option<PathBuf> {
    None
}

/// 쪽 번호·북마크는 Edge 에서 직접 확인함(--generate-pdf-document-outline 이 있어야 개요가 나온다; @page 가장자리 상자는 기본으로 먹는다)
pub fn edge_args(out: &Path, html: &Path, profile: &Path) -> Vec<OsString> {
    let url = format!("file:///{}", html.to_string_lossy().replace('\\', "/").replace(' ', "%20"));
    let mut a: Vec<OsString> = ["--headless=new", "--disable-gpu", "--no-first-run", "--no-pdf-header-footer", "--generate-pdf-document-outline"].map(Into::into).to_vec();
    a.push(format!("--user-data-dir={}", profile.display()).into());
    a.push(format!("--print-to-pdf={}", out.display()).into());
    a.push(url.into());
    a
}

fn fail(m: impl std::fmt::Display) -> String {
    format!("PDF export failed: {m}")
}

static SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// html 을 work_root/pdf-<PID>-<n>/doc.html 로 쓰고 Edge 를 돌려 out 에 PDF 를 만든다. 실패하면 out 을 지우고, 임시 폴더는 언제나 지운다
pub fn export_with(edge: Option<&Path>, work_root: &Path, html: &str, out: &Path, paper: &str, timeout: Duration) -> Result<(), String> {
    let edge = edge.ok_or_else(|| NO_EDGE.to_string())?;
    if paper != "letter" && paper != "a4" {
        return Err(fail("unknown paper size"));
    }
    let work = work_root.join(format!("pdf-{}-{}", std::process::id(), SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    let r = run_in(edge, &work, html, out, timeout);
    let _ = std::fs::remove_dir_all(&work);
    if r.is_err() {
        let _ = std::fs::remove_file(out);
    }
    r
}

fn run_in(edge: &Path, work: &Path, html: &str, out: &Path, timeout: Duration) -> Result<(), String> {
    std::fs::create_dir_all(work).map_err(fail)?;
    let doc = work.join("doc.html");
    std::fs::write(&doc, html).map_err(fail)?;
    let _ = std::fs::remove_file(out); // 옛 파일이 성공으로 보이지 않게
    let mut cmd = std::process::Command::new(edge);
    cmd.args(edge_args(out, &doc, &work.join("profile")));
    // ponytail: 끄는 것은 이 자식 PID 하나(Edge 가 낳은 손자는 그대로) — 헤드리스는 보통 부모가 끝나며 정리됨
    match crate::gh::run_timeout(&mut cmd, timeout) {
        None => Err(fail(format!("timed out after {}s or Edge could not start", timeout.as_secs().max(1)))),
        Some((ok, text)) => {
            if ok && std::fs::metadata(out).map(|m| m.len() > 0).unwrap_or(false) {
                Ok(())
            } else {
                Err(fail(text.lines().rev().map(str::trim).find(|l| !l.is_empty()).unwrap_or("Edge produced no file")))
            }
        }
    }
}

/// PDF·Markdown 공용 파일 쓰기. 부모 폴더가 있어야 한다(덮어쓰기는 저장 창이 이미 물었다)
pub fn export_write_at(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if !path.parent().map(|p| p.as_os_str().is_empty() || p.is_dir()).unwrap_or(false) {
        return Err("folder not found".into());
    }
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

// ---- Tauri 명령 ----
fn temp_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("Temp"))
}

/// 쪽 미리보기 임시 PDF 를 둘 폴더(%APPDATA%/com.symvibe.win/Temp, 없으면 만든다)
#[tauri::command]
pub fn pdf_temp_dir(app: tauri::AppHandle) -> Result<String, String> {
    let d = temp_root(&app)?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn pdf_export(app: tauri::AppHandle, html: String, out_path: String, paper: String) -> Result<(), String> {
    let root = temp_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        export_with(find_edge().as_deref(), &root, &html, Path::new(&out_path), &paper, Duration::from_secs(60))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn export_write(path: String, bytes: Vec<u8>) -> Result<(), String> {
    export_write_at(Path::new(&path), &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-e2-{}-{tag}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn touch(p: &Path) -> PathBuf {
        fs::write(p, "x").unwrap();
        p.to_path_buf()
    }

    #[test]
    fn edge_order_env_then_registry_then_program_files() {
        let d = tmp("order");
        let (env, reg, pf) = (touch(&d.join("env.exe")), touch(&d.join("reg.exe")), touch(&d.join("pf.exe")));
        let rg = || Some(reg.clone());
        assert_eq!(find_edge_with(Some(env.to_string_lossy().into()), &rg, &pf), Some(env.clone()));
        // 환경 변수가 없는 파일을 가리키면 건너뛴다
        assert_eq!(find_edge_with(Some("C:/nope/x.exe".into()), &rg, &pf), Some(reg.clone()));
        assert_eq!(find_edge_with(None, &|| None, &pf), Some(pf.clone()));
        assert_eq!(find_edge_with(None, &|| Some(d.join("ghost.exe")), &pf), Some(pf.clone()));
        assert_eq!(find_edge_with(None, &|| None, &d.join("ghost2.exe")), None);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn args_follow_spec() {
        let a: Vec<String> = edge_args(Path::new("C:/o/out.pdf"), Path::new("C:/w/pdf-1/doc.html"), Path::new("C:/w/pdf-1/profile"))
            .into_iter()
            .map(|s| s.to_string_lossy().into_owned())
            .collect();
        for want in ["--headless=new", "--disable-gpu", "--no-first-run", "--no-pdf-header-footer", "--generate-pdf-document-outline"] {
            assert!(a.iter().any(|x| x == want), "{want} 없음: {a:?}");
        }
        assert!(a.iter().any(|x| x == "--user-data-dir=C:/w/pdf-1/profile"), "{a:?}");
        assert!(a.iter().any(|x| x == "--print-to-pdf=C:/o/out.pdf"), "{a:?}");
        assert_eq!(a.last().unwrap(), "file:///C:/w/pdf-1/doc.html");
    }

    #[test]
    fn missing_edge_message_and_bad_paper() {
        let d = tmp("noedge");
        assert_eq!(export_with(None, &d, "<p>", &d.join("o.pdf"), "letter", Duration::from_secs(1)), Err(NO_EDGE.to_string()));
        let fake = touch(&d.join("e.exe"));
        let e = export_with(Some(&fake), &d, "<p>", &d.join("o.pdf"), "tabloid", Duration::from_secs(1)).unwrap_err();
        assert!(e.starts_with("PDF export failed:"), "{e}");
        let _ = fs::remove_dir_all(&d);
    }

    fn no_work_dirs(root: &Path) -> bool {
        fs::read_dir(root).unwrap().filter_map(|e| e.ok()).all(|e| !e.file_name().to_string_lossy().starts_with("pdf-"))
    }

    #[cfg(windows)]
    #[test]
    fn fake_edge_gets_args_writes_pdf_and_cleans_up() {
        let d = tmp("fake-ok");
        let work = d.join("work");
        fs::create_dir_all(&work).unwrap();
        // 인자를 args.txt 에 남기고 --print-to-pdf= 뒤 경로에 %PDF 를 쓴다
        let fake = d.join("fake.cmd");
        fs::write(&fake, "@echo off\r\nsetlocal enabledelayedexpansion\r\necho %*> \"%~dp0args.txt\"\r\nset \"m=%%PDF-fake\"\r\nfor %%a in (%*) do (\r\n  set \"t=%%~a\"\r\n  if \"!t:~0,15!\"==\"--print-to-pdf=\" echo !m!> \"!t:~15!\"\r\n)\r\nexit /b 0\r\n").unwrap();
        let out = d.join("out.pdf");
        export_with(Some(&fake), &work, "<p>hi</p>", &out, "a4", Duration::from_secs(20)).unwrap();
        assert!(fs::read(&out).unwrap().starts_with(b"%PDF"));
        let args = fs::read_to_string(d.join("args.txt")).unwrap();
        for want in ["--headless=new", "--print-to-pdf=", "file:///", "doc.html", "--user-data-dir="] {
            assert!(args.contains(want), "{want} 없음: {args}");
        }
        assert!(no_work_dirs(&work), "임시 폴더가 남음");
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn fake_edge_failure_deletes_output_and_reports_last_line() {
        let d = tmp("fake-fail");
        let work = d.join("work");
        fs::create_dir_all(&work).unwrap();
        let fake = d.join("fail.cmd");
        fs::write(&fake, "@echo off\r\necho first line 1>&2\r\necho boom happened 1>&2\r\nexit /b 3\r\n").unwrap();
        let out = d.join("out.pdf");
        fs::write(&out, "half").unwrap();
        let e = export_with(Some(&fake), &work, "<p>", &out, "letter", Duration::from_secs(20)).unwrap_err();
        assert_eq!(e, "PDF export failed: boom happened");
        assert!(!out.exists(), "실패했는데 출력 파일이 남음");
        assert!(no_work_dirs(&work));
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn fake_edge_exit_zero_without_file_is_failure() {
        let d = tmp("fake-nofile");
        let fake = d.join("nop.cmd");
        fs::write(&fake, "@echo off\r\nexit /b 0\r\n").unwrap();
        let e = export_with(Some(&fake), &d, "<p>", &d.join("o.pdf"), "letter", Duration::from_secs(20)).unwrap_err();
        assert!(e.starts_with("PDF export failed:"), "{e}");
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn fake_edge_timeout_kills_and_cleans() {
        let d = tmp("fake-slow");
        let work = d.join("work");
        fs::create_dir_all(&work).unwrap();
        let fake = d.join("slow.cmd");
        fs::write(&fake, "@echo off\r\nping -n 8 127.0.0.1 >nul\r\n").unwrap();
        let out = d.join("out.pdf");
        let t = std::time::Instant::now();
        let e = export_with(Some(&fake), &work, "<p>", &out, "letter", Duration::from_millis(800)).unwrap_err();
        assert!(e.starts_with("PDF export failed:") && e.contains("timed out"), "{e}");
        assert!(t.elapsed() < Duration::from_secs(6), "제한 시간 뒤에도 기다림");
        assert!(!out.exists());
        assert!(no_work_dirs(&work));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn export_write_requires_parent_folder() {
        let d = tmp("write");
        assert!(export_write_at(&d.join("no/such/a.md"), b"x").is_err());
        export_write_at(&d.join("a.md"), "한글".as_bytes()).unwrap();
        assert_eq!(fs::read_to_string(d.join("a.md")).unwrap(), "한글");
        let _ = fs::remove_dir_all(&d);
    }

    /// 진짜 Edge: 쪽 수 >= 2, %PDF, 북마크(개요). `cargo test --lib pdf -- --ignored`
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn real_edge_makes_multi_page_pdf_with_outline() {
        let d = tmp("real");
        let html = "<!doctype html><meta charset=utf-8><style>@page{size:8.5in 11in;margin:0.9in 1in;@bottom-center{content:counter(page)}}h1,h2{break-before:page}</style><h1>One</h1><h2>Two</h2><h2>Three</h2>";
        let out = d.join("real.pdf");
        let edge = find_edge_with(std::env::var("SYMVIBE_EDGE").ok(), &|| None, Path::new("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"));
        export_with(edge.as_deref(), &d, html, &out, "letter", Duration::from_secs(60)).unwrap();
        let b = fs::read(&out).unwrap();
        assert!(b.starts_with(b"%PDF"));
        let s = String::from_utf8_lossy(&b);
        let pages = s.matches("/Type /Page").count() - s.matches("/Type /Pages").count();
        assert!(pages >= 2, "쪽 수 {pages}");
        assert!(s.contains("/Outlines"), "북마크 개요 없음");
        let _ = fs::remove_dir_all(&d);
    }
}
