// 5묶음 E7 S-2071·S-2078~S-2081·S-2085·S-2086: Skills 관리자 Rust 쪽. 모든 함수가 홈 폴더(home)를 인자로 받는다(시험은 임시 폴더).
use serde::Serialize;
use std::path::{Path, PathBuf};

pub const CAP: usize = 400;
pub const IMPORT_MAX: u64 = 2 * 1024 * 1024;
pub const ERR_CHANGED: &str = "This file changed on disk since you opened it.";
pub const ERR_NO_SKILL_MD: &str = "That folder has no SKILL.md.";
pub const ERR_TOO_BIG: &str = "That folder is larger than 2 MB.";
pub const ERR_EXISTS: &str = "A skill with that name already exists.";
pub const ERR_PLUGIN: &str = "Plugin skills are read-only.";
pub const ERR_PATH: &str = "That isn't a skill path.";
pub const ERR_NAME: &str = "Use lowercase letters, numbers and hyphens only (64 characters max).";
pub const ERR_NO_REPO: &str = "Open a repo first.";

/// scope: personal | project | plugin, kind: skill | command.
/// path = SKILL.md 또는 명령 .md, dir = 스킬 폴더(명령은 그 파일) — 복사·삭제가 대상으로 삼는다
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub scope: String,
    pub kind: String,
    pub plugin: Option<String>,
    pub folder_name: String,
    pub path: String,
    pub dir: String,
    pub raw: String,
    pub mtime: u64,
    pub side_files: Vec<String>,
}
#[derive(Serialize, Debug)]
pub struct ScanOut {
    pub skills: Vec<Skill>,
    pub truncated: bool,
}

/// `SYMVIBE_HOME` → 없으면 `%USERPROFILE%`. 계정 프로필 폴더(CLAUDE_CONFIG_DIR)는 보지 않는다.
pub fn home_dir() -> PathBuf {
    let var = |k: &str| std::env::var_os(k).filter(|v| !v.is_empty());
    var("SYMVIBE_HOME").or_else(|| var("USERPROFILE")).map(PathBuf::from).unwrap_or_default()
}

