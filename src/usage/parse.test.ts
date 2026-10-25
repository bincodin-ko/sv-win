import { describe, expect, it } from "vitest";
import { parseUsage } from "./parse";

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
