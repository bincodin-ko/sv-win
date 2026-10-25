// D4 S-1560~S-1566: Claude·Codex 로컬 로그 토큰 집계(읽기 전용). 내용은 합계만 낸다.
// 시험은 임시 폴더 roots 로만(tokens_scan_in) — 사용자의 실제 로그는 열지 않는다.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant, UNIX_EPOCH};

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Agent {
    Claude,
    Codex,
}

#[derive(Clone, Debug)]
pub struct Root {
    pub agent: Agent,
    pub dir: PathBuf,
}

/// 지금 시각(UTC ms)과 지역 시간대(UTC 대비 분). 날짜 경계를 시험하려고 인자로 받는다.
#[derive(Clone, Copy, Debug)]
pub struct Now {
    pub ms: i64,
    pub tz_min: i32,
}

pub struct Opts<'a> {
    pub cache: Option<&'a Path>,
    pub limit: Duration,
    pub cancel: &'a AtomicBool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayRow {
    pub date: String,
    pub agent: Option<Agent>,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    /// All tokens
    pub total: u64,
    /// In+out
    pub in_out: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStat {
    /// 모델별 메시지 수
    pub models: BTreeMap<String, u64>,
    pub sessions: u64,
    pub active_dates: Vec<String>,
    pub longest_session_secs: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub days: Vec<DayRow>,
    pub stats: BTreeMap<Agent, AgentStat>,
    pub partial: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Heat {
    pub date: String,
    pub level: u8,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStats {
    pub favorite_model: Option<String>,
    pub total_tokens: u64,
    pub sessions: u64,
    pub active_days: u64,
    /// 첫 활동일부터 오늘까지 일수(포함)
    pub span_days: u64,
    pub most_active_day: Option<String>,
    pub longest_streak: u64,
    pub lifetime: u64,
    pub peak: u64,
    pub streak_current: u64,
    pub streak_best: u64,
    pub longest_task_secs: u64,
    pub heat: Vec<Heat>,
}

pub fn default_roots(home: &Path, claude_cfg: Option<&Path>, codex_home: Option<&Path>) -> Vec<Root> {
    let c = claude_cfg.map_or_else(|| home.join(".claude"), Path::to_path_buf);
    let x = codex_home.map_or_else(|| home.join(".codex"), Path::to_path_buf);
    // Gemini·Grok 은 읽지 않는다(S-1563). OpenCode DB 도 이번엔 제외.
    vec![Root { agent: Agent::Claude, dir: c.join("projects") }, Root { agent: Agent::Codex, dir: x.join("sessions") }]
}

// ---- 날짜 계산 (chrono 없이: Hinnant 알고리즘) ----
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * ((m + 9) % 12) + 2) / 5 + d - 1;
    era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468
}

