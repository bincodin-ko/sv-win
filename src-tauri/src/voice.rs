// F1 음성 엔진(S-2200~S-2215): whisper.cpp 실행 파일 + ggml 모델을 앱 데이터 폴더 Voice/ 에 두고 자식 프로세스로 받아쓴다.
// 내려받기는 사용자가 켤 때만(프런트 확인창 S-2202). 소리는 메모리와 Voice/tmp 의 임시 WAV 에만 있고 끝나면 지운다(S-2214).
pub mod pins;
#[cfg(test)]
mod tests;
use crate::repo_setup::{kill_pid, quiet};
use pins::{pin, Pin};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Part {
    None,
    Downloading { pct: u8 },
    Ready,
    Failed { why: String },
}

struct Dl {
    part: Part,
    pid: Option<u32>,
    cancelled: bool,
}

/// 내려받기 상태(종류별)와 받아쓰기 한 번에 하나 잠금
#[derive(Default, Clone)]
pub struct Voice {
    dl: Arc<Mutex<HashMap<String, Dl>>>,
    busy: Arc<Mutex<()>>,
}

/// Windows 기본 도구(curl·tar·certutil)는 System32 의 것을 쓴다(Git Bash 의 같은 이름 도구를 피함)
fn sys(exe: &str) -> PathBuf {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    let p = Path::new(&root).join("System32").join(exe);
    if p.exists() { p } else { PathBuf::from(exe) }
}

impl Voice {
    fn set(&self, kind: &str, part: Part) {
        let mut m = self.dl.lock().unwrap();
        let e = m.entry(kind.into()).or_insert(Dl { part: Part::None, pid: None, cancelled: false });
        e.part = part;
    }

    /// S-2201: 진행 중·실패면 그 상태, 아니면 디스크(파일 + 크기·해시 표식 `.ok`)로 판정
    pub fn part(&self, dir: &Path, p: &Pin) -> Part {
        if let Some(d) = self.dl.lock().unwrap().get(&p.kind) {
            return d.part.clone();
        }
        let ok = |marker: PathBuf| std::fs::read_to_string(marker).map(|s| s.trim() == p.sha256).unwrap_or(false);
        let ready = if p.kind == "engine" {
            find_exe(&dir.join("engine")).is_some() && ok(dir.join("engine/.ok"))
        } else {
            let f = dir.join("models").join(&p.file);
            std::fs::metadata(&f).map(|m| m.len() == p.bytes).unwrap_or(false) && ok(dir.join("models").join(format!("{}.ok", p.file)))
        };
        if ready { Part::Ready } else { Part::None }
    }

