// D10 S-1513·S-1515: Claude `/usage`·Codex `/status`+`/usage` 화면 글자 → 창 목록. 순수 함수
// 화면 문구는 CLI 가 바뀌면 달라진다(추측) — 알아보는 규칙은 아래 두 정규식뿐이다
export interface Win { label: string; pct: number; resetText: string | null }
export interface Parsed { windows: Win[] }

const LABEL = /^\s*(Current (?:session|(?:week|month|day)(?:\s*\([^)]*\))?)|[A-Za-z0-9]+ limit)(?![A-Za-z0-9])/i; // 창 이름 줄
const PCT = /(\d{1,3})\s*%\s*(used|left)?/i;
const RESET = /\bresets?\s+(?:at\s+)?([^()]+?)\s*(?:\([^)]*\))?\s*\)?\s*$/i;
const LOOK = 4; // 이름 줄 아래 몇 줄까지 퍼센트·리셋을 찾는가

export function parseUsage(agent: string, text: string): Parsed | null {
  if (agent !== "claude" && agent !== "codex") return null;
  const lines = text.split("\n");
  const windows: Win[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = LABEL.exec(lines[i]!);
    if (!m) continue;
    const near = [lines[i]!.slice(m[0].length)];
    for (let j = i + 1; j < lines.length && j <= i + LOOK && !LABEL.test(lines[j]!); j++) near.push(lines[j]!);
    const p = near.map((l) => PCT.exec(l)).find(Boolean);
    if (!p) continue;
    const n = Math.min(100, +p[1]!);
    const reset = near.map((l) => RESET.exec(l)).find(Boolean);
    windows.push({ label: m[1]!.trim(), pct: p[2]?.toLowerCase() === "left" ? 100 - n : n, resetText: reset?.[1]?.trim() ?? null });
  }
  return windows.length ? { windows } : null;
}
