// 13묶음 R1 S-3320~S-3334: API 공급자 HTTP. 키는 Rust 안에서만(헤더로만), 리디렉션 안 따름, 오류 글은 마스킹.
use crate::secrets::{self, Secret};
use reqwest::Url;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fmt;
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

pub const DEFAULT_COMPAT: &str = "http://localhost:11434/v1";
const MAX_BODY: usize = 1 << 20; // 응답 1MB
const MAX_REQ: usize = 32 * 1024; // system+user 합쳐 32KB

/// 웹뷰로 가는 실패. 키 글자는 어디에도 없다(detail 은 mask 를 지난 것)
#[derive(Serialize, Clone, PartialEq)]
pub struct ApiErr {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}
impl ApiErr {
    pub fn new(kind: &str) -> Self {
        ApiErr { kind: kind.into(), status: None, detail: None }
    }
    fn status(mut self, s: u16) -> Self {
        self.status = Some(s);
        self
    }
    /// 마스킹 → 제어 문자 제거 → 200자 (S-3329·S-3330)
    fn detail(mut self, text: &str, key: &str) -> Self {
        self.detail = Some(mask(text, key).chars().filter(|c| !c.is_control()).take(200).collect());
        self
    }
}
impl fmt::Debug for ApiErr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ApiErr({} {:?} {:?})", self.kind, self.status, self.detail)
    }
}
impl fmt::Display for ApiErr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.kind)?;
        if let Some(d) = &self.detail {
            write!(f, ": {d}")?;
        }
        Ok(())
    }
}

fn local_host(host: &str) -> bool {
    let h = host.trim_start_matches('[').trim_end_matches(']');
    if h.eq_ignore_ascii_case("localhost") {
        return true;
    }
    if let Ok(ip) = h.parse::<std::net::Ipv4Addr>() {
        return ip.is_loopback() || ip.is_private(); // 127/8 · 10/8 · 172.16/12 · 192.168/16
    }
    h.parse::<std::net::Ipv6Addr>().map(|ip| ip.is_loopback()).unwrap_or(false)
}

/// 주소 검사(S-3327). 통과하면 끝 `/` 를 뗀 주소
pub fn check_base(url: &str) -> Result<String, ApiErr> {
    let bad = || ApiErr::new("url");
    let u = Url::parse(url.trim()).map_err(|_| bad())?;
    if !u.username().is_empty() || u.password().is_some() || u.query().is_some() || u.fragment().is_some() {
        return Err(bad());
    }
    let host = u.host_str().ok_or_else(bad)?;
    match u.scheme() {
        "https" => {}
        "http" if local_host(host) => {}
        _ => return Err(bad()),
    }
    Ok(u.as_str().trim_end_matches('/').to_string())
}

/// 모델 이름 검사(S-3326)
pub fn check_model(model: &str) -> Result<(), ApiErr> {
    let ok = (1..=100).contains(&model.len()) && model.chars().all(|c| c.is_ascii_alphanumeric() || "._:/@-".contains(c)) && !model.contains("..");
    if ok { Ok(()) } else { Err(ApiErr::new("no model")) }
}

fn is_tok(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '-' || c == '_'
}
fn run_len(s: &str, f: impl Fn(char) -> bool) -> usize {
    s.chars().take_while(|c| f(*c)).map(|c| c.len_utf8()).sum()
}

/// 마스킹(S-3330): 키 글자(4자 이상) → •••, sk-/sk-ant-/sk-proj-/AIza + 8자 이상 → 접두어•••, Bearer 뒤 → •••
pub fn mask(text: &str, key: &str) -> String {
    let s = if key.chars().count() >= 4 { text.replace(key, "•••") } else { text.to_string() };
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        let rest = &s[i..];
        if let Some(after) = rest.strip_prefix("Bearer ") {
            let n = run_len(after, |c| !c.is_whitespace() && c != '"' && c != '\'');
            if n > 0 {
                out.push_str("Bearer •••");
                i += 7 + n;
                continue;
            }
        }
        if let Some(p) = ["sk-ant-", "sk-proj-", "sk-", "AIza"].iter().find(|p| rest.starts_with(**p)) {
            let n = run_len(&rest[p.len()..], is_tok);
            if n >= 8 {
                out.push_str(p);
                out.push_str("•••");
                i += p.len() + n;
                continue;
            }
        }
        let c = rest.chars().next().unwrap();
        out.push(c);
        i += c.len_utf8();
    }
    out
}