fn mtime_ms(p: &Path) -> u64 {
    std::fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64)
}
fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}
fn sorted_entries(d: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = std::fs::read_dir(d).map(|r| r.flatten().map(|e| e.path()).collect()).unwrap_or_default();
    v.sort();
    v
}
fn fname(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

/// root 아래 스킬 폴더(`<이름>` 또는 `<묶음>/<이름>` — SKILL.md 가 있는 곳)
fn skill_dirs(root: &Path) -> Vec<PathBuf> {
    let mut out = vec![];
    for d in sorted_entries(root).into_iter().filter(|p| p.is_dir()) {
        if d.join("SKILL.md").is_file() {
            out.push(d);
        } else {
            out.extend(sorted_entries(&d).into_iter().filter(|p| p.is_dir() && p.join("SKILL.md").is_file()));
        }
    }
    out
}
fn command_files(root: &Path) -> Vec<PathBuf> {
    sorted_entries(root).into_iter().filter(|p| p.is_file() && p.extension().is_some_and(|e| e.eq_ignore_ascii_case("md"))).collect()
}

struct Found {
    scope: &'static str,
    kind: &'static str,
    plugin: Option<String>,
    path: PathBuf,
}

/// base 의 스킬(skills=true) 또는 명령. 플러그인은 설치 폴더 바로 아래, 나머지는 `.claude` 아래
fn collect(base: &Path, scope: &'static str, plugin: &Option<String>, out: &mut Vec<Found>, skills: bool) {
    let root = if scope == "plugin" { base.to_path_buf() } else { base.join(".claude") };
    if skills {
        out.extend(skill_dirs(&root.join("skills")).into_iter().map(|d| Found { scope, kind: "skill", plugin: plugin.clone(), path: d }));
    } else {
        out.extend(command_files(&root.join("commands")).into_iter().map(|f| Found { scope, kind: "command", plugin: plugin.clone(), path: f }));
    }
}

fn load(f: Found) -> Skill {
    let is_skill = f.kind == "skill";
    let file = if is_skill { f.path.join("SKILL.md") } else { f.path.clone() };
    let folder_name = if is_skill { fname(&f.path) } else { f.path.file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default() };
    let side_files = if is_skill { sorted_entries(&f.path).iter().filter(|p| p.is_file() && fname(p) != "SKILL.md").map(|p| fname(p)).collect() } else { vec![] };
    Skill {
        scope: f.scope.into(),
        kind: f.kind.into(),
        plugin: f.plugin,
        folder_name,
        raw: std::fs::read(&file).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default(),
        mtime: mtime_ms(&file),
        path: s(&file),
        dir: s(&f.path),
        side_files,
    }
}

/// 읽기 전용 구조(플러그인)는 깨져도 건너뛰고 나머지를 돌려준다
fn plugin_roots(home: &Path) -> Vec<(String, PathBuf)> {
    let Ok(text) = std::fs::read_to_string(home.join(".claude/plugins/installed_plugins.json")) else { return vec![] };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
    let mut seen = std::collections::HashSet::new();
    let mut out = vec![];
    for (key, arr) in v.get("plugins").and_then(|p| p.as_object()).into_iter().flatten() {
        let name = key.split('@').next().unwrap_or(key).to_string();
        for e in arr.as_array().into_iter().flatten() {
            let Some(ip) = e.get("installPath").and_then(|x| x.as_str()) else { continue };
            let p = PathBuf::from(ip);
            if p.is_dir() && seen.insert(ip.to_lowercase()) {
                out.push((name.clone(), p));
            }
        }
    }
    out
}

pub fn scan(home: &Path, repo: Option<&Path>) -> ScanOut {
    let mut f = vec![];
    let none = None;
    collect(home, "personal", &none, &mut f, true);
    if let Some(r) = repo {
        collect(r, "project", &none, &mut f, true);
    }
    collect(home, "personal", &none, &mut f, false);
    if let Some(r) = repo {
        collect(r, "project", &none, &mut f, false);
    }
    for (name, root) in plugin_roots(home) {
        let p = Some(name);
        collect(&root, "plugin", &p, &mut f, true);
        collect(&root, "plugin", &p, &mut f, false);
    }
    let truncated = f.len() > CAP;
    f.truncate(CAP);
    ScanOut { skills: f.into_iter().map(load).collect(), truncated }
}

// ---- 쓰기 쪽: 경로 검사 ----
fn norm(p: &Path) -> Option<String> {
    if p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return None;
    }
    Some(s(p).replace('\\', "/").trim_end_matches('/').to_lowercase())
}
fn under(n: &str, root: &Path) -> bool {
    norm(root).is_some_and(|r| n.starts_with(&format!("{r}/")))
}
fn in_roots(home: &Path, repo: Option<&Path>, n: &str) -> bool {
    [Some(home), repo].into_iter().flatten().any(|b| under(n, &b.join(".claude/skills")) || under(n, &b.join(".claude/commands")))
}
/// 스킬·명령 뿌리 안(밑)의 경로만. 플러그인은 읽기 전용
fn allowed(home: &Path, repo: Option<&Path>, path: &Path) -> Result<(), String> {
    let n = norm(path).ok_or(ERR_PATH)?;
    if under(&n, &home.join(".claude/plugins")) {
        return Err(ERR_PLUGIN.into());
    }
    if in_roots(home, repo, &n) { Ok(()) } else { Err(ERR_PATH.into()) }
}
fn base<'a>(home: &'a Path, repo: Option<&'a Path>, scope: &str) -> Result<&'a Path, String> {
    if scope == "project" { repo.ok_or_else(|| ERR_NO_REPO.to_string()) } else { Ok(home) }
}
fn valid_name(n: &str) -> bool {
    !n.is_empty() && n.len() <= 64 && n.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

pub fn write(home: &Path, repo: Option<&Path>, path: &Path, text: &str, expect_mtime: Option<u64>) -> Result<u64, String> {
    allowed(home, repo, path)?;
    if !path.is_file() {
        return Err(ERR_PATH.into());
    }
    if expect_mtime.is_some_and(|m| m != mtime_ms(path)) {
        return Err(ERR_CHANGED.into());
    }
    std::fs::write(path, text).map_err(|e| e.to_string())?;
    Ok(mtime_ms(path))
}

pub fn create(home: &Path, repo: Option<&Path>, scope: &str, name: &str, text: &str) -> Result<String, String> {
    let b = base(home, repo, scope)?;
    if !valid_name(name) {
        return Err(ERR_NAME.into());
    }
    let dir = b.join(".claude/skills").join(name);
    if dir.exists() {
        return Err(ERR_EXISTS.into());
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let f = dir.join("SKILL.md");
    std::fs::write(&f, text).map_err(|e| e.to_string())?;
    Ok(s(&f))
}

fn dir_size(d: &Path) -> u64 {
    sorted_entries(d)
        .iter()
        .map(|p| match std::fs::symlink_metadata(p) {
            Ok(m) if m.is_dir() => dir_size(p),
            Ok(m) if m.is_file() => m.len(),
            _ => 0,
        })
        .sum()
}
fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for p in sorted_entries(from) {
        let t = to.join(fname(&p));
        match std::fs::symlink_metadata(&p) {
            Ok(m) if m.is_dir() => copy_dir(&p, &t)?,
            Ok(m) if m.is_file() => drop(std::fs::copy(&p, &t).map_err(|e| e.to_string())?),
            _ => {}
        }
    }
    Ok(())
}

pub fn import_check(src: &Path) -> Result<String, String> {
    if !src.join("SKILL.md").is_file() {
        return Err(ERR_NO_SKILL_MD.into());
    }
    if dir_size(src) > IMPORT_MAX {
        return Err(ERR_TOO_BIG.into());
    }
    Ok(fname(src))
}

pub fn import(home: &Path, repo: Option<&Path>, scope: &str, src: &Path) -> Result<String, String> {
    let name = import_check(src)?;
    let dest = base(home, repo, scope)?.join(".claude/skills").join(&name);
    if name.is_empty() || dest.exists() {
        return Err(ERR_EXISTS.into());
    }
    copy_dir(src, &dest)?;
    Ok(s(&dest))
}

/// 머리말 안의 `name:` 줄을 새 이름으로(없으면 그대로)
fn rewrite_name(text: &str, new: &str) -> String {
    if !text.starts_with("---") {
        return text.to_string();
    }
    let (mut out, mut inside, mut done) = (String::new(), false, false);
    for (i, line) in text.split_inclusive('\n').enumerate() {
        let t = line.trim_end();
        if i == 0 {
            inside = true;
        } else if inside && t == "---" {
            inside = false;
        } else if inside && !done && t.starts_with("name:") {
            out.push_str(&format!("name: {new}{}", &line[t.len()..]));
            done = true;
            continue;
        }
        out.push_str(line);
    }
    out
}

pub fn duplicate(home: &Path, repo: Option<&Path>, src: &Path, scope: &str) -> Result<String, String> {
    let n = norm(src).ok_or(ERR_PATH)?;
    if !(in_roots(home, repo, &n) || under(&n, &home.join(".claude/plugins"))) {
        return Err(ERR_PATH.into());
    }
    let b = base(home, repo, scope)?;
    let copy_name = |name: &str, ext: &str, dir: &Path| (1..).map(|i| if i == 1 { format!("{name}-copy") } else { format!("{name}-copy-{i}") }).find(|c| !dir.join(format!("{c}{ext}")).exists()).unwrap();
    if src.is_file() {
        let dir = b.join(".claude/commands");
        let c = copy_name(&src.file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), ".md", &dir);
        let dest = dir.join(format!("{c}.md"));
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let text = std::fs::read_to_string(src).map_err(|e| e.to_string())?;
        std::fs::write(&dest, rewrite_name(&text, &c)).map_err(|e| e.to_string())?;
        return Ok(s(&dest));
    }
    if !src.join("SKILL.md").is_file() {
        return Err(ERR_NO_SKILL_MD.into());
    }
    let dir = b.join(".claude/skills");
    let c = copy_name(&fname(src), "", &dir);
    let dest = dir.join(&c);
    copy_dir(src, &dest)?;
    let f = dest.join("SKILL.md");
    let text = std::fs::read_to_string(&f).map_err(|e| e.to_string())?;
    std::fs::write(&f, rewrite_name(&text, &c)).map_err(|e| e.to_string())?;
    Ok(s(&dest))
}

