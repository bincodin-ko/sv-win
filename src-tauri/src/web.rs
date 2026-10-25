// C2 S-1099: 웹 바탕 Rust 명령(포트 확인·프레임 판정·검사 창)
use crate::gh::run_timeout;
use serde::Serialize;
use std::net::{TcpStream, ToSocketAddrs};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebProbe {
    pub reachable: bool,
    pub frame_blocked: bool,
    pub status: Option<u16>,
}

/// http/https 주소만 통과
pub fn check_http(url: &str) -> Result<(), String> {
    let ok = ["http://", "https://"].iter().any(|p| url.get(..p.len()).is_some_and(|h| h.eq_ignore_ascii_case(p)))
        && !url.chars().any(|c| c.is_whitespace() || c.is_control());
    if ok { Ok(()) } else { Err("http/https 주소만 열 수 있습니다".into()) }
}

/// 응답 헤더 글에서 iframe 으로 못 띄우게 막았는지(X-Frame-Options DENY/SAMEORIGIN, CSP frame-ancestors 가 * 아님)
pub fn frame_blocked(headers: &str) -> bool {
    headers.lines().filter_map(|l| l.split_once(':')).any(|(k, v)| {
        let v = v.to_ascii_lowercase();
        match k.trim().to_ascii_lowercase().as_str() {
            "x-frame-options" => v.contains("deny") || v.contains("sameorigin"),
            "content-security-policy" => v.split(';').any(|d| {
                let mut t = d.split_whitespace();
                t.next() == Some("frame-ancestors") && !t.any(|x| x == "*")
            }),
            _ => false,
        }
    })
}

fn host_port(url: &str) -> Option<(String, u16)> {
    let (default, rest) = if url.len() >= 8 && url[..8].eq_ignore_ascii_case("https://") { (443, &url[8..]) } else { (80, url.get(7..)?) };
    let auth = rest.split(['/', '?', '#']).next()?.rsplit('@').next()?;
    if let Some(r) = auth.strip_prefix('[') {
        let (h, after) = r.split_once(']')?;
        let port = match after.strip_prefix(':') { Some(p) => p.parse().ok()?, None => default };
        return Some((h.into(), port));
    }
    match auth.rsplit_once(':') {
        Some((h, p)) => Some((h.into(), p.parse().ok()?)),
        None => Some((auth.into(), default)),
    }
}

fn tcp_ok(host: &str, port: u16, timeout: Duration) -> bool {
    (host, port).to_socket_addrs().is_ok_and(|mut a| a.any(|ad| TcpStream::connect_timeout(&ad, timeout).is_ok()))
}

#[tauri::command]
pub fn web_ports(ports: Vec<u16>) -> Vec<bool> {
    std::thread::scope(|s| {
        let hs: Vec<_> = ports.iter().map(|&p| s.spawn(move || tcp_ok("127.0.0.1", p, Duration::from_millis(300)))).collect();
        hs.into_iter().map(|h| h.join().unwrap_or(false)).collect()
    })
}

#[tauri::command]
pub fn web_probe(url: String) -> Result<WebProbe, String> {
    check_http(&url)?;
    let (host, port) = host_port(&url).ok_or("잘못된 주소")?;
    let local = matches!(host.as_str(), "localhost" | "127.0.0.1" | "::1");
    if !tcp_ok(&host, port, Duration::from_secs(if local { 3 } else { 5 })) {
        return Ok(WebProbe { reachable: false, frame_blocked: false, status: None });
    }
    // 헤더를 못 읽어도(curl 없음·시간 초과) 연결은 된 것
    let mut cmd = Command::new("curl.exe");
    cmd.args(["-sI", "-L", "--max-redirs", "3", "-m", "5", &url]);
    let out = run_timeout(&mut cmd, Duration::from_secs(7)).filter(|(ok, _)| *ok).map(|(_, t)| t).unwrap_or_default();
    // -L 이면 헤더 묶음이 여러 개 — 마지막 응답만 본다
    let last = out.replace("\r\n", "\n").split("\n\n").filter(|b| b.contains("HTTP/")).last().unwrap_or("").to_string();
    let status = last.lines().find(|l| l.starts_with("HTTP/")).and_then(|l| l.split_whitespace().nth(1)).and_then(|c| c.parse().ok());
    Ok(WebProbe { reachable: true, frame_blocked: frame_blocked(&last), status })
}