struct Req {
    url: String,
    headers: Vec<(&'static str, String)>,
    body: String,
}

fn needs_key(provider: &str) -> bool {
    matches!(provider, "api:openai" | "api:anthropic" | "api:gemini")
}

/// 키는 헤더로만(S-3322~S-3325)
fn auth_headers(provider: &str, key: Option<&Secret>) -> Vec<(&'static str, String)> {
    let Some(k) = key else { return vec![] };
    match provider {
        "api:anthropic" => vec![("x-api-key", k.expose().to_string()), ("anthropic-version", "2023-06-01".into())],
        "api:gemini" => vec![("x-goog-api-key", k.expose().to_string())],
        _ => vec![("authorization", format!("Bearer {}", k.expose()))],
    }
}

fn build_ask(base: &str, provider: &str, model: &str, key: Option<&Secret>, system: &str, user: &str, response_format: bool) -> Req {
    let base = base.trim_end_matches('/');
    let mut headers = auth_headers(provider, key);
    headers.push(("content-type", "application/json".into()));
    let (url, body) = match provider {
        "api:anthropic" => (
            format!("{base}/messages"),
            json!({"model": model, "max_tokens": 512, "system": system, "messages": [{"role": "user", "content": user}]}),
        ),
        "api:gemini" => (
            format!("{base}/models/{model}:generateContent"),
            json!({"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": user}]}], "generationConfig": {"responseMimeType": "application/json"}}),
        ),
        _ => {
            let mut b = json!({"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]});
            if response_format {
                b["response_format"] = json!({"type": "json_object"});
            }
            (format!("{base}/chat/completions"), b)
        }
    };
    Req { url, headers, body: body.to_string() }
}

/// 답 글 꺼내기(S-3322·S-3324·S-3325)
fn parse_answer(provider: &str, body: &str, key: &str) -> Result<String, ApiErr> {
    let bad = |d: &str| ApiErr::new("bad").detail(d, key);
    let v: Value = serde_json::from_str(body).map_err(|_| bad("not JSON"))?;
    let text = match provider {
        "api:anthropic" => v["content"].as_array().map(|a| a.iter().filter(|p| p["type"] == "text").filter_map(|p| p["text"].as_str()).collect::<String>()).unwrap_or_default(),
        "api:gemini" => {
            let c = &v["candidates"][0];
            let t: String = c["content"]["parts"].as_array().map(|a| a.iter().filter(|p| p["thought"] != true).filter_map(|p| p["text"].as_str()).collect()).unwrap_or_default();
            if t.is_empty() {
                if let Some(f) = c["finishReason"].as_str() {
                    return Err(bad(f));
                }
            }
            t
        }
        _ => {
            let m = &v["choices"][0]["message"];
            if let Some(r) = m["refusal"].as_str().filter(|r| !r.is_empty()) {
                return Err(bad(r));
            }
            m["content"].as_str().unwrap_or_default().to_string()
        }
    };
    if text.is_empty() { Err(bad("empty answer")) } else { Ok(text) }
}

/// 상태 코드 → 실패(S-3329). detail = error.message 또는 본문 앞 200자
fn status_err(status: u16, body: &str, key: &str, ask: bool) -> ApiErr {
    let kind = match status {
        401 | 403 => "auth",
        404 if ask => "model",
        429 => "quota",
        _ => "http",
    };
    let msg = serde_json::from_str::<Value>(body).ok().and_then(|v| v["error"]["message"].as_str().map(String::from));
    ApiErr::new(kind).status(status).detail(msg.as_deref().unwrap_or(body), key)
}

fn host_of(base: &str) -> String {
    Url::parse(base).ok().and_then(|u| u.host_str().map(String::from)).unwrap_or_default()
}

fn net_err(e: reqwest::Error, host: &str) -> ApiErr {
    let e = e.without_url(); // 주소(키가 섞일 수 있는 곳)를 버린 뒤 종류만 본다
    if e.is_timeout() { ApiErr::new("timeout") } else { ApiErr::new("net").detail(host, "") }
}

fn client(timeout_ms: u64, host: &str) -> Result<reqwest::Client, ApiErr> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|e| net_err(e, host))
}

/// 요청 하나 → (상태, 본문). 본문은 1MB까지
async fn send(c: &reqwest::Client, get: bool, req: Req, host: &str) -> Result<(u16, String), ApiErr> {
    let mut rb = if get { c.get(&req.url) } else { c.post(&req.url).body(req.body) };
    for (k, v) in req.headers {
        rb = rb.header(k, v);
    }
    let mut resp = rb.send().await.map_err(|e| net_err(e, host))?;
    let status = resp.status().as_u16();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| net_err(e, host))? {
        buf.extend_from_slice(&chunk);
        if buf.len() > MAX_BODY {
            return Err(ApiErr::new("bad").detail("answer too large", ""));
        }
    }
    Ok((status, String::from_utf8_lossy(&buf).into_owned()))
}

fn key_check(provider: &str, key: Option<&Secret>) -> Result<(), ApiErr> {
    if !matches!(provider, "api:openai" | "api:anthropic" | "api:gemini" | "api:compat") {
        return Err(ApiErr::new("bad"));
    }
    if needs_key(provider) && key.is_none() {
        return Err(ApiErr::new("no key"));
    }
    Ok(())
}

