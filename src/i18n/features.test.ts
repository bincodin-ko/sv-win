// K7 기능 패널 번역(Loops·Memory·Mission Map·Orchestrator·Usage·Handoff) — 시간 표기·문구 순수 함수의 영어/한국어.
// 영어 기존 시험(각 폴더 *.test.ts)은 그대로 통과해야 한다. 한국어 케이스는 여기서, 끝나면 영어로 되돌린다.
// 기대 문구 출처: briefs/K7-기능패널번역.md "시간 표기" — "2시간 15분 남음"·"3분 전"·"10분마다"·"매시간".
import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "./index";
import { countdown } from "../loops/trigger";
import { summary } from "../loops/summary";
import { fixRanges, emptyDraft, outputError } from "../loops/form";
import type { Loop } from "../loops/types";
import { fmtElapsed } from "../mission/since";
import { missionModel } from "../mission/model";
import { leftText } from "../usage/reset";
import { duration } from "../usage/parts";
import { dayColumns, tiles } from "../usage/tokens";
import { headerText } from "../orchestrator/rows";
import { pushLine } from "../memory/push";

afterEach(() => setLang("en"));

const base = (p: Partial<Loop> = {}): Loop => ({ id: "l", name: "L", instruction: "x", trigger: { kind: "schedule", everyMin: 15 }, target: { kind: "all" }, stop: {}, keepBehind: true, enabled: true, wsId: "w", repo: "r", ...p });

describe("K7 시간 표기 (S-2481·S-2483)", () => {
  it("남은 시간 leftText", () => {
    expect(leftText(135 * 60_000)).toBe("2h 15m left");
    expect(leftText(45 * 60_000)).toBe("45m left");
    expect(leftText(26 * 3_600_000 + 5 * 60_000)).toBe("1d 2h left");
    setLang("ko");
    expect(leftText(135 * 60_000)).toBe("2시간 15분 남음");
    expect(leftText(45 * 60_000)).toBe("45분 남음");
    expect(leftText(26 * 3_600_000 + 5 * 60_000)).toBe("1일 2시간 남음");
  });
  it("경과 시간 fmtElapsed (Mission 'For')", () => {
    expect([130, 45, 3720, 0].map(fmtElapsed)).toEqual(["2m 10s", "45s", "1h 2m", "0s"]);
    setLang("ko");
    expect([130, 45, 3720, 0].map(fmtElapsed)).toEqual(["2분 10초", "45초", "1시간 2분", "0초"]);
  });
  it("Codex 가장 긴 작업 duration", () => {
    expect([duration(300), duration(8100)]).toEqual(["5m", "2h 15m"]);
    setLang("ko");
    expect([duration(300), duration(8100)]).toEqual(["5분", "2시간 15분"]);
  });
  it("루프 카운트다운", () => {
    expect(countdown(1_000_000 + 893_000, 1_000_000)).toBe("in 14:53");
    setLang("ko");
    expect(countdown(1_000_000 + 893_000, 1_000_000)).toBe("14:53 후");
  });
  it("간격 요약 — 10분마다·매시간", () => {
    expect(summary(base({ trigger: { kind: "schedule", everyMin: 10 }, stop: { runs: 5 } }), 3, "Claude")).toBe(
      "Every 10 min, the instruction is sent to every console on the board, for 5 runs. ≈ 18 prompts/hour across 3 consoles",
    );
    expect(summary(base({ trigger: { kind: "schedule", everyMin: 60 } }), 1, "Claude")).toMatch(/^Every 1 h, /);
    setLang("ko");
    expect(summary(base({ trigger: { kind: "schedule", everyMin: 10 }, stop: { runs: 5 } }), 3, "Claude")).toBe(
      "10분마다 지시를 보드의 모든 콘솔에 보냅니다 (5회 실행까지). 콘솔 3개 기준 시간당 프롬프트 약 18개",
    );
    expect(summary(base({ trigger: { kind: "schedule", everyMin: 60 } }), 1, "Claude")).toMatch(/^매시간 지시를 /);
    expect(summary(base({ trigger: { kind: "schedule", everyMin: 120 }, stop: { minutes: 120 } }), 1, "Claude")).toContain("2시간마다");
    expect(summary(base({ trigger: { kind: "idle" }, target: { kind: "card", id: "o" }, stop: { goal: { mode: "command", text: "npm test" } } }), 2, "Claude")).toBe(
      "에이전트가 대기 상태가 되면 지시를 오케스트레이터 카드 하나의 콘솔에 보냅니다 (명령이 통과할 때까지).",
    );
  });
  it("토큰 타일의 가장 바쁜 날", () => {
    const row = { date: "2026-08-11", agent: "claude" as const, input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 400, inOut: 200 };
    const cols = dayColumns([row as never], "all", 30, new Date(2026, 7, 20));
    expect(tiles(cols).busiest).toBe("Aug 11");
    setLang("ko");
    expect(tiles(cols).busiest).toBe("8월 11일");
  });
});

describe("K7 문구 함수", () => {
  it("폼 범위 안내·오류", () => {
    const d = { ...emptyDraft(), runsOn: true, runs: 500 };
    expect(fixRanges(d).notes).toEqual(["Runs set to 200 (allowed 1–200)"]);
    expect(outputError({ ...emptyDraft(), kind: "output", outputText: "e" })).toBe("At least two characters");
    setLang("ko");
    expect(fixRanges(d).notes).toEqual(["실행 횟수 조정: 200 (허용 범위 1–200)"]);
    expect(outputError({ ...emptyDraft(), kind: "output", outputText: "e" })).toBe("두 글자 이상 입력하세요");
  });
  it("Mission Map 요약", () => {
    const sum = () => missionModel({}, [], () => undefined, 0).summary;
    expect(sum()).toBe("Mission Map · 0 orchestrators · 0 teams · 0 consoles · 0 working");
    setLang("ko");
    expect(sum()).toBe("미션 맵 · 오케스트레이터 0개 · 팀 0개 · 콘솔 0개 · 작업 중 0");
  });
  it("오케스트레이터 머리 보조줄", () => {
    expect(headerText(21, ["A", "B"])).toBe("21 agents · 2 groups");
    setLang("ko");
    expect(headerText(21, ["A", "B"])).toBe("에이전트 21개 · 그룹 2개");
    expect(headerText(1, ["Team"])).toBe("에이전트 1개 · Team");
  });
  it("Memory Push 결과 줄", () => {
    expect(pushLine({ sent: 1, busy: 2, omitted: 3 })).toBe("Sent to 1 · 2 busy · 3 left out");
    setLang("ko");
    expect(pushLine({ sent: 1, busy: 2, omitted: 3 })).toBe("1곳에 보냄 · 2곳 바쁨 · 3개 제외");
    expect(pushLine({ sent: 0, busy: 1, omitted: 0 })).toBe("보낸 곳 없음");
  });
});
