import { describe, expect, it } from "vitest";
import { deserialize, serialize, type WorkspaceInfo } from "./persist";
import type { BoardNode } from "./store";

// S-1141: 손대지 않은 자동 웹 타일(auto:true)은 저장에서 빠지고, 주소를 옮긴 타일(auto 해제)은 남는다
const WS: WorkspaceInfo = { id: "ws1", name: "W", repoPath: "C:/r" };
const vp = { x: 0, y: 0, zoom: 1 };
const web = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: "web", x: 0, y: 0, w: 640, h: 420, z: 1, tabs: [{ id: "t", url: "http://localhost:3000/" }], active: "t", ...extra }) as BoardNode;
const ids = (nodes: Record<string, BoardNode>) => Object.keys(deserialize(serialize({ viewport: vp, nodes }, WS)).nodes).sort();

describe("serialize 의 자동 미리보기 필터", () => {
  it("auto:true 타일은 저장에 안 들어간다", () => {
    expect(ids({ c1: { id: "c1", kind: "console", x: 0, y: 0, w: 1, h: 1, z: 1 } as BoardNode, w1: web("w1", { auto: true, wireTo: "c1" }) })).toEqual(["c1"]);
  });
  it("auto 가 없는(주소를 옮겨 해제된) 타일은 남는다", () => {
    expect(ids({ w1: web("w1", { wireTo: "c1" }), w2: web("w2") })).toEqual(["w1", "w2"]);
  });
  it("auto:true 인데 탭을 더 열었으면 남긴다", () => {
    const w = web("w1", { auto: true, tabs: [{ id: "t", url: "http://localhost:3000/" }, { id: "u", url: "" }] });
    expect(ids({ w1: w })).toEqual(["w1"]);
  });
  it("빠진 타일에 매달린 인스펙터 카드도 같이 빠진다(끊긴 선 방지)", () => {
    const card = { id: "i1", kind: "inspector", x: 0, y: 0, w: 300, h: 180, z: 2, wireTo: "w1", tab: "t" } as BoardNode;
    expect(ids({ w1: web("w1", { auto: true }), i1: card })).toEqual([]);
  });
  it("자동이 아닌 노드는 건드리지 않는다(기존 왕복)", () => {
    const n = { id: "k1", kind: "tk-card", x: 1, y: 2, w: 3, h: 4, z: 1, auto: true } as BoardNode;
    expect(ids({ k1: n })).toEqual(["k1"]);
  });
});