    /// S-2203: curl 자식으로 tmp 에 받고 → certutil SHA-256 확인 → 모델은 models/ 로 옮기고, 엔진 zip 은 engine/ 에 푼다 → `.ok`.
    /// 끝날 때까지 막는다(명령은 스레드에서 부른다).
    pub fn run_download(&self, dir: &Path, p: &Pin, curl: &Path) -> Part {
        {
            let mut m = self.dl.lock().unwrap();
            m.insert(p.kind.clone(), Dl { part: Part::Downloading { pct: 0 }, pid: None, cancelled: false });
        }
        let tmp = dir.join("tmp");
        let _ = std::fs::create_dir_all(&tmp);
        let part_file = tmp.join(format!("dl-{}.part", p.kind));
        let _ = std::fs::remove_file(&part_file);
        let fail = |why: &str| {
            let _ = std::fs::remove_file(&part_file);
            let r = Part::Failed { why: why.into() };
            self.set(&p.kind, r.clone());
            r
        };
        let mut cmd = Command::new(curl);
        cmd.args(["-L", "--fail", "--retry", "2", "-s", "-o"]).arg(&part_file).arg(&p.url);
        let mut child = match quiet(&mut cmd).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn() {
            Ok(c) => c,
            Err(_) => return fail("curl"),
        };
        let pid = child.id();
        let cancelled_early = {
            let mut m = self.dl.lock().unwrap();
            let e = m.get_mut(&p.kind).unwrap();
            e.pid = Some(pid);
            e.cancelled
        };
        if cancelled_early {
            kill_pid(pid);
        }
        let ok = loop {
            match child.try_wait() {
                Ok(Some(st)) => break st.success(),
                Ok(None) => {}
                Err(_) => break false,
            }
            let got = std::fs::metadata(&part_file).map(|m| m.len()).unwrap_or(0);
            let pct = if p.bytes == 0 { 0 } else { (got * 100 / p.bytes).min(99) as u8 };
            if let Some(e) = self.dl.lock().unwrap().get_mut(&p.kind) {
                if !e.cancelled {
                    e.part = Part::Downloading { pct };
                }
            }
            std::thread::sleep(Duration::from_millis(100)); // ponytail: 0.5초 대신 0.1초 확인(진행률 갱신은 같다)
        };
        if self.dl.lock().unwrap().get(&p.kind).map(|e| e.cancelled).unwrap_or(false) {
            let _ = std::fs::remove_file(&part_file);
            self.dl.lock().unwrap().remove(&p.kind);
            return Part::None;
        }
        if !ok {
            return fail("download");
        }
        if sha256_file(&part_file).as_deref() != Some(p.sha256.as_str()) {
            return fail("checksum");
        }
        if p.kind == "engine" {
            let eng = dir.join("engine");
            let _ = std::fs::remove_dir_all(&eng);
            let _ = std::fs::create_dir_all(&eng);
            let mut tar = Command::new(sys("tar.exe"));
            tar.arg("-xf").arg(&part_file).arg("-C").arg(&eng);
            let extracted = quiet(&mut tar).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status().map(|s| s.success()).unwrap_or(false);
            if !extracted || find_exe(&eng).is_none() {
                let _ = std::fs::remove_dir_all(&eng);
                return fail("engine-missing");
            }
            let _ = std::fs::remove_file(&part_file);
            if std::fs::write(eng.join(".ok"), &p.sha256).is_err() {
                return fail("write");
            }
        } else {
            let models = dir.join("models");
            let _ = std::fs::create_dir_all(&models);
            let dest = models.join(&p.file);
            let _ = std::fs::remove_file(&dest);
            if std::fs::rename(&part_file, &dest).is_err() || std::fs::write(models.join(format!("{}.ok", p.file)), &p.sha256).is_err() {
                return fail("write");
            }
        }
        self.dl.lock().unwrap().remove(&p.kind);
        Part::Ready
    }

    /// 진행 중인 내려받기의 curl PID 만 끈다
    pub fn cancel(&self, kind: &str) -> bool {
        let mut m = self.dl.lock().unwrap();
        match m.get_mut(kind) {
            Some(e) if matches!(e.part, Part::Downloading { .. }) && !e.cancelled => {
                e.cancelled = true;
                if let Some(pid) = e.pid {
                    kill_pid(pid);
                }
                true
            }
            _ => false,
        }
    }
}

/// S-2203: https 의 ggml-org/whisper.cpp(GitHub)·ggerganov/whisper.cpp(Hugging Face) 아래만
pub fn url_allowed(u: &str) -> bool {
    u.starts_with("https://github.com/ggml-org/whisper.cpp/") || u.starts_with("https://huggingface.co/ggerganov/whisper.cpp/")
}

/// S-2207 인자: -m 모델 -f wav -l 언어|auto -nt -np -nth 0.6 -t 스레드 --prompt 힌트(비면 뺌)
pub fn whisper_args(model: &Path, wav: &Path, lang: &str, prompt: &str, threads: usize) -> Vec<String> {
    let lang = if lang.is_empty() { "auto" } else { lang };
    let mut a: Vec<String> = ["-m", &model.display().to_string(), "-f", &wav.display().to_string(), "-l", lang, "-nt", "-np", "-nth", "0.6", "-t", &threads.to_string()]
        .iter()
        .map(|s| s.to_string())
        .collect();
    if !prompt.is_empty() {
        a.push("--prompt".into());
        a.push(prompt.into());
    }
    a
}

