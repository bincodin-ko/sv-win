//! ConPTY(portable-pty) 터미널: spawn/write/resize/kill + 16ms/64KB 묶음 출력 (S-100~S-105)
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// 한 번에 보내는 묶음 최대 크기 (S-102)
pub const BATCH_MAX: usize = 64 * 1024;
/// 첫 바이트 뒤 이만큼 지나면 보냄 (S-102)
pub const BATCH_WAIT: Duration = Duration::from_millis(16);

/// P2: 저사양이면 50ms, 저사양 + 안 보이는 콘솔이면 100ms. 그 밖은 16ms.
pub fn batch_wait(low_spec: bool, visible: bool) -> Duration {
    match (low_spec, visible) {
        (false, _) => BATCH_WAIT,
        (true, true) => Duration::from_millis(50),
        (true, false) => Duration::from_millis(100),
    }
}

/// 출력 묶음: 첫 바이트 뒤 16ms(P2: 바꿀 수 있음) 또는 64KB 먼저 차는 쪽에서 내보낸다.
pub struct Batcher {
    buf: Vec<u8>,
    first: Option<Instant>,
    wait: Duration,
}

impl Default for Batcher {
    fn default() -> Self {
        Batcher { buf: Vec::new(), first: None, wait: BATCH_WAIT }
    }
}

impl Batcher {
    /// 기다리는 시간을 바꾼다(이미 쌓인 것의 deadline 도 첫 바이트 시각 + 새 값).
    pub fn set_wait(&mut self, w: Duration) {
        self.wait = w;
    }
}

impl Batcher {
    /// 바이트를 넣고, 지금 보낼 묶음들(각 ≤64KB, 순서대로)을 돌려준다.
    pub fn push(&mut self, bytes: &[u8], now: Instant) -> Vec<Vec<u8>> {
        let mut out = Vec::new();
        if bytes.is_empty() {
            return out;
        }
        if self.buf.is_empty() {
            self.first = Some(now);
        }
        self.buf.extend_from_slice(bytes);
        while self.buf.len() >= BATCH_MAX {
            let rest = self.buf.split_off(BATCH_MAX);
            out.push(std::mem::replace(&mut self.buf, rest));
        }
        if self.buf.is_empty() {
            self.first = None;
        }
        out.extend(self.poll(now));
        out
    }

    /// 첫 바이트 뒤 16ms가 지났으면 남은 것을 내보낸다.
    pub fn poll(&mut self, now: Instant) -> Option<Vec<u8>> {
        match self.deadline() {
            Some(d) if now >= d => self.flush(),
            _ => None,
        }
    }

    /// 남은 것을 바로 내보낸다(출력 끝).
    pub fn flush(&mut self) -> Option<Vec<u8>> {
        self.first = None;
        (!self.buf.is_empty()).then(|| std::mem::take(&mut self.buf))
    }

    pub fn deadline(&self) -> Option<Instant> {
        self.first.map(|t| t + self.wait)
    }
}

pub type DataFn = Box<dyn FnMut(Vec<u8>) + Send>;
pub type ExitFn = Box<dyn FnOnce(Option<u32>) + Send>;

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    exited: Arc<AtomicBool>,
    /// S-620: 자식(루트) PID. 일시 중지·재개가 이 PID 의 트리를 찾는다
    pid: Option<u32>,
    /// 멈춰 있으면 멈춘 프로세스 목록(재개 때 같은 목록을 쓴다)
    frozen: Option<Vec<crate::suspend::Entry>>,
    /// P2: 묶음 간격(ms). 프런트가 pty_set_batch 로 바꾼다
    wait_ms: Arc<AtomicU64>,
}

type Sessions = Arc<Mutex<HashMap<u32, Session>>>;

#[derive(Default)]
pub struct PtyManager {
    next: AtomicU32,
    sessions: Sessions,
}

