import { describe, expect, it } from "vitest";
import { parseOpenCodeStats, parseUsage } from "./parse";

// 영상(sheets/node-usage.jpg) 화면 예시를 옮긴 고정 문자열 — 문구는 CLI 가 바뀌면 달라진다(추측)
const CLAUDE = [
  " Settings:  Status   Config   Usage",
  "",
  " Current session",
  " ███████                                            14% used",
  " Resets 4:09pm (Asia/Seoul)",
  "",
  " Current week (all models)",
  " ████                                               9% used",
  " Resets Oct 28, 6pm (Asia/Seoul)",
  "",
  " Current week (Fable)",
  " ██████                                             17% used",
  " Resets Oct 28, 6pm (Asia/Seoul)",
].join("\n");
const CODEX = [
  "  /status",
  "  Monthly limit  [██████░░░░░░░░░░░░░░] 27% used",
  "                 Resets 08:37 on 14 Sep",
].join("\n");

describe("S-1513 Claude 화면", () => {
  it("세션·주(전체 모델)·주(모델) 창을 순서대로 읽는다", () => {
    expect(parseUsage("claude", CLAUDE)?.windows).toEqual([
      { label: "Current session", pct: 14, resetText: "4:09pm" },
      { label: "Current week (all models)", pct: 9, resetText: "Oct 28, 6pm" },
      { label: "Current week (Fable)", pct: 17, resetText: "Oct 28, 6pm" },
    ]);
  });
  it("이름과 퍼센트가 한 줄에 있는 화면도 읽는다", () => {
    const t = "Current session 14% used\nResets 4:09pm\nCurrent week (all models) 9%\nResets 6pm";
    expect(parseUsage("claude", t)?.windows).toEqual([
      { label: "Current session", pct: 14, resetText: "4:09pm" },
      { label: "Current week (all models)", pct: 9, resetText: "6pm" },
    ]);
  });
  it("리셋 줄이 없는 창은 resetText 가 null", () => {
    expect(parseUsage("claude", "Current session\n██ 3% used")?.windows).toEqual([{ label: "Current session", pct: 3, resetText: null }]);
  });
});

describe("S-1515 Codex 화면", () => {
  it("Monthly limit 27% used + Resets 08:37 on 14 Sep", () => {
    expect(parseUsage("codex", CODEX)?.windows).toEqual([{ label: "Monthly limit", pct: 27, resetText: "08:37 on 14 Sep" }]);
  });
  it("남은 퍼센트(left)는 사용량으로 바꾼다, 같은 줄의 (resets …)도 읽는다", () => {
    const t = "5h limit: [████████████░░░░░░░░] 73% left (resets 08:37)\nWeekly limit: [██░] 90% left (resets 08:37 on 14 Sep)";
    expect(parseUsage("codex", t)?.windows).toEqual([
      { label: "5h limit", pct: 27, resetText: "08:37" },
      { label: "Weekly limit", pct: 10, resetText: "08:37 on 14 Sep" },
    ]);
  });
});

describe("S-1511·S-1516 알 수 없는 화면은 파싱 실패(raw 만)", () => {
  it("모르는 글은 null", () => {
    expect(parseUsage("claude", "Welcome back!\nTry /help")).toBeNull();
    expect(parseUsage("codex", "")).toBeNull();
  });
  it("Claude·Codex 가 아닌 CLI 는 해석하지 않는다", () => {
    expect(parseUsage("gemini", CLAUDE)).toBeNull();
    expect(parseUsage("opencode", CODEX)).toBeNull();
  });
});

// S-3161 예시 화면 3개 — gemini-cli QuotaStatsInfo.tsx 글 기준의 추측 모양
const G_ONE = ["Usage limits span all sessions and reset daily.", "34% used (Limit resets in 3h 20m)"].join("\n");
const G_TWO = [
  "gemini-2.5-pro     34% used (Limit resets in 3h 20m)",
  "gemini-2.5-flash   5% used",
  "                   (Limit resets in 3h 20m)",
  "Usage limits span all sessions and reset daily.",
].join("\n");
const G_FULL = ["gemini-2.5-pro  Limit reached (resets in 2h)", "gemini-2.5-flash  10% used (Limit resets in 2h)"].join("\n");

describe("S-3161 Gemini /stats model 화면", () => {
  it("모델 이름 없이 34% used + resets -> Daily limit 창 하나", () => {
    expect(parseUsage("gemini", G_ONE)?.windows).toEqual([{ label: "Daily limit", pct: 34, resetText: "3h 20m" }]);
  });
  it("모델이 둘이면 모델마다 창 하나(label = 모델 이름, 리셋은 다음 줄도 본다)", () => {
    expect(parseUsage("gemini", G_TWO)?.windows).toEqual([
      { label: "gemini-2.5-pro", pct: 34, resetText: "3h 20m" },
      { label: "gemini-2.5-flash", pct: 5, resetText: "3h 20m" },
    ]);
  });
  it("Limit reached 줄은 pct 100", () => {
    expect(parseUsage("gemini", G_FULL)?.windows).toEqual([
      { label: "gemini-2.5-pro", pct: 100, resetText: "2h" },
      { label: "gemini-2.5-flash", pct: 10, resetText: "2h" },
    ]);
  });
  it("예시가 아닌 글·옛 /stats 글은 null(원문 보기)", () => {
    expect(parseUsage("gemini", "Session stats: 12 requests, 3 tool calls")).toBeNull();
    expect(parseUsage("gemini", "")).toBeNull();
  });
});

// S-3162 opencode cli/cmd/stats.ts 304~320줄 모양
const OC = [
  "┌────────────────────────────────────────────────────────┐",
  "│                       OVERVIEW                         │",
  "├────────────────────────────────────────────────────────┤",
  "│Sessions                                             12 │",
  "│Messages                                          1,234 │",
  "│Days                                                  5 │",
  "└────────────────────────────────────────────────────────┘",
  "┌────────────────────────────────────────────────────────┐",
  "│                    COST & TOKENS                       │",
  "├────────────────────────────────────────────────────────┤",
  "│Total Cost                                       $12.34 │",
  "│Avg Cost/Day                                      $2.47 │",
  "│Input                                              1.2M │",
  "│Output                                           45,000 │",
  "└────────────────────────────────────────────────────────┘",
].join("\n");

describe("S-3162 OpenCode stats 화면", () => {
  it("이름 줄의 값을 읽는다(, $ 뗌, K/M/B 곱함)", () => {
    expect(parseOpenCodeStats(OC)).toEqual({ sessions: 12, messages: 1234, days: 5, cost: 12.34, costPerDay: 2.47, input: 1_200_000, output: 45000 });
  });
  it("Input·Output 이 없으면 그 칸만 빠진다", () => {
    expect(parseOpenCodeStats("│Sessions   3 │\n│Total Cost   $0.50 │")).toEqual({ sessions: 3, cost: 0.5 });
  });
  it("하나도 없으면 null", () => {
    expect(parseOpenCodeStats("hello")).toBeNull();
    expect(parseOpenCodeStats("")).toBeNull();
  });
});