/// 답 하나 요청(S-3320~S-3329, S-3333·S-3334). base = 공급자 루트 주소(`…/v1` 까지)
pub async fn ask_with(base: &str, provider: &str, model: &str, key: Option<&Secret>, system: &str, user: &str, timeout_ms: u64) -> Result<String, ApiErr> {
    key_check(provider, key)?;
    check_model(model)?;
    if system.len() + user.len() > MAX_REQ {
        return Err(ApiErr::new("bad").detail("request too large", ""));
    }
    let (host, ks) = (host_of(base), key.map(|k| k.expose()).unwrap_or(""));
    let c = client(timeout_ms.clamp(1000, 60000), &host)?;
    let mut rf = true;
    loop {
        let (status, body) = send(&c, false, build_ask(base, provider, model, key, system, user, rf), &host).await?;
        if provider == "api:compat" && rf && status == 400 && body.contains("response_format") {
            rf = false; // 호환 서버마다 JSON 모드 지원이 다름: 빼고 한 번만 다시
            continue;
        }
        return if (200..300).contains(&status) { parse_answer(provider, &body, ks) } else { Err(status_err(status, &body, ks, true)) };
    }
}

/// 연결 시험: 모델 목록(S-3331). 이름순·중복 없이 200개까지
pub async fn models_with(base: &str, provider: &str, key: Option<&Secret>, timeout_ms: u64) -> Result<Vec<String>, ApiErr> {
    key_check(provider, key)?;
    let (host, ks) = (host_of(base), key.map(|k| k.expose()).unwrap_or(""));
    let c = client(timeout_ms.clamp(1000, 60000), &host)?;
    let headers = auth_headers(provider, key);
    let req = Req { url: format!("{}/models", base.trim_end_matches('/')), headers, body: String::new() };
    let (status, body) = send(&c, true, req, &host).await?;
    if !(200..300).contains(&status) {
        return Err(status_err(status, &body, ks, false));
    }
    let v: Value = serde_json::from_str(&body).map_err(|_| ApiErr::new("bad").detail("not JSON", ""))?;
    let mut names: Vec<String> = if provider == "api:gemini" {
        v["models"].as_array().map(|a| a.iter().filter(|m| m["supportedGenerationMethods"].as_array().is_some_and(|g| g.iter().any(|x| x == "generateContent"))).filter_map(|m| m["name"].as_str()).map(|n| n.strip_prefix("models/").unwrap_or(n).to_string()).collect()).unwrap_or_default()
    } else {
        v["data"].as_array().map(|a| a.iter().filter_map(|m| m["id"].as_str().map(String::from)).collect()).unwrap_or_default()
    };
    names.sort();
    names.dedup();
    names.truncate(200);
    Ok(names)
}

type Aborter = Box<dyn Fn() + Send>;
/// 진행 중인 요청의 취소 손잡이(S-3332)
#[derive(Default)]
pub struct PlannerApi(Mutex<HashMap<String, Aborter>>);

impl PlannerApi {
    /// ask_with 를 따로 띄워 req_id 로 기억하고 끝나면 지운다. 끊기면 cancelled
    #[allow(clippy::too_many_arguments)]
    pub async fn run_ask(&self, req_id: &str, base: String, provider: String, model: String, key: Option<Secret>, system: String, user: String, timeout_ms: u64) -> Result<String, ApiErr> {
        let h = tauri::async_runtime::spawn(async move { ask_with(&base, &provider, &model, key.as_ref(), &system, &user, timeout_ms).await });
        let ah = h.inner().abort_handle();
        self.0.lock().unwrap().insert(req_id.to_string(), Box::new(move || ah.abort()));
        let r = h.await;
        self.0.lock().unwrap().remove(req_id);
        r.unwrap_or_else(|_| Err(ApiErr::new("cancelled")))
    }
    pub fn cancel(&self, req_id: &str) -> bool {
        let f = self.0.lock().unwrap().remove(req_id);
        f.map(|f| f()).is_some()
    }
}

