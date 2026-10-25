// D5 순수 함수: 정의 보정(S-1400·S-1403), 카운트다운(S-1402), 새 출력·대소문자(S-1405), 대상(S-1409), 전달 분류(S-1407), 요약문(S-1415), 템플릿(S-1416)
import { describe, expect, it } from "vitest";
import { DEFAULT_EVERY, PRESETS_MIN, normalize, outputTextOk, type Loop } from "./types";
import { countdown, newLines, outputMatch, idleEdge, cooled, COOLDOWN_MS } from "./trigger";
import { targetNodeIds } from "./targets";
import { sortTargets, type LConsole } from "./deliver";
import { summary } from "./summary";
import { TEMPLATES } from "./templates";

const base = (p: Partial<Loop> = {}): Loop => ({
  id: "l1", name: "L", instruction: "go", trigger: { kind: "schedule", everyMin: 15 }, target: { kind: "all" }, stop: {}, keepBehind: true, enabled: false, wsId: "w", repo: "C:/r", ...p,
});

describe("정의 보정 S-1400·S-1403", () => {
  it("주기 1~1440 정수, runs 1~200, minutes 15~1440", () => {
    expect((normalize(base({ trigger: { kind: "schedule", everyMin: 0 } })).trigger as { everyMin: number }).everyMin).toBe(1);
    expect((normalize(base({ trigger: { kind: "schedule", everyMin: 5000 } })).trigger as { everyMin: number }).everyMin).toBe(1440);
    expect((normalize(base({ trigger: { kind: "schedule", everyMin: 7.6 } })).trigger as { everyMin: number }).everyMin).toBe(8);
    const s = normalize(base({ stop: { runs: 0, minutes: 5 } })).stop;
    expect(s).toEqual({ runs: 1, minutes: 15 });
    expect(normalize(base({ stop: { runs: 999, minutes: 99999 } })).stop).toEqual({ runs: 200, minutes: 1440 });
  });
  it("output 글은 2자 이상", () => {
    expect(outputTextOk("e")).toBe(false);
    expect(outputTextOk(" e ")).toBe(false);
    expect(outputTextOk("er")).toBe(true);
  });
  it("프리셋 5·10·15·30분·1·2시간, 기본 15", () => {
    expect(PRESETS_MIN).toEqual([5, 10, 15, 30, 60, 120]);
    expect(DEFAULT_EVERY).toBe(15);
  });
});

describe("카운트다운 S-1402", () => {
  it("in 분:초", () => {
    expect(countdown(1_000_000 + 893_000, 1_000_000)).toBe("in 14:53");
    expect(countdown(1000 + 5_000, 1000)).toBe("in 0:05");
    expect(countdown(0, 1000)).toBe("in 0:00");
    expect(countdown(120 * 60_000, 0)).toBe("in 120:00");
  });
});

describe("새 출력 S-1405", () => {
  it("이전 꼬리 뒤에 붙은 줄만 새 줄", () => {
    expect(newLines([], ["a", "b"])).toEqual(["a", "b"]);
    expect(newLines(["a", "b"], ["a", "b"])).toEqual([]);
    expect(newLines(["a", "b"], ["a", "b", "c"])).toEqual(["c"]);
    expect(newLines(["a", "b", "c"], ["b", "c", "d"])).toEqual(["d"]); // 화면이 밀림
  });
  it("소문자면 대소문자 무시, 대문자가 있으면 구분, 색 코드 제거", () => {
    expect(outputMatch("error", ["Build ERROR here"])).toBe(true);
    expect(outputMatch("Error", ["build error"])).toBe(false);
    expect(outputMatch("Error", ["\x1b[31mError\x1b[0m: x"])).toBe(true);
    expect(outputMatch("error", ["err", "or"])).toBe(false); // 줄을 걸친 것은 무시
  });
  it("idle = WORKING → READY, 2분 제한", () => {
    expect(idleEdge("WORKING", "READY")).toBe(true);
    expect(idleEdge("RUNNING", "READY")).toBe(false);
    expect(idleEdge("READY", "READY")).toBe(false);
    expect(COOLDOWN_MS).toBe(120_000);
    expect(cooled(undefined, 0)).toBe(true);
    expect(cooled(0, 119_999)).toBe(false);
    expect(cooled(0, 120_000)).toBe(true);
  });
});

