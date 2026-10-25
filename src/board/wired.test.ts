import { describe, expect, it } from "vitest";
import type { Group } from "./groups";
import { pruneWired, toggleWired, wiredTargets } from "./wired";
import type { BoardNode } from "./store";

// D1 S-1220~S-1222: 기대값은 명세 문장에서만
const con = (id: string, groupId?: string): BoardNode => ({ id, kind: "console", x: 0, y: 0, w: 720, h: 440, z: 1, ...(groupId ? { groupId } : {}) });
const card = (wired?: string[]): BoardNode => ({ id: "o1", kind: "orchestrator", x: 0, y: 0, w: 300, h: 200, z: 1, ...(wired ? { wired } : {}) });
const G = (id: string): Group => ({ id, name: id, role: "general" });
const map = (...ns: BoardNode[]) => Object.fromEntries(ns.map((n) => [n.id, n]));

describe("S-1221 wiredTargets", () => {
  it("콘솔 id 는 consoles, 그룹 id 는 groups 로 나뉘고 연결한 순서를 지킨다", () => {
    const nodes = map(con("c1"), con("c2"), con("c3", "g1"), con("c4", "g1"));
    const t = wiredTargets(nodes, [G("g1")], card(["c2", "g1", "c1"]));
    expect(t.groups).toEqual(["g1"]);
    expect([...t.consoles].sort()).toEqual(["c1", "c2", "c3", "c4"]);
    expect(t.consoles.slice(0, 1)).toEqual(["c2"]);
  });
  it("그룹은 지금 멤버 콘솔로 펼치고, 같은 콘솔은 한 번만 센다", () => {
    const nodes = map(con("c1", "g1"), con("c2", "g1"));
    const t = wiredTargets(nodes, [G("g1")], card(["c1", "g1"]));
    expect([...t.consoles].sort()).toEqual(["c1", "c2"]);
    expect(t.consoles).toHaveLength(2);
  });
  it("사라진 콘솔·그룹 id 는 무시한다", () => {
    const nodes = map(con("c1"));
    const t = wiredTargets(nodes, [], card(["ghost", "c1", "g9"]));
    expect(t).toEqual({ consoles: ["c1"], groups: [] });
  });
  it("그룹에 나중에 콘솔이 들어와도 wired 를 안 고치고 대상에 든다", () => {
    const c = card(["g1"]);
    const before = wiredTargets(map(con("c1", "g1")), [G("g1")], c);
    const after = wiredTargets(map(con("c1", "g1"), con("c2", "g1")), [G("g1")], c);
    expect(before.consoles).toEqual(["c1"]);
    expect([...after.consoles].sort()).toEqual(["c1", "c2"]);
  });
  it("wired 가 없는 카드는 빈 대상", () => {
    expect(wiredTargets(map(con("c1")), [], card())).toEqual({ consoles: [], groups: [] });
  });
});

describe("S-1226 toggleWired", () => {
  it("없으면 끝에 붙이고 있으면 뺀다. 입력 배열은 안 바꾼다", () => {
    const a = ["c1"];
    expect(toggleWired(a, "c2")).toEqual(["c1", "c2"]);
    expect(a).toEqual(["c1"]);
    expect(toggleWired(["c1", "c2"], "c1")).toEqual(["c2"]);
    expect(toggleWired(undefined, "c1")).toEqual(["c1"]);
  });
});

describe("S-1222 pruneWired", () => {
  it("지워진 id 만 빼고 순서를 지킨다", () => {
    expect(pruneWired(["c1", "g1", "c2"], ["g1", "zz"])).toEqual(["c1", "c2"]);
    expect(pruneWired(undefined, ["c1"])).toEqual([]);
  });
});