/// S-101: 자식 환경 변수
fn build_command(program: &str, args: &[String], env: &[(String, String)], cwd: Option<&str>) -> CommandBuilder {
    let program = if program.is_empty() {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into())
    } else {
        program.to_string()
    };
    let mut cmd = CommandBuilder::new(program);
    cmd.args(args);
    match cwd.filter(|c| !c.is_empty()) {
        Some(c) => cmd.cwd(c),
        None => {
            if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
                cmd.cwd(home);
            }
        }
    }
    for (k, _) in std::env::vars_os() {
        let ks = k.to_string_lossy().to_ascii_uppercase();
        if ks.starts_with("CLAUDE_CODE_") || ks == "CLAUDECODE" {
            cmd.env_remove(&k);
        }
    }
    for (k, v) in env {
        cmd.env(k, v); // yoloEnv 등 호출자가 준 변수. 아래 고정값이 이긴다
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "Hypervibe");
    cmd
}

impl PtyManager {
    /// S-100: cwd에서 ConPTY로 실행. 아무것도 자동 입력하지 않는다.
    #[allow(clippy::too_many_arguments)]
    pub fn spawn(
        &self,
        program: &str,
        args: &[String],
        env: &[(String, String)],
        cwd: Option<&str>,
        cols: u16,
        rows: u16,
        mut on_data: DataFn,
        on_exit: ExitFn,
    ) -> Result<u32, String> {
        let e = |x: anyhow::Error| x.to_string();
        let pair = native_pty_system()
            .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(e)?;
        let mut child = pair.slave.spawn_command(build_command(program, args, env, cwd)).map_err(e)?;
        drop(pair.slave); // 슬레이브를 남기면 ConPTY가 안 닫힌다
        let mut reader = pair.master.try_clone_reader().map_err(e)?;
        let writer = pair.master.take_writer().map_err(e)?;
        let killer = child.clone_killer();
        let pid = child.process_id();
        let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        let exited = Arc::new(AtomicBool::new(false));

        // 읽기 스레드 → 묶음 스레드 (읽기는 막혀 있으므로 시간 재기는 따로)
        let (tx, rx) = mpsc::channel::<Vec<u8>>();
        std::thread::spawn(move || {
            let mut buf = vec![0u8; 16 * 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                }
            }
        });
        let (code_tx, code_rx) = mpsc::channel::<Option<u32>>();
        let wait_ms = Arc::new(AtomicU64::new(BATCH_WAIT.as_millis() as u64));
        let wait_ms2 = wait_ms.clone();
        std::thread::spawn(move || {
            let mut b = Batcher::default();
            loop {
                b.set_wait(Duration::from_millis(wait_ms2.load(Ordering::Relaxed)));
                let msg = match b.deadline() {
                    Some(d) => rx.recv_timeout(d.saturating_duration_since(Instant::now())),
                    None => rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
                };
                match msg {
                    Ok(bytes) => b.push(&bytes, Instant::now()).into_iter().for_each(&mut on_data),
                    Err(RecvTimeoutError::Timeout) => b.poll(Instant::now()).into_iter().for_each(&mut on_data),
                    Err(RecvTimeoutError::Disconnected) => {
                        b.flush().into_iter().for_each(&mut on_data);
                        break;
                    }
                }
            }
            // 출력을 다 보낸 뒤 종료 알림
            on_exit(code_rx.recv().unwrap_or(None));
        });

        self.sessions.lock().unwrap().insert(
            id,
            Session { master: pair.master, writer, killer, exited: exited.clone(), pid, frozen: None, wait_ms },
        );

