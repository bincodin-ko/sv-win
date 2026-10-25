// S-315: 홈 화면의 repo 행에 보일 git 브랜치. `.git/HEAD` 만 읽는다(git 실행 안 함).
use std::path::Path;

/// `ref: refs/heads/x` 면 x, 분리 HEAD 면 짧은 해시 7자, git 저장소가 아니면 None.
/// 워크트리·서브모듈처럼 `.git` 이 `gitdir: <경로>` 파일이면 그 폴더의 HEAD 를 읽는다.
pub fn branch_of(dir: &Path) -> Option<String> {
    let dot = dir.join(".git");
    let git_dir = if dot.is_file() {
        let txt = std::fs::read_to_string(&dot).ok()?;
        let p = std::path::PathBuf::from(txt.trim().strip_prefix("gitdir:")?.trim());
        if p.is_absolute() { p } else { dir.join(p) }
    } else {
        dot
    };
    let head = std::fs::read_to_string(git_dir.join("HEAD")).ok()?;
    let head = head.trim();
    match head.strip_prefix("ref: refs/heads/") {
        Some(b) => Some(b.to_string()),
        None if head.len() >= 7 && head.chars().all(|c| c.is_ascii_hexdigit()) => Some(head[..7].to_string()),
        None => None, // 태그 등 그 밖의 ref
    }
}

#[tauri::command]
pub async fn repo_branch(path: String) -> Option<String> {
    branch_of(Path::new(&path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-b3-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn branch_from_ref() {
        let d = tmp("ref");
        fs::create_dir_all(d.join(".git")).unwrap();
        fs::write(d.join(".git/HEAD"), "ref: refs/heads/feature/x\n").unwrap();
        assert_eq!(branch_of(&d), Some("feature/x".to_string()));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn detached_short_hash() {
        let d = tmp("det");
        fs::create_dir_all(d.join(".git")).unwrap();
        fs::write(d.join(".git/HEAD"), "0123456789abcdef0123456789abcdef01234567\n").unwrap();
        assert_eq!(branch_of(&d), Some("0123456".to_string()));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn not_a_repo_none() {
        let d = tmp("none");
        assert_eq!(branch_of(&d), None);
        assert_eq!(branch_of(&d.join("missing")), None);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn gitdir_file_is_followed() {
        let d = tmp("wt");
        let real = d.join("real-git");
        fs::create_dir_all(&real).unwrap();
        fs::write(real.join("HEAD"), "ref: refs/heads/wt-branch\n").unwrap();
        fs::write(d.join(".git"), format!("gitdir: {}\n", real.display())).unwrap();
        assert_eq!(branch_of(&d), Some("wt-branch".to_string()));
        let _ = fs::remove_dir_all(&d);
    }
}
