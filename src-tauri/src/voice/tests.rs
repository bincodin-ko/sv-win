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

// ---- Q1 Piper (S-3103~S-3110). 값은 spec/12묶음.md 고정 핀 표 ----
use super::piper::{single_codepoint_config, write_converted_config, clip_text, merge, piper_args, piper_speak_with, voice_kinds};

const PIPER_PINS: [(&str, &str, &str, u64, &str); 5] = [
    ("piper-engine", "piper_windows_amd64.zip", "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip", 22_477_236, "f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea"),
    ("piper-ko", "ko_KR-kss-medium.onnx", "https://huggingface.co/rhasspy/piper-voices/resolve/5041a7a49ae5b3a0f30e6837769eb03fdbb231bd/ko/ko_KR/kss/medium/ko_KR-kss-medium.onnx", 63_221_984, "624fd774e26895f24bebae1bd9a3379e3394baeade4b584924f83e414096e2c9"),
    ("piper-ko-json", "ko_KR-kss-medium.onnx.json", "https://huggingface.co/rhasspy/piper-voices/resolve/5041a7a49ae5b3a0f30e6837769eb03fdbb231bd/ko/ko_KR/kss/medium/ko_KR-kss-medium.onnx.json", 5_232, "153b5619d0580f824a59108d83ca19434de410eb8e4fe80325b58684fdc8a1df"),
    ("piper-en", "en_US-ljspeech-medium.onnx", "https://huggingface.co/rhasspy/piper-voices/resolve/5041a7a49ae5b3a0f30e6837769eb03fdbb231bd/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx", 63_531_379, "6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22"),
    ("piper-en-json", "en_US-ljspeech-medium.onnx.json", "https://huggingface.co/rhasspy/piper-voices/resolve/5041a7a49ae5b3a0f30e6837769eb03fdbb231bd/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx.json", 4_972, "141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860"),
];

#[test]
fn piper_pins_match_spec_table() {
    for (k, f, u, b, s) in PIPER_PINS {
        let p = pin(k).unwrap_or_else(|| panic!("{k} 없음"));
        assert_eq!((p.file.as_str(), p.url.as_str(), p.bytes, p.sha256.as_str()), (f, u, b, s), "{k}");
        assert!(url_allowed(&p.url), "{k}");
        assert_eq!(download_check(&p), Ok(()), "{k}");
    }
    assert!(pin("piper-fr").is_none());
}

#[test]
fn url_allow_list_piper() {
    assert!(url_allowed("https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"));
    assert!(url_allowed("https://huggingface.co/rhasspy/piper-voices/resolve/abc/ko/x.onnx"));
    for bad in [
        "http://github.com/rhasspy/piper/releases/download/x/p.zip",
        "https://github.com/someone/piper/releases/download/x/p.zip",
        "https://huggingface.co/other/piper-voices/resolve/abc/x.onnx",
        "https://github.com/rhasspy/piper-evil/releases/download/x",
        "https://github.com/rhasspy/piper/issues/1",
    ] {
        assert!(!url_allowed(bad), "{bad}");
    }
}

#[test]
fn empty_hash_pin_is_not_available() {
    let p = target("piper-engine", "p.zip", "https://github.com/rhasspy/piper/releases/download/x/p.zip".into(), 1, "");
    assert_eq!(download_check(&p), Err("not available".to_string()));
    let bad = target("piper-ko", "m.onnx", "https://evil.com/m.onnx".into(), 1, HELLO_SHA);
    assert_eq!(download_check(&bad), Err("url not allowed".to_string()));
}

#[test]
fn piper_args_are_assembled() {
    let a = piper_args(Path::new("M.onnx"), Path::new("M.onnx.json"), Path::new("s-1.wav"));
    assert_eq!(a, ["--model", "M.onnx", "--config", "M.onnx.json", "--output_file", "s-1.wav"]);
}

#[test]
fn piper_text_and_lang_rules() {
    assert_eq!(clip_text("  hi there \n").unwrap(), "hi there");
    assert!(clip_text("   ").is_err() && clip_text("").is_err());
    assert_eq!(clip_text(&"가".repeat(300)).unwrap().chars().count(), 200);
    assert_eq!(voice_kinds("ko").unwrap(), ("piper-ko", "piper-ko-json"));
    assert_eq!(voice_kinds("en").unwrap(), ("piper-en", "piper-en-json"));
    assert!(voice_kinds("fr").is_err() && voice_kinds("").is_err() && voice_kinds("../ko").is_err());
}

