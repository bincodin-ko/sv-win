// D11 S-1570~S-1575: Tokens 화면의 순수 계산
import { t, tm } from "../i18n";
import { tokenValue, type Agent, type DayRow, type TokenMode } from "./tokensApi";

export const AGENTS: Agent[] = ["claude", "codex"];
export const AGENT_NAME: Record<Agent, string> = { claude: "Claude", codex: "Codex" };
const MON = [tm("Jan"), tm("Feb"), tm("Mar"), tm("Apr"), tm("May"), tm("Jun"), tm("Jul"), tm("Aug"), tm("Sep"), tm("Oct"), tm("Nov"), tm("Dec")];

/** S-1574: 1,000 미만 그대로, K·M·B 소수 한 자리(100 이상은 소수 없음) */
export function fmtTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  const units = ["K", "M", "B"];
  let i = 0, v = n / 1000;
  const rnd = (x: number) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10);
  while (rnd(v) >= 1000 && i < 2) (v /= 1000, i++);
  const r = rnd(v);
  return (r >= 100 ? String(r) : r.toFixed(1)) + units[i];
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** 오늘로 끝나는 days 일의 날짜(오래된 것부터) */
export function lastDates(days: number, today = new Date()): string[] {
  return Array.from({ length: days }, (_, i) => ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i))));
}

export type Col = { date: string; parts: Record<Agent, number>; total: number };
/** S-1572: 로그 없는 날도 0으로 채운 열 */
export function dayColumns(rows: DayRow[], mode: TokenMode, days = 30, today = new Date()): Col[] {
  return lastDates(days, today).map((date) => {
    const parts: Record<Agent, number> = { claude: 0, codex: 0 };
    for (const r of rows) if (r.date === date) parts[r.agent] += tokenValue(r, mode);
    return { date, parts, total: parts.claude + parts.codex };
  });
}

/** S-1573: 에이전트별 합계(range 30 = 지난 30일, all = 전부) */
export function agentTotals(rows: DayRow[], mode: TokenMode, range: "30" | "all", today = new Date()): { agent: Agent; total: number; pct: number }[] {
  const keep = range === "all" ? null : new Set(lastDates(30, today));
  const sum: Record<Agent, number> = { claude: 0, codex: 0 };
  for (const r of rows) if (!keep || keep.has(r.date)) sum[r.agent] += tokenValue(r, mode);
  const all = sum.claude + sum.codex;
  return AGENTS.filter((a) => sum[a] > 0).map((agent) => ({ agent, total: sum[agent], pct: all ? Math.round((sum[agent] / all) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
}

/** S-1571: 타일 값 */
export function tiles(cols: Col[]) {
  const total = cols.reduce((s, c) => s + c.total, 0);
  const best = cols.reduce<Col | null>((b, c) => (c.total > (b?.total ?? 0) ? c : b), null);
  const sum: Record<Agent, number> = { claude: 0, codex: 0 };
  for (const c of cols) AGENTS.forEach((a) => (sum[a] += c.parts[a]));
  const top = total ? AGENTS.reduce((a, b) => (sum[b] > sum[a] ? b : a)) : null;
  return {
    total,
    busiest: best ? t("{mon} {day}", { mon: t(MON[Number(best.date.slice(5, 7)) - 1]!), day: Number(best.date.slice(8, 10)) }) : "—",
    top: top ? { agent: top, pct: Math.round((sum[top] / total) * 100) } : null,
  };
}
