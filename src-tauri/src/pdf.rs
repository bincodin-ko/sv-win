// 5묶음 E2 S-1849~S-1850, S-1853: Edge 헤드리스 print-to-pdf 자식 프로세스 + 파일 쓰기.
use std::collections::HashMap;
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
    if !html.contains("data-pg=") {
        return print(edge, work, &doc, out, timeout);
    }
    // S-3188: 1차로 쪽 위치를 알아내 목차에 번호를 채운 뒤 2차를 out 으로. 번호를 못 알면 1차 결과가 곧 out
    let pass1 = work.join("pass1.pdf");
    print(edge, work, &doc, &pass1, timeout)?;
    let map = dest_pages(&std::fs::read(&pass1).map_err(fail)?);
    if map.is_empty() {
        return std::fs::rename(&pass1, out).or_else(|_| std::fs::copy(&pass1, out).map(|_| ())).map_err(fail);
    }
    std::fs::write(&doc, fill_pages(html, &map)).map_err(fail)?;
    print(edge, work, &doc, out, timeout)
}

fn print(edge: &Path, work: &Path, doc: &Path, out: &Path, timeout: Duration) -> Result<(), String> {
    let mut cmd = std::process::Command::new(edge);
    cmd.args(edge_args(out, doc, &work.join("profile")));
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

/// 12묶음 Q6 S-3186: PDF 의 /Dests 이름 -> 쪽 번호(1부터). 압축 안 된 객체만 읽고, 못 읽으면 빈 표
pub fn dest_pages(pdf: &[u8]) -> HashMap<String, u32> {
    if pdf.len() > 50_000_000 {
        return HashMap::new(); // ponytail: 50MB 넘는 PDF 는 번호 없음. 필요하면 스트리밍 파서
    }
    let s = String::from_utf8_lossy(pdf);
    let mut objs: HashMap<u32, &str> = HashMap::new();
    for (i, _) in s.match_indices(" 0 obj") {
        let head = &s[..i];
        let digits = head.len() - head.trim_end_matches(|c: char| c.is_ascii_digit()).len();
        // 숫자가 맨 앞이 아니면(줄 중간) 객체 시작이 아님
        let Ok(n) = head[head.len() - digits..].parse::<u32>() else { continue };
        let start = i + 6;
        let end = s[start..].find("endobj").map_or(s.len(), |e| start + e);
        objs.insert(n, &s[start..end]);
    }
    let mut roots: Vec<_> = objs.iter().filter(|(_, b)| b.contains("/Type /Pages") && !b.contains("/Parent")).map(|(n, _)| *n).collect();
    roots.sort();
    let mut order = Vec::new();
    if let Some(r) = roots.first() {
        walk_pages(&objs, *r, &mut order, 0);
    }
    let page_of: HashMap<u32, u32> = order.iter().enumerate().map(|(i, n)| (*n, i as u32 + 1)).collect();
    let mut out = HashMap::new();
    let Some((_, body)) = objs.iter().filter(|(_, b)| b.contains("/Dests")).min_by_key(|(n, _)| **n) else { return out };
    let after = body[body.find("/Dests").unwrap() + 6..].trim_start();
    let dests = if after.starts_with("<<") {
        &after[2..after.find(">>").unwrap_or(after.len())]
    } else {
        match after.split_whitespace().next().and_then(|t| t.parse::<u32>().ok()).and_then(|n| objs.get(&n)) {
            Some(b) => b,
            None => return out,
        }
    };
    for seg in dests.split('/') {
        let name_end = seg.find(|c: char| c.is_whitespace() || c == '[').unwrap_or(seg.len());
        let Some(rest) = seg[name_end..].trim_start().strip_prefix('[') else { continue };
        if let Some(p) = rest.split_whitespace().next().and_then(|t| t.parse::<u32>().ok()).and_then(|m| page_of.get(&m)) {
            out.insert(seg[..name_end].to_string(), *p);
        }
    }
    out
}

fn walk_pages(objs: &HashMap<u32, &str>, n: u32, out: &mut Vec<u32>, depth: u8) {
    let Some(b) = objs.get(&n) else { return };
    if b.contains("/Type /Pages") {
        let Some(k) = b.find("/Kids") else { return };
        let list = &b[k + 5..];
        let list = &list[..list.find(']').unwrap_or(list.len())];
        let t: Vec<&str> = list.trim_start().trim_start_matches('[').split_whitespace().collect();
        for w in t.windows(3) {
            if depth < 20 && w[1] == "0" && w[2] == "R" {
                if let Ok(c) = w[0].parse() {
                    walk_pages(objs, c, out, depth + 1);
                }
            }
        }
    } else if b.contains("/Type /Page") {
        out.push(n);
    }
}

/// 12묶음 Q6 S-3187: 목차 자리표시자 `<span class="pg" data-pg="h-K">000</span>` 를 쪽 번호로 바꾼다(없는 이름은 빈 글)
pub fn fill_pages(html: &str, map: &HashMap<String, u32>) -> String {
    const OPEN: &str = "<span class=\"pg\" data-pg=\"";
    let mut out = String::new();
    let mut rest = html;
    while let Some(i) = rest.find(OPEN) {
        out += &rest[..i];
        let tail = &rest[i + OPEN.len()..];
        let (Some(q), Some(e)) = (tail.find('"'), tail.find("</span>")) else { out += &rest[i..]; return out };
        let num = map.get(&tail[..q]).map(|n| n.to_string()).unwrap_or_default();
        out += &format!("<span class=\"pg\">{num}</span>");
        rest = &tail[e + 7..];
    }
    out + rest
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
pub async fn pdf_temp_dir(app: tauri::AppHandle) -> Result<String, String> {
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
pub async fn export_write(path: String, bytes: Vec<u8>) -> Result<(), String> {
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

    // ---- 12묶음 Q6: 쪽 번호 ----

    /// 쪽 객체 번호는 일부러 거꾸로(30-i) — 쪽 순서는 Kids 순서여야 한다. nested 면 8개씩 중간 /Pages 노드
    fn mk_pdf(n: usize, dests: &[(&str, usize)], nested: bool, dests_ref: bool) -> Vec<u8> {
        let page = |i: usize| 30 - i;
        let refs = |r: std::ops::Range<usize>| r.map(|i| format!("{} 0 R", page(i))).collect::<Vec<_>>().join(" ");
        let d: String = dests.iter().map(|(k, i)| format!("/{k} [{} 0 R /XYZ 6 776.25 0]\n", page(*i))).collect();
        let dict = format!("<<\n{d}>>");
        let mut s = String::from("%PDF-1.4\n");
        s += &format!("1 0 obj\n<</Type /Catalog\n/Pages 2 0 R\n/Dests {}>>\nendobj\n", if dests_ref { "5 0 R".to_string() } else { dict.clone() });
        if dests_ref {
            s += &format!("5 0 obj\n{dict}\nendobj\n");
        }
        if nested {
            let groups: Vec<_> = (0..n).step_by(8).collect();
            let g: Vec<String> = groups.iter().enumerate().map(|(gi, _)| format!("{} 0 R", 40 + gi)).collect();
            s += &format!("2 0 obj\n<</Type /Pages\n/Count {n}\n/Kids [{}]>>\nendobj\n", g.join(" "));
            for (gi, a) in groups.iter().enumerate() {
                let b = (a + 8).min(n);
                s += &format!("{} 0 obj\n<</Type /Pages\n/Parent 2 0 R\n/Count {}\n/Kids [{}]>>\nendobj\n", 40 + gi, b - a, refs(*a..b));
            }
        } else {
            s += &format!("2 0 obj\n<</Type /Pages\n/Count {n}\n/Kids [{}]>>\nendobj\n", refs(0..n));
        }
        for i in 0..n {
            s += &format!("{} 0 obj\n<</Type /Page\n/Parent 2 0 R>>\nendobj\n", page(i));
        }
        s.into_bytes()
    }
    fn want(v: &[(&str, u32)]) -> HashMap<String, u32> {
        v.iter().map(|(k, n)| (k.to_string(), *n)).collect()
    }

    #[test]
    fn dest_pages_flat_kids_ref_and_direct() {
        for by_ref in [true, false] {
            let m = dest_pages(&mk_pdf(5, &[("h-0", 2), ("h-1", 4), ("h-12", 0)], false, by_ref));
            assert_eq!(m, want(&[("h-0", 3), ("h-1", 5), ("h-12", 1)]), "by_ref={by_ref}");
        }
    }

    #[test]
    fn dest_pages_nested_kids() {
        let m = dest_pages(&mk_pdf(20, &[("h-0", 0), ("h-3", 8), ("h-9", 19)], true, true));
        assert_eq!(m, want(&[("h-0", 1), ("h-3", 9), ("h-9", 20)]));
    }

    #[test]
    fn dest_pages_broken_input_is_empty() {
        assert!(dest_pages(b"").is_empty());
        assert!(dest_pages(b"%PDF-1.4\n1 0 obj\n<</Type /Catalog").is_empty());
        assert!(dest_pages(&[0xff, 0xfe, 0x00, 0x12]).is_empty());
        let mut b = mk_pdf(3, &[("h-0", 1)], false, true);
        b.truncate(b.len() / 3);
        assert!(dest_pages(&b).is_empty());
        assert!(dest_pages(&mk_pdf(3, &[], false, false)).is_empty()); // Dests 없는 PDF
    }

    #[test]
    fn fill_pages_known_and_unknown_names() {
        let h = r##"<li><a href="#h-0">A</a><span class="pg" data-pg="h-0">000</span></li><li><span class="pg" data-pg="h-7">000</span></li>"##;
        let out = fill_pages(h, &want(&[("h-0", 12)]));
        assert_eq!(out, r##"<li><a href="#h-0">A</a><span class="pg">12</span></li><li><span class="pg"></span></li>"##);
        assert_eq!(fill_pages("<p>x</p>", &want(&[("h-0", 1)])), "<p>x</p>");
    }

    /// 가짜 Edge: 호출마다 c<N>.html 에 doc.html 을 복사, p<N>.pdf 가 있으면 그것을 없으면 %PDF-fake 를 출력. f<N>.txt 가 있으면 N번째 호출은 실패
    #[cfg(windows)]
    fn two_pass_fake(d: &Path) -> PathBuf {
        let fake = d.join("fake2.cmd");
        fs::write(&fake, "@echo off\r\nsetlocal enabledelayedexpansion\r\nset \"tag=1\"\r\nif exist \"%~dp0c1.html\" set \"tag=2\"\r\nfor %%a in (%*) do (\r\n  set \"t=%%~a\"\r\n  if \"!t:~0,8!\"==\"file:///\" set \"doc=!t:~8!\"\r\n  if \"!t:~0,15!\"==\"--print-to-pdf=\" set \"o=!t:~15!\"\r\n)\r\ntype \"!doc:/=\\!\" > \"%~dp0c!tag!.html\"\r\nif exist \"%~dp0f!tag!.txt\" (echo boom 1>&2 & exit /b 3)\r\nif exist \"%~dp0p!tag!.pdf\" (copy /y \"%~dp0p!tag!.pdf\" \"!o!\" >nul) else (echo %%PDF-fake> \"!o!\")\r\nexit /b 0\r\n").unwrap();
        fake
    }
    const TOC: &str = r##"<ol><li><a href="#h-0">A</a><span class="pg" data-pg="h-0">000</span></li></ol>"##;

    #[cfg(windows)]
    #[test]
    fn one_print_without_placeholders() {
        let d = tmp("q6-none");
        let (work, out) = (d.join("work"), d.join("out.pdf"));
        fs::create_dir_all(&work).unwrap();
        export_with(Some(&two_pass_fake(&d)), &work, "<p>hi</p>", &out, "a4", Duration::from_secs(20)).unwrap();
        assert!(d.join("c1.html").exists() && !d.join("c2.html").exists(), "인쇄는 한 번이어야 함");
        assert!(fs::read(&out).unwrap().starts_with(b"%PDF-fake"));
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn one_print_when_first_pass_has_no_dests() {
        let d = tmp("q6-nodests");
        let (work, out) = (d.join("work"), d.join("out.pdf"));
        fs::create_dir_all(&work).unwrap();
        export_with(Some(&two_pass_fake(&d)), &work, TOC, &out, "a4", Duration::from_secs(20)).unwrap();
        assert!(d.join("c1.html").exists() && !d.join("c2.html").exists(), "Dests 없으면 한 번이어야 함");
        assert!(fs::read(&out).unwrap().starts_with(b"%PDF-fake"), "1차 결과가 out 이어야 함");
        assert!(no_work_dirs(&work));
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn two_prints_fill_numbers_into_second_doc() {
        let d = tmp("q6-two");
        let (work, out) = (d.join("work"), d.join("out.pdf"));
        fs::create_dir_all(&work).unwrap();
        fs::write(d.join("p1.pdf"), mk_pdf(5, &[("h-0", 3)], false, true)).unwrap();
        export_with(Some(&two_pass_fake(&d)), &work, TOC, &out, "a4", Duration::from_secs(20)).unwrap();
        let (c1, c2) = (fs::read_to_string(d.join("c1.html")).unwrap(), fs::read_to_string(d.join("c2.html")).unwrap());
        assert!(c1.contains(r#"data-pg="h-0">000"#), "{c1}");
        assert!(c2.contains(r#"<span class="pg">4</span>"#) && !c2.contains("data-pg"), "{c2}");
        assert!(fs::read(&out).unwrap().starts_with(b"%PDF-fake"));
        assert!(no_work_dirs(&work));
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(windows)]
    #[test]
    fn second_print_failure_deletes_out() {
        let d = tmp("q6-fail2");
        let (work, out) = (d.join("work"), d.join("out.pdf"));
        fs::create_dir_all(&work).unwrap();
        fs::write(d.join("p1.pdf"), mk_pdf(5, &[("h-0", 3)], false, true)).unwrap();
        fs::write(d.join("f2.txt"), "x").unwrap();
        let e = export_with(Some(&two_pass_fake(&d)), &work, TOC, &out, "a4", Duration::from_secs(20)).unwrap_err();
        assert_eq!(e, "PDF export failed: boom");
        assert!(!out.exists() && no_work_dirs(&work));
        let _ = fs::remove_dir_all(&d);
    }

    /// 진짜 Edge: 제목 12개 -> 결과 PDF 의 Dests 쪽 = 목차에 쓸 번호(표지 1, 목차 2, h-K = 3+K), 개요 있음. `cargo test pdf -- --ignored`
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn real_edge_two_pass_dest_pages_match() {
        let d = tmp("q6-real");
        let li: String = (0..12).map(|k| format!(r##"<li><a href="#h-{k}">Head {k}</a><span class="pg" data-pg="h-{k}">000</span></li>"##)).collect();
        let hs: String = (0..12).map(|k| format!(r#"<h2 id="h-{k}">Head {k}</h2><p>text</p>"#)).collect();
        let html = format!("<!doctype html><meta charset=utf-8><style>@page{{size:8.5in 11in;margin:0.9in 1in}}.cover,.toc{{break-after:page}}h2{{break-before:page}}.toc ol{{list-style:none;padding:0}}.toc li{{display:flex}}.pg[data-pg]{{visibility:hidden}}</style><section class=cover>Cover</section><section class=toc><ol>{li}</ol></section><main>{hs}</main>");
        let out = d.join("real.pdf");
        let edge = find_edge_with(std::env::var("SYMVIBE_EDGE").ok(), &|| None, Path::new("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"));
        export_with(edge.as_deref(), &d, &html, &out, "letter", Duration::from_secs(60)).unwrap();
        let b = fs::read(&out).unwrap();
        let m = dest_pages(&b);
        for k in 0..12u32 {
            assert_eq!(m.get(&format!("h-{k}")), Some(&(3 + k)), "h-{k}: {m:?}");
        }
        assert!(String::from_utf8_lossy(&b).contains("/Type /Outlines"), "개요 없음");
        let _ = fs::remove_dir_all(&d);
    }
}
