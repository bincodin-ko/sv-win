// D5 엔진: 스케줄(S-1402), idle(S-1404), output(S-1405), 중단(S-1406), 전달·재시도(S-1407·S-1408), keepBehind(S-1410),
// 목표 확인 시점(S-1411), 알림(S-1413), 기록 20개(S-1414), 실행 수·▶(S-1417), 시계 주입(S-1418). 진짜 대기 없음.
import { beforeEach, describe, expect, it } from "vitest";
import { createEngine, type Deps } from "./engine";
import type { LConsole } from "./deliver";
import { HISTORY_MAX, runningLoops, useLoops } from "./store";
import type { Loop } from "./types";

const W = window as unknown as { __loopNow?: number; __fakeLoops?: Record<string, unknown[]> };
let t = 0;
const MIN = 60_000;

type FC = LConsole & { st: string; lines: string[]; agent: boolean; paused: boolean };
const fc = (key: string): FC => {
  const c = { key, name: key, st: "READY", lines: [] as string[], agent: true, paused: false } as FC;
  c.isAgent = () => c.agent; c.status = () => c.st; c.isPaused = () => c.paused; c.tail = () => c.lines; c.write = () => {}; c.bracketedPaste = () => false;
  return c;
};

let sent: [string, string][];
let notes: string[];
let cons: FC[];
let vis: boolean;
let goals: (Loop["id"])[];
let verdict: "met" | "notMet" | "unknown" | "skipped";

function engine(over: Partial<Deps> = {}) {
  return createEngine({
    now: () => t,
    targets: () => cons,
    visible: () => vis,
    send: async (c, text) => { sent.push([c.key, text]); },
    notify: (title, body) => { notes.push(`${title}: ${body}`); },
    checkGoal: async (l) => { goals.push(l.id); return verdict; },
    ...over,
  });
}
const add = (p: Partial<Loop> = {}) => {
  const id = useLoops.getState().add({ name: "L", instruction: "go", trigger: { kind: "schedule", everyMin: 15 }, target: { kind: "all" }, stop: {}, keepBehind: true, wsId: "w", repo: "C:/r", ...p });
  useLoops.getState().setEnabled(id, true);
  return id;
};
const rt = (id: string) => useLoops.getState().rt[id]!;
const loop = (id: string) => useLoops.getState().loops.find((l) => l.id === id)!;
const texts = () => useLoops.getState().history.map((h) => `${h.kind}:${h.text}`);

beforeEach(() => {
  t = 1_000_000; W.__loopNow = t; W.__fakeLoops = {};
  useLoops.setState({ loops: [], history: [], rt: {} });
  sent = []; notes = []; cons = [fc("a")]; vis = true; goals = []; verdict = "notMet";
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
});

describe("스케줄 S-1402", () => {
  it("켠 시각 + 주기가 첫 실행, 이후 실행 시각 + 주기", async () => {
    const id = add();
    const e = engine();
    expect(rt(id).nextAt).toBe(t + 15 * MIN);
    t += 15 * MIN - 1000; await e.tick(); expect(sent).toEqual([]);
    t += 1000; await e.tick(); expect(sent).toEqual([["a", "go"]]);
    expect(rt(id).runs).toBe(1);
    expect(rt(id).nextAt).toBe(t + 15 * MIN);
  });
  it("잠들었다 늦게 깨면 한 번만 실행", async () => {
    const id = add();
    const e = engine();
    t += 3 * 60 * MIN; await e.tick(); await e.tick();
    expect(sent.length).toBe(1);
    expect(rt(id).nextAt).toBe(t + 15 * MIN);
  });
});

describe("전달·재시도 S-1407·S-1408", () => {
  it("아무 데도 못 가면 1분 뒤 다시, 횟수 안 셈, 건너뜀 기록", async () => {
    cons[0]!.st = "NEEDS YOU";
    const id = add();
    const e = engine();
    t += 15 * MIN; await e.tick();
    expect(sent).toEqual([]);
    expect(rt(id).runs).toBe(0);
    expect(rt(id).nextAt).toBe(t + MIN);
    expect(texts()).toContain("skip:a needs you");
    expect(notes.length).toBe(1); // S-1413 ① 기다리는 콘솔을 만나 보류
    cons[0]!.st = "READY";
    t += MIN; await e.tick();
    expect(sent.length).toBe(1);
    expect(rt(id).runs).toBe(1);
  });
  it("대상 0 = 'no consoles' 건너뜀", async () => {
    cons = [];
    add();
    const e = engine();
    t += 15 * MIN; await e.tick();
    expect(texts()).toContain("skip:no consoles");
  });
  it("일부만 가면 실행 1회로 세고 다음 실행 대기", async () => {
    cons.push(fc("b")); cons[1]!.paused = true;
    const id = add();
    const e = engine();
    t += 15 * MIN; await e.tick();
    expect(sent).toEqual([["a", "go"]]);
    expect(rt(id).runs).toBe(1);
    expect(rt(id).nextAt).toBe(t + 15 * MIN);
    expect(texts()).toContain("skip:b paused");
  });
  it("셸 콘솔에는 보내지 않는다", async () => {
    cons[0]!.agent = false;
    const id = add();
    const e = engine();
    t += 15 * MIN; await e.tick();
    expect(sent).toEqual([]);
    expect(rt(id).runs).toBe(0);
  });
});