fn date_str(num: i64) -> String {
    let z = num + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

fn date_num(s: &str) -> Option<i64> {
    let n = |r: std::ops::Range<usize>| s.get(r)?.parse::<i64>().ok();
    Some(days_from_civil(n(0..4)?, n(5..7)?, n(8..10)?))
}

/// RFC3339("2026-10-23T14:59:59.123Z" / "+09:00") → UTC ms
fn parse_ts(s: &str) -> Option<i64> {
    let n = |r: std::ops::Range<usize>| s.get(r)?.parse::<i64>().ok();
    let mut secs = date_num(s)? * 86400 + n(11..13)? * 3600 + n(14..16)? * 60 + n(17..19)?;
    let mut rest = s.get(19..)?;
    let mut ms = 0;
    if let Some(f) = rest.strip_prefix('.') {
        let digits: String = f.chars().take_while(char::is_ascii_digit).collect();
        ms = format!("{digits:0<3}")[..3].parse::<i64>().ok()?;
        rest = &f[digits.len()..];
    }
    if rest.len() == 6 && (rest.starts_with('+') || rest.starts_with('-')) {
        let off = rest[1..3].parse::<i64>().ok()? * 3600 + rest[4..6].parse::<i64>().ok()? * 60;
        secs -= if rest.starts_with('+') { off } else { -off };
    }
    Some(secs * 1000 + ms)
}

fn local_day(ms: i64, tz_min: i32) -> i64 {
    (ms.div_euclid(1000) + i64::from(tz_min) * 60).div_euclid(86400)
}

// ---- 파일 하나의 집계(캐시 단위) ----
#[derive(Clone, Default, Serialize, Deserialize)]
struct Tok {
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
}

impl Tok {
    fn add(&mut self, o: &Tok) {
        self.input += o.input;
        self.output += o.output;
        self.cache_read += o.cache_read;
        self.cache_write += o.cache_write;
    }
    fn total(&self) -> u64 {
        self.input + self.output + self.cache_read + self.cache_write
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
struct FileAgg {
    days: BTreeMap<String, Tok>,
    /// 날짜 → 모델 → 메시지 수
    models: BTreeMap<String, BTreeMap<String, u64>>,
    first_ms: i64,
    last_ms: i64,
    /// Claude: 메시지마다 (message.id|requestId, 날짜, 합, 모델). 합칠 때 파일을 넘나드는 중복을 걷는다(S-1560)
    #[serde(default)]
    msgs: Vec<(String, String, Tok, Option<String>)>,
}

impl FileAgg {
    fn touch(&mut self, ms: i64) {
        if self.first_ms == 0 || ms < self.first_ms {
            self.first_ms = ms;
        }
        self.last_ms = self.last_ms.max(ms);
    }
    fn put(&mut self, date: String, t: &Tok, model: Option<&str>) {
        self.days.entry(date.clone()).or_default().add(t);
        if let Some(m) = model {
            *self.models.entry(date).or_default().entry(m.to_string()).or_default() += 1;
        }
    }
}

fn u(v: &Value, k: &str) -> u64 {
    v.get(k).and_then(Value::as_u64).unwrap_or(0)
}

fn read_file(p: &Path, agent: Agent, tz: i32) -> FileAgg {
    let mut a = FileAgg::default();
    let Ok(f) = fs::File::open(p) else { return a };
    let (mut prev, mut model) = ((0u64, 0u64, 0u64), None::<String>);
    for line in BufReader::new(f).split(b'\n').flatten() {
        let Ok(v) = serde_json::from_slice::<Value>(&line) else { continue }; // 깨진 줄
        let Some(ms) = v.get("timestamp").and_then(Value::as_str).and_then(parse_ts) else { continue };
        a.touch(ms);
        let date = date_str(local_day(ms, tz));
        match agent {
            Agent::Claude => {
                if v.get("type").and_then(Value::as_str) != Some("assistant") {
                    continue;
                }
                let Some(m) = v.get("message") else { continue };
                let Some(us) = m.get("usage") else { continue };
                let key = m.get("id").and_then(Value::as_str).map(|id| format!("{id}|{}", v.get("requestId").and_then(Value::as_str).unwrap_or("")));
                let t = Tok { input: u(us, "input_tokens"), output: u(us, "output_tokens"), cache_read: u(us, "cache_read_input_tokens"), cache_write: u(us, "cache_creation_input_tokens") };
                // id 없는 줄은 중복 판단 불가 → 키 없이 그대로 센다. 한 파일 안 중복도 합칠 때 같은 키로 걷힌다
                a.msgs.push((key.unwrap_or_default(), date, t, m.get("model").and_then(Value::as_str).map(str::to_string)));
            }
            Agent::Codex => {
                let Some(pl) = v.get("payload") else { continue };
                match pl.get("type").and_then(Value::as_str).or_else(|| v.get("type").and_then(Value::as_str)) {
                    Some("turn_context") => model = pl.get("model").and_then(Value::as_str).map(str::to_string),
                    Some("token_count") => {
                        let Some(c) = pl.get("info").and_then(|i| i.get("total_token_usage")) else { continue };
                        let cur = (u(c, "input_tokens"), u(c, "cached_input_tokens"), u(c, "output_tokens"));
                        // 누적이 줄어들면(새 시작) 현재 값을 그대로 더한다
                        let d = if cur.0 < prev.0 || cur.2 < prev.2 { cur } else { (cur.0 - prev.0, cur.1.saturating_sub(prev.1), cur.2 - prev.2) };
                        prev = cur;
                        if d == (0, 0, 0) {
                            continue;
                        }
                        // Codex input_tokens 는 캐시 포함 → 캐시를 뺀 나머지가 input
                        let t = Tok { input: d.0.saturating_sub(d.1), output: d.2, cache_read: d.1, cache_write: 0 };
                        a.put(date, &t, model.as_deref());
                    }
                    _ => {}
                }
            }
        }
    }
    a
}

// ---- 캐시 ----
#[derive(Default, Serialize, Deserialize)]
struct Entry {
    mtime: i64,
    size: u64,
    agg: FileAgg,
}

const CACHE_VER: u32 = 2; // 2: Claude 메시지 목록(S-1560 파일 간 중복 제거)

#[derive(Default, Serialize, Deserialize)]
struct Cache {
    /// 형식이 바뀌면(CACHE_VER) 옛 캐시는 버리고 다시 읽는다
    #[serde(default)]
    ver: u32,
    tz_min: i32,
    files: BTreeMap<String, Entry>,
}

fn walk(dir: &Path, agent: Agent, out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let Ok(ft) = e.file_type() else { continue }; // 링크는 따라가지 않는다
        let name = e.file_name().to_string_lossy().to_string();
        if ft.is_dir() {
            if !name.eq_ignore_ascii_case("profiles") {
                walk(&p, agent, out);
            }
        } else if ft.is_file() && name.ends_with(".jsonl") && (agent == Agent::Claude || name.starts_with("rollout-")) {
            out.push(p);
        }
    }
}

pub fn tokens_scan_with(roots: &[Root], days: u32, now: Now, o: &Opts) -> ScanResult {
    use std::sync::atomic::Ordering::SeqCst;
    let start = Instant::now();
    let today = local_day(now.ms, now.tz_min);
    let cutoff = today - i64::from(days.max(1)) + 1;
    let cutoff_date = date_str(cutoff);
    let cutoff_ms = (cutoff * 86400 - i64::from(now.tz_min) * 60) * 1000; // 지역 자정(UTC ms)
    let mut cache: Cache = o.cache.and_then(|p| fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    if cache.tz_min != now.tz_min || cache.ver != CACHE_VER {
        cache = Cache { ver: CACHE_VER, tz_min: now.tz_min, files: BTreeMap::new() }; // 날짜 경계가 달라 쓸 수 없다
    }
    let mut res = ScanResult::default();
    let mut sums: BTreeMap<(Agent, String), Tok> = BTreeMap::new();
    let mut seen_paths = HashSet::new();
    let mut seen_msgs = HashSet::new(); // Claude 메시지 키: 파일을 넘어 한 번만 센다(S-1560)
    'roots: for r in roots {
        let mut files = Vec::new();
        walk(&r.dir, r.agent, &mut files);
        for p in files {
            let key = p.to_string_lossy().to_string();
            seen_paths.insert(key.clone());
            if o.cancel.load(SeqCst) || start.elapsed() >= o.limit {
                res.partial = true;
                break 'roots;
            }
            let Ok(md) = fs::metadata(&p) else { continue };
            let mtime = md.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as i64);
            if mtime < cutoff_ms {
                continue; // 조회 시작일 이전에 마지막으로 바뀐 파일은 열지 않는다
            }
            let hit = cache.files.get(&key).is_some_and(|e| e.mtime == mtime && e.size == md.len());
            if !hit {
                let agg = read_file(&p, r.agent, now.tz_min);
                cache.files.insert(key.clone(), Entry { mtime, size: md.len(), agg });
            }
            let agg = &cache.files[&key].agg;
            let st = res.stats.entry(r.agent).or_default();
            let mut any = false;
            for (d, t) in agg.days.range(cutoff_date.clone()..) {
                sums.entry((r.agent, d.clone())).or_default().add(t);
                any = true;
            }
            for (_, m) in agg.models.range(cutoff_date.clone()..) {
                for (k, n) in m {
                    *st.models.entry(k.clone()).or_default() += n;
                }
            }
            for (k, d, t, model) in &agg.msgs {
                if d.as_str() < cutoff_date.as_str() || (!k.is_empty() && !seen_msgs.insert(k.clone())) {
                    continue;
                }
                sums.entry((r.agent, d.clone())).or_default().add(t);
                if let Some(m) = model {
                    *st.models.entry(m.clone()).or_default() += 1;
                }
                any = true;
            }
            if any {
                st.sessions += 1;
                st.longest_session_secs = st.longest_session_secs.max(((agg.last_ms - agg.first_ms) / 1000) as u64);
            }
        }
    }
    if !res.partial {
        cache.files.retain(|k, _| seen_paths.contains(k)); // 사라진 파일 정리
    }
    if let Some(p) = o.cache {
        if let Ok(b) = serde_json::to_vec(&cache) {
            let _ = fs::write(p, b);
        }
    }
    for ((agent, date), t) in sums {
        res.stats.entry(agent).or_default().active_dates.push(date.clone());
        res.days.push(DayRow { date, agent: Some(agent), input: t.input, output: t.output, cache_read: t.cache_read, cache_write: t.cache_write, total: t.total(), in_out: t.input + t.output });
    }
    res
}

pub fn tokens_scan_in(roots: &[Root], days: u32, now: Now) -> ScanResult {
    let c = AtomicBool::new(false);
    tokens_scan_with(roots, days, now, &Opts { cache: None, limit: Duration::from_secs(30), cancel: &c })
}

/// 최근 N일 합계에서 통계 화면용 값을 계산한다. (호출하는 쪽이 365일치를 모아 넘긴다 — S-1564 "최근 365일 안")
pub fn usage_stats_in(r: &ScanResult, agent: Agent, today: &str) -> UsageStats {
    let rows: Vec<&DayRow> = r.days.iter().filter(|x| x.agent == Some(agent)).collect();
    let mut s = UsageStats::default();
    if let Some(st) = r.stats.get(&agent) {
        s.favorite_model = st.models.iter().max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0))).map(|(k, _)| k.clone());
        s.sessions = st.sessions;
        s.longest_task_secs = st.longest_session_secs;
    }
    s.total_tokens = rows.iter().map(|x| x.total).sum();
    s.lifetime = s.total_tokens;
    s.active_days = rows.len() as u64;
    let peak = rows.iter().map(|x| x.total).max().unwrap_or(0);
    s.peak = peak;
    s.most_active_day = rows.iter().rev().max_by_key(|x| x.total).map(|x| x.date.clone()); // 같으면 이른 날
    let mut nums: Vec<i64> = rows.iter().filter_map(|x| date_num(&x.date)).collect();
    nums.sort_unstable();
    let t = date_num(today).unwrap_or(0);
    if let Some(first) = nums.first() {
        s.span_days = (t - first + 1).max(0) as u64;
    }
    let mut run = 0;
    for (i, n) in nums.iter().enumerate() {
        run = if i > 0 && nums[i - 1] + 1 == *n { run + 1 } else { 1 };
        s.longest_streak = s.longest_streak.max(run);
    }
    s.streak_best = s.longest_streak;
    let mut d = if nums.contains(&t) { t } else { t - 1 }; // 오늘 활동이 없으면 어제부터
    while nums.contains(&d) {
        s.streak_current += 1;
        d -= 1;
    }
    s.heat = rows.iter().filter(|x| x.total > 0).map(|x| Heat { date: x.date.clone(), level: (x.total * 4).div_ceil(peak).clamp(1, 4) as u8 }).collect();
    s
}

