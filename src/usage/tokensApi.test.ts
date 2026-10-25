import { afterEach, describe, expect, it } from "vitest";
import { tokensCancel, tokensScan, tokenValue, usageStats, type DayRow, type ScanResult, type UsageStats } from "./tokensApi";

type W = { __fakeTokens?: { scan?: ScanResult; stats?: Partial<Record<"claude" | "codex", UsageStats>>; log?: string[] } };
const w = () => window as unknown as W;
afterEach(() => delete w().__fakeTokens);

const row: DayRow = { date: "2026-10-23", agent: "claude", input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100, inOut: 30 };
const scan: ScanResult = { days: [row], stats: { claude: { models: { opus: 3 }, sessions: 2, activeDates: ["2026-10-23"], longestSessionSecs: 60 } }, partial: false };
const stats: UsageStats = {
  favoriteModel: "opus", totalTokens: 100, sessions: 2, activeDays: 1, spanDays: 1, mostActiveDay: "2026-10-23", longestStreak: 1,
  lifetime: 100, peak: 100, streakCurrent: 1, streakBest: 1, longestTaskSecs: 60, heat: [{ date: "2026-10-23", level: 4 }],
};

describe("가짜 토큰 데이터 왕복 (S-1560~S-1564)", () => {
  it("심은 scan 을 그대로 돌려준다", async () => {
    w().__fakeTokens = { scan };
    expect(await tokensScan(30)).toEqual(scan);
  });
  it("심지 않으면 빈 결과", async () => {
    expect(await tokensScan(7)).toEqual({ days: [], stats: {}, partial: false });
  });
  it("usageStats 는 에이전트별로 심은 값을 돌려준다", async () => {
    w().__fakeTokens = { stats: { claude: stats } };
    expect(await usageStats("claude")).toEqual(stats);
    expect((await usageStats("codex")).heat).toEqual([]);
  });
  it("취소는 기록만 남기고 reject 하지 않는다", async () => {
    await expect(tokensCancel()).resolves.toBeUndefined();
    expect(w().__fakeTokens?.log).toEqual(["cancel"]);
  });
  it("All tokens / In+out / Output 파생 값", () => {
    expect(tokenValue(row, "all")).toBe(100);
    expect(tokenValue(row, "inOut")).toBe(30);
    expect(tokenValue(row, "output")).toBe(20);
  });
});