describe("대상 해석 S-1409", () => {
  const nodes = {
    a: { id: "a", kind: "console", x: 0, y: 0, w: 1, h: 1, z: 0, groupId: "g1" },
    b: { id: "b", kind: "console", x: 0, y: 0, w: 1, h: 1, z: 0, groupId: "g1" },
    c: { id: "c", kind: "console", x: 0, y: 0, w: 1, h: 1, z: 0 },
    n: { id: "n", kind: "note", x: 0, y: 0, w: 1, h: 1, z: 0 },
    o: { id: "o", kind: "orchestrator", x: 0, y: 0, w: 1, h: 1, z: 0, wired: ["g1", "c", "gone", "a"] },
  };
  it("all = 콘솔 전부", () => expect(targetNodeIds({ kind: "all" }, nodes).sort()).toEqual(["a", "b", "c"]));
  it("card = wired 를 그룹 멤버로 펼치고 사라진 id 무시, 한 번씩", () => expect(targetNodeIds({ kind: "card", id: "o" }, nodes, [{ id: "g1", name: "Group 1", role: "general" }]).sort()).toEqual(["a", "b", "c"]));
  it("없는 카드 = 0", () => expect(targetNodeIds({ kind: "card", id: "zz" }, nodes)).toEqual([]));
  it("pick = 지워진 id·콘솔 아닌 것 무시", () => expect(targetNodeIds({ kind: "pick", ids: ["c", "gone", "n"] }, nodes)).toEqual(["c"]));
});

const con = (key: string, p: Partial<{ agent: boolean; status: string; paused: boolean }> = {}): LConsole => ({
  key, name: key, isAgent: () => p.agent ?? true, status: () => p.status ?? "READY", isPaused: () => p.paused ?? false, tail: () => [], write: () => {}, bracketedPaste: () => false,
});

describe("전달 분류 S-1407", () => {
  it("셸 제외(기록 없음), NEEDS YOU·일시 중지는 건너뜀", () => {
    const r = sortTargets([con("a"), con("s", { agent: false }), con("n", { status: "NEEDS YOU" }), con("p", { paused: true })]);
    expect(r.send.map((c) => c.key)).toEqual(["a"]);
    expect(r.skipped.map((s) => [s.c.key, s.why])).toEqual([["n", "needs you"], ["p", "paused"]]);
  });
});

describe("요약문 S-1415", () => {
  it("스케줄 + 목표(agent)", () => {
    expect(summary(base({ stop: { goal: { mode: "agent", text: "x", agent: "claude" } } }), 1, "Claude")).toBe(
      "Every 15 min, the instruction is sent to every console on the board, until Claude judges the goal met. ≈ 4 prompts/hour across 1 console",
    );
  });
  it("스케줄 + 횟수, 콘솔 여럿", () => {
    expect(summary(base({ trigger: { kind: "schedule", everyMin: 10 }, stop: { runs: 5 } }), 3, "Claude")).toBe(
      "Every 10 min, the instruction is sent to every console on the board, for 5 runs. ≈ 18 prompts/hour across 3 consoles",
    );
  });
  it("2시간 주기는 소수 한 자리, 시간 제한", () => {
    expect(summary(base({ trigger: { kind: "schedule", everyMin: 120 }, stop: { minutes: 120 } }), 1, "Claude")).toBe(
      "Every 2 h, the instruction is sent to every console on the board, for 2 h. ≈ 0.5 prompts/hour across 1 console",
    );
  });
  it("idle + command 목표 — 시간당 추정 없음", () => {
    expect(summary(base({ trigger: { kind: "idle" }, target: { kind: "card", id: "o" }, stop: { goal: { mode: "command", text: "npm test" } } }), 2, "Claude")).toBe(
      "When an agent goes idle, the instruction is sent to the consoles of one orchestrator card, until the command passes.",
    );
  });
});

describe("템플릿 S-1416", () => {
  it("7개, 이름과 트리거", () => {
    expect(TEMPLATES.map((t) => t.name)).toEqual(["Progress check", "Keep them moving", "Build rescue", "Test watchdog", "Commit checkpoint", "Review sweep", "Hourly standup"]);
    expect(TEMPLATES.map((t) => t.trigger)).toEqual([
      { kind: "schedule", everyMin: 30 }, { kind: "idle" }, { kind: "output", text: "error" }, { kind: "schedule", everyMin: 15 },
      { kind: "schedule", everyMin: 60 }, { kind: "schedule", everyMin: 30 }, { kind: "schedule", everyMin: 60 },
    ]);
    expect(TEMPLATES[0]!.instruction).toBe("Give me a one-line status: what you are working on and what is next.");
    expect(TEMPLATES.every((t) => t.instruction.length > 10)).toBe(true);
  });
});