#[test]
fn piper_voice_part_needs_both_files() {
    let d = |pct| Part::Downloading { pct };
    assert_eq!(merge(Part::Ready, Part::Ready), Part::Ready);
    assert_eq!(merge(Part::Ready, Part::None), Part::None);
    assert_eq!(merge(Part::None, Part::None), Part::None);
    assert_eq!(merge(Part::Ready, Part::Failed { why: "x".into() }), Part::Failed { why: "x".into() });
    assert!(matches!(merge(d(50), Part::None), Part::Downloading { .. }));
    assert!(matches!(merge(Part::Ready, d(10)), Part::Downloading { .. }));
}

#[cfg(windows)]
#[test]
fn piper_speak_runs_engine_writes_stdin_and_deletes_wav() {
    let d = tmpdir("ps");
    let tmp = d.join("tmp");
    // 인자는 %*, 글은 stdin 첫 줄, 출력 파일은 6번째 인자
    let exe = write(&d.join("piper.cmd"), "@echo off\r\necho %*> \"%~dp0args.txt\"\r\nset /p L=\r\necho %L%> \"%~dp0stdin.txt\"\r\necho WAVDATA> \"%~6\"\r\n");
    let (onnx, json) = (write(&d.join("m.onnx"), "m"), write(&d.join("m.onnx.json"), "{}"));
    let wav = piper_speak_with(&exe, &onnx, &json, &tmp, "hello piper", Duration::from_secs(20)).unwrap();
    assert!(String::from_utf8_lossy(&wav).contains("WAVDATA"));
    let args = std::fs::read_to_string(d.join("args.txt")).unwrap();
    for w in ["--model", "m.onnx", "--config", "m.onnx.json", "--output_file", "s-", ".wav"] {
        assert!(args.contains(w), "{w} 없음: {args}");
    }
    assert_eq!(std::fs::read_to_string(d.join("stdin.txt")).unwrap().trim(), "hello piper");
    assert_eq!(std::fs::read_dir(&tmp).unwrap().count(), 0, "wav 를 지움");
    let _ = std::fs::remove_dir_all(&d);
}

#[cfg(windows)]
#[test]
fn piper_speak_timeout_and_failure_delete_wav() {
    let d = tmpdir("pst");
    let tmp = d.join("tmp");
    let (onnx, json) = (write(&d.join("m.onnx"), "m"), write(&d.join("m.onnx.json"), "{}"));
    let slow = write(&d.join("slow.cmd"), "@echo off\r\nping -n 5 127.0.0.1 >nul\r\n"); // 가드: 4초 뒤 스스로 끝남
    let t = Instant::now();
    assert_eq!(piper_speak_with(&slow, &onnx, &json, &tmp, "x", Duration::from_millis(800)), Err("timeout".to_string()));
    assert!(t.elapsed() < Duration::from_secs(3), "제한 시간에 멈춤");
    let bad = write(&d.join("bad.cmd"), "@echo off\r\nexit /b 3\r\n");
    assert_eq!(piper_speak_with(&bad, &onnx, &json, &tmp, "x", Duration::from_secs(10)), Err("engine".to_string()));
    let none = write(&d.join("none.cmd"), "@echo off\r\n"); // 성공인데 wav 를 안 씀
    assert!(piper_speak_with(&none, &onnx, &json, &tmp, "x", Duration::from_secs(10)).is_err());
    assert_eq!(std::fs::read_dir(&tmp).unwrap().count(), 0);
    let _ = std::fs::remove_dir_all(&d);
}

