//! S-110: 16개 PTY 동시 부하 — 각 ≥1MB + `DONE-<i>`를 10초 안에, 묶음 하나 ≤64KB
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use symvibe_lib::pty::{PtyManager, BATCH_MAX};

#[test]
fn sixteen_concurrent() {
    // target/debug/deps/pty_load-xxx.exe → target/debug/examples/flood.exe
    let exe = std::env::current_exe().unwrap();
    let flood = exe.parent().unwrap().parent().unwrap().join("examples").join("flood.exe");
    assert!(flood.exists(), "flood 예제 없음: {flood:?}");

    let m = Arc::new(PtyManager::default());
    let max_chunk = Arc::new(AtomicUsize::new(0));
    let (done_tx, done_rx) = mpsc::channel::<(usize, usize)>();
    let t0 = Instant::now();
    for i in 0..16usize {
        let total = Arc::new(Mutex::new((0usize, Vec::<u8>::new(), false)));
        let mc = max_chunk.clone();
        let tx = done_tx.clone();
        let marker = format!("DONE-{i}");
        // ConPTY는 시작 때 ESC[6n으로 커서 위치를 묻고 답을 기다린다(앱에서는 xterm.js가 답함)
        let (dsr_tx, dsr_rx) = mpsc::channel::<()>();
        let on_data = Box::new(move |c: Vec<u8>| {
            if c.windows(4).any(|w| w == b"[6n") {
                let _ = dsr_tx.send(());
            }
            mc.fetch_max(c.len(), Ordering::Relaxed);
            let mut g = total.lock().unwrap();
            g.0 += c.len();
            // 끝 표시가 묶음 경계에 걸릴 수 있으니 꼬리만 남겨 검사
            g.1.extend_from_slice(&c);
            let keep = g.1.len().saturating_sub(64);
            g.1.drain(..keep);
            if !g.2 && String::from_utf8_lossy(&g.1).contains(&marker) {
                g.2 = true;
                let _ = tx.send((i, g.0));
            }
        });
        let id = m.spawn(
            flood.to_str().unwrap(),
            &[i.to_string(), (1 << 20).to_string()],
            &[],
            None,
            120,
            30,
            on_data,
            Box::new(|_| {}),
        )
        .unwrap();
        let m2 = m.clone();
        std::thread::spawn(move || {
            if dsr_rx.recv_timeout(Duration::from_secs(5)).is_ok() {
                let _ = m2.write(id, b"[1;1R");
            }
        });
    }
    let mut seen = vec![false; 16];
    for _ in 0..16 {
        let left = Duration::from_secs(10).saturating_sub(t0.elapsed());
        let (i, bytes) = done_rx.recv_timeout(left).unwrap_or_else(|_| panic!("10초 안에 못 끝남: {seen:?}"));
        assert!(bytes >= 1 << 20, "터미널 {i}: {bytes} 바이트 < 1MB");
        seen[i] = true;
    }
    assert!(max_chunk.load(Ordering::Relaxed) <= BATCH_MAX);
    eprintln!("16개 끝: {:?}, 최대 묶음 {}", t0.elapsed(), max_chunk.load(Ordering::Relaxed));
}
