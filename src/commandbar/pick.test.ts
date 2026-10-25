import { describe, expect, it } from "vitest";
import { isIdle, pickTargets, restNote, stopText, type Cand } from "./pick";

const c = (name: string, status = "RUNNING", agent = true): Cand => ({ id: name, name, status, agent });
const otto = c("Otto"), dax = c("Dax"), bex = c("Bex"), sh = c("Sh", "IDLE", false);

describe("S-609 한가한 판정", () => {
  it("READY·RUNNING·IDLE 만 한가하다", () => {
    for (const s of ["READY", "RUNNING", "IDLE"]) expect(isIdle(s)).toBe(true);
    for (const s of ["WORKING", "NEEDS YOU", "PAUSED", "STARTING", "DONE", "ERROR"]) expect(isIdle(s)).toBe(false);
  });
});

describe("S-609 보낼 곳 정하기", () => {
  it("① 이름 하나면 그 콘솔에(바쁜 상태여도)", () => {
    const busy = c("Otto", "WORKING");
    expect(pickTargets({ named: [busy], all: [busy, dax] })).toEqual({ to: [busy], rest: 0 });
  });
  it("② 이름이 여럿이면 한가한 하나에게만, 나머지 수를 알린다", () => {
    const w = c("Otto", "WORKING");
    expect(pickTargets({ named: [w, dax, bex], all: [w, dax, bex] })).toEqual({ to: [dax], rest: 2 });
  });
  it("② 모두 바쁘면 첫 번째에게(대기열이 알아서 기다린다)", () => {
    const a = c("Otto", "WORKING"), b = c("Dax", "NEEDS YOU");
    expect(pickTargets({ named: [a, b], all: [a, b] }).to).toEqual([a]);
  });
  it("② 이름 여럿 중 셸은 빠진다", () => {
    expect(pickTargets({ named: [sh, otto], all: [sh, otto] })).toEqual({ to: [otto], rest: 0 });
  });
  it("③ 이름이 없고 에이전트가 둘 이상이면 보내지 않는다", () => {
    expect(pickTargets({ named: [], all: [otto, dax] })).toEqual({ to: [], rest: 0, stop: "ambiguous" });
  });
  it("④ 에이전트가 하나뿐이면 그에게(셸은 세지 않는다)", () => {
    expect(pickTargets({ named: [], all: [otto, sh] })).toEqual({ to: [otto], rest: 0 });
  });
  it("⑤ broadcast 는 모든 에이전트에게(셸 제외)", () => {
    expect(pickTargets({ named: [], all: [otto, dax, sh], broadcast: true })).toEqual({ to: [otto, dax], rest: 0 });
  });
  it("S-604 대상이 셸뿐이면 보내지 않는다", () => {
    expect(pickTargets({ named: [sh], all: [sh, otto] })).toEqual({ to: [], rest: 0, stop: "shellOnly" });
    expect(pickTargets({ named: [], all: [sh] })).toEqual({ to: [], rest: 0, stop: "shellOnly" });
  });
  it("에이전트도 셸도 없으면 noAgent", () => {
    expect(pickTargets({ named: [], all: [] }).stop).toBe("noAgent");
    expect(pickTargets({ named: [], all: [], broadcast: true }).stop).toBe("noAgent");
  });
});

describe("문구", () => {
  it("나머지 N개 문구", () => {
    expect(restNote(1)).toBe("1 other left to rest");
    expect(restNote(2)).toBe("2 others left to rest");
  });
  it("멈춤 안내에 누구에게 줄지 앞에 말하라고 한다", () => {
    expect(stopText("ambiguous")).toMatch(/say who it is for first/i);
    expect(stopText("shellOnly")).toMatch(/shell/i);
    expect(stopText("noAgent")).toMatch(/no agent/i);
  });
});
