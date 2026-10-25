// D10 S-1513·S-1515: Claude `/usage`·Codex `/status`+`/usage` 화면 글자 → 창 목록. 순수 함수
// 화면 문구는 CLI 가 바뀌면 달라진다(추측) — 알아보는 규칙은 아래 두 정규식뿐이다
export interface Win { label: string; pct: number; resetText: string | null }
export interface Parsed { windows: Win[] }

const LABEL = /^\s*(Current (?:session|(?:week|month|day)(?:\s*\([^)]*\))?)|[A-Za-z0-9]+ limit)(?![A-Za-z0-9])/i; // 창 이름 줄
const PCT = /(\d{1,3})\s*%\s*(used|left)?/i;
const RESET = /\bresets?\s+(?:at\s+)?([^()]+?)\s*(?:\([^)]*\))?\s*\)?\s*$/i;
const LOOK = 4; // 이름 줄 아래 몇 줄까지 퍼센트·리셋을 찾는가

export function parseUsage(agent: string, text: string): Parsed | null {
  if (agent === "gemini") return parseGemini(text);
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

// S-3161: Gemini `/stats model` — `NN% used (Limit resets in …)`. 옛 `/stats` 글(% used 없음)과 Claude 글(곁글 없음)은 null
const G_PCT = /(\d{1,3})\s*%\s*used/i;
const G_MODEL = /\bgemini-[\w.-]+/i;
const G_RESET = /resets in\s+([^)\n]+)/i;
function parseGemini(text: string): Parsed | null {
  const lines = text.split("\n");
  const ok = G_PCT.test(text) && /Limit resets in|Usage limits span|gemini-/i.test(text);
  const windows: Win[] = [];
  lines.forEach((l, i) => {
    const used = ok ? G_PCT.exec(l) : null;
    const reached = !used && /limit reached/i.test(l) && G_MODEL.test(l);
    if (!used && !reached) return;
    const prev = lines[i - 1] ?? "";
    const next = lines[i + 1] ?? "";
    const label = G_MODEL.exec(l)?.[0] ?? (G_PCT.test(prev) ? null : G_MODEL.exec(prev)?.[0]) ?? "Daily limit";
    const reset = G_RESET.exec(l) ?? (G_PCT.test(next) ? null : G_RESET.exec(next));
    windows.push({ label, pct: used ? Math.min(100, +used[1]!) : 100, resetText: reset?.[1]?.trim() ?? null });
  });
  return windows.length ? { windows } : null;
}

export interface OpenCodeStats { sessions?: number; messages?: number; days?: number; cost?: number; costPerDay?: number; input?: number; output?: number }
const OC_ROW = /^[│|]?\s*(Sessions|Messages|Days|Total Cost|Avg Cost\/Day|Input|Output)\s+\$?([\d,]+(?:\.\d+)?)\s*([KMB])?\s*[│|]?\s*$/;
const OC_KEY = { Sessions: "sessions", Messages: "messages", Days: "days", "Total Cost": "cost", "Avg Cost/Day": "costPerDay", Input: "input", Output: "output" } as const;
const OC_MUL = { K: 1e3, M: 1e6, B: 1e9 };
/** S-3162: opencode stats 의 `│이름   값 │` 줄들. 하나도 없으면 null */
export function parseOpenCodeStats(text: string): OpenCodeStats | null {
  const out: OpenCodeStats = {};
  for (const l of text.split("\n")) {
    const m = OC_ROW.exec(l.trim());
    if (m) out[OC_KEY[m[1] as keyof typeof OC_KEY]] = +m[2]!.replace(/,/g, "") * (m[3] ? OC_MUL[m[3] as "K"] : 1);
  }
  return Object.keys(out).length ? out : null;
}