#[cfg(windows)]
#[test]
fn piper_downloads_go_to_piper_folders() {
    let d = tmpdir("pdl");
    // 모델 → Voice/piper/voices/<파일> + .ok
    let src = write(&d.join("src.bin"), "hello");
    let v = Voice::default();
    let p = target("piper-ko", "ko_KR-kss-medium.onnx", file_url(&src), 5, HELLO_SHA);
    assert_eq!(v.part(&d, &p), Part::None);
    assert_eq!(v.run_download(&d, &p, Path::new("curl.exe")), Part::Ready);
    assert_eq!(std::fs::read_to_string(d.join("piper/voices/ko_KR-kss-medium.onnx")).unwrap(), "hello");
    assert_eq!(std::fs::read_to_string(d.join("piper/voices/ko_KR-kss-medium.onnx.ok")).unwrap().trim(), HELLO_SHA);
    assert!(!d.join("models").exists(), "whisper 폴더는 건드리지 않음");
    assert_eq!(v.part(&d, &p), Part::Ready);
    // 엔진 zip(안에 piper/ 폴더) → Voice/piper/engine/piper/piper.exe
    let stage = d.join("stage/piper");
    std::fs::create_dir_all(&stage).unwrap();
    write(&stage.join("piper.exe"), "exe");
    write(&stage.join("espeak-ng-data.txt"), "d");
    let zip = d.join("piper_windows_amd64.zip");
    assert!(std::process::Command::new("tar").args(["-a", "-cf"]).arg(&zip).arg("-C").arg(d.join("stage")).arg("piper").status().unwrap().success());
    let (sha, bytes) = (sha256_file(&zip).unwrap(), std::fs::metadata(&zip).unwrap().len());
    let e = target("piper-engine", "piper_windows_amd64.zip", file_url(&zip), bytes, &sha);
    assert_eq!(v.run_download(&d, &e, Path::new("curl.exe")), Part::Ready);
    let exe = find_exe(&d.join("piper/engine")).unwrap();
    assert!(exe.ends_with("piper.exe") && exe.starts_with(d.join("piper/engine/piper")));
    assert_eq!(v.part(&d, &e), Part::Ready);
    assert!(!d.join("engine").exists(), "whisper 엔진 폴더는 건드리지 않음");
    let _ = std::fs::remove_dir_all(&d);
}

#[test]
fn clean_tmp_removes_piper_wavs() {
    let d = tmpdir("cleanp");
    std::fs::create_dir_all(d.join("tmp")).unwrap();
    write(&d.join("tmp/s-4.wav"), "x");
    clean_tmp(&d);
    assert_eq!(std::fs::read_dir(d.join("tmp")).unwrap().count(), 0);
    let _ = std::fs::remove_dir_all(&d);
}

#[test]
fn piper_config_drops_only_multi_codepoint_phonemes() {
    // 2026-10-25 실측: ko_KR-kss-medium.onnx.json 의 여러 글자 키는 aɪ aʊ ɔɪ eɪ oʊ (id 161~165) 5개뿐
    let src = r#"{"audio":{"sample_rate":22050},"phoneme_id_map":{"_":[0],"a":[14],"aɪ":[161],"aʊ":[162],"ɔɪ":[163],"eɪ":[164],"oʊ":[165]},"num_symbols":256}"#;
    let out: serde_json::Value = serde_json::from_str(&single_codepoint_config(src).unwrap()).unwrap();
    let m = out["phoneme_id_map"].as_object().unwrap();
    assert_eq!(m.len(), 2);
    assert_eq!(m["a"][0], 14);
    assert_eq!(out["num_symbols"], 256, "다른 칸은 그대로");
    assert_eq!(out["audio"]["sample_rate"], 22050);
}

#[test]
fn piper_config_bad_input_is_engine_error() {
    assert!(single_codepoint_config("not json").is_err());
    assert!(single_codepoint_config("{}").is_err(), "phoneme_id_map 없음");
}

#[test]
fn piper_config_file_is_written_apart_from_original() {
    let d = tmpdir("pcf");
    let src = write(&d.join("m.onnx.json"), r#"{"phoneme_id_map":{"a":[1],"aɪ":[2]}}"#);
    let dst = d.join("run").join("m.onnx.json");
    write_converted_config(&src, &dst).unwrap();
    assert!(std::fs::read_to_string(&dst).unwrap().contains("\"a\"") && !std::fs::read_to_string(&dst).unwrap().contains("aɪ"));
    assert!(std::fs::read_to_string(&src).unwrap().contains("aɪ"), "원본은 그대로");
    let _ = std::fs::remove_dir_all(&d);
}