// ---- Tauri 명령 ----
static CANCEL: AtomicBool = AtomicBool::new(false);

fn real_scan(app: &tauri::AppHandle, days: u32) -> ScanResult {
    use tauri::Manager;
    let home = crate::resume::home().unwrap_or_default();
    let env = |k| std::env::var_os(k).map(PathBuf::from);
    let roots = default_roots(&home, env("CLAUDE_CONFIG_DIR").as_deref(), env("CODEX_HOME").as_deref());
    let off = chrono::Local::now().offset().local_minus_utc() / 60;
    let ms = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64);
    let cache = app.path().app_data_dir().ok().map(|d| {
        let _ = fs::create_dir_all(&d);
        d.join("tokens-cache.json")
    });
    CANCEL.store(false, std::sync::atomic::Ordering::SeqCst);
    tokens_scan_with(&roots, days, Now { ms, tz_min: off }, &Opts { cache: cache.as_deref(), limit: Duration::from_secs(30), cancel: &CANCEL })
}

#[tauri::command]
pub async fn tokens_scan(app: tauri::AppHandle, days: u32) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || real_scan(&app, days)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn usage_stats(app: tauri::AppHandle, agent: Agent) -> Result<UsageStats, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let r = real_scan(&app, 365);
        let off = chrono::Local::now().offset().local_minus_utc() / 60;
        let ms = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64);
        usage_stats_in(&r, agent, &date_str(local_day(ms, off)))
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tokens_cancel() {
    CANCEL.store(true, std::sync::atomic::Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::Ordering;
    use std::time::SystemTime;

    // 2026-10-24T12:00:00Z
    const NOW_MS: i64 = 1_792_843_200_000;
    fn now(tz: i32) -> Now {
        Now { ms: NOW_MS, tz_min: tz }
    }
    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("symvibe-tokens-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn write(p: &Path, lines: &[String]) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, lines.join("\n") + "\n").unwrap();
    }
    fn set_age_days(p: &Path, days: u64) {
        let t = SystemTime::now() - Duration::from_secs(days * 86400);
        fs::File::options().write(true).open(p).unwrap().set_modified(t).unwrap();
    }
    // usage 순서: input, output, cache_read, cache_creation
    fn asst(ts: &str, id: &str, req: &str, model: &str, u: (u64, u64, u64, u64)) -> String {
        format!(
            r#"{{"type":"assistant","timestamp":"{ts}","requestId":"{req}","message":{{"id":"{id}","model":"{model}","usage":{{"input_tokens":{},"output_tokens":{},"cache_read_input_tokens":{},"cache_creation_input_tokens":{}}}}}}}"#,
            u.0, u.1, u.2, u.3
        )
    }
    fn cx(ts: &str, input: u64, cached: u64, output: u64) -> String {
        format!(
            r#"{{"timestamp":"{ts}","type":"event_msg","payload":{{"type":"token_count","info":{{"total_token_usage":{{"input_tokens":{input},"cached_input_tokens":{cached},"output_tokens":{output},"total_tokens":{}}}}}}}}}"#,
            input + output
        )
    }
    fn claude_root(d: &Path) -> Vec<Root> {
        vec![Root { agent: Agent::Claude, dir: d.to_path_buf() }]
    }
    fn row<'a>(r: &'a ScanResult, a: Agent, date: &str) -> &'a DayRow {
        r.days.iter().find(|x| x.agent == Some(a) && x.date == date).unwrap_or_else(|| panic!("행 없음 {date}: {:?}", r.days))
    }

    #[test]
    fn claude_일별합_중복제거_깨진줄_user줄_s1560() {
        let d = tmp("c1");
        write(&d.join("p1/a.jsonl"), &[
            asst("2026-10-23T10:00:00.000Z", "m1", "r1", "opus", (10, 20, 30, 40)),
            asst("2026-10-23T10:00:01.000Z", "m1", "r1", "opus", (10, 20, 30, 40)), // 중복
            "{깨진 줄".into(),
            r#"{"type":"user","timestamp":"2026-10-23T10:00:02Z","message":{"usage":{"input_tokens":999}}}"#.into(),
            asst("2026-10-23T11:00:00.000Z", "m2", "r2", "opus", (1, 2, 3, 4)),
            asst("2026-10-24T01:00:00.000Z", "m3", "r3", "sonnet", (5, 5, 5, 5)),
        ]);
        let r = tokens_scan_in(&claude_root(&d), 7, now(0));
        let a = row(&r, Agent::Claude, "2026-10-23");
        assert_eq!((a.input, a.output, a.cache_read, a.cache_write), (11, 22, 33, 44));
        // 파생: All tokens / In+out / Output (S-1562)
        assert_eq!(a.total, 11 + 22 + 33 + 44);
        assert_eq!(a.in_out, 11 + 22);
        let b = row(&r, Agent::Claude, "2026-10-24");
        assert_eq!(b.total, 20);
        assert_eq!(r.days.len(), 2);
        assert!(!r.partial);
    }

    #[test]
    fn 파일이_달라도_같은_message_id_request_id는_한_번만_센다_s1560() {
        // 이어하기·서브에이전트가 앞 줄을 새 파일에 복사한 경우
        let d = tmp("c1x");
        write(&d.join("p1/a.jsonl"), &[asst("2026-10-23T10:00:00Z", "m1", "r1", "opus", (10, 20, 30, 40)), asst("2026-10-23T10:01:00Z", "m2", "r2", "opus", (1, 1, 1, 1))]);
        write(&d.join("p1/b.jsonl"), &[asst("2026-10-23T10:00:00Z", "m1", "r1", "opus", (10, 20, 30, 40)), asst("2026-10-23T10:02:00Z", "m3", "r3", "opus", (2, 2, 2, 2))]);
        let r = tokens_scan_in(&claude_root(&d), 7, now(0));
        let a = row(&r, Agent::Claude, "2026-10-23");
        assert_eq!((a.input, a.output, a.cache_read, a.cache_write), (13, 23, 33, 43));
    }

    #[test]
    fn 같은_id라도_request_id가_다르면_따로_센다() {
        let d = tmp("c2");
        write(&d.join("a.jsonl"), &[
            asst("2026-10-24T01:00:00Z", "m1", "rA", "x", (1, 1, 0, 0)),
            asst("2026-10-24T01:00:01Z", "m1", "rB", "x", (1, 1, 0, 0)),
        ]);
        let r = tokens_scan_in(&claude_root(&d), 3, now(0));
        assert_eq!(row(&r, Agent::Claude, "2026-10-24").total, 4);
    }

    #[test]
    fn 로컬_날짜_경계_s1560() {
        let d = tmp("c3");
        write(&d.join("a.jsonl"), &[
            asst("2026-10-23T14:59:59Z", "m1", "r1", "x", (1, 0, 0, 0)), // +09:00 → 10-23 23:59:59
            asst("2026-10-23T15:00:00Z", "m2", "r2", "x", (2, 0, 0, 0)), // → 10-24 00:00:00
        ]);
        let r = tokens_scan_in(&claude_root(&d), 7, now(540));
        assert_eq!(row(&r, Agent::Claude, "2026-10-23").input, 1);
        assert_eq!(row(&r, Agent::Claude, "2026-10-24").input, 2);
        // 음수 시간대(-05:00): 둘 다 10-23
        let r2 = tokens_scan_in(&claude_root(&d), 7, now(-300));
        assert_eq!(row(&r2, Agent::Claude, "2026-10-23").input, 3);
    }

    #[test]
    fn 조회_시작일_이전_줄은_뺀다() {
        let d = tmp("c4");
        write(&d.join("a.jsonl"), &[
            asst("2026-10-17T10:00:00Z", "m1", "r1", "x", (1, 0, 0, 0)), // days=7 → 시작 10-18
            asst("2026-10-18T10:00:00Z", "m2", "r2", "x", (2, 0, 0, 0)),
        ]);
        let r = tokens_scan_in(&claude_root(&d), 7, now(0));
        assert_eq!(r.days.len(), 1);
        assert_eq!(row(&r, Agent::Claude, "2026-10-18").input, 2);
    }

    #[test]
    fn codex_누적_token_count의_차이_합_s1561() {
        let d = tmp("x1");
        write(&d.join("2026/10/23/rollout-a.jsonl"), &[
            r#"{"timestamp":"2026-10-23T09:00:00Z","type":"session_meta","payload":{"id":"s1"}}"#.into(),
            r#"{"timestamp":"2026-10-23T09:00:01Z","type":"turn_context","payload":{"model":"gpt-5"}}"#.into(),
            cx("2026-10-23T09:10:00Z", 100, 40, 10),
            cx("2026-10-23T09:20:00Z", 100, 40, 10), // 변화 없음
            cx("2026-10-24T09:30:00Z", 250, 100, 30),
        ]);
        write(&d.join("2026/10/23/rollout-b.jsonl"), &[cx("2026-10-24T10:00:00Z", 10, 0, 5)]);
        write(&d.join("2026/10/23/other.jsonl"), &[cx("2026-10-24T10:00:00Z", 999, 0, 999)]); // rollout- 아님
        let roots = vec![Root { agent: Agent::Codex, dir: d.clone() }];
        let r = tokens_scan_in(&roots, 7, now(0));
        let a = row(&r, Agent::Codex, "2026-10-23");
        assert_eq!((a.input, a.cache_read, a.output, a.total), (60, 40, 10, 110));
        let b = row(&r, Agent::Codex, "2026-10-24");
        // a: 입력 +150(캐시 +60 → 90), 출력 +20 / b: 입력 10, 출력 5
        assert_eq!((b.input, b.cache_read, b.output), (90 + 10, 60, 25));
        assert_eq!(b.total, 100 + 60 + 25);
        assert_eq!(r.stats[&Agent::Codex].sessions, 2);
    }

    #[test]
    fn 수정시각이_시작일_이전인_파일은_열지_않는다_s1565() {
        let d = tmp("m1");
        let old = d.join("old.jsonl");
        write(&old, &[asst("2026-10-23T10:00:00Z", "m1", "r1", "x", (7, 0, 0, 0))]);
        set_age_days(&old, 30);
        write(&d.join("new.jsonl"), &[asst("2026-10-23T10:00:00Z", "m2", "r2", "x", (1, 0, 0, 0))]);
        let r = tokens_scan_in(&claude_root(&d), 7, now(0));
        assert_eq!(row(&r, Agent::Claude, "2026-10-23").input, 1); // old 의 7 은 없다
    }

    #[test]
    fn 캐시는_바뀐_파일만_다시_읽는다_s1565() {
        let d = tmp("k1");
        let cache = d.join("tokens-cache.json");
        let logs = d.join("logs");
        let (a, b) = (logs.join("a.jsonl"), logs.join("b.jsonl"));
        write(&a, &[asst("2026-10-23T10:00:00Z", "m1", "r1", "x", (1, 0, 0, 0))]);
        write(&b, &[asst("2026-10-23T10:00:00Z", "m2", "r2", "x", (2, 0, 0, 0))]);
        let c = AtomicBool::new(false);
        let o = Opts { cache: Some(&cache), limit: Duration::from_secs(30), cancel: &c };
        let r1 = tokens_scan_with(&claude_root(&logs), 7, now(0), &o);
        assert_eq!(row(&r1, Agent::Claude, "2026-10-23").input, 3);
        assert!(cache.exists());
        // a: 같은 크기·같은 수정 시각으로 내용만 바꿈(1→8) → 캐시가 맞으면 옛 값 1 이 남는다
        let mt = fs::metadata(&a).unwrap().modified().unwrap();
        write(&a, &[asst("2026-10-23T10:00:00Z", "m1", "r1", "x", (8, 0, 0, 0))]);
        fs::File::options().write(true).open(&a).unwrap().set_modified(mt).unwrap();
        // b: 크기가 달라짐(2→20) → 다시 읽는다
        write(&b, &[asst("2026-10-23T10:00:00Z", "m2", "r2", "x", (20, 0, 0, 0))]);
        let r2 = tokens_scan_with(&claude_root(&logs), 7, now(0), &o);
        assert_eq!(row(&r2, Agent::Claude, "2026-10-23").input, 1 + 20);
    }

    #[test]
    fn 제한_시간_0이나_취소면_partial_s1565() {
        let d = tmp("p1");
        write(&d.join("a.jsonl"), &[asst("2026-10-23T10:00:00Z", "m1", "r1", "x", (1, 0, 0, 0))]);
        let c = AtomicBool::new(false);
        let r = tokens_scan_with(&claude_root(&d), 7, now(0), &Opts { cache: None, limit: Duration::ZERO, cancel: &c });
        assert!(r.partial);
        c.store(true, Ordering::SeqCst);
        let r = tokens_scan_with(&claude_root(&d), 7, now(0), &Opts { cache: None, limit: Duration::from_secs(30), cancel: &c });
        assert!(r.partial);
    }

    #[test]
    fn 기본_roots는_claude_codex만_gemini_grok_프로필은_제외_s1563() {
        let h = tmp("h1");
        let roots = default_roots(&h, None, None);
        let dirs: Vec<_> = roots.iter().map(|r| (r.agent, r.dir.clone())).collect();
        assert_eq!(dirs, vec![(Agent::Claude, h.join(".claude").join("projects")), (Agent::Codex, h.join(".codex").join("sessions"))]);
        // 환경변수 대체 폴더
        let cc = h.join("cc");
        let ch = h.join("ch");
        let roots = default_roots(&h, Some(&cc), Some(&ch));
        assert_eq!(roots[0].dir, cc.join("projects"));
        assert_eq!(roots[1].dir, ch.join("sessions"));
        // 파일 쪽: Gemini/Grok 폴더와 Profiles 폴더 안 로그는 합계에 안 들어간다
        write(&h.join(".gemini/tmp/x.jsonl"), &[asst("2026-10-23T10:00:00Z", "g", "g", "gem", (100, 0, 0, 0))]);
        write(&h.join(".grok/x.jsonl"), &[asst("2026-10-23T10:00:00Z", "k", "k", "grok", (100, 0, 0, 0))]);
        write(&h.join(".claude/projects/Profiles/acct/x.jsonl"), &[asst("2026-10-23T10:00:00Z", "q", "q", "x", (100, 0, 0, 0))]);
        write(&h.join(".claude/projects/p/ok.jsonl"), &[asst("2026-10-23T10:00:00Z", "o", "o", "x", (1, 0, 0, 0))]);
        let r = tokens_scan_in(&default_roots(&h, None, None), 7, now(0));
        assert_eq!(r.days.iter().map(|x| x.input).sum::<u64>(), 1);
    }

    fn many_days() -> ScanResult {
        // 10-20,21,22 연속 + 10-24(오늘) / 모델 opus 3, sonnet 2
        let d = tmp("s1");
        write(&d.join("a.jsonl"), &[
            asst("2026-10-20T01:00:00Z", "a", "a", "opus", (100, 0, 0, 0)),
            asst("2026-10-21T01:00:00Z", "b", "b", "opus", (10, 0, 0, 0)),
            asst("2026-10-21T02:00:00Z", "c", "c", "opus", (10, 0, 0, 0)),
            asst("2026-10-22T01:00:00Z", "d", "d", "sonnet", (50, 0, 0, 0)),
        ]);
        write(&d.join("b.jsonl"), &[asst("2026-10-24T01:00:00Z", "e", "e", "sonnet", (1, 0, 0, 0))]);
        tokens_scan_in(&claude_root(&d), 30, now(0))
    }

    #[test]
    fn usage_stats_claude_s1564() {
        let r = many_days();
        let s = usage_stats_in(&r, Agent::Claude, "2026-10-24");
        assert_eq!(s.favorite_model.as_deref(), Some("opus")); // 메시지 수 3 > 2
        assert_eq!(s.total_tokens, 171);
        assert_eq!(s.sessions, 2);
        assert_eq!(s.active_days, 4);
        assert_eq!(s.span_days, 5); // 10-20 ~ 10-24
        assert_eq!(s.most_active_day.as_deref(), Some("2026-10-20"));
        assert_eq!(s.longest_streak, 3);
        // 히트맵: 최대(100) 대비 4단계. 0 은 목록에 없다
        let lv = |d: &str| s.heat.iter().find(|h| h.date == d).map(|h| h.level);
        assert_eq!(lv("2026-10-20"), Some(4));
        assert_eq!(lv("2026-10-22"), Some(2)); // 50/100 → 2
        assert_eq!(lv("2026-10-24"), Some(1)); // 1/100 → 1(0 아님)
        assert_eq!(lv("2026-10-23"), None);
    }

    #[test]
    fn usage_stats_codex_lifetime_peak_streak_longest_task_s1564() {
        let d = tmp("s2");
        write(&d.join("rollout-a.jsonl"), &[
            cx("2026-10-22T09:00:00Z", 10, 0, 0),
            cx("2026-10-23T09:00:00Z", 40, 0, 0),
            cx("2026-10-24T10:30:00Z", 45, 0, 0),
        ]);
        let roots = vec![Root { agent: Agent::Codex, dir: d }];
        let r = tokens_scan_in(&roots, 30, now(0));
        let s = usage_stats_in(&r, Agent::Codex, "2026-10-24");
        assert_eq!(s.lifetime, 45);
        assert_eq!(s.peak, 30); // 10-23 하루 최대
        assert_eq!((s.streak_current, s.streak_best), (3, 3));
        assert_eq!(s.longest_task_secs, 49 * 3600 + 30 * 60); // 10-22 09:00 → 10-24 10:30
        // 오늘 활동이 없으면 어제까지의 연속을 센다
        assert_eq!(usage_stats_in(&r, Agent::Codex, "2026-10-25").streak_current, 3);
        assert_eq!(usage_stats_in(&r, Agent::Codex, "2026-10-26").streak_current, 0);
    }
}
