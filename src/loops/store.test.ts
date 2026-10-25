// D5 저장(S-1401): repo 경로별 정의만 저장, 불러오면 모두 꺼짐, 실행 상태·기록은 저장 안 함. 목표 확인 큐(S-1411·S-1412)
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLoops } from "./store";
import { createGoalQueue, GOAL_GAP_MS, GOAL_MAX, GOAL_TIMEOUT_S } from "./goal";
import type { Loop } from "./types";

const W = window as unknown as { __loopNow?: number; __fakeLoops?: Record<string, unknown[]> };
const def = (p: Partial<Loop> = {}) => ({ name: "L", instruction: "go", trigger: { kind: "schedule", everyMin: 15 } as const, target: { kind: "all" } as const, stop: {}, keepBehind: true, wsId: "w", repo: "C:/r", ...p });

beforeEach(() => {
  W.__loopNow = 5000; W.__fakeLoops = {};
  useLoops.setState({ loops: [], history: [], rt: {} });
});

describe("저장 왕복 S-1401", () => {
  it("repo 별로 정의만 저장하고, 불러오면 enabled:false", async () => {
    const s = useLoops.getState();
    const a = s.add(def({ name: "A" }));
    s.add(def({ name: "B", repo: "C:/other" }));
    s.setEnabled(a, true);
    s.log({ at: 1, loop: a, kind: "run", text: "x" });
    await vi.waitFor(() => expect((W.__fakeLoops!["C:/r"] as Loop[] | undefined)?.[0]?.enabled).toBe(true));
    const saved = W.__fakeLoops!["C:/r"] as Record<string, unknown>[];
    expect(saved.map((l) => l.name)).toEqual(["A"]);
    expect(Object.keys(saved[0]!).sort()).toEqual(["enabled", "id", "instruction", "keepBehind", "name", "repo", "stop", "target", "trigger", "wsId"]);
    expect((W.__fakeLoops!["C:/other"] as Loop[]).map((l) => l.name)).toEqual(["B"]);

    useLoops.setState({ loops: [], history: [], rt: {} }); // 앱을 다시 켬
    await useLoops.getState().load("C:/r");
    const l = useLoops.getState().loops;
    expect(l.map((x) => [x.name, x.enabled])).toEqual([["A", false]]);
    expect(useLoops.getState().history).toEqual([]);
    expect(useLoops.getState().rt).toEqual({});
  });
  it("두 번 불러와도 겹치지 않고, 불러올 때 범위 보정", async () => {
    W.__fakeLoops = { "C:/r": [{ ...def(), id: "x", enabled: true, trigger: { kind: "schedule", everyMin: 0 } }] };
    await useLoops.getState().load("C:/r");
    await useLoops.getState().load("C:/r");
    const l = useLoops.getState().loops;
    expect(l.length).toBe(1);
    expect(l[0]!.enabled).toBe(false);
    expect((l[0]!.trigger as { everyMin: number }).everyMin).toBe(1);
  });
});

describe("불러오기 전에 add S-1401", () => {
  it("저장돼 있던 loop 와 새 loop 가 화면과 파일에 둘 다 남는다", async () => {
    W.__fakeLoops = { "C:/r": [{ ...def({ name: "OLD" }), id: "old", enabled: false }] };
    const s = useLoops.getState();
    const p = s.load("C:/r");
    s.add(def({ name: "NEW" })); // load 가 끝나기 전
    await p;
    await vi.waitFor(() => expect((W.__fakeLoops!["C:/r"] as Loop[]).length).toBe(2));
    expect(useLoops.getState().loops.map((x) => x.name).sort()).toEqual(["NEW", "OLD"]);
    expect((W.__fakeLoops!["C:/r"] as Loop[]).map((x) => x.name).sort()).toEqual(["NEW", "OLD"]);
  });
  it("불러오지 않은 repo 에 add 해도 저장돼 있던 것을 지우지 않는다", async () => {
    W.__fakeLoops = { "C:/unloaded": [{ ...def({ name: "OLD", repo: "C:/unloaded" }), id: "old", enabled: false }] };
    useLoops.getState().add(def({ name: "NEW", repo: "C:/unloaded" }));
    await vi.waitFor(() => expect((W.__fakeLoops!["C:/unloaded"] as Loop[]).length).toBe(2));
  });
});