describe("keepBehind S-1410", () => {
  it("꺼져 있고 안 보이면 예약 시각을 기록 없이 건너뛴다", async () => {
    vis = false;
    const id = add({ keepBehind: false });
    const e = engine();
    t += 15 * MIN; await e.tick();
    expect(sent).toEqual([]);
    expect(useLoops.getState().history).toEqual([]);
    expect(rt(id).nextAt).toBe(t + 15 * MIN);
  });
  it("켜져 있으면 안 보여도 보낸다", async () => {
    vis = false;
    add({ keepBehind: true });
    const e = engine();
    t += 15 * MIN; await e.tick();
    expect(sent.length).toBe(1);
  });
});

describe("idle 트리거 S-1404", () => {
  it("WORKING → READY 에서 그 콘솔에 보내고, 콘솔당 2분에 한 번", async () => {
    cons.push(fc("b"));
    const id = add({ trigger: { kind: "idle" } });
    const e = engine();
    cons[0]!.st = "WORKING"; await e.tick();
    cons[0]!.st = "READY"; t += 1000; await e.tick();
    expect(sent).toEqual([["a", "go"]]);
    expect(rt(id).runs).toBe(1);
    cons[0]!.st = "WORKING"; t += 1000; await e.tick();
    cons[0]!.st = "READY"; t += 1000; await e.tick();
    expect(sent.length).toBe(1); // 2분 안
    cons[0]!.st = "WORKING"; t += 2 * MIN; await e.tick();
    cons[0]!.st = "READY"; t += 1000; await e.tick();
    expect(sent.length).toBe(2);
  });
  it("live status 없는 콘솔(READY 로 안 감)은 발동 안 함", async () => {
    add({ trigger: { kind: "idle" } });
    const e = engine();
    cons[0]!.st = "WORKING"; await e.tick();
    cons[0]!.st = "RUNNING"; t += 1000; await e.tick();
    expect(sent).toEqual([]);
  });
});

describe("output 트리거 S-1405", () => {
  it("새 출력에만, 한가해지면 전달, 2분 제한", async () => {
    cons[0]!.lines = ["old error"];
    const id = add({ trigger: { kind: "output", text: "error" } });
    const e = engine();
    await e.tick(); // 켤 때 있던 출력은 새것이 아님
    expect(sent).toEqual([]);
    cons[0]!.st = "WORKING"; cons[0]!.lines = ["old error", "build ERROR"]; t += 1000; await e.tick();
    expect(sent).toEqual([]); // 일하는 중 → 기다림
    cons[0]!.st = "READY"; t += 1000; await e.tick();
    expect(sent).toEqual([["a", "go"]]);
    expect(rt(id).runs).toBe(1);
    cons[0]!.lines = ["old error", "build ERROR", "error again"]; t += 1000; await e.tick();
    expect(sent.length).toBe(1); // 2분 안
    cons[0]!.lines = [...cons[0]!.lines, "error 3"]; t += 2 * MIN; await e.tick();
    expect(sent.length).toBe(2);
  });
  it("NEEDS YOU 동안은 보류", async () => {
    add({ trigger: { kind: "output", text: "fail" } });
    const e = engine();
    await e.tick();
    cons[0]!.st = "NEEDS YOU"; cons[0]!.lines = ["fail"]; t += 1000; await e.tick();
    expect(sent).toEqual([]);
    cons[0]!.st = "READY"; t += 1000; await e.tick();
    expect(sent.length).toBe(1);
  });
});

