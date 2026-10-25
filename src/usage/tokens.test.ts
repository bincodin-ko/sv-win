import { describe, expect, it } from "vitest";
import { agentTotals, dayColumns, fmtTokens, lastDates, tiles } from "./tokens";
import type { DayRow } from "./tokensApi";

const today = new Date(2026, 7, 20); // Aug 20
const row = (date: string, agent: "claude" | "codex", total: number, inOut = total / 2, output = total / 4): DayRow =>
  ({ date, agent, input: 0, output, cacheRead: 0, cacheWrite: 0, total, inOut });

describe("fmtTokens (S-1574)", () => {
  it.each([[999, "999"], [0, "0"], [1100000, "1.1M"], [753000, "753K"], [303000, "303K"], [2300000000, "2.3B"], [1500, "1.5K"], [999600, "1.0M"]])("%i -> %s", (n, s) => expect(fmtTokens(n)).toBe(s));
});
describe("30일 열 (S-1572)", () => {
  it("로그 없는 날도 0, 30개, 오늘로 끝남", () => {
    const cols = dayColumns([row("2026-08-11", "claude", 100)], "all", 30, today);
    expect(cols).toHaveLength(30);
    expect(cols[29].date).toBe("2026-08-20");
    expect(cols[0].date).toBe("2026-07-22");
    expect(cols.filter((c) => c.total === 0)).toHaveLength(29);
  });
  it("탭별 합: all=total, inOut, output", () => {
    const r = [row("2026-08-11", "claude", 100), row("2026-08-11", "codex", 40)];
    expect(dayColumns(r, "all", 30, today)[20].total).toBe(140);
    expect(dayColumns(r, "inOut", 30, today)[20].total).toBe(70);
    expect(dayColumns(r, "output", 30, today)[20].total).toBe(35);
  });
  it("lastDates 월 경계", () => expect(lastDates(3, new Date(2026, 2, 1))).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]));
});
describe("타일·BY AGENT (S-1571·S-1573)", () => {
  const r = [row("2026-08-11", "claude", 300), row("2026-08-12", "codex", 100), row("2026-05-01", "codex", 1000)];
  it("Busiest day 'Aug 11'·Top agent 비율·합계", () => {
    const t = tiles(dayColumns(r, "all", 30, today));
    expect(t).toEqual({ total: 400, busiest: "Aug 11", top: { agent: "claude", pct: 75 } });
  });
  it("로그 없음 -> 0, —, null", () => expect(tiles(dayColumns([], "all", 30, today))).toEqual({ total: 0, busiest: "—", top: null }));
  it("Last 30 days 대 All time 토글", () => {
    expect(agentTotals(r, "all", "30", today).map((a) => [a.agent, a.total, a.pct])).toEqual([["claude", 300, 75], ["codex", 100, 25]]);
    expect(agentTotals(r, "all", "all", today).map((a) => [a.agent, a.total, a.pct])).toEqual([["codex", 1100, 79], ["claude", 300, 21]]);
  });
});
