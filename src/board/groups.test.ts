// B7 S-500~S-511 그룹 순수 함수.
import { describe, expect, it } from "vitest";
import { GROUP_NAME_MAX, GROUP_PAD, dropTarget, groupBounds, groupByName, groupTitle, membersOf, nextGroupName, runningCount, type Group } from "./groups";
import type { BoardNode } from "./store";

const g = (id: string, name: string, role: Group["role"] = "general"): Group => ({ id, name, role });
const con = (id: string, x: number, y: number, w = 720, h = 440, groupId?: string): BoardNode =>
  ({ id, kind: "console", x, y, w, h, z: 1, name: id, agentId: "shell", textSize: null, yolo: false, ...(groupId ? { groupId } : {}) });

describe("S-500 nextGroupName", () => {
  it("그룹이 없으면 Group 1", () => expect(nextGroupName([])).toBe("Group 1"));
  it("Group 1 이 있으면 Group 2", () => expect(nextGroupName([g("a", "Group 1")])).toBe("Group 2"));
  it("안 쓴 가장 작은 수: Group 1 이 비면 Group 1", () => expect(nextGroupName([g("a", "Group 2"), g("b", "Group 3")])).toBe("Group 1"));
  it("사이가 비면 그 수: 1,3 -> Group 2", () => expect(nextGroupName([g("a", "Group 1"), g("b", "Group 3")])).toBe("Group 2"));
  it("바꾼 이름·빈 이름은 번호를 차지하지 않는다", () => expect(nextGroupName([g("a", "Alpha"), g("b", "")])).toBe("Group 1"));
});

describe("S-511 membersOf", () => {
  const nodes = { a: con("a", 0, 0, 10, 10, "g1"), b: con("b", 0, 0, 10, 10, "g2"), c: con("c", 0, 0, 10, 10, "g1"), n: { id: "n", kind: "box", x: 0, y: 0, w: 1, h: 1, z: 0 } as BoardNode };
  it("groupId 가 같은 노드만", () => expect(membersOf(nodes, "g1").map((n) => n.id).sort()).toEqual(["a", "c"]));
  it("없는 그룹은 빈 목록", () => expect(membersOf(nodes, "zz")).toEqual([]));
});

describe("S-502 groupBounds", () => {
  it("멤버 경계 상자에 여백을 사방으로 더한다", () => {
    const m = [con("a", 0, 0, 720, 440), con("b", 800, 100, 720, 440)];
    // 경계 상자 x 0..1520, y 0..540
    expect(groupBounds(m, GROUP_PAD)).toEqual({ x: -GROUP_PAD, y: -GROUP_PAD, w: 1520 + 2 * GROUP_PAD, h: 540 + 2 * GROUP_PAD });
  });
  it("여백 0 이면 경계 상자 그대로, 음수 좌표도 처리", () => {
    expect(groupBounds([con("a", -100, -50, 200, 100), con("b", 50, 20, 100, 100)], 0)).toEqual({ x: -100, y: -50, w: 250, h: 170 });
  });
  it("멤버가 없으면 null", () => expect(groupBounds([], GROUP_PAD)).toBeNull());
  it("여백은 양수 상수", () => expect(GROUP_PAD).toBeGreaterThan(0));
});

describe("S-506 groupTitle", () => {
  it("이름이 있으면 그 이름", () => expect(groupTitle(g("a", "Alpha", "backend"))).toBe("Alpha"));
  it("이름이 비면 역할 이름(Backend)", () => expect(groupTitle(g("a", "", "backend"))).toBe("Backend"));
  it("공백뿐인 이름도 빈 이름", () => expect(groupTitle(g("a", "   ", "reviewers"))).toBe("Reviewers"));
  it("이름 최대 24자", () => expect(GROUP_NAME_MAX).toBe(24));
});

describe("S-511·S-577 groupByName", () => {
  const gs = [g("g1", "Group 1"), g("g2", "Group 2", "backend"), g("g3", "Alpha", "reviewers")];
  const found = (text: string) => { const r = groupByName(gs, text); return r.kind === "found" ? r.group.id : r.kind; };
  it("번호: '2' -> Group 2", () => expect(found("2")).toBe("g2"));
  it("'group 1' 도 같다(대소문자 무시)", () => expect(found("GROUP 1")).toBe("g1"));
  it("이름: 'alpha' -> Alpha (대소문자 무시)", () => expect(found("alpha")).toBe("g3"));
  it("'the backend group' -> 역할이 backend 인 그룹", () => expect(found("the backend group")).toBe("g2"));
  it("'the Reviewer group' 처럼 단수도 역할로 해석", () => expect(found("the Reviewer group")).toBe("g3"));
  it("없는 이름·번호·역할은 notFound", () => {
    expect(found("9")).toBe("notFound");
    expect(found("zeta")).toBe("notFound");
    expect(found("the docs group")).toBe("notFound");
  });
  it("같은 이름이 둘이면 ambiguous", () => {
    expect(groupByName([g("a", "Dup"), g("b", "dup")], "dup")).toEqual({ kind: "ambiguous" });
  });
  it("같은 역할 그룹이 둘이면 'the <role> group' 은 ambiguous", () => {
    expect(groupByName([g("a", "X", "docs"), g("b", "Y", "docs")], "the docs group")).toEqual({ kind: "ambiguous" });
  });
  it("그룹이 없으면 notFound", () => expect(groupByName([], "1")).toEqual({ kind: "notFound" }));
});

describe("S-502 runningCount", () => {
  const m = [con("a", 0, 0), con("b", 0, 0), con("c", 0, 0)];
  it("실행 중인 멤버만 센다", () => expect(runningCount(m, (id) => id !== "b")).toBe(2));
  it("모두 멈췄으면 0", () => expect(runningCount(m, () => false)).toBe(0));
  it("멤버가 없으면 0", () => expect(runningCount([], () => true)).toBe(0));
});

describe("S-504 dropTarget", () => {
  const gs = [g("g1", "Group 1"), g("g2", "Group 2")];
  const bounds = { g1: { x: 0, y: 0, w: 1000, h: 500 }, g2: { x: 2000, y: 0, w: 400, h: 400 } };
  it("중심이 할로 안이면 그 그룹", () => {
    expect(dropTarget({ x: 500, y: 250 }, gs, bounds)).toBe("g1");
    expect(dropTarget({ x: 2200, y: 200 }, gs, bounds)).toBe("g2");
  });
  it("중심이 할로 밖이면 null (노드가 일부 걸쳐도 중심 기준)", () => {
    expect(dropTarget({ x: 1500, y: 250 }, gs, bounds)).toBeNull();
    expect(dropTarget({ x: 500, y: 501 }, gs, bounds)).toBeNull();
    expect(dropTarget({ x: -1, y: 10 }, gs, bounds)).toBeNull();
  });
  it("할로가 겹친 자리는 면적이 작은 그룹", () => {
    const b = { g1: { x: 0, y: 0, w: 1000, h: 500 }, g2: { x: 100, y: 100, w: 200, h: 200 } };
    expect(dropTarget({ x: 150, y: 150 }, gs, b)).toBe("g2");
  });
  it("그룹이 없으면 null", () => expect(dropTarget({ x: 0, y: 0 }, [], {})).toBeNull());
});
