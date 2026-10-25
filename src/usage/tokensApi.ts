// D4 S-1560~S-1566: 토큰 집계 IPC(Rust tokens.rs). Tauri 밖에서는 window.__fakeTokens 를 돌려준다(D10·D11 시험용).
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/ipc";
export type Agent = "claude" | "codex";
export type TokenMode = "all" | "inOut" | "output";
export type DayRow = { date: string; agent: Agent; input: number; output: number; cacheRead: number; cacheWrite: number; total: number; inOut: number };
export type AgentStat = { models: Record<string, number>; sessions: number; activeDates: string[]; longestSessionSecs: number };
export type ScanResult = { days: DayRow[]; stats: Partial<Record<Agent, AgentStat>>; partial: boolean };
export type UsageStats = {
  favoriteModel: string | null; totalTokens: number; sessions: number; activeDays: number; spanDays: number;
  mostActiveDay: string | null; longestStreak: number; lifetime: number; peak: number;
  streakCurrent: number; streakBest: number; longestTaskSecs: number; heat: { date: string; level: number }[];
};
type FakeTokens = { scan?: ScanResult; stats?: Partial<Record<Agent, UsageStats>>; log?: string[] };
const fake = () => (window as unknown as { __fakeTokens?: FakeTokens }).__fakeTokens;
const emptyStats: UsageStats = {
  favoriteModel: null, totalTokens: 0, sessions: 0, activeDays: 0, spanDays: 0, mostActiveDay: null, longestStreak: 0,
  lifetime: 0, peak: 0, streakCurrent: 0, streakBest: 0, longestTaskSecs: 0, heat: [],
};

/** 최근 days 일의 날짜별·에이전트별 합계. 가짜: window.__fakeTokens.scan */
export async function tokensScan(days: number): Promise<ScanResult> {
  if (isTauri()) return invoke<ScanResult>("tokens_scan", { days });
  return fake()?.scan ?? { days: [], stats: {}, partial: false };
}
/** 통계 화면 값(최근 365일). 가짜: window.__fakeTokens.stats[agent] */
export async function usageStats(agent: Agent): Promise<UsageStats> {
  if (isTauri()) return invoke<UsageStats>("usage_stats", { agent });
  return fake()?.stats?.[agent] ?? emptyStats;
}
export async function tokensCancel(): Promise<void> {
  if (isTauri()) return invoke("tokens_cancel");
  const f = ((window as unknown as { __fakeTokens?: FakeTokens }).__fakeTokens ??= {});
  (f.log ??= []).push("cancel");
}
/** Tokens 표시 방식: All tokens / In+out / Output */
export function tokenValue(r: DayRow, mode: TokenMode): number {
  return mode === "all" ? r.total : mode === "inOut" ? r.inOut : r.output;
}