pub fn threads() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1).clamp(1, 8)
}

/// 제한 시간 = 소리 길이 × 4 + 15초 (16kHz 모노 PCM16 = 32000 바이트/초, 머리 44)
pub fn timeout_for(wav_len: usize) -> Duration {
    let ms = (wav_len.saturating_sub(44) as u64) * 1000 / 32000;
    Duration::from_millis(ms * 4 + 15_000)
}

static SEQ: AtomicU32 = AtomicU32::new(1);

/// Voice/tmp/t-<번호>.wav 에 쓰고 엔진을 돌린 뒤 wav 를 바로 지운다. 시간 초과면 그 PID 만 끄고 Err("timeout")
pub fn transcribe_with(exe: &Path, model: &Path, tmp: &Path, wav: &[u8], lang: &str, prompt: &str, timeout: Duration) -> Result<String, String> {
    std::fs::create_dir_all(tmp).map_err(|_| "write".to_string())?;
    let f = tmp.join(format!("t-{}.wav", SEQ.fetch_add(1, Ordering::SeqCst)));
    std::fs::write(&f, wav).map_err(|_| "write".to_string())?;
    let r = crate::gh::run_timeout_out(Command::new(exe).args(whisper_args(model, &f, lang, prompt, threads())), timeout);
    let _ = std::fs::remove_file(&f);
    match r {
        None => Err("timeout".into()),
        Some((false, ..)) => Err("engine".into()),
        Some((true, out, _)) => Ok(out.lines().map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join(" ")),
    }
}

/// S-2214·S-2215: 시작할 때 Voice/tmp 의 남은 wav·받다 만 파일을 지운다
pub fn clean_tmp(dir: &Path) {
    let t = dir.join("tmp");
    let _ = std::fs::remove_dir_all(&t);
    let _ = std::fs::create_dir_all(&t);
}

/// `certutil -hashfile <p> SHA256` 의 64자 16진 줄(옛 Windows 는 공백이 섞임)
pub fn sha256_file(p: &Path) -> Option<String> {
    if !p.is_file() {
        return None;
    }
    let mut c = Command::new(sys("certutil.exe"));
    c.arg("-hashfile").arg(p).arg("SHA256");
    let out = quiet(&mut c).stdin(Stdio::null()).stderr(Stdio::null()).output().ok()?;
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|l| l.replace(' ', "").to_lowercase())
        .find(|l| l.len() == 64 && l.bytes().all(|b| b.is_ascii_hexdigit()))
}

/// 풀린 엔진 폴더에서 whisper-cli.exe(없으면 옛 이름 main.exe)를 찾는다(S-2204)
pub fn find_exe(d: &Path) -> Option<PathBuf> {
    fn walk(d: &Path, depth: u8, out: &mut Vec<PathBuf>) {
        for e in std::fs::read_dir(d).into_iter().flatten().flatten() {
            let p = e.path();
            if p.is_dir() && depth < 3 {
                walk(&p, depth + 1, out);
            } else if p.is_file() {
                out.push(p);
            }
        }
    }
    let mut files = vec![];
    walk(d, 0, &mut files);
    ["whisper-cli.exe", "main.exe"]
        .iter()
        .find_map(|n| files.iter().find(|f| f.file_name().is_some_and(|x| x.eq_ignore_ascii_case(n))).cloned())
}

fn setting(s: &Map<String, Value>, k: &str) -> Option<String> {
    s.get(k).and_then(Value::as_str).map(str::trim).filter(|v| !v.is_empty()).map(String::from)
}

/// S-2200: SYMVIBE_WHISPER(시험) > 설정 speechEnginePath > Voice/engine 에서 찾은 것
pub fn engine_path(dir: &Path, s: &Map<String, Value>, env: Option<String>) -> Option<PathBuf> {
    env.filter(|v| !v.is_empty()).or_else(|| setting(s, "speechEnginePath")).map(PathBuf::from).or_else(|| find_exe(&dir.join("engine")))
}