describe("중단 조건 S-1406", () => {
  it("횟수 도달 → 끄고 기록·알림", async () => {
    const id = add({ stop: { runs: 2 } });
    const e = engine();
    t += 15 * MIN; await e.tick();
    t += 15 * MIN; await e.tick();
    expect(loop(id).enabled).toBe(false);
    expect(texts()).toContain("stop:run cap reached");
    expect(notes.some((n) => n.includes("run cap reached"))).toBe(true);
    t += 15 * MIN; await e.tick();
    expect(sent.length).toBe(2);
  });
  it("시간 도달 → time limit reached", async () => {
    const id = add({ stop: { minutes: 20 } });
    const e = engine();
    t += 20 * MIN; await e.tick();
    expect(loop(id).enabled).toBe(false);
    expect(texts()).toContain("stop:time limit reached");
  });
  it("목표 달성 → 예약 실행 직전 확인, goal met 이면 보내지 않고 끔", async () => {
    verdict = "met";
    const id = add({ stop: { goal: { mode: "command", text: "exit 0" } } });
    const e = engine();
    t += 15 * MIN; await e.tick();
    expect(goals).toEqual([id]);
    expect(sent).toEqual([]);
    expect(loop(id).enabled).toBe(false);
    expect(texts()).toContain("stop:goal met");
    expect(notes.some((n) => n.includes("goal met"))).toBe(true);
  });
  it("판단 못 함이면 실행 진행 (S-1411)", async () => {
    verdict = "unknown";
    const id = add({ stop: { goal: { mode: "agent", text: "done", agent: "claude" } } });
    const e = engine();
    t += 15 * MIN; await e.tick();
    expect(sent.length).toBe(1);
    expect(loop(id).enabled).toBe(true);
  });
  it("대상 콘솔이 턴을 끝냈을 때도 목표 확인 (S-1411)", async () => {
    const id = add({ stop: { goal: { mode: "command", text: "x" } } });
    const e = engine();
    cons[0]!.st = "WORKING"; await e.tick();
    cons[0]!.st = "READY"; t += 1000; await e.tick();
    expect(goals).toEqual([id]);
  });
  it("중단 칸이 없으면 계속", async () => {
    const id = add();
    const e = engine();
    for (let i = 0; i < 5; i++) { t += 15 * MIN; await e.tick(); }
    expect(loop(id).enabled).toBe(true);
    expect(rt(id).runs).toBe(5);
  });
});

describe("알림 S-1413", () => {
  it("창이 앞에 있으면 알리지 않는다", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    const real: string[] = [];
    // 엔진 notify 는 창 판정을 notify.ts 에 맡긴다 → 기본 notify 를 쓰는 경우
    const { notify } = await import("./notify");
    const N = function (this: unknown, title: string) { real.push(title); } as unknown as typeof Notification;
    Object.assign(N, { permission: "granted" });
    (window as unknown as { Notification: unknown }).Notification = N;
    document.hasFocus = () => true;
    expect(notify("x", "y")).toBe(false);
    document.hasFocus = () => false;
    expect(notify("x", "y")).toBe(true);
    expect(real).toEqual(["x"]);
  });
});

describe("기록·실행 수·▶ S-1414·S-1417", () => {
  it("기록 20개 상한, 오래된 것부터 빠짐", () => {
    for (let i = 0; i < 21; i++) useLoops.getState().log({ at: i, loop: "l", kind: "run", text: `r${i}` });
    const h = useLoops.getState().history;
    expect(HISTORY_MAX).toBe(20);
    expect(h.length).toBe(20);
    expect(h.some((x) => x.text === "r0")).toBe(false);
    expect(h.some((x) => x.text === "r20")).toBe(true);
  });
  it("runningLoops = 켜진 수, 켜기/끄기·삭제·수정", () => {
    const a = add(); const b = add();
    expect(runningLoops()).toBe(2);
    useLoops.getState().setEnabled(a, false);
    expect(runningLoops()).toBe(1);
    useLoops.getState().update(b, { name: "B2", trigger: { kind: "schedule", everyMin: 0 } });
    expect(loop(b).name).toBe("B2");
    expect((loop(b).trigger as { everyMin: number }).everyMin).toBe(1); // 수정도 보정
    useLoops.getState().remove(b);
    expect(runningLoops()).toBe(0);
    expect(useLoops.getState().loops.length).toBe(1);
  });
  it("▶ 는 트리거와 상관없이 한 번 보내고 횟수에 센다", async () => {
    const id = add({ trigger: { kind: "idle" } });
    const e = engine();
    await e.runNow(id);
    expect(sent).toEqual([["a", "go"]]);
    expect(rt(id).runs).toBe(1);
  });
});