fn window_label(id: &str) -> String {
    format!("inspect-{}", id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect::<String>())
}

/// 검사 창 `inspect-<id>` 를 열고 개발자 도구를 연다. 이미 있으면 앞으로 가져온다
#[tauri::command]
pub async fn web_window_open(app: AppHandle, id: String, url: String) -> Result<(), String> {
    check_http(&url)?;
    let label = window_label(&id);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.unminimize();
        return w.set_focus().map_err(|e| e.to_string());
    }
    let u: tauri::Url = url.parse().map_err(|_| "잘못된 주소".to_string())?;
    let w = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(u)).title(&url).inner_size(1100.0, 800.0).build().map_err(|e| e.to_string())?;
    w.open_devtools();
    Ok(())
}

#[tauri::command]
pub fn web_window_close(app: AppHandle, id: String) -> Result<(), String> {
    match app.get_webview_window(&window_label(&id)) {
        Some(w) => w.destroy().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    #[test]
    fn frame_blocked_rules() {
        assert!(frame_blocked("HTTP/1.1 200 OK\r\nX-Frame-Options: DENY\r\n"));
        assert!(frame_blocked("x-frame-options: sameorigin\r\n"));
        assert!(frame_blocked("Content-Security-Policy: default-src 'self'; frame-ancestors 'none'\r\n"));
        assert!(frame_blocked("content-security-policy: frame-ancestors 'self'\r\n"));
        assert!(!frame_blocked("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n"));
        assert!(!frame_blocked("Content-Security-Policy: default-src 'self'\r\n"));
        assert!(!frame_blocked("Content-Security-Policy: frame-ancestors *\r\n"));
        assert!(!frame_blocked(""));
    }

    fn free_port() -> u16 {
        let t = TcpListener::bind("127.0.0.1:0").unwrap();
        t.local_addr().unwrap().port()
    } // 반환과 함께 닫힌다

    #[test]
    fn web_ports_open_and_closed() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let open = l.local_addr().unwrap().port();
        assert_eq!(web_ports(vec![open, free_port()]), vec![true, false]);
    }

    /// 접속마다 정해진 응답을 주는 임시 서버(최대 8번). 포트를 돌려준다
    fn serve(resp: &'static str) -> u16 {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for mut s in l.incoming().flatten().take(8) {
                let mut buf = [0u8; 1024];
                let _ = s.read(&mut buf);
                let _ = s.write_all(resp.as_bytes());
            }
        });
        port
    }

    #[test]
    fn web_probe_reachable_and_closed() {
        let port = serve("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        let p = web_probe(format!("http://localhost:{port}/")).unwrap();
        assert!(p.reachable);
        let q = web_probe(format!("http://127.0.0.1:{}/", free_port())).unwrap();
        assert_eq!(q, WebProbe { reachable: false, frame_blocked: false, status: None });
    }

    #[cfg(windows)]
    #[test]
    fn web_probe_reads_frame_header() {
        let port = serve("HTTP/1.1 200 OK\r\nX-Frame-Options: DENY\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        let p = web_probe(format!("http://127.0.0.1:{port}/")).unwrap();
        assert!(p.reachable && p.frame_blocked);
        assert_eq!(p.status, Some(200));
    }

    #[test]
    fn rejects_non_http() {
        assert!(web_probe("file:///C:/x".into()).is_err());
        assert!(web_probe("ftp://example.com".into()).is_err());
        assert!(web_probe("javascript:alert(1)".into()).is_err());
    }
}
