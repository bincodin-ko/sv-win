// Q1 S-3105~S-3108: Piper 로컬 음성. 엔진·모델은 voice.rs 의 같은 내려받기 코드가 Voice/piper/ 아래에 둔다.
// 소리는 PC 밖으로 안 나간다: piper.exe 가 Voice/tmp/s-<n>.wav 를 쓰면 바이트로 돌려주고 파일을 바로 지운다.
use super::pins::pin;
use super::{find_exe, voice_dir, Part, Voice, SEQ};
use crate::repo_setup::quiet;
use std::io::Write;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

/// 인자 `--model <onnx> --config <json> --output_file <wav>` (espeak 데이터는 exe 옆 기본 위치)
pub fn piper_args(onnx: &Path, json: &Path, out_wav: &Path) -> Vec<String> {
    ["--model", &onnx.display().to_string(), "--config", &json.display().to_string(), "--output_file", &out_wav.display().to_string()].iter().map(|s| s.to_string()).collect()
}

/// S-3106: 앞뒤 공백을 자르고 200자까지(speak.ts 와 같음), 비면 Err
pub fn clip_text(text: &str) -> Result<String, String> {
    let t: String = text.trim().chars().take(200).collect();
    if t.trim().is_empty() { Err("empty".into()) } else { Ok(t) }
}

/// S-3106: lang 은 ko/en 만 → (모델 핀, 설정 json 핀)
pub fn voice_kinds(lang: &str) -> Result<(&'static str, &'static str), String> {
    match lang {
        "ko" => Ok(("piper-ko", "piper-ko-json")),
        "en" => Ok(("piper-en", "piper-en-json")),
        _ => Err("unknown lang".into()),
    }
}

/// S-3105: 음성은 onnx + json 둘 다 Ready 라야 Ready. 받는 중 퍼센트는 onnx 가 정한다(json 은 몇 KB)
pub fn merge(a: Part, b: Part) -> Part {
    match (a, b) {
        (Part::Failed { why }, _) | (_, Part::Failed { why }) => Part::Failed { why },
        (Part::Ready, Part::Ready) => Part::Ready,
        (Part::Downloading { pct }, _) => Part::Downloading { pct },
        (_, Part::Downloading { .. }) => Part::Downloading { pct: 99 },
        _ => Part::None,
    }
}

/// 2023.11.14-2 엔진은 piper 1.5.0 설정의 여러 글자 음소 키("aɪ" 등 영어 이중모음 5개, id 161~165)를 못 읽는다.
/// 한국어 설정에서 그런 키만 뺀 json 글을 돌려준다(원본은 그대로 두고 해시도 원본으로 확인한다).
pub fn single_codepoint_config(json: &str) -> Result<String, String> {
    let mut v: serde_json::Value = serde_json::from_str(json).map_err(|_| "engine".to_string())?;
    let m = v.get_mut("phoneme_id_map").and_then(|m| m.as_object_mut()).ok_or("engine")?;
    m.retain(|k, _| k.chars().count() == 1);
    serde_json::to_string(&v).map_err(|_| "engine".into())
}

/// src(내려받은 원본)를 읽어 변환본을 dst 에 쓴다. 폴더는 만든다.
pub fn write_converted_config(src: &Path, dst: &Path) -> Result<(), String> {
    let out = single_codepoint_config(&std::fs::read_to_string(src).map_err(|_| "engine".to_string())?)?;
    std::fs::create_dir_all(dst.parent().ok_or("write")?).map_err(|_| "write".to_string())?;
    std::fs::write(dst, out).map_err(|_| "write".into())
}

fn run(exe: &Path, args: Vec<String>, text: &str, timeout: Duration) -> Result<(), String> {
    let mut cmd = std::process::Command::new(exe);
    cmd.args(args);
    let mut child = quiet(&mut cmd).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|_| "engine".to_string())?;
    if let Some(mut si) = child.stdin.take() {
        let _ = si.write_all(format!("{text}\n").as_bytes()); // 닫으면(drop) 글 끝
    }
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(st)) => return if st.success() { Ok(()) } else { Err("engine".into()) },
            Ok(None) if start.elapsed() >= timeout => {
                let _ = child.kill(); // 이 자식 하나만
                let _ = child.wait();
                return Err("timeout".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => return Err("engine".into()),
        }
    }
}

/// tmp/s-<번호>.wav 에 쓰게 하고 읽은 뒤 wav 를 지운다. 시간 초과면 그 PID 만 끄고 Err("timeout")
pub fn piper_speak_with(exe: &Path, onnx: &Path, json: &Path, tmp: &Path, text: &str, timeout: Duration) -> Result<Vec<u8>, String> {
    std::fs::create_dir_all(tmp).map_err(|_| "write".to_string())?;
    let wav = tmp.join(format!("s-{}.wav", SEQ.fetch_add(1, Ordering::SeqCst)));
    let r = run(exe, piper_args(onnx, json, &wav), text, timeout).and_then(|_| std::fs::read(&wav).map_err(|_| "engine".to_string()));
    let _ = std::fs::remove_file(&wav);
    r.and_then(|b| if b.is_empty() { Err("engine".into()) } else { Ok(b) })
}

// ---- Tauri 명령 ----
#[derive(serde::Serialize)]
pub struct PiperStatus {
    engine: Part,
    ko: Part,
    en: Part,
}

#[tauri::command]
pub async fn piper_status(app: tauri::AppHandle, state: tauri::State<'_, Voice>) -> Result<PiperStatus, String> {
    let dir = voice_dir(&app)?;
    let part = |k: &str| state.part(&dir, &pin(k).unwrap());
    Ok(PiperStatus { engine: part("piper-engine"), ko: merge(part("piper-ko"), part("piper-ko-json")), en: merge(part("piper-en"), part("piper-en-json")) })
}

#[tauri::command]
pub async fn piper_speak(app: tauri::AppHandle, state: tauri::State<'_, Voice>, text: String, lang: String) -> Result<Vec<u8>, String> {
    let text = clip_text(&text)?;
    let (m, j) = voice_kinds(&lang)?;
    let dir = voice_dir(&app)?;
    let ready = ["piper-engine", m, j].iter().all(|k| state.part(&dir, &pin(k).unwrap()) == Part::Ready);
    let exe = find_exe(&dir.join("piper/engine")).filter(|_| ready).ok_or("not-ready")?;
    let voices = dir.join("piper/voices");
    let (onnx, orig) = (voices.join(pin(m).unwrap().file), voices.join(pin(j).unwrap().file));
    let json = dir.join("piper/run").join(pin(j).unwrap().file); // 변환본은 따로(원본 해시 확인은 그대로)
    write_converted_config(&orig, &json)?;
    tauri::async_runtime::spawn_blocking(move || piper_speak_with(&exe, &onnx, &json, &dir.join("tmp"), &text, Duration::from_secs(20)))
        .await
        .map_err(|e| e.to_string())?
}