describe("목표 확인 큐 S-1411·S-1412", () => {
  const loop = (id: string, goal: Loop["stop"]["goal"]): Loop => ({ ...def(), id, enabled: true, stop: { goal } });
  it("command: 종료 0 = met, 1 = notMet, 제한 시간 = unknown, cwd = repo, 300초, 출력 끝 200자 기록", async () => {
    let now = 0;
    const calls: [string, string, number][] = [];
    const logs: string[] = [];
    const res = ["met", "notMet", "timeout"] as const;
    let i = 0;
    const q = createGoalQueue({
      now: () => now,
      goalRun: async (cmd, cwd, secs) => { calls.push([cmd, cwd, secs]); return { status: res[i++]!, output: "y".repeat(300) }; },
      judge: async () => "unknown",
      log: (_l, text) => logs.push(text),
    });
    const l = loop("a", { mode: "command", text: "npm test" });
    expect(await q.check(l)).toBe("met");
    now += GOAL_GAP_MS; expect(await q.check(l)).toBe("notMet");
    now += GOAL_GAP_MS; expect(await q.check(l)).toBe("unknown");
    expect(calls[0]).toEqual(["npm test", "C:/r", 300]);
    expect(GOAL_TIMEOUT_S).toBe(300);
    expect(logs[0]!.endsWith("y".repeat(200))).toBe(true);
    expect(logs[0]!.includes("y".repeat(201))).toBe(false);
  });
  it("같은 loop 는 90초 안에 두 번 확인 안 함", async () => {
    let now = 0;
    let n = 0;
    const q = createGoalQueue({ now: () => now, goalRun: async () => { n++; return { status: "notMet" }; }, judge: async () => "unknown", log: () => {} });
    const l = loop("a", { mode: "command", text: "x" });
    await q.check(l);
    now += GOAL_GAP_MS - 1;
    expect(await q.check(l)).toBe("skipped");
    expect(n).toBe(1);
    now += 1;
    await q.check(l);
    expect(n).toBe(2);
  });
  it("동시에 최대 2개", async () => {
    expect(GOAL_MAX).toBe(2);
    const open: (() => void)[] = [];
    let running = 0, peak = 0;
    const q = createGoalQueue({
      now: () => 0,
      goalRun: () => new Promise((r) => { running++; peak = Math.max(peak, running); open.push(() => { running--; r({ status: "notMet" }); }); }),
      judge: async () => "unknown",
      log: () => {},
    });
    const ps = ["a", "b", "c"].map((id) => q.check(loop(id, { mode: "command", text: "x" })));
    await vi.waitFor(() => expect(open.length).toBe(2));
    expect(q.running()).toBe(2);
    open.shift()!();
    await vi.waitFor(() => expect(open.length).toBe(2));
    open.shift()!(); open.shift()!();
    await Promise.all(ps);
    expect(peak).toBe(2);
  });
  it("agent: judge 결과, 오류는 unknown", async () => {
    const v = ["met", "boom"];
    const q = createGoalQueue({
      now: (() => { let t = 0; return () => (t += GOAL_GAP_MS); })(),
      goalRun: async () => ({ status: "met" }),
      judge: async () => { const x = v.shift(); if (x === "boom") throw new Error("logged out"); return x as "met"; },
      log: () => {},
    });
    const l = loop("a", { mode: "agent", text: "done", agent: "claude" });
    expect(await q.check(l)).toBe("met");
    expect(await q.check(l)).toBe("unknown");
  });
  it("command 실행이 실패(던짐)해도 unknown", async () => {
    const q = createGoalQueue({ now: () => 0, goalRun: async () => { throw new Error("no shell"); }, judge: async () => "met", log: () => {} });
    expect(await q.check(loop("a", { mode: "command", text: "x" }))).toBe("unknown");
  });
});