        // 대기 스레드: 자식이 끝나면 ConPTY를 닫아 읽기 스레드에 EOF를 준다
        let sessions = self.sessions.clone();
        std::thread::spawn(move || {
            let code = child.wait().ok().map(|s| s.exit_code());
            exited.store(true, Ordering::SeqCst);
            let s = sessions.lock().unwrap().remove(&id);
            drop(s); // 잠금 밖에서 닫기
            let _ = code_tx.send(code);
        });
        Ok(id)
    }

    pub fn write(&self, id: u32, data: &[u8]) -> Result<(), String> {
        let mut map = self.sessions.lock().unwrap();
        let s = map.get_mut(&id).ok_or("없는 터미널")?;
        s.writer.write_all(data).and_then(|_| s.writer.flush()).map_err(|x| x.to_string())
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        let map = self.sessions.lock().unwrap();
        let s = map.get(&id).ok_or("없는 터미널")?;
        s.master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|x| x.to_string())
    }

    /// P2: 저사양·보임 여부에 따라 묶음 간격을 바꾼다(없는 id 는 오류 없이 무시: 방금 끝난 터미널)
    pub fn set_batch(&self, id: u32, low_spec: bool, visible: bool) {
        if let Some(s) = self.sessions.lock().unwrap().get(&id) {
            s.wait_ms.store(batch_wait(low_spec, visible).as_millis() as u64, Ordering::Relaxed);
        }
    }

    pub fn pid(&self, id: u32) -> Option<u32> {
        self.sessions.lock().unwrap().get(&id)?.pid
    }

    /// S-620: 프로세스 트리를 멈춘다. 이미 멈춰 있으면 아무 일도 안 한다
    pub fn pause(&self, id: u32) -> Result<(), String> {
        let mut map = self.sessions.lock().unwrap();
        let s = map.get_mut(&id).ok_or("없는 터미널")?;
        if s.frozen.is_some() {
            return Ok(());
        }
        let tree = crate::suspend::tree(s.pid.ok_or("PID 없음")?);
        if tree.is_empty() {
            return Err("이미 끝난 프로세스".into());
        }
        crate::suspend::suspend_list(&tree);
        s.frozen = Some(tree);
        Ok(())
    }

    /// S-621: 같은 목록을 다시 돌린다. 멈춰 있지 않으면 아무 일도 안 한다
    pub fn resume(&self, id: u32) -> Result<(), String> {
        let mut map = self.sessions.lock().unwrap();
        let s = map.get_mut(&id).ok_or("없는 터미널")?;
        if let Some(t) = s.frozen.take() {
            crate::suspend::resume_list(&t);
        }
        Ok(())
    }

    /// S-105: ConPTY 닫기(=CTRL_CLOSE_EVENT) → 2초 뒤에도 살아 있으면 강제 종료
    pub fn kill(&self, id: u32) -> Result<(), String> {
        let s = self.sessions.lock().unwrap().remove(&id).ok_or("없는 터미널")?;
        let Session { master, writer, mut killer, exited, frozen, pid, .. } = s;
        let tree = pid.map(crate::suspend::tree).unwrap_or_default(); // 닫기 전에 잡아 둔다: 2초 뒤엔 부모 관계가 끊겼을 수 있다
        if let Some(t) = frozen {
            crate::suspend::resume_list(&t); // S-622: 멈춘 프로세스는 닫힘 신호를 못 받는다. 먼저 재개
        }
        drop(writer);
        drop(master);
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(2));
            if !exited.load(Ordering::SeqCst) {
                let _ = killer.kill();
                crate::suspend::kill_list(&tree); // S-105: 루트만이 아니라 자손까지(시작 시각이 같은 것만)
            }
        });
        Ok(())
    }

    /// S-231: 앱 종료 때 모든 터미널에 kill 절차. 끝났는지 볼 깃발들을 돌려준다.
    pub fn kill_all(&self) -> Vec<Arc<AtomicBool>> {
        let (ids, flags): (Vec<u32>, Vec<Arc<AtomicBool>>) =
            self.sessions.lock().unwrap().iter().map(|(id, s)| (*id, s.exited.clone())).unzip();
        for id in ids {
            let _ = self.kill(id);
        }
        flags
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::sync::{Arc, Mutex};

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    #[test]
    fn batcher_waits_16ms_then_emits() {
        let t0 = Instant::now();
        let mut b = Batcher::default();
        assert!(b.push(b"ab", t0).is_empty());
        assert!(b.push(b"cd", t0 + ms(10)).is_empty());
        assert_eq!(b.poll(t0 + ms(15)), None);
        assert_eq!(b.deadline(), Some(t0 + BATCH_WAIT));
        assert_eq!(b.poll(t0 + ms(16)), Some(b"abcd".to_vec()));
        assert_eq!(b.deadline(), None);
    }

    #[test]
    fn batcher_push_after_16ms_emits_all() {
        let t0 = Instant::now();
        let mut b = Batcher::default();
        b.push(b"ab", t0);
        assert_eq!(b.push(b"cd", t0 + ms(20)), vec![b"abcd".to_vec()]);
    }

    #[test]
    fn batcher_splits_at_64kb_in_order() {
        let t0 = Instant::now();
        let mut b = Batcher::default();
        let data: Vec<u8> = (0..BATCH_MAX * 2 + 100).map(|i| (i % 251) as u8).collect();
        let out = b.push(&data, t0);
        assert_eq!(out.len(), 2);
        assert!(out.iter().all(|c| c.len() == BATCH_MAX));
        let rest = b.poll(t0 + ms(16)).unwrap();
        assert_eq!(rest.len(), 100);
        let joined: Vec<u8> = out.into_iter().flatten().chain(rest).collect();
        assert_eq!(joined, data);
    }

    #[test]
    fn batcher_never_emits_empty() {
        let t0 = Instant::now();
        let mut b = Batcher::default();
        assert!(b.push(b"", t0).is_empty());
        assert_eq!(b.poll(t0 + ms(100)), None);
        assert_eq!(b.flush(), None);
        assert_eq!(b.deadline(), None);
        // 정확히 64KB면 바로 하나 내보내고 남는 것 없음
        assert_eq!(b.push(&vec![1u8; BATCH_MAX], t0).len(), 1);
        assert_eq!(b.flush(), None);
    }

    #[test]
    fn p2_batch_wait_table() {
        assert_eq!(batch_wait(false, true), ms(16));
        assert_eq!(batch_wait(false, false), ms(16));
        assert_eq!(batch_wait(true, true), ms(50));
        assert_eq!(batch_wait(true, false), ms(100));
    }

    #[test]
    fn p2_batcher_set_wait_changes_deadline_without_losing_bytes() {
        let t0 = Instant::now();
        let mut b = Batcher::default();
        b.set_wait(ms(50));
        b.push(b"ab", t0);
        assert_eq!(b.deadline(), Some(t0 + ms(50)));
        assert_eq!(b.poll(t0 + ms(49)), None);
        b.push(b"cd", t0 + ms(30));
        assert_eq!(b.poll(t0 + ms(50)), Some(b"abcd".to_vec()));
        b.set_wait(ms(100));
        b.push(b"e", t0 + ms(60));
        assert_eq!(b.poll(t0 + ms(159)), None);
        assert_eq!(b.poll(t0 + ms(160)), Some(b"e".to_vec()));
        b.set_wait(BATCH_WAIT);
        b.push(b"f", t0 + ms(200));
        assert_eq!(b.deadline(), Some(t0 + ms(216)));
    }

    type Out = (u32, Arc<Mutex<Vec<u8>>>, mpsc::Receiver<Option<u32>>);

    /// 시험용 spawn: 출력 모음 + 종료 알림. ConPTY는 시작할 때 커서 위치를 묻고(ESC[6n)
    /// 답이 올 때까지 자식을 멈춰 둔다. 앱에서는 xterm.js가 답하므로 시험에서는 여기서 답한다.
    fn spawn_t(m: &Arc<PtyManager>, a: &[&str], cwd: Option<&str>, cols: u16, rows: u16) -> Out {
        spawn_p(m, &comspec(), &args(a), cwd, cols, rows)
    }

    fn spawn_p(m: &Arc<PtyManager>, program: &str, a: &[String], cwd: Option<&str>, cols: u16, rows: u16) -> Out {
        spawn_e(m, program, a, &[], cwd, cols, rows)
    }

    fn spawn_e(m: &Arc<PtyManager>, program: &str, a: &[String], env: &[(String, String)], cwd: Option<&str>, cols: u16, rows: u16) -> Out {
        let buf = Arc::new(Mutex::new(Vec::new()));
        let b2 = buf.clone();
        let (tx, rx) = mpsc::channel();
        let (dsr_tx, dsr_rx) = mpsc::channel::<()>();
        let on_data: DataFn = Box::new(move |c: Vec<u8>| {
            if c.windows(4).any(|w| w == b"[6n") {
                let _ = dsr_tx.send(());
            }
            b2.lock().unwrap().extend(c);
        });
        let on_exit: ExitFn = Box::new(move |code| {
            let _ = tx.send(code);
        });
        let id = m.spawn(program, a, env, cwd, cols, rows, on_data, on_exit).unwrap();
        let m2 = m.clone();
        std::thread::spawn(move || {
            if dsr_rx.recv_timeout(Duration::from_secs(5)).is_ok() {
                let _ = m2.write(id, b"[1;1R");
            }
        });
        (id, buf, rx)
    }

    fn comspec() -> String {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into())
    }

    fn args(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn spawn_echo() {
        let m = Arc::new(PtyManager::default());
        let (_id, buf, rx) = spawn_t(&m, &["/c", "echo", "hello-pty"], None, 80, 24);
        rx.recv_timeout(Duration::from_secs(10)).expect("on_exit 안 옴");
        let out = String::from_utf8_lossy(&buf.lock().unwrap()).to_string();
        assert!(out.contains("hello-pty"), "출력: {out:?}");
    }

    #[test]
    fn resize() {
        let m = Arc::new(PtyManager::default());
        let (id, _buf, rx) = spawn_t(&m, &[], None, 80, 24);
        m.resize(id, 120, 40).unwrap();
        m.resize(id, 40, 10).unwrap();
        m.kill(id).unwrap();
        rx.recv_timeout(Duration::from_secs(5)).expect("on_exit 안 옴");
    }

    #[test]
    fn kill_ends_within_3s() {
        let m = Arc::new(PtyManager::default());
        let (id, _buf, rx) = spawn_t(&m, &[], None, 80, 24);
        std::thread::sleep(ms(300));
        let t = Instant::now();
        m.kill(id).unwrap();
        rx.recv_timeout(Duration::from_secs(3)).expect("kill 뒤 3초 안에 on_exit 안 옴");
        assert!(t.elapsed() < Duration::from_secs(3));
        assert!(m.write(id, b"x").is_err(), "죽은 id에 쓰기는 오류");
    }

    #[test]
    fn write_echoes_through_shell() {
        let m = Arc::new(PtyManager::default());
        let (id, buf, rx) = spawn_t(&m, &["/q"], None, 80, 24);
        m.write(id, b"echo wr-ok-%COMSPEC:~0,0%42\r\nexit\r\n").unwrap();
        rx.recv_timeout(Duration::from_secs(10)).expect("on_exit 안 옴");
        let out = String::from_utf8_lossy(&buf.lock().unwrap()).to_string();
        assert!(out.contains("wr-ok-42"), "출력: {out:?}");
    }

    #[test]
    fn env_vars() {
        // 부모에 넣어 둔 값은 자식에 넘어가면 안 된다 (S-101)
        std::env::set_var("CLAUDE_CODE_X", "leak");
        std::env::set_var("CLAUDECODE", "1");
        let m = Arc::new(PtyManager::default());
        let (_id, buf, rx) = spawn_t(&m, &["/c", "set"], None, 200, 50);
        rx.recv_timeout(Duration::from_secs(10)).expect("on_exit 안 옴");
        let out = String::from_utf8_lossy(&buf.lock().unwrap()).to_string();
        assert!(out.contains("TERM=xterm-256color"), "출력: {out:?}");
        assert!(out.contains("COLORTERM=truecolor"));
        assert!(out.contains("TERM_PROGRAM=Hypervibe"));
        assert!(!out.contains("CLAUDE_CODE_X"));
        assert!(!out.contains("CLAUDECODE="));
    }

    #[test]
    fn spawn_uses_cwd() {
        let dir = std::env::temp_dir();
        let m = Arc::new(PtyManager::default());
        let (_id, buf, rx) = spawn_t(&m, &["/c", "cd"], dir.to_str(), 200, 24);
        rx.recv_timeout(Duration::from_secs(10)).expect("on_exit 안 옴");
        let out = String::from_utf8_lossy(&buf.lock().unwrap()).to_lowercase();
        let want = dir.to_string_lossy().trim_end_matches('\\').to_lowercase();
        assert!(out.contains(&want), "출력: {out:?} 기대: {want}");
    }
    #[test]
    fn cmd_wrap_runs_through_pty_with_spaces_and_quotes() {
        // A3 메모: 공백 든 경로의 .cmd 를 agents::wrap 으로 감싼 줄이 portable-pty 에서 따옴표 이중 이스케이프 없이 실행되는가
        let dir = std::env::temp_dir().join(format!("sym wrap {}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("my agent.cmd");
        std::fs::write(&f, "@echo off\r\necho GOT[%~1][%~2]\r\n").unwrap();
        let (prog, a) = crate::agents::wrap(&f, vec!["two words".into(), "x".into()], "powershell.exe");
        let m = Arc::new(PtyManager::default());
        let (_id, buf, rx) = spawn_p(&m, &prog, &a, None, 200, 24);
        rx.recv_timeout(Duration::from_secs(10)).expect("on_exit 안 옴");
        let out = String::from_utf8_lossy(&buf.lock().unwrap()).to_string();
        let _ = std::fs::remove_dir_all(&dir);
        assert!(out.contains("GOT[two words][x]"), "출력: {out:?}");
    }

    #[cfg(windows)]
    #[test]
    fn kill_while_paused_still_ends() {
        // S-622: 멈춘 프로세스는 닫힘 신호를 못 받으므로 kill 이 먼저 재개한다. 2초 강제 종료에 기대지 않고 1.5초 안에 끝나야 한다
        let m = Arc::new(PtyManager::default());
        let (id, buf, rx) = spawn_t(&m, &[], None, 80, 24);
        // 프롬프트가 뜰 때까지(=cmd 준비 끝). 부하 중엔 고정 0.5초 뒤 cmd 가 아직 준비 전이라, 멈추지 않아도 닫힘 신호에 안 끝나고 2초 강제 종료로 갔다
        let t0 = Instant::now();
        while !buf.lock().unwrap().contains(&b'>') && t0.elapsed() < Duration::from_secs(30) {
            std::thread::sleep(ms(50));
        }
        m.pause(id).unwrap();
        std::thread::sleep(ms(200));
        let t = Instant::now();
        m.kill(id).unwrap();
        rx.recv_timeout(Duration::from_secs(5)).expect("멈춘 채 kill 뒤 on_exit 안 옴");
        assert!(t.elapsed() < ms(1500), "재개 없이 2초 강제 종료까지 기다렸다: {:?}", t.elapsed());
    }

    #[test]
    fn spawn_passes_env() {
        // A4 넘김: yoloEnv 를 PTY 자식 환경으로 (S-101 의 고정값·CLAUDE_CODE_ 제거는 그대로)
        let m = Arc::new(PtyManager::default());
        let env = vec![("GOOSE_MODE".to_string(), "auto".to_string()), ("SYM_A5".to_string(), "x y".to_string())];
        let (_id, buf, rx) = spawn_e(&m, &comspec(), &args(&["/c", "set"]), &env, None, 200, 50);
        rx.recv_timeout(Duration::from_secs(10)).expect("on_exit 안 옴");
        let out = String::from_utf8_lossy(&buf.lock().unwrap()).to_string();
        assert!(out.contains("GOOSE_MODE=auto"), "출력: {out:?}");
        assert!(out.contains("SYM_A5=x y"), "출력: {out:?}");
        assert!(out.contains("TERM_PROGRAM=Hypervibe"));
    }
}
