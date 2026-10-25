use super::*;
use std::fs;
use std::path::PathBuf;

fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("symvibe-library-{tag}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}
fn meta(id: &str, at: u64) -> Meta {
    Meta { id: id.into(), doc_id: "architecture".into(), title: format!("T {id}"), agent: "claude".into(), effort: "balanced".into(), started_at: at, duration_ms: 1000, status: "complete".into() }
}
const REPO: &str = "C:\\Users\\me\\Votelanding";

#[test]
fn dir_name_is_folder_plus_6_hex_s1987() {
    let n = repo_dir_name(REPO);
    let (folder, hash) = n.rsplit_once('-').unwrap();
    assert_eq!(folder, "Votelanding");
    assert_eq!(hash.len(), 6);
    assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
}

#[test]
fn hash_is_stable_and_normalized() {
    assert_eq!(repo_dir_name(REPO), repo_dir_name(REPO));
    // 대소문자·슬래시 방향·끝 슬래시는 같은 repo
    let hash = |r: &str| repo_dir_name(r).rsplit_once('-').unwrap().1.to_string();
    assert_eq!(hash(REPO), hash("c:/users/ME/votelanding/"));
    // 폴더 이름이 같아도 전체 경로가 다르면 다른 폴더
    assert_ne!(repo_dir_name(REPO), repo_dir_name("D:\\work\\Votelanding"));
}

#[test]
fn list_is_empty_for_unknown_repo() {
    let b = tmp("empty");
    assert_eq!(list(&b, REPO).unwrap(), vec![]);
}

#[test]
fn put_then_list_newest_first_and_get() {
    let b = tmp("put");
    put(&b, REPO, &meta("a", 100), "# A\nold").unwrap();
    put(&b, REPO, &meta("b", 300), "# B\nnew").unwrap();
    put(&b, REPO, &meta("c", 200), "# C").unwrap();
    let ids: Vec<_> = list(&b, REPO).unwrap().into_iter().map(|m| m.id).collect();
    assert_eq!(ids, ["b", "c", "a"]);
    assert_eq!(get(&b, REPO, "a").unwrap(), "# A\nold");
    let dir = b.join(repo_dir_name(REPO));
    assert!(dir.join("index.json").is_file() && dir.join("b.md").is_file());
    // 다른 repo 는 섞이지 않는다
    assert_eq!(list(&b, "D:\\other\\x").unwrap().len(), 0);
}

#[test]
fn put_same_id_replaces() {
    let b = tmp("replace");
    put(&b, REPO, &meta("a", 100), "one").unwrap();
    put(&b, REPO, &meta("a", 100), "two").unwrap();
    assert_eq!(list(&b, REPO).unwrap().len(), 1);
    assert_eq!(get(&b, REPO, "a").unwrap(), "two");
}

#[test]
fn delete_is_permanent() {
    let b = tmp("del");
    put(&b, REPO, &meta("a", 1), "x").unwrap();
    put(&b, REPO, &meta("b", 2), "y").unwrap();
    delete(&b, REPO, "a").unwrap();
    assert_eq!(list(&b, REPO).unwrap().into_iter().map(|m| m.id).collect::<Vec<_>>(), ["b"]);
    assert!(!b.join(repo_dir_name(REPO)).join("a.md").exists());
    assert!(get(&b, REPO, "a").is_err());
}

#[test]
fn bad_ids_are_rejected() {
    let b = tmp("bad");
    for id in ["", "../x", "a/b", "a\\b", "..", "a.md", "x y"] {
        assert!(put(&b, REPO, &meta(id, 1), "x").is_err(), "put {id:?}");
        assert!(get(&b, REPO, id).is_err(), "get {id:?}");
        assert!(delete(&b, REPO, id).is_err(), "delete {id:?}");
    }
    // 아무것도 안 만들어졌다
    assert_eq!(list(&b, REPO).unwrap().len(), 0);
}

#[test]
fn index_json_is_camel_case() {
    let b = tmp("json");
    put(&b, REPO, &meta("a", 1), "x").unwrap();
    let s = fs::read_to_string(b.join(repo_dir_name(REPO)).join("index.json")).unwrap();
    assert!(s.contains("\"docId\"") && s.contains("\"durationMs\"") && s.contains("\"startedAt\""));
}
