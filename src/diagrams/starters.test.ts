import { describe, expect, it } from "vitest";
import { makeBoardStore } from "../board/store";
import { placeStarter, STARTERS } from "./starters";

const count = (id: Parameters<typeof placeStarter>[1]) => {
  const store = makeBoardStore();
  const ids = placeStarter(store, id, { x: 500, y: 300 });
  const nodes = ids.map((i) => store.getState().nodes[i]!);
  return { store, ids, nodes, shapes: nodes.filter((n) => n.kind === "shape"), lines: nodes.filter((n) => n.kind === "line"), texts: nodes.filter((n) => n.kind === "text") };
};

describe("S-2024 스타터", () => {
  it("4개: Flow·Steps·Decision branch·Mind map", () => {
    expect(STARTERS.map((s) => s.label)).toEqual(["Flow", "Steps", "Decision branch", "Mind map"]);
  });
  it("Flow = 상자 3 + 화살표 2", () => {
    const c = count("flow");
    expect(c.shapes.length).toBe(3);
    expect(c.lines.length).toBe(2);
    expect(c.lines.every((l) => l.head === true)).toBe(true);
  });
  it("Steps = 알약(둥근 상자) 4 + 화살표 3, 가로", () => {
    const c = count("steps");
    expect(c.shapes.length).toBe(4);
    expect(c.shapes.every((s) => s.edges === "round")).toBe(true);
    expect(new Set(c.shapes.map((s) => s.y)).size).toBe(1);
    expect(c.lines.length).toBe(3);
  });
  it("Decision branch = 마름모 1 + 상자 2 + 화살표 2(라벨 Yes·No)", () => {
    const c = count("decision");
    expect(c.shapes.filter((s) => s.shape === "diamond").length).toBe(1);
    expect(c.shapes.length).toBe(3);
    expect(c.lines.length).toBe(2);
    expect(c.texts.map((t) => t.text).sort()).toEqual(["No", "Yes"]);
  });
  it("Mind map = 가운데 타원 1 + 사방 상자 4 + 선 4", () => {
    const c = count("mindmap");
    expect(c.shapes.filter((s) => s.shape === "ellipse").length).toBe(1);
    expect(c.shapes.length).toBe(5);
    expect(c.lines.length).toBe(4);
  });
  it("눌린 곳이 가운데, diagramId 없음", () => {
    const c = count("flow");
    const l = Math.min(...c.nodes.map((n) => n.x)), r = Math.max(...c.nodes.map((n) => n.x + n.w));
    expect(Math.abs((l + r) / 2 - 500)).toBeLessThan(1.5);
    expect(c.nodes.every((n) => n.diagramId === undefined)).toBe(true);
  });
  it("놓기 1번 = 되돌리기 1단계, 놓인 것 전부 선택", () => {
    const c = count("mindmap");
    expect(c.store.getState().selection.length).toBe(c.ids.length);
    c.store.getState().undo();
    expect(Object.keys(c.store.getState().nodes)).toEqual([]);
  });
});
