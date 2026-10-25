// F1 S-2216 cargo 시험: 가짜 whisper(.cmd)·가짜 curl(.cmd)·로컬 file:// 만 쓴다. 인터넷·실제 엔진 없음.
use super::pins::{pin, Pin};
use super::*;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const HELLO_SHA: &str = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"; // sha256("hello")

fn tmpdir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("symvibe-voice-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}
fn file_url(p: &Path) -> String {
    format!("file:///{}", p.display().to_string().replace('\\', "/"))
}
fn write(p: &Path, s: &str) -> PathBuf {
    std::fs::write(p, s).unwrap();
    p.to_path_buf()
}
fn target(kind: &str, file: &str, url: String, bytes: u64, sha: &str) -> Pin {
    Pin { kind: kind.into(), file: file.into(), url, bytes, sha256: sha.into() }
}

#[test]
fn pins_have_engine_and_two_models() {
    let e = pin("engine").unwrap();
    assert!(e.url.starts_with("https://github.com/ggml-org/whisper.cpp/releases/download/") && e.url.ends_with("/whisper-bin-x64.zip"));
    for k in ["small", "base"] {
        let p = pin(k).unwrap();
        assert_eq!(p.file, format!("ggml-{k}.bin"));
        assert!(p.url.starts_with("https://huggingface.co/ggerganov/whisper.cpp/resolve/"), "{}", p.url);
        assert_eq!(p.sha256.len(), 64);
        assert!(p.bytes > 100_000_000);
    }
    assert!(url_allowed(&e.url) && url_allowed(&pin("small").unwrap().url));
    assert!(pin("large").is_none());
}

#[test]
fn url_allow_list() {
    assert!(url_allowed("https://github.com/ggml-org/whisper.cpp/releases/download/b1/whisper-bin-x64.zip"));
    assert!(url_allowed("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"));
    for bad in [
        "http://github.com/ggml-org/whisper.cpp/releases/download/b1/x.zip",
        "https://github.com.evil.com/ggml-org/whisper.cpp/x",
        "https://github.com/ggml-org/whisper.cpp.evil/x",
        "https://github.com/someone/whisper.cpp/releases/x",
        "https://huggingface.co/other/whisper.cpp/resolve/main/x.bin",
        "https://evil.com/?https://huggingface.co/ggerganov/whisper.cpp/",
        "https://user@github.com/ggml-org/whisper.cpp/x",
        "file:///C:/x.bin",
    ] {
        assert!(!url_allowed(bad), "{bad}");
    }
}

#[test]
fn args_are_assembled() {
    let a = whisper_args(Path::new("M.bin"), Path::new("t-1.wav"), "en", "Otto, Bex, spawn", 4);
    assert_eq!(a, ["-m", "M.bin", "-f", "t-1.wav", "-l", "en", "-nt", "-np", "-nth", "0.6", "-t", "4", "--prompt", "Otto, Bex, spawn"]);
    let a = whisper_args(Path::new("M.bin"), Path::new("w.wav"), "", "", 2);
    assert_eq!(a[5], "auto");
    assert!(!a.contains(&"--prompt".to_string()), "빈 힌트는 넣지 않음");
    assert!((1..=8).contains(&threads()));
}

#[test]
fn timeout_is_four_times_audio_plus_15() {
    assert_eq!(timeout_for(44 + 32000 * 5), Duration::from_secs(35)); // 5초
    assert_eq!(timeout_for(44), Duration::from_secs(15));
}

#[cfg(windows)]
#[test]
fn transcribe_runs_engine_and_deletes_wav() {
    let d = tmpdir("tr");
    let tmp = d.join("tmp");
    let exe = write(&d.join("fake-whisper.cmd"), "@echo off\r\necho %* > \"%~dp0args.txt\"\r\necho  Can you spawn 5 Claude Code Agents?\r\n");
    let model = write(&d.join("ggml-small.bin"), "m");
    let wav = vec![0u8; 44 + 3200];
    let out = transcribe_with(&exe, &model, &tmp, &wav, "en", "Otto, spawn", Duration::from_secs(20)).unwrap();
    assert_eq!(out, "Can you spawn 5 Claude Code Agents?");
    let args = std::fs::read_to_string(d.join("args.txt")).unwrap();
    for w in ["-m", "-f", "-l en", "-nt", "-np", "-nth 0.6", "-t", "--prompt"] {
        assert!(args.contains(w), "{w} 없음: {args}");
    }
    assert!(args.contains("t-") && args.contains(".wav"));
    assert_eq!(std::fs::read_dir(&tmp).unwrap().count(), 0, "wav 를 지움");
    let _ = std::fs::remove_dir_all(&d);
}

#[cfg(windows)]
#[test]
fn transcribe_timeout_kills_and_deletes_wav() {
    let d = tmpdir("to");
    let tmp = d.join("tmp");
    // 가드: 끄지 못해도 4초 뒤 스스로 끝난다
    let exe = write(&d.join("slow.cmd"), "@echo off\r\nping -n 5 127.0.0.1 >nul\r\necho late\r\n");
    let model = write(&d.join("m.bin"), "m");
    let t = Instant::now();
    let r = transcribe_with(&exe, &model, &tmp, &[0u8; 100], "en", "", Duration::from_millis(800));
    assert_eq!(r, Err("timeout".to_string()));
    assert!(t.elapsed() < Duration::from_secs(3), "제한 시간에 멈춤");
    assert_eq!(std::fs::read_dir(&tmp).unwrap().count(), 0);
    let _ = std::fs::remove_dir_all(&d);
}

#[cfg(windows)]
#[test]
fn transcribe_failure_is_error_and_deletes_wav() {
    let d = tmpdir("fail");
    let tmp = d.join("tmp");
    let exe = write(&d.join("bad.cmd"), "@echo off\r\necho boom 1>&2\r\nexit /b 3\r\n");
    let model = write(&d.join("m.bin"), "m");
    assert_eq!(transcribe_with(&exe, &model, &tmp, &[0u8; 100], "en", "", Duration::from_secs(10)), Err("engine".to_string()));
    assert_eq!(std::fs::read_dir(&tmp).unwrap().count(), 0);
    let _ = std::fs::remove_dir_all(&d);
}

#[test]
fn clean_tmp_empties_folder() {
    let d = tmpdir("clean");
    std::fs::create_dir_all(d.join("tmp/sub")).unwrap();
    write(&d.join("tmp/t-3.wav"), "x");
    write(&d.join("tmp/dl-small.part"), "x");
    clean_tmp(&d);
    assert!(d.join("tmp").is_dir());
    assert_eq!(std::fs::read_dir(d.join("tmp")).unwrap().count(), 0);
    let _ = std::fs::remove_dir_all(&d);
}

#[cfg(windows)]
#[test]
fn sha256_via_certutil() {
    let d = tmpdir("sha");
    assert_eq!(sha256_file(&write(&d.join("h.txt"), "hello")).as_deref(), Some(HELLO_SHA));
    assert_eq!(sha256_file(&d.join("missing")), None);
    let _ = std::fs::remove_dir_all(&d);
}

#[cfg(windows)]
#[test]
fn download_model_ok_writes_marker_and_status_ready() {
    let d = tmpdir("dlok");
    let src = write(&d.join("src.bin"), "hello");
    let v = Voice::default();
    let p = target("small", "ggml-small.bin", file_url(&src), 5, HELLO_SHA);
    assert_eq!(v.part(&d, &p), Part::None);
    assert_eq!(v.run_download(&d, &p, Path::new("curl.exe")), Part::Ready);
    assert_eq!(std::fs::read_to_string(d.join("models/ggml-small.bin")).unwrap(), "hello");
    assert_eq!(std::fs::read_to_string(d.join("models/ggml-small.bin.ok")).unwrap().trim(), HELLO_SHA);
    assert_eq!(v.part(&d, &p), Part::Ready);
    // 표식이 틀리면(다른 핀) ready 가 아님
    let other = target("small", "ggml-small.bin", String::new(), 5, &"0".repeat(64));
    assert_eq!(Voice::default().part(&d, &other), Part::None);
    let _ = std::fs::remove_dir_all(&d);
}

#[cfg(windows)]
#[test]
fn download_wrong_hash_deletes_and_fails() {
    let d = tmpdir("dlbad");
    let src = write(&d.join("src.bin"), "hello!");
    let v = Voice::default();
    let p = target("base", "ggml-base.bin", file_url(&src), 6, HELLO_SHA);
    assert_eq!(v.run_download(&d, &p, Path::new("curl.exe")), Part::Failed { why: "checksum".into() });
    assert!(!d.join("models/ggml-base.bin").exists());
    assert_eq!(std::fs::read_dir(d.join("tmp")).unwrap().count(), 0, "임시 파일도 지움");
    assert_eq!(v.part(&d, &p), Part::Failed { why: "checksum".into() }, "다시 받기 전까지 failed");
    let _ = std::fs::remove_dir_all(&d);
}

#[cfg(windows)]
#[test]
fn download_engine_zip_is_extracted() {
    let d = tmpdir("dlzip");
    let stage = d.join("stage/Release");
    std::fs::create_dir_all(&stage).unwrap();
    write(&stage.join("whisper-cli.exe"), "exe");
    write(&stage.join("whisper.dll"), "dll");
    let zip = d.join("whisper-bin-x64.zip");
    let st = std::process::Command::new("tar").args(["-a", "-cf"]).arg(&zip).arg("-C").arg(d.join("stage")).arg("Release").status().unwrap();
    assert!(st.success());
    let sha = sha256_file(&zip).unwrap();
    let bytes = std::fs::metadata(&zip).unwrap().len();
    let v = Voice::default();
    let p = target("engine", "whisper-bin-x64.zip", file_url(&zip), bytes, &sha);
    assert_eq!(v.run_download(&d, &p, Path::new("curl.exe")), Part::Ready);
    let exe = find_exe(&d.join("engine")).unwrap();
    assert!(exe.ends_with("whisper-cli.exe"));
    assert!(exe.with_file_name("whisper.dll").exists(), "같이 오는 DLL");
    assert_eq!(v.part(&d, &p), Part::Ready);
    let _ = std::fs::remove_dir_all(&d);
}

#[test]
fn find_exe_falls_back_to_main_exe() {
    let d = tmpdir("main");
    std::fs::create_dir_all(d.join("Release")).unwrap();
    write(&d.join("Release/main.exe"), "x");
    assert!(find_exe(&d).unwrap().ends_with("main.exe"));
    write(&d.join("Release/whisper-cli.exe"), "x");
    assert!(find_exe(&d).unwrap().ends_with("whisper-cli.exe"), "새 이름이 먼저");
    assert!(find_exe(&d.join("none")).is_none());
    let _ = std::fs::remove_dir_all(&d);
}

#[cfg(windows)]
#[test]
fn cancel_kills_only_download_pid() {
    let d = tmpdir("cancel");
    // 가짜 curl: 4초 뒤 스스로 끝나는 가드
    let curl = write(&d.join("fake-curl.cmd"), "@echo off\r\nping -n 5 127.0.0.1 >nul\r\n");
    let v = std::sync::Arc::new(Voice::default());
    let p = target("small", "ggml-small.bin", "file:///nowhere".into(), 100, HELLO_SHA);
    let (v2, d2, p2) = (v.clone(), d.clone(), p.clone());
    let h = std::thread::spawn(move || v2.run_download(&d2, &p2, &curl));
    let t = Instant::now();
    while !matches!(v.part(&d, &p), Part::Downloading { .. }) && t.elapsed() < Duration::from_secs(3) {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(matches!(v.part(&d, &p), Part::Downloading { .. }));
    assert!(v.cancel("small"));
    assert_eq!(h.join().unwrap(), Part::None, "취소는 실패가 아니라 처음 상태로");
    assert!(t.elapsed() < Duration::from_secs(3), "PID 를 껐으니 가드(4초) 전에 끝남");
    assert!(!d.join("models/ggml-small.bin").exists());
    assert!(!v.cancel("small"), "끝난 뒤 취소할 것 없음");
    let _ = std::fs::remove_dir_all(&d);
}

#[test]
fn custom_paths_override() {
    let d = tmpdir("custom");
    let exe = write(&d.join("my-whisper.exe"), "x");
    let mut s = serde_json::Map::new();
    s.insert("speechEnginePath".into(), exe.display().to_string().into());
    s.insert("speechModelPath".into(), "".into());
    assert_eq!(engine_path(&d, &s, None), Some(exe.clone()));
    assert_eq!(engine_path(&d, &serde_json::Map::new(), Some("C:/fake/w.cmd".into())), Some(PathBuf::from("C:/fake/w.cmd")), "SYMVIBE_WHISPER 가 먼저");
    assert_eq!(engine_path(&d, &serde_json::Map::new(), None), None);
    assert_eq!(model_path(&d, &s, "small"), d.join("models/ggml-small.bin"));
    s.insert("speechModelPath".into(), "D:/m/x.bin".into());
    assert_eq!(model_path(&d, &s, "small"), PathBuf::from("D:/m/x.bin"));
    let _ = std::fs::remove_dir_all(&d);
}