/// 공급자 루트 주소: 셋은 상수, compat 만 사용자 주소(검사 통과한 것)
fn root(provider: &str, base_url: Option<&str>) -> Result<String, ApiErr> {
    Ok(match provider {
        "api:openai" => "https://api.openai.com/v1".into(),
        "api:anthropic" => "https://api.anthropic.com/v1".into(),
        "api:gemini" => "https://generativelanguage.googleapis.com/v1beta".into(),
        "api:compat" => check_base(base_url.map(str::trim).filter(|s| !s.is_empty()).unwrap_or(DEFAULT_COMPAT))?,
        _ => return Err(ApiErr::new("bad")),
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn planner_api_ask(state: State<'_, PlannerApi>, req_id: String, provider: String, model: String, base_url: Option<String>, system: String, user: String, timeout_ms: Option<u64>) -> Result<String, ApiErr> {
    let base = root(&provider, base_url.as_deref())?;
    let key = secrets::get(&provider);
    state.run_ask(&req_id, base, provider, model, key, system, user, timeout_ms.unwrap_or(20000).clamp(1000, 60000)).await
}

#[tauri::command]
pub async fn planner_api_models(provider: String, base_url: Option<String>) -> Result<Vec<String>, ApiErr> {
    let base = root(&provider, base_url.as_deref())?;
    models_with(&base, &provider, secrets::get(&provider).as_ref(), 10000).await
}

#[tauri::command]
pub async fn planner_api_cancel(state: State<'_, PlannerApi>, req_id: String) -> Result<bool, ()> {
    Ok(state.cancel(&req_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc::{channel, Receiver};
    use std::time::{Duration, Instant};

    const KEY: &str = "sk-test-KEYKEYKEY-12345";

    fn run<F: std::future::Future>(f: F) -> F::Output {
        tauri::async_runtime::block_on(f)
    }

    /// 가짜 서버가 받은 요청
    struct Got {
        line: String,
        headers: HashMap<String, String>,
        body: String,
    }
    impl Got {
        fn json(&self) -> serde_json::Value {
            serde_json::from_str(&self.body).unwrap()
        }
        fn h(&self, k: &str) -> Option<&str> {
            self.headers.get(k).map(|s| s.as_str())
        }
    }
    struct R {
        status: u16,
        body: String,
        delay: u64,
        loc: Option<String>,
    }
    fn r(status: u16, body: &str) -> R {
        R { status, body: body.into(), delay: 0, loc: None }
    }
    impl R {
        fn delay(mut self, ms: u64) -> R {
            self.delay = ms;
            self
        }
        fn loc(mut self, l: &str) -> R {
            self.loc = Some(l.into());
            self
        }
    }

    /// 접속 하나마다 요청을 채널로 돌려주고 정해진 답을 쓰는 임시 서버(순서대로). 127.0.0.1 만
    fn serve_n(resps: Vec<R>) -> (String, Receiver<Got>) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://127.0.0.1:{}", l.local_addr().unwrap().port());
        let (tx, rx) = channel();
        std::thread::spawn(move || {
            for resp in resps {
                let Ok((mut s, _)) = l.accept() else { return };
                let mut buf = Vec::new();
                let mut tmp = [0u8; 4096];
                let head_end = loop {
                    let n = s.read(&mut tmp).unwrap_or(0);
                    if n == 0 {
                        break buf.len();
                    }
                    buf.extend_from_slice(&tmp[..n]);
                    if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                        break p + 4;
                    }
                };
                let head = String::from_utf8_lossy(&buf[..head_end.min(buf.len())]).to_string();
                let mut lines = head.split("\r\n");
                let line = lines.next().unwrap_or("").to_string();
                let headers: HashMap<String, String> = lines.filter_map(|l| l.split_once(':')).map(|(k, v)| (k.trim().to_lowercase(), v.trim().to_string())).collect();
                let len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
                while buf.len() < head_end + len {
                    let n = s.read(&mut tmp).unwrap_or(0);
                    if n == 0 {
                        break;
                    }
                    buf.extend_from_slice(&tmp[..n]);
                }
                let body = String::from_utf8_lossy(&buf[head_end.min(buf.len())..]).to_string();
                let _ = tx.send(Got { line, headers, body });
                std::thread::sleep(Duration::from_millis(resp.delay));
                let loc = resp.loc.map(|l| format!("Location: {l}\r\n")).unwrap_or_default();
                let out = format!("HTTP/1.1 {} X\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n", resp.status, loc, resp.body.len());
                let _ = s.write_all(out.as_bytes());
                let _ = s.write_all(resp.body.as_bytes());
            }
        });
        (base, rx)
    }
    fn serve(status: u16, body: &str) -> (String, Receiver<Got>) {
        serve_n(vec![r(status, body)])
    }
    fn key() -> Secret {
        Secret::new(KEY.into())
    }
    fn ask(base: &str, provider: &str, k: Option<&Secret>) -> Result<String, ApiErr> {
        run(ask_with(base, provider, "m-1", k, "SYS", "USER", 5000))
    }
    const OK_OPENAI: &str = r#"{"choices":[{"message":{"content":"{\"a\":1}"}}]}"#;

    // ① OpenAI
    #[test]
    fn openai_request_and_answer() {
        let (base, rx) = serve(200, OK_OPENAI);
        assert_eq!(ask(&base, "api:openai", Some(&key())).unwrap(), "{\"a\":1}");
        let g = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(g.line.starts_with("POST /chat/completions "), "{}", g.line);
        assert_eq!(g.h("authorization"), Some(&*format!("Bearer {KEY}")));
        assert_eq!(g.h("content-type"), Some("application/json"));
        let j = g.json();
        assert_eq!(j["model"], "m-1");
        assert_eq!(j["messages"][0], serde_json::json!({"role":"system","content":"SYS"}));
        assert_eq!(j["messages"][1], serde_json::json!({"role":"user","content":"USER"}));
        assert_eq!(j["response_format"], serde_json::json!({"type":"json_object"}));
        assert!(!g.body.contains(KEY) && !g.line.contains(KEY), "키는 헤더로만");
    }

    // ② 답 꺼내기: OpenAI refusal·content 없음
    #[test]
    fn openai_refusal_and_empty_are_bad() {
        let (base, _rx) = serve(200, r#"{"choices":[{"message":{"content":null,"refusal":"I can't help"}}]}"#);
        let e = ask(&base, "api:openai", Some(&key())).unwrap_err();
        assert_eq!((e.kind.as_str(), e.detail.as_deref()), ("bad", Some("I can't help")));
        let (base, _rx) = serve(200, r#"{"choices":[]}"#);
        assert_eq!(ask(&base, "api:openai", Some(&key())).unwrap_err().kind, "bad");
        let (base, _rx) = serve(200, "not json");
        assert_eq!(ask(&base, "api:openai", Some(&key())).unwrap_err().kind, "bad");
    }

    // ① Anthropic + ② text 조각 잇기
    #[test]
    fn anthropic_request_and_answer() {
        let (base, rx) = serve(200, r#"{"content":[{"type":"text","text":"ab"},{"type":"tool_use","text":"zz"},{"type":"text","text":"cd"}]}"#);
        assert_eq!(ask(&base, "api:anthropic", Some(&key())).unwrap(), "abcd");
        let g = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(g.line.starts_with("POST /messages "), "{}", g.line);
        assert_eq!(g.h("x-api-key"), Some(KEY));
        assert_eq!(g.h("anthropic-version"), Some("2023-06-01"));
        assert_eq!(g.h("authorization"), None);
        let j = g.json();
        assert_eq!(j["model"], "m-1");
        assert_eq!(j["max_tokens"], 512);
        assert_eq!(j["system"], "SYS");
        assert_eq!(j["messages"], serde_json::json!([{"role":"user","content":"USER"}]));
        assert!(j.get("response_format").is_none());
        let (base, _rx) = serve(200, r#"{"content":[]}"#);
        assert_eq!(ask(&base, "api:anthropic", Some(&key())).unwrap_err().kind, "bad");
    }

    // ① Gemini: URL 에 key= 없음, 헤더에 키 + ② thought 빼기·finishReason
    #[test]
    fn gemini_request_and_answer() {
        let (base, rx) = serve(200, r#"{"candidates":[{"content":{"parts":[{"text":"hmm","thought":true},{"text":"A"},{"text":"B"}]}}]}"#);
        assert_eq!(ask(&base, "api:gemini", Some(&key())).unwrap(), "AB");
        let g = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(g.line.starts_with("POST /models/m-1:generateContent "), "{}", g.line);
        assert!(!g.line.contains("key="), "URL 쿼리 key= 금지");
        assert_eq!(g.h("x-goog-api-key"), Some(KEY));
        let j = g.json();
        assert_eq!(j["systemInstruction"], serde_json::json!({"parts":[{"text":"SYS"}]}));
        assert_eq!(j["contents"], serde_json::json!([{"role":"user","parts":[{"text":"USER"}]}]));
        assert_eq!(j["generationConfig"], serde_json::json!({"responseMimeType":"application/json"}));
        let (base, _rx) = serve(200, r#"{"candidates":[{"finishReason":"SAFETY","content":{"parts":[]}}]}"#);
        let e = ask(&base, "api:gemini", Some(&key())).unwrap_err();
        assert_eq!((e.kind.as_str(), e.detail.as_deref()), ("bad", Some("SAFETY")));
    }

    // ③ compat: 키 없음 → Authorization 없음, base 끝 / 하나로
    #[test]
    fn compat_without_key_sends_no_auth() {
        let (base, rx) = serve(200, OK_OPENAI);
        assert_eq!(ask(&format!("{base}//"), "api:compat", None).unwrap(), "{\"a\":1}");
        let g = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(g.line.starts_with("POST /chat/completions "), "{}", g.line);
        assert_eq!(g.h("authorization"), None);
        let (base, rx) = serve(200, OK_OPENAI);
        assert!(ask(&base, "api:compat", Some(&key())).is_ok());
        assert_eq!(rx.recv_timeout(Duration::from_secs(2)).unwrap().h("authorization"), Some(&*format!("Bearer {KEY}")));
    }

    // ④ compat 400 + response_format → 한 번만 다시(둘째 본문에 없음)
    #[test]
    fn compat_retries_once_without_response_format() {
        let (base, rx) = serve_n(vec![r(400, r#"{"error":{"message":"unknown field response_format"}}"#), r(200, OK_OPENAI)]);
        assert_eq!(ask(&base, "api:compat", None).unwrap(), "{\"a\":1}");
        let a = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let b = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(a.json().get("response_format").is_some());
        assert!(b.json().get("response_format").is_none());
        assert_eq!(b.json()["messages"][1]["content"], "USER");
        // 두 번 다 400 이면 더 보내지 않는다
        let (base, rx) = serve_n(vec![r(400, "response_format"), r(400, "response_format"), r(200, OK_OPENAI)]);
        let e = ask(&base, "api:compat", None).unwrap_err();
        assert_eq!((e.kind.as_str(), e.status), ("http", Some(400)));
        let _ = (rx.recv_timeout(Duration::from_secs(2)), rx.recv_timeout(Duration::from_secs(2)));
        assert!(rx.recv_timeout(Duration::from_millis(300)).is_err(), "셋째 요청 없음");
        // 400 이어도 response_format 얘기가 없으면 다시 안 보냄
        let (base, rx) = serve_n(vec![r(400, r#"{"error":{"message":"bad"}}"#), r(200, OK_OPENAI)]);
        assert_eq!(ask(&base, "api:compat", None).unwrap_err().kind, "http");
        let _ = rx.recv_timeout(Duration::from_secs(2));
        assert!(rx.recv_timeout(Duration::from_millis(300)).is_err());
    }

    // ⑤ 상태 코드 표
    #[test]
    fn status_table() {
        for (st, kind) in [(401, "auth"), (403, "auth"), (404, "model"), (429, "quota"), (500, "http"), (302, "http")] {
            let (base, _rx) = serve(st, r#"{"error":{"message":"nope"}}"#);
            let e = ask(&base, "api:openai", Some(&key())).unwrap_err();
            assert_eq!(e.kind, kind, "{st}");
            if kind == "http" {
                assert_eq!(e.status, Some(st));
            }
        }
        let (base, _rx) = serve(500, r#"{"error":{"message":"server broke"}}"#);
        assert_eq!(ask(&base, "api:openai", Some(&key())).unwrap_err().detail.as_deref(), Some("server broke"));
        let (base, _rx) = serve(500, "plain\ttext\u{1}body");
        assert_eq!(ask(&base, "api:openai", Some(&key())).unwrap_err().detail.as_deref(), Some("plaintextbody"), "error.message 없으면 본문, 제어 문자 제거");
        let (base, _rx) = serve(500, &"x".repeat(500));
        assert_eq!(ask(&base, "api:openai", Some(&key())).unwrap_err().detail.unwrap().chars().count(), 200);
        // 목록은 404 도 http
        let (base, _rx) = serve(404, "{}");
        assert_eq!(run(models_with(&base, "api:openai", Some(&key()), 5000)).unwrap_err().kind, "http");
    }

    // ⑥ 리디렉션을 따라가지 않는다
    #[test]
    fn redirect_not_followed() {
        let (second, rx2) = serve(200, OK_OPENAI);
        let (first, _rx1) = serve_n(vec![r(302, "").loc(&format!("{second}/steal"))]);
        let e = ask(&first, "api:openai", Some(&key())).unwrap_err();
        assert_eq!((e.kind.as_str(), e.status), ("http", Some(302)));
        assert!(rx2.recv_timeout(Duration::from_millis(500)).is_err(), "둘째 서버 요청 0개");
    }

    // ⑦ 시간 제한
    #[test]
    fn timeout_kind() {
        let (base, _rx) = serve_n(vec![r(200, OK_OPENAI).delay(3000)]);
        let t = Instant::now();
        let e = run(ask_with(&base, "api:openai", "m-1", Some(&key()), "S", "U", 1000)).unwrap_err();
        assert_eq!(e.kind, "timeout");
        assert!(t.elapsed() < Duration::from_millis(2500), "{:?}", t.elapsed());
    }

    // ⑧ 취소
    #[test]
    fn cancel_aborts_request() {
        let (base, rx) = serve_n(vec![r(200, OK_OPENAI).delay(3000)]);
        let st = std::sync::Arc::new(PlannerApi::default());
        let st2 = st.clone();
        let h = std::thread::spawn(move || {
            rx.recv_timeout(Duration::from_secs(2)).unwrap(); // 서버가 요청을 받은 뒤
            assert!(st2.cancel("req-1"));
            assert!(!st2.cancel("req-1"), "한 번만");
            rx
        });
        let t = Instant::now();
        let e = run(st.run_ask("req-1", base, "api:openai".into(), "m-1".into(), Some(key()), "S".into(), "U".into(), 20000)).unwrap_err();
        assert_eq!(e.kind, "cancelled");
        assert!(t.elapsed() < Duration::from_millis(2500), "{:?}", t.elapsed());
        h.join().unwrap();
        assert!(!st.cancel("req-1"), "끝나면 맵에서 지움");
    }

    // 끝난 요청은 맵에 남지 않고 결과를 그대로 돌려준다
    #[test]
    fn run_ask_returns_result_and_clears() {
        let (base, _rx) = serve(200, OK_OPENAI);
        let st = PlannerApi::default();
        assert_eq!(run(st.run_ask("r", base, "api:openai".into(), "m-1".into(), Some(key()), "S".into(), "U".into(), 5000)).unwrap(), "{\"a\":1}");
        assert!(!st.cancel("r"));
    }

    // ⑨ 1MB 넘는 본문
    #[test]
    fn oversize_answer_is_bad() {
        let (base, _rx) = serve(200, &format!(r#"{{"choices":[{{"message":{{"content":"{}"}}}}]}}"#, "a".repeat(1_100_000)));
        let e = ask(&base, "api:openai", Some(&key())).unwrap_err();
        assert_eq!((e.kind.as_str(), e.detail.as_deref()), ("bad", Some("answer too large")));
    }

    // ⑩ 키 되풀이 → 마스킹
    #[test]
    fn error_text_never_has_key() {
        let body = format!(r#"{{"error":{{"message":"Incorrect API key provided: {KEY}. See Bearer abc.def and sk-proj-AAAABBBBCCCC1234 and AIzaSyA1b2c3d4e5f6"}}}}"#);
        let (base, _rx) = serve(401, &body);
        let e = ask(&base, "api:openai", Some(&key())).unwrap_err();
        assert_eq!(e.kind, "auth");
        let d = e.detail.clone().unwrap();
        for s in [d.as_str(), &format!("{e:?}"), &format!("{e}"), &serde_json::to_string(&e).unwrap()] {
            assert!(!s.contains(KEY) && !s.contains("KEYKEYKEY"), "{s}");
            assert!(!s.contains("AAAABBBB") && !s.contains("abc.def") && !s.contains("SyA1b2"), "{s}");
        }
        assert!(d.contains("•••"));
        assert_eq!(e.status, Some(401));
    }

    #[test]
    fn mask_table() {
        assert_eq!(mask("key=mykey-1234 end", "mykey-1234"), "key=••• end");
        assert_eq!(mask("abc", "abc"), "abc", "4자 미만 키는 그대로 두지 않고 건드리지도 않음");
        assert_eq!(mask("x sk-proj-abcdefgh12345 y", ""), "x sk-proj-••• y");
        assert_eq!(mask("sk-ant-api03-abcdefgh_ij", ""), "sk-ant-•••");
        assert_eq!(mask("sk-abcdefgh12", ""), "sk-•••");
        assert_eq!(mask("AIzaSyA1b2c3d4e5", ""), "AIza•••");
        assert_eq!(mask("Authorization: Bearer abc.def-ghi", ""), "Authorization: Bearer •••");
        assert_eq!(mask("sk-short", ""), "sk-short", "8자 미만은 그대로");
        assert_eq!(mask("plain text", "sk-xx"), "plain text");
    }

    // ⑪ check_base·check_model
    #[test]
    fn check_base_table() {
        for ok in ["https://x.com/v1", "http://localhost:11434/v1", "http://127.0.0.1:1/v1", "http://127.9.9.9/v1", "http://[::1]:8080/v1", "http://192.168.0.5:8080/v1", "http://10.1.2.3/v1", "http://172.16.0.1/v1", "http://172.31.255.255/v1"] {
            assert!(check_base(ok).is_ok(), "{ok}");
        }
        for bad in ["http://example.com/v1", "http://172.32.0.1/v1", "http://172.15.0.1/v1", "http://11.0.0.1/v1", "http://192.169.0.1/v1", "ftp://x.com/v1", "http://a:b@localhost/v1", "https://u@x.com/v1", "javascript:alert(1)", "not a url", "", "file:///c:/x"] {
            let e = check_base(bad).unwrap_err();
            assert_eq!(e.kind, "url", "{bad}");
        }
        assert_eq!(check_base("http://localhost:11434/v1/").unwrap(), "http://localhost:11434/v1");
        assert_eq!(check_base("  https://x.com/v1  ").unwrap(), "https://x.com/v1");
    }

    #[test]
    fn check_model_table() {
        for ok in ["gpt-5-mini", "claude-haiku-4-5", "gemini-2.5-flash", "llama3:8b", "org/model@v1", &"a".repeat(100)] {
            assert!(check_model(ok).is_ok(), "{ok}");
        }
        for bad in ["", "a b", "a?x=1", "a#b", "a%2f", "../x", "a..b", "a\nb", "한글", &"a".repeat(101)] {
            assert_eq!(check_model(bad).unwrap_err().kind, "no model", "{bad:?}");
        }
    }

    // ⑫ 키 없음 → HTTP 0개
    #[test]
    fn no_key_sends_nothing() {
        for p in ["api:openai", "api:anthropic", "api:gemini"] {
            let (base, rx) = serve(200, OK_OPENAI);
            assert_eq!(ask(&base, p, None).unwrap_err().kind, "no key", "{p}");
            assert!(rx.recv_timeout(Duration::from_millis(300)).is_err(), "{p}: HTTP 0개");
        }
        // 모델·공급자·길이 오류도 HTTP 전에
        let (base, rx) = serve(200, OK_OPENAI);
        assert_eq!(run(ask_with(&base, "api:openai", "", Some(&key()), "S", "U", 5000)).unwrap_err().kind, "no model");
        assert_eq!(run(ask_with(&base, "claude", "m", Some(&key()), "S", "U", 5000)).unwrap_err().kind, "bad");
        assert_eq!(run(ask_with(&base, "api:openai", "m", Some(&key()), &"s".repeat(20000), &"u".repeat(12800), 5000)).unwrap_err().kind, "bad");
        assert!(rx.recv_timeout(Duration::from_millis(300)).is_err());
        // 합쳐 32KB 딱 맞으면 통과
        assert!(run(ask_with(&base, "api:openai", "m", Some(&key()), &"s".repeat(20000), &"u".repeat(12768), 5000)).is_ok());
    }

    #[test]
    fn unreachable_is_net_with_host_only() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        drop(l);
        let e = ask(&format!("http://127.0.0.1:{port}"), "api:openai", Some(&key())).unwrap_err();
        assert_eq!(e.kind, "net");
        assert_eq!(e.detail.as_deref(), Some("127.0.0.1"));
        assert!(!format!("{e:?}").contains(KEY));
    }

    // ⑮ models 셋 모양
    #[test]
    fn models_shapes() {
        let (base, rx) = serve(200, r#"{"data":[{"id":"b"},{"id":"a"},{"id":"a"}]}"#);
        assert_eq!(run(models_with(&base, "api:openai", Some(&key()), 5000)).unwrap(), vec!["a", "b"]);
        let g = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(g.line.starts_with("GET /models "), "{}", g.line);
        assert_eq!(g.h("authorization"), Some(&*format!("Bearer {KEY}")));
        let (base, rx) = serve(200, r#"{"data":[{"id":"claude-x"}]}"#);
        assert_eq!(run(models_with(&base, "api:anthropic", Some(&key()), 5000)).unwrap(), vec!["claude-x"]);
        let g = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!((g.h("x-api-key"), g.h("anthropic-version")), (Some(KEY), Some("2023-06-01")));
        let gem = r#"{"models":[{"name":"models/gemini-b","supportedGenerationMethods":["generateContent"]},{"name":"models/embed","supportedGenerationMethods":["embedContent"]},{"name":"models/gemini-a","supportedGenerationMethods":["x","generateContent"]}]}"#;
        let (base, rx) = serve(200, gem);
        assert_eq!(run(models_with(&base, "api:gemini", Some(&key()), 5000)).unwrap(), vec!["gemini-a", "gemini-b"]);
        let g = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(g.line.starts_with("GET /models "), "{}", g.line);
        assert_eq!(g.h("x-goog-api-key"), Some(KEY));
        // compat 는 키 없이
        let (base, rx) = serve(200, r#"{"data":[{"id":"llama3"}]}"#);
        assert_eq!(run(models_with(&base, "api:compat", None, 5000)).unwrap(), vec!["llama3"]);
        assert_eq!(rx.recv_timeout(Duration::from_secs(2)).unwrap().h("authorization"), None);
        // 키 없는 필수 공급자는 HTTP 없이
        let (base, rx) = serve(200, "{}");
        assert_eq!(run(models_with(&base, "api:openai", None, 5000)).unwrap_err().kind, "no key");
        assert!(rx.recv_timeout(Duration::from_millis(300)).is_err());
        // 200개까지
        let many: Vec<String> = (0..300).map(|i| format!(r#"{{"id":"m{i:03}"}}"#)).collect();
        let (base, _rx) = serve(200, &format!(r#"{{"data":[{}]}}"#, many.join(",")));
        let v = run(models_with(&base, "api:openai", Some(&key()), 5000)).unwrap();
        assert_eq!((v.len(), v[0].as_str()), (200, "m000"));
    }

    #[test]
    fn api_err_json_shape() {
        let e = ApiErr { kind: "auth".into(), status: Some(401), detail: None };
        assert_eq!(serde_json::to_value(&e).unwrap(), serde_json::json!({"kind":"auth","status":401}));
        assert_eq!(serde_json::to_value(ApiErr::new("timeout")).unwrap(), serde_json::json!({"kind":"timeout"}));
    }
}
