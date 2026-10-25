import { describe, expect, it } from "vitest";
import { canCreate, emptyDraft, fixRanges, fromLoop, fromTemplate, loopName, outputError, toLoop, OUTPUT_ERROR } from "./form";
import { TEMPLATES } from "./templates";
import { normalize, type Loop } from "./types";

const ok = () => ({ ...emptyDraft(), instruction: "go" });
const ctx = { wsId: "ws1", repo: "C:/r", n: 3 };

describe("S-1454 검사", () => {
  it("지시가 비면 만들 수 없고, 있으면 만들 수 있다", () => {
    expect(canCreate(emptyDraft())).toBe(false);
    expect(canCreate({ ...emptyDraft(), instruction: "   " })).toBe(false);
    expect(canCreate(ok())).toBe(true);
  });
  it("output 글이 2자 미만이면 오류 문구 + 비활성", () => {
    const d = { ...ok(), kind: "output" as const, outputText: "e" };
    expect(outputError(d)).toBe(OUTPUT_ERROR);
    expect(OUTPUT_ERROR).toBe("At least two characters");
    expect(canCreate(d)).toBe(false);
    expect(outputError({ ...d, outputText: " e " })).toBe(OUTPUT_ERROR); // 앞뒤 공백은 세지 않는다
    expect(outputError({ ...d, outputText: "er" })).toBeNull();
    expect(canCreate({ ...d, outputText: "er" })).toBe(true);
    expect(outputError({ ...ok(), kind: "idle", outputText: "" })).toBeNull(); // output 이 아니면 오류 없음
  });
  it("목표를 켰는데 입력이 비면 비활성", () => {
    expect(canCreate({ ...ok(), goalOn: true, goalText: "" })).toBe(false);
    expect(canCreate({ ...ok(), goalOn: true, goalText: "npm test" })).toBe(true);
    expect(canCreate({ ...ok(), goalOn: false, goalText: "" })).toBe(true);
  });
  it("범위 밖 값은 가까운 값으로 고치고 알린다 (횟수 1~200, 시간 15~1440분, 주기 1~1440분)", () => {
    const r = fixRanges({ ...ok(), runsOn: true, runs: 500, minutesOn: true, minutes: 5, everyMin: 0 });
    expect(r.draft.runs).toBe(200);
    expect(r.draft.minutes).toBe(15);
    expect(r.draft.everyMin).toBe(1);
    expect(r.notes).toHaveLength(3);
    expect(r.notes.join(" ")).toMatch(/200/);
    const hi = fixRanges({ ...ok(), runsOn: true, runs: 0, minutesOn: true, minutes: 9999, everyMin: 5000 });
    expect([hi.draft.runs, hi.draft.minutes, hi.draft.everyMin]).toEqual([1, 1440, 1440]);
  });
  it("범위 안이면 그대로, 알림 없음. 꺼진 칸은 보정·알림하지 않는다", () => {
    const d = { ...ok(), runsOn: true, runs: 10 };
    expect(fixRanges(d)).toEqual({ draft: d, notes: [] });
    expect(fixRanges({ ...ok(), runsOn: false, runs: 999 }).notes).toEqual([]);
    expect(fixRanges({ ...ok(), kind: "idle", everyMin: 0 }).notes).toEqual([]);
  });
});

describe("S-1454 이름", () => {
  it("이름이 있으면 그것(앞뒤 공백 제거), 비면 템플릿 이름, 템플릿도 없으면 Loop N", () => {
    expect(loopName({ ...ok(), name: "  Mine " }, 3)).toBe("Mine");
    expect(loopName({ ...fromTemplate(TEMPLATES[3]!), name: "" }, 3)).toBe("Test watchdog");
    expect(loopName({ ...ok(), name: "" }, 3)).toBe("Loop 3");
  });
});

describe("S-1451·S-1453 템플릿 채우기 7개", () => {
  it.each(TEMPLATES.map((t, i) => [i, t] as const))("%i %s", (_i, t) => {
    const d = fromTemplate(t);
    expect(d.name).toBe(t.name);
    expect(d.template).toBe(t.name);
    expect(d.instruction).toBe(t.instruction);
    expect(d.kind).toBe(t.trigger.kind);
    if (t.trigger.kind === "schedule") expect(d.everyMin).toBe(t.trigger.everyMin);
    if (t.trigger.kind === "output") expect(d.outputText).toBe(t.trigger.text);
    expect(canCreate(d)).toBe(true);
  });
  it("7개", () => expect(TEMPLATES).toHaveLength(7));
  it("처음부터(emptyDraft)는 15분 스케줄·전체 콘솔·중단 칸 꺼짐·keepBehind 켜짐", () => {
    const d = emptyDraft();
    expect([d.kind, d.everyMin, d.target, d.runsOn, d.minutesOn, d.goalOn, d.keepBehind]).toEqual(["schedule", 15, { kind: "all" }, false, false, false, true]);
  });
});

describe("toLoop / fromLoop", () => {
  it("스케줄·전체·중단 없음", () => {
    const l = toLoop({ ...ok(), name: "A" }, ctx);
    expect(l).toEqual({ name: "A", instruction: "go", trigger: { kind: "schedule", everyMin: 15 }, target: { kind: "all" }, stop: {}, keepBehind: true, wsId: "ws1", repo: "C:/r" });
  });
  it("켠 중단 칸만 stop 에 들어가고 보정된다", () => {
    const l = toLoop({ ...ok(), runsOn: true, runs: 500, minutesOn: true, minutes: 30, goalOn: true, goalMode: "agent", goalText: "tests green", goalAgent: "codex" }, ctx);
    expect(l.stop).toEqual({ runs: 200, minutes: 30, goal: { mode: "agent", text: "tests green", agent: "codex" } });
    expect(toLoop({ ...ok(), goalOn: true, goalMode: "command", goalText: "npm test" }, ctx).stop).toEqual({ goal: { mode: "command", text: "npm test" } });
  });
  it("output 트리거는 앞뒤 공백을 뗀 글, pick 은 ids", () => {
    const l = toLoop({ ...ok(), kind: "output", outputText: " error ", target: { kind: "pick", ids: ["a", "b"] }, keepBehind: false }, ctx);
    expect(l.trigger).toEqual({ kind: "output", text: "error" });
    expect(l.target).toEqual({ kind: "pick", ids: ["a", "b"] });
    expect(l.keepBehind).toBe(false);
  });
  it("fromLoop 는 toLoop 의 거꾸로(수정 폼)", () => {
    const base: Loop = normalize({ id: "x", enabled: true, name: "N", instruction: "do", trigger: { kind: "idle" }, target: { kind: "card", id: "o1" }, stop: { runs: 5, goal: { mode: "command", text: "ls" } }, keepBehind: false, wsId: "ws1", repo: "C:/r" });
    const d = fromLoop(base);
    expect(d.runsOn).toBe(true);
    expect(d.minutesOn).toBe(false);
    expect(d.goalOn).toBe(true);
    const back = toLoop(d, ctx);
    expect(back).toEqual({ name: "N", instruction: "do", trigger: { kind: "idle" }, target: { kind: "card", id: "o1" }, stop: { runs: 5, goal: { mode: "command", text: "ls" } }, keepBehind: false, wsId: "ws1", repo: "C:/r" });
  });
});
