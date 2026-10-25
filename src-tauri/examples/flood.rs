//! 부하 시험용 출력기: `flood <i> <bytes>` → 서로 다른 줄로 bytes 이상 쓰고 마지막에 `DONE-<i>`
use std::io::Write;

fn main() {
    let mut a = std::env::args().skip(1);
    let i: String = a.next().unwrap_or_else(|| "0".into());
    let total: usize = a.next().and_then(|s| s.parse().ok()).unwrap_or(1 << 20);
    let mut out = std::io::BufWriter::new(std::io::stdout().lock());
    let mut n = 0usize;
    let mut line = 0usize;
    while n < total {
        let s = format!("{i:>2} {line:>8} abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ\r\n");
        n += s.len();
        line += 1;
        out.write_all(s.as_bytes()).unwrap();
    }
    write!(out, "DONE-{i}\r\n").unwrap();
    out.flush().unwrap();
}