pub fn delete(home: &Path, repo: Option<&Path>, path: &Path, trash: &dyn Fn(&Path) -> Result<(), String>) -> Result<(), String> {
    allowed(home, repo, path)?;
    if !path.exists() {
        return Err(ERR_PATH.into());
    }
    trash(path)
}

// ---- Tauri 명령: 실제 홈은 여기서만 정한다(SYMVIBE_HOME 이 있으면 그쪽) ----
fn repo_of(repo: &Option<String>) -> Option<PathBuf> {
    repo.as_deref().filter(|r| !r.is_empty()).map(PathBuf::from)
}
#[tauri::command]
pub async fn skills_scan(repo: Option<String>) -> ScanOut {
    scan(&home_dir(), repo_of(&repo).as_deref())
}
#[tauri::command]
pub async fn skills_write(repo: Option<String>, path: String, text: String, expect_mtime: Option<u64>) -> Result<u64, String> {
    write(&home_dir(), repo_of(&repo).as_deref(), Path::new(&path), &text, expect_mtime)
}
#[tauri::command]
pub async fn skills_create(repo: Option<String>, scope: String, name: String, text: String) -> Result<String, String> {
    create(&home_dir(), repo_of(&repo).as_deref(), &scope, &name, &text)
}
#[tauri::command]
pub async fn skills_import_check(src: String) -> Result<String, String> {
    import_check(Path::new(&src))
}
#[tauri::command]
pub async fn skills_import(repo: Option<String>, scope: String, src: String) -> Result<String, String> {
    import(&home_dir(), repo_of(&repo).as_deref(), &scope, Path::new(&src))
}
#[tauri::command]
pub async fn skills_duplicate(repo: Option<String>, src: String, scope: String) -> Result<String, String> {
    duplicate(&home_dir(), repo_of(&repo).as_deref(), Path::new(&src), &scope)
}
#[tauri::command]
pub async fn skills_delete(repo: Option<String>, path: String) -> Result<(), String> {
    delete(&home_dir(), repo_of(&repo).as_deref(), Path::new(&path), &|p| crate::fs::trash_move_sync(s(p)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::fs;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-skills-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn put(p: &Path, s: &str) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, s).unwrap();
    }
    fn names(o: &ScanOut) -> Vec<String> {
        let mut v: Vec<String> = o.skills.iter().map(|s| format!("{}/{}/{}", s.scope, s.kind, s.folder_name)).collect();
        v.sort();
        v
    }
    const MD: &str = "---\nname: x\ndescription: d\n---\nbody\n";

    #[test]
    fn skills_home_dir_uses_symvibe_home() {
        std::env::set_var("SYMVIBE_HOME", "C:/tmp/fake-home");
        assert_eq!(home_dir(), PathBuf::from("C:/tmp/fake-home"));
        std::env::remove_var("SYMVIBE_HOME");
    }

    #[test]
    fn skills_scan_two_levels_and_side_files() {
        let h = tmp("two");
        put(&h.join(".claude/skills/a/SKILL.md"), MD);
        put(&h.join(".claude/skills/a/notes.md"), "n");
        put(&h.join(".claude/skills/grp/b/SKILL.md"), MD);
        put(&h.join(".claude/skills/loose.txt"), "x"); // 스킬 아님
        let o = scan(&h, None);
        assert_eq!(names(&o), ["personal/skill/a", "personal/skill/b"]);
        let a = o.skills.iter().find(|s| s.folder_name == "a").unwrap();
        assert_eq!(a.raw, MD);
        assert_eq!(a.side_files, ["notes.md"]);
        assert!(a.mtime > 0 && a.path.ends_with("SKILL.md"));
        assert!(!o.truncated);
    }

    #[test]
    fn skills_scan_project_and_commands() {
        let h = tmp("proj-h");
        let r = tmp("proj-r");
        put(&r.join(".claude/skills/p/SKILL.md"), MD);
        put(&h.join(".claude/commands/c.md"), "do it");
        put(&r.join(".claude/commands/d.md"), "do that");
        assert_eq!(names(&scan(&h, Some(&r))), ["personal/command/c", "project/command/d", "project/skill/p"]);
        assert_eq!(names(&scan(&h, None)), ["personal/command/c"]); // repo 없으면 Project 는 비어 있다
    }

    #[test]
    fn skills_scan_plugins_read_only_and_broken_parts_skipped() {
        let h = tmp("plug");
        let ok = h.join(".claude/plugins/cache/mk/foo/1");
        put(&ok.join("skills/x/SKILL.md"), MD);
        put(&ok.join("commands/y.md"), "cmd");
        let json = format!(
            r#"{{"version":2,"plugins":{{"foo@mk":[{{"scope":"user","installPath":{:?}}}],"gone@mk":[{{"installPath":"C:/nope/missing"}}],"bad@mk":"x"}}}}"#,
            ok.to_string_lossy().replace('\\', "/")
        );
        put(&h.join(".claude/plugins/installed_plugins.json"), &json);
        let o = scan(&h, None);
        assert_eq!(names(&o), ["plugin/command/y", "plugin/skill/x"]);
        assert!(o.skills.iter().all(|s| s.plugin.as_deref() == Some("foo")));
        put(&h.join(".claude/plugins/installed_plugins.json"), "{ not json");
        assert!(scan(&h, None).skills.is_empty()); // 깨져도 터지지 않는다
    }

    #[test]
    fn skills_scan_caps_at_400() {
        let h = tmp("cap");
        for i in 0..401 {
            put(&h.join(format!(".claude/skills/s{i:03}/SKILL.md")), MD);
        }
        let o = scan(&h, None);
        assert_eq!((o.skills.len(), o.truncated), (400, true));
        fs::remove_dir_all(h.join(".claude/skills/s400")).unwrap();
        let o = scan(&h, None);
        assert_eq!((o.skills.len(), o.truncated), (400, false));
    }

    #[test]
    fn skills_scan_ignores_profile_folder() {
        let h = tmp("prof-h");
        let p = tmp("prof-p");
        put(&p.join("skills/z/SKILL.md"), MD);
        put(&h.join(".claude/skills/a/SKILL.md"), MD);
        std::env::set_var("CLAUDE_CONFIG_DIR", &p);
        let o = scan(&h, None);
        std::env::remove_var("CLAUDE_CONFIG_DIR");
        assert_eq!(names(&o), ["personal/skill/a"]);
    }

    #[test]
    fn skills_write_refuses_changed_mtime() {
        let h = tmp("w");
        let f = h.join(".claude/skills/a/SKILL.md");
        put(&f, MD);
        let m = scan(&h, None).skills[0].mtime;
        assert_eq!(write(&h, None, &f, "new", Some(m + 1000)), Err(ERR_CHANGED.to_string()));
        assert_eq!(fs::read_to_string(&f).unwrap(), MD); // 안 바뀜
        let m2 = write(&h, None, &f, "new text", Some(m)).unwrap();
        assert_eq!(fs::read_to_string(&f).unwrap(), "new text");
        assert!(m2 > 0);
    }

    #[test]
    fn skills_write_only_inside_skill_roots_and_never_plugins() {
        let h = tmp("w2");
        let pl = h.join(".claude/plugins/cache/mk/foo/1/skills/x/SKILL.md");
        put(&pl, MD);
        assert_eq!(write(&h, None, &pl, "z", None), Err(ERR_PLUGIN.to_string()));
        assert_eq!(fs::read_to_string(&pl).unwrap(), MD);
        let other = h.join("elsewhere/SKILL.md");
        put(&other, MD);
        assert_eq!(write(&h, None, &other, "z", None), Err(ERR_PATH.to_string()));
        let sneaky = h.join(".claude/skills/../../elsewhere/SKILL.md");
        assert_eq!(write(&h, None, &sneaky, "z", None), Err(ERR_PATH.to_string()));
    }

    #[test]
    fn skills_create_writes_skill_md_and_refuses_duplicates_and_bad_names() {
        let h = tmp("c-h");
        let r = tmp("c-r");
        let p = create(&h, Some(&r), "personal", "my-skill", MD).unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), MD);
        assert!(Path::new(&p).starts_with(h.join(".claude/skills/my-skill")));
        assert_eq!(create(&h, Some(&r), "personal", "my-skill", "other"), Err(ERR_EXISTS.to_string()));
        assert_eq!(fs::read_to_string(&p).unwrap(), MD);
        let q = create(&h, Some(&r), "project", "my-skill", MD).unwrap(); // 다른 범위는 따로
        assert!(Path::new(&q).starts_with(r.join(".claude/skills/my-skill")));
        assert_eq!(create(&h, Some(&r), "personal", "../evil", MD), Err(ERR_NAME.to_string()));
        assert_eq!(create(&h, Some(&r), "personal", "Bad Name", MD), Err(ERR_NAME.to_string()));
        assert_eq!(create(&h, None, "project", "z", MD), Err(ERR_NO_REPO.to_string()));
    }

    #[test]
    fn skills_import_checks_and_copies_whole_folder() {
        let h = tmp("i-h");
        let src = tmp("i-src").join("cool");
        fs::create_dir_all(&src).unwrap();
        assert_eq!(import_check(&src), Err(ERR_NO_SKILL_MD.to_string()));
        assert_eq!(import(&h, None, "personal", &src), Err(ERR_NO_SKILL_MD.to_string()));
        put(&src.join("SKILL.md"), MD);
        put(&src.join("refs/deep/a.txt"), "A");
        assert_eq!(import_check(&src), Ok("cool".to_string()));
        let d = import(&h, None, "personal", &src).unwrap();
        assert_eq!(Path::new(&d), h.join(".claude/skills/cool"));
        assert_eq!(fs::read_to_string(h.join(".claude/skills/cool/refs/deep/a.txt")).unwrap(), "A");
        put(&h.join(".claude/skills/cool/SKILL.md"), "mine"); // 덮어쓰기 안 함
        assert_eq!(import(&h, None, "personal", &src), Err(ERR_EXISTS.to_string()));
        assert_eq!(fs::read_to_string(h.join(".claude/skills/cool/SKILL.md")).unwrap(), "mine");
    }

    #[test]
    fn skills_import_refuses_over_2mb() {
        let h = tmp("big-h");
        let src = tmp("big-src").join("fat");
        put(&src.join("SKILL.md"), MD);
        fs::write(src.join("blob.bin"), vec![0u8; (IMPORT_MAX + 1) as usize]).unwrap();
        assert_eq!(import_check(&src), Err(ERR_TOO_BIG.to_string()));
        assert_eq!(import(&h, None, "personal", &src), Err(ERR_TOO_BIG.to_string()));
        assert!(!h.join(".claude/skills/fat").exists());
    }

    #[test]
    fn skills_duplicate_names_copy_copy2_and_rewrites_name_line() {
        let h = tmp("d-h");
        put(&h.join(".claude/skills/a/SKILL.md"), "---\nname: a\ndescription: d\n---\nbody\n");
        put(&h.join(".claude/skills/a/side.txt"), "s");
        let one = duplicate(&h, None, &h.join(".claude/skills/a"), "personal").unwrap();
        assert_eq!(Path::new(&one), h.join(".claude/skills/a-copy"));
        assert_eq!(fs::read_to_string(h.join(".claude/skills/a-copy/SKILL.md")).unwrap(), "---\nname: a-copy\ndescription: d\n---\nbody\n");
        assert!(h.join(".claude/skills/a-copy/side.txt").exists());
        let two = duplicate(&h, None, &h.join(".claude/skills/a"), "personal").unwrap();
        assert_eq!(Path::new(&two), h.join(".claude/skills/a-copy-2"));
        assert!(fs::read_to_string(h.join(".claude/skills/a-copy-2/SKILL.md")).unwrap().contains("name: a-copy-2"));
    }

    #[test]
    fn skills_duplicate_plugin_skill_and_command_into_project() {
        let h = tmp("d2-h");
        let r = tmp("d2-r");
        let ps = h.join(".claude/plugins/cache/mk/foo/1/skills/x");
        put(&ps.join("SKILL.md"), MD);
        let d = duplicate(&h, Some(&r), &ps, "project").unwrap();
        assert_eq!(Path::new(&d), r.join(".claude/skills/x-copy"));
        let c = h.join(".claude/commands/go.md");
        put(&c, "run");
        let d = duplicate(&h, Some(&r), &c, "personal").unwrap();
        assert_eq!(Path::new(&d), h.join(".claude/commands/go-copy.md"));
        assert_eq!(fs::read_to_string(&d).unwrap(), "run");
        assert_eq!(duplicate(&h, None, &ps, "project"), Err(ERR_NO_REPO.to_string()));
    }

    #[test]
    fn skills_delete_goes_to_fake_trash_and_refuses_plugins() {
        let h = tmp("x-h");
        let dir = h.join(".claude/skills/a");
        put(&dir.join("SKILL.md"), MD);
        let cmd = h.join(".claude/commands/c.md");
        put(&cmd, "c");
        let pl = h.join(".claude/plugins/cache/mk/foo/1/skills/x");
        put(&pl.join("SKILL.md"), MD);
        let log: RefCell<Vec<PathBuf>> = RefCell::new(vec![]);
        let trash = |p: &Path| -> Result<(), String> { log.borrow_mut().push(p.to_path_buf()); Ok(()) };
        delete(&h, None, &dir, &trash).unwrap();
        delete(&h, None, &cmd, &trash).unwrap();
        assert_eq!(*log.borrow(), vec![dir.clone(), cmd.clone()]);
        assert_eq!(delete(&h, None, &pl, &trash), Err(ERR_PLUGIN.to_string()));
        assert_eq!(delete(&h, None, &h.join(".claude"), &trash), Err(ERR_PATH.to_string()));
        assert_eq!(delete(&h, None, &h.join(".claude/skills"), &trash), Err(ERR_PATH.to_string())); // 뿌리 자체는 안 지운다
        assert_eq!(log.borrow().len(), 2);
    }
}
