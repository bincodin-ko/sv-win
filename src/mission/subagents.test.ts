import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../board/groups";
import type { BoardNode } from "../board/store";
import { missionModel } from "./model";
import { capSubs, fmtDur, subStateText, startSubPolling, subTargets, visibleSubs, type Sub, type SubTarget } from "./subagents";

const MIN = 60_000;
const sub = (id: string, o: Partial<Sub> = {}): Sub => ({ id, name: "mimic-planner", title: "Plan it", state: "running", startedAt: 1000, ...o });
const con = (id: string, agentId: string, resume?: unknown, name = id): BoardNode => ({ id, kind: "console", x: 0, y: 0, w: 1, h: 1, z: 1, name, agentId, ...(resume ? { resume } : {}) });

describe("S-3173 fmtDur", () => {
  it("12s · 3m 05s · 1h 02m", () => {
    expect(fmtDur(12_000)).toBe("12s");
    expect(fmtDur(185_000)).toBe("3m 05s");
    expect(fmtDur(3_720_000)).toBe("1h 02m");
    expect(fmtDur(0)).toBe("0s");
  });
});

describe("S-3174 visibleSubs · S-3173 capSubs", () => {
  const now = 100 * MIN;
  it("끝난 지 10분 넘은 것만 숨김, running 은 오래돼도 그대로(판정하지 않음)", () => {
    const l = [
      sub("run-old", { startedAt: 1 }),
      sub("done-9", { state: "done", endedAt: now - 9 * MIN - 59_000 }),
      sub("done-11", { state: "done", endedAt: now - 11 * MIN }),
      sub("fail-11", { state: "failed", endedAt: now - 11 * MIN }),
    ];
    expect(visibleSubs(l, now).map((s) => s.id).sort()).toEqual(["done-9", "run-old"]);
  });
  it("unknown(부모 세션 죽음): 글은 Unknown, 마지막 기록이 10분 넘으면 숨김", () => {
    const u = sub("u", { state: "unknown", startedAt: 1, endedAt: now - 5 * MIN });
    expect(subStateText(u, now)).toBe("Unknown");
    expect(visibleSubs([u, { ...u, id: "u2", endedAt: now - 40 * MIN }], now).map((s) => s.id)).toEqual(["u"]);
  });
  it("최근 시작이 먼저", () => {
    const l = [sub("a", { startedAt: 10 }), sub("c", { startedAt: 30 }), sub("b", { startedAt: 20 })];
    expect(visibleSubs(l, now).map((s) => s.id)).toEqual(["c", "b", "a"]);
  });
  it("5줄까지, 넘으면 남은 수", () => {
    const l = Array.from({ length: 8 }, (_, i) => sub(`s${i}`));
    expect(capSubs(l)).toMatchObject({ more: 3 });
    expect(capSubs(l).rows).toHaveLength(5);
    expect(capSubs(l.slice(0, 5))).toMatchObject({ more: 0 });
  });
});

describe("S-3172·S-3177 subTargets", () => {
  const cwdOf = (n: BoardNode) => (n.id === "nocwd" ? undefined : "C:/repo");
  it("claude + claudeSessionId + 폴더 있는 것만, codex·셸 제외", () => {
    const nodes = Object.fromEntries([
      con("c1", "claude", { claudeSessionId: "s1" }),
      con("c2", "claude"),
      con("x1", "codex", { codexSessionId: "z" }),
      con("sh", "shell", { claudeSessionId: "s9" }),
      con("nocwd", "claude", { claudeSessionId: "s3" }),
      { ...con("p", "claude", { claudeSessionId: "s4" }), profile: "work" },
    ].map((n) => [n.id, n]));
    expect(subTargets(nodes, cwdOf)).toEqual([
      { id: "c1", sessionId: "s1", cwd: "C:/repo" },
      { id: "p", sessionId: "s4", cwd: "C:/repo", profile: "work" },
    ]);
  });
  it("최대 40개", () => {
    const nodes = Object.fromEntries(Array.from({ length: 50 }, (_, i) => con(`c${i}`, "claude", { claudeSessionId: `s${i}` })).map((n) => [n.id, n]));
    expect(subTargets(nodes, cwdOf)).toHaveLength(40);
  });
});

describe("S-3172 startSubPolling (가짜 시계)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const T: SubTarget[] = [{ id: "c1", sessionId: "s1", cwd: "C:/r" }, { id: "c2", sessionId: "s2", cwd: "C:/r" }];
  it("시작 즉시 1번, 3초마다, 멈추면 더 안 부름", async () => {
    const fetchOne = vi.fn(async () => [sub("a")]);
    const onData = vi.fn();
    const stop = startSubPolling(() => T, fetchOne, onData);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchOne).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenLastCalledWith({ c1: [sub("a")], c2: [sub("a")] });
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetchOne).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchOne).toHaveBeenCalledTimes(4);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchOne).toHaveBeenCalledTimes(4);
  });
  it("앞 호출이 안 끝났으면 건너뜀", async () => {
    let release!: () => void;
    const fetchOne = vi.fn(() => new Promise<Sub[]>((r) => (release = () => r([]))));
    const stop = startSubPolling(() => [T[0]], fetchOne, () => {});
    await vi.advanceTimersByTimeAsync(9000);
    expect(fetchOne).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchOne).toHaveBeenCalledTimes(2);
    stop();
  });
  it("한 콘솔이 실패해도 나머지는 온다", async () => {
    const fetchOne = vi.fn(async (t: SubTarget) => { if (t.id === "c1") throw new Error("x"); return [sub("b")]; });
    const onData = vi.fn();
    const stop = startSubPolling(() => T, fetchOne, onData);
    await vi.advanceTimersByTimeAsync(0);
    expect(onData).toHaveBeenLastCalledWith({ c1: [], c2: [sub("b")] });
    stop();
  });
});

describe("S-3176 missionModel subsOf", () => {
  const G0: Group[] = [];
  const n = Object.fromEntries([con("a", "claude", undefined, "Alpha"), con("b", "claude", undefined, "Beta")].map((x) => [x.id, x]));
  const sess = () => ({ status: "WORKING" as const, hooked: false });
  const subsOf = (id: string): Sub[] => (id === "a" ? [sub("s1", { name: "mimic-planner", title: "Explore the loop" })] : []);
  it("검색어가 하위 이름·설명에 맞으면 그 콘솔을 남김", () => {
    expect(missionModel(n, G0, sess, 0, { query: "planner", subsOf }).consoles.map((c) => c.id)).toEqual(["a"]);
    expect(missionModel(n, G0, sess, 0, { query: "explore the", subsOf }).consoles.map((c) => c.id)).toEqual(["a"]);
    expect(missionModel(n, G0, sess, 0, { query: "planner" }).consoles).toEqual([]);
  });
  it("집계·구조는 콘솔 단위 그대로", () => {
    const base = missionModel(n, G0, sess, 0);
    const withSubs = missionModel(n, G0, sess, 0, { subsOf });
    expect(withSubs.counts).toEqual(base.counts);
    expect(withSubs.structure).toEqual(base.structure);
    expect(withSubs.consoles).toHaveLength(2);
  });
});
