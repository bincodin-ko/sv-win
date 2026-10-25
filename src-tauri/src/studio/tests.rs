use super::*;
use std::fs;

fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("symvibe-studio-{tag}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}
fn names(v: &[Entry]) -> Vec<&str> { v.iter().map(|e| e.name.as_str()).collect() }

#[test]
fn skip_rules_s1814() {
    for d in ["node_modules", ".git", "build", "dist", ".next", "venv", ".venv", "target", "vendor", "coverage", "DerivedData", "Pods", "__pycache__", "out", ".gradle", ".idea", ".vs", "bin", "obj", ".cache", ".turbo", ".anything"] {
        assert!(skip_dir(d), "{d}");
    }
    assert!(!skip_dir("src") && !skip_dir("docs"));
    for f in [".gitignore", ".gitattributes", ".env.example", ".editorconfig", ".prettierrc", ".nvmrc", ".dockerignore", "a.txt"] {
        assert!(show_file(f), "{f}");
    }
    assert!(!show_file(".env") && !show_file(".DS_Store"));
}

#[test]
fn tree_sorts_and_hides() {
    let r = tmp("tree");
    for d in ["Zeta", "alpha", "node_modules", ".git", ".hid"] { fs::create_dir(r.join(d)).unwrap(); }
    for (f, b) in [("b.txt", &b"hi"[..]), ("A.md", b"x"), (".gitignore", b"t"), (".secret", b"s"), ("bin.dat", &[0u8, 1, 2][..])] { fs::write(r.join(f), b).unwrap(); }
    let t = tree(&r, &r).unwrap();
    assert_eq!(names(&t), ["alpha", "Zeta", ".gitignore", "A.md", "b.txt"]);
    assert!(t[0].is_dir && !t[3].is_dir && t[4].size == 2);
    assert!(t[3].path.replace('\\', "/").ends_with("/A.md"));
}

#[test]
fn read_encodings() {
    let r = tmp("read");
    fs::write(r.join("u.txt"), b"\xEF\xBB\xBFhi").unwrap();
    let o = read_file(&r, &r.join("u.txt")).unwrap();
    assert_eq!((o.text.as_deref(), o.encoding.as_str(), o.bom, o.crlf, o.bytes, o.outside), (Some("hi"), "utf-8", true, false, 5, false));
    assert!(o.mtime_ms > 0);
    fs::write(r.join("w.txt"), b"caf\xe9\r\nx").unwrap();
    let o = read_file(&r, &r.join("w.txt")).unwrap();
    assert_eq!((o.text.as_deref(), o.encoding.as_str(), o.bom, o.crlf), (Some("café\nx"), "windows-1252", false, true));
    fs::write(r.join("c.txt"), "한글 ok\n").unwrap();
    let o = read_file(&r, &r.join("c.txt")).unwrap();
    assert_eq!((o.text.as_deref(), o.encoding.as_str()), (Some("한글 ok\n"), "utf-8"));
    fs::write(r.join("b.bin"), [0u8, 1, 2]).unwrap();
    assert_eq!(read_file(&r, &r.join("b.bin")).unwrap().unreadable.as_deref(), Some("binary"));
    fs::write(r.join("big.txt"), "x".repeat(11)).unwrap();
    assert_eq!(read_file_max(&r, &r.join("big.txt"), 10).unwrap().unreadable.as_deref(), Some("large"));
}

#[test]
fn write_preserves_encoding() {
    let r = tmp("write");
    let p = r.join("w.txt");
    write_file(&r, &p, "café\nx", "windows-1252", false, true, None, false, false).unwrap();
    assert_eq!(fs::read(&p).unwrap(), b"caf\xe9\r\nx");
    write_file(&r, &p, "a\r\nb", "utf-8", true, false, None, false, false).unwrap();
    assert_eq!(fs::read(&p).unwrap(), b"\xEF\xBB\xBFa\nb");
    let e = write_file(&r, &p, "한", "windows-1252", false, false, None, false, false).unwrap_err();
    assert!(e.contains("unencodable"), "{e}");
}

#[test]
fn write_conflict_and_force() {
    let r = tmp("conf");
    let p = r.join("f.txt");
    let m = write_file(&r, &p, "one", "utf-8", false, false, None, false, false).unwrap();
    assert!(write_file(&r, &p, "two", "utf-8", false, false, Some(m), false, false).is_ok());
    let f = fs::OpenOptions::new().write(true).open(&p).unwrap();
    f.set_modified(std::time::SystemTime::now() + std::time::Duration::from_secs(60)).unwrap();
    drop(f);
    assert_eq!(write_file(&r, &p, "three", "utf-8", false, false, Some(m), false, false).unwrap_err(), "changed");
    assert_eq!(fs::read_to_string(&p).unwrap(), "two");
    assert!(write_file(&r, &p, "three", "utf-8", false, false, Some(m), true, false).is_ok());
    assert_eq!(fs::read_to_string(&p).unwrap(), "three");
}

#[test]
fn path_escape_rejected() {
    let r = tmp("esc");
    let o = tmp("esc-out");
    fs::write(o.join("s.txt"), "secret").unwrap();
    assert!(tree(&r, &r.join("..")).is_err());
    assert!(read_file(&r, &o.join("s.txt")).is_err());
    assert!(read_file(&r, Path::new("../x.txt")).is_err());
    // allow_outside 도 링크가 아닌 밖 경로는 안 된다
    assert!(write_file(&r, &o.join("n.txt"), "x", "utf-8", false, false, None, false, true).is_err());
    assert!(!o.join("n.txt").exists());
}

#[test]
fn relative_path_is_under_root() {
    let r = tmp("rel");
    fs::write(r.join("a.txt"), "ok").unwrap();
    assert_eq!(read_file(&r, Path::new("a.txt")).unwrap().text.as_deref(), Some("ok"));
}

#[cfg(windows)]
#[test]
fn junction_outside_flagged() {
    let r = tmp("junc");
    let o = tmp("junc-out");
    fs::write(o.join("s.txt"), "secret").unwrap();
    let link = r.join("link");
    let st = std::process::Command::new("cmd").args(["/C", "mklink", "/J", &link.to_string_lossy(), &o.to_string_lossy()]).output().unwrap();
    assert!(st.status.success(), "mklink 실패");
    let f = link.join("s.txt");
    let out = read_file(&r, &f).unwrap();
    assert!(out.outside);
    assert_eq!(out.text.as_deref(), Some("secret"));
    assert_eq!(write_file(&r, &f, "x", "utf-8", false, false, None, false, false).unwrap_err(), "outside");
    assert!(write_file(&r, &f, "x", "utf-8", false, false, None, false, true).is_ok());
    assert_eq!(fs::read_to_string(o.join("s.txt")).unwrap(), "x");
    let _ = std::process::Command::new("cmd").args(["/C", "rmdir", &link.to_string_lossy()]).output();
}

#[test]
fn create_rename_duplicate() {
    let r = tmp("crd");
    create(&r, &r.join("a.txt"), false).unwrap();
    create(&r, &r.join("d"), true).unwrap();
    assert!(r.join("a.txt").is_file() && r.join("d").is_dir());
    assert!(create(&r, &r.join("a.txt"), false).is_err());
    let n = rename(&r, &r.join("a.txt"), "b.txt").unwrap();
    assert!(n.replace('\\', "/").ends_with("/b.txt") && r.join("b.txt").exists() && !r.join("a.txt").exists());
    fs::write(r.join("c.txt"), "c").unwrap();
    assert!(rename(&r, &r.join("b.txt"), "c.txt").is_err()); // 겹침 거절
    assert!(rename(&r, &r.join("b.txt"), "../x.txt").is_err());
    assert!(rename(&r, &r.join("b.txt"), "sub/x.txt").is_err());
    let d1 = duplicate(&r, &r.join("c.txt")).unwrap();
    assert!(d1.replace('\\', "/").ends_with("/c copy.txt"));
    let d2 = duplicate(&r, &r.join("c.txt")).unwrap();
    assert!(d2.replace('\\', "/").ends_with("/c copy 2.txt"));
    assert_eq!(fs::read_to_string(r.join("c copy 2.txt")).unwrap(), "c");
}

#[test]
fn vault_limit_and_skip() {
    let r = tmp("vault");
    for d in ["notes", "node_modules", ".hid"] { fs::create_dir(r.join(d)).unwrap(); }
    for f in ["a.md", "b.markdown", "c.mdx", "x.txt", "notes/n.md", "node_modules/m.md", ".hid/h.md"] { fs::write(r.join(f), "#").unwrap(); }
    let v = vault(&r, 2000).unwrap();
    let mut got: Vec<_> = v.files.iter().map(|e| e.name.clone()).collect();
    got.sort();
    assert_eq!(got, ["a.md", "b.markdown", "c.mdx", "n.md"]);
    assert!(!v.truncated);
    let v = vault(&r, 2).unwrap();
    assert_eq!(v.files.len(), 2);
    assert!(v.truncated);
}

#[test]
fn memory_dir_path() {
    let p = memory_dir(Path::new("C:/u/.claude"), "C:\\work\\내 repo");
    assert_eq!(p, PathBuf::from("C:/u/.claude").join("projects").join("C--work---repo").join("memory"));
}

#[test]
fn drafts_roundtrip() {
    let d = tmp("draft");
    assert!(draft_get(&d, "C:/r/a.md").is_none());
    draft_put(&d, "C:/r/a.md", "hello", 7).unwrap();
    draft_put(&d, "C:/r/b.md", "other", 8).unwrap();
    let g = draft_get(&d, "C:/r/a.md").unwrap();
    assert_eq!((g.path.as_str(), g.text.as_str(), g.base_mtime), ("C:/r/a.md", "hello", 7));
    assert!(g.saved_at > 0);
    assert_eq!(draft_get(&d, "c:\\r\\A.md").unwrap().text, "hello"); // 경로 표기·대소문자가 달라도 같은 초안
    assert_eq!(fs::read_dir(&d).unwrap().count(), 2);
    draft_clear(&d, "C:/r/a.md").unwrap();
    assert!(draft_get(&d, "C:/r/a.md").is_none() && draft_get(&d, "C:/r/b.md").is_some());
    assert!(draft_clear(&d, "C:/r/a.md").is_ok()); // 없어도 오류 아님
}

// ---- FX7 ----
#[test]
fn utf16_bom_is_binary_s1883() {
    let r = tmp("u16");
    fs::write(r.join("le.txt"), [0xFFu8, 0xFE, b'h', 0, b'i', 0]).unwrap();
    fs::write(r.join("be.txt"), [0xFEu8, 0xFF, 0, b'h', 0, b'i']).unwrap();
    for f in ["le.txt", "be.txt"] {
        let o = read_file(&r, &r.join(f)).unwrap();
        assert_eq!((o.unreadable.as_deref(), o.text), (Some("binary"), None), "{f}");
    }
}

#[test]
fn mixed_eol_s1884() {
    let r = tmp("eol");
    let read = |name: &str, b: &[u8]| { fs::write(r.join(name), b).unwrap(); read_file(&r, &r.join(name)).unwrap() };
    let o = read("a.txt", b"a\r\nb\r\nc\r\nd\n");
    assert_eq!((o.crlf, o.mixed_eol, o.text.as_deref()), (true, true, Some("a\nb\nc\nd\n")));
    let o = read("b.txt", b"a\nb\nc\r\nd");
    assert_eq!((o.crlf, o.mixed_eol), (false, true));
    let o = read("c.txt", b"a\r\nb\r\n");
    assert_eq!((o.crlf, o.mixed_eol), (true, false));
    let o = read("d.txt", b"a\nb\n");
    assert_eq!((o.crlf, o.mixed_eol), (false, false));
    // 저장하면 모든 줄 끝이 판정된 쪽으로
    let p = r.join("a.txt");
    write_file(&r, &p, "a\nb\nc\nd\n", "utf-8", false, true, None, false, false).unwrap();
    assert_eq!(fs::read(&p).unwrap(), b"a\r\nb\r\nc\r\nd\r\n");
}

#[test]
fn create_dir_makes_parents_s1925() {
    let r = tmp("mk");
    let deep = r.join("projects").join("x").join("memory");
    create(&r, &deep, true).unwrap();
    assert!(deep.is_dir());
    create(&r, &deep.join("n.md"), false).unwrap();
    assert!(create(&r, &r.join("..").join("esc"), true).is_err());
    // 루트(memory 폴더) 자체가 아직 없어도 만들 수 있다
    let mem = r.join("claude").join("projects").join("p").join("memory");
    create(&mem, &mem, true).unwrap();
    assert!(mem.is_dir());
}

#[test]
fn claude_dir_uses_config_dir_s1922() {
    assert_eq!(claude_dir(Some("D:/profiles/work")), PathBuf::from("D:/profiles/work"));
    assert_eq!(memory_dir(&claude_dir(Some("D:/p")), "C:/w/r"), PathBuf::from("D:/p").join("projects").join("C--w-r").join("memory"));
}