pub fn model_path(dir: &Path, s: &Map<String, Value>, model: &str) -> PathBuf {
    setting(s, "speechModelPath").map(PathBuf::from).unwrap_or_else(|| dir.join("models").join(format!("ggml-{model}.bin")))
}

// ---- Tauri 명령 ----
pub fn voice_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("Voice"))
}
#[tauri::command]
pub fn voice_folder(app: tauri::AppHandle) -> Result<String, String> {
    let d = voice_dir(&app)?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().into_owned())
}
fn load_settings(app: &tauri::AppHandle) -> Map<String, Value> {
    crate::settings::file(app).map(|f| crate::settings::load(&f)).unwrap_or_default()
}
fn model_kind(m: &str) -> Result<&'static str, String> {
    match m {
        "small" | "" => Ok("small"),
        "base" => Ok("base"),
        _ => Err("unknown model".into()),
    }
}
fn custom_part(p: &Path) -> Part {
    if p.is_file() { Part::Ready } else { Part::None }
}

#[derive(serde::Serialize)]
pub struct Status {
    engine: Part,
    model: Part,
}

#[tauri::command]
pub fn voice_status(app: tauri::AppHandle, state: tauri::State<'_, Voice>, model: String) -> Result<Status, String> {
    let m = model_kind(&model)?;
    let dir = voice_dir(&app)?;
    let s = load_settings(&app);
    let env = std::env::var("SYMVIBE_WHISPER").ok().filter(|v| !v.is_empty());
    let engine = match env.or_else(|| setting(&s, "speechEnginePath")) {
        Some(p) => custom_part(Path::new(&p)),
        None => state.part(&dir, &pin("engine").unwrap()),
    };
    let model = match setting(&s, "speechModelPath") {
        Some(p) => custom_part(Path::new(&p)),
        None => state.part(&dir, &pin(m).unwrap()),
    };
    Ok(Status { engine, model })
}

/// 고정 핀(pins.rs)만 받는다. 프런트는 종류 이름만 보낸다(URL·해시를 바꿀 수 없음)
#[tauri::command]
pub fn voice_download(app: tauri::AppHandle, state: tauri::State<'_, Voice>, kind: String) -> Result<(), String> {
    let p = pin(&kind).ok_or("unknown download")?;
    if !url_allowed(&p.url) {
        return Err("url not allowed".into());
    }
    let dir = voice_dir(&app)?;
    if matches!(state.part(&dir, &p), Part::Downloading { .. }) {
        return Ok(());
    }
    state.set(&p.kind, Part::Downloading { pct: 0 });
    let v = state.inner().clone();
    std::thread::spawn(move || v.run_download(&dir, &p, &sys("curl.exe")));
    Ok(())
}

#[tauri::command]
pub fn voice_cancel(state: tauri::State<'_, Voice>, kind: String) -> bool {
    state.cancel(&kind)
}

#[tauri::command]
pub async fn voice_transcribe(app: tauri::AppHandle, state: tauri::State<'_, Voice>, wav: Vec<u8>, lang: String, prompt: String, model: String) -> Result<String, String> {
    let m = model_kind(&model)?;
    let dir = voice_dir(&app)?;
    let s = load_settings(&app);
    let exe = engine_path(&dir, &s, std::env::var("SYMVIBE_WHISPER").ok()).filter(|p| p.is_file()).ok_or("not-ready")?;
    let mp = model_path(&dir, &s, m);
    if !mp.is_file() {
        return Err("not-ready".into());
    }
    let lang = if lang.len() == 2 && lang.bytes().all(|b| b.is_ascii_lowercase()) { lang } else { "auto".into() };
    let busy = state.busy.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _one = busy.lock().unwrap(); // 한 번에 하나(대기 규칙은 프런트 recognize.ts)
        transcribe_with(&exe, &mp, &dir.join("tmp"), &wav, &lang, &prompt, timeout_for(wav.len()))
    })
    .await
    .map_err(|e| e.to_string())?
}
