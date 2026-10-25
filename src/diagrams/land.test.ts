import { describe, expect, it } from "vitest";
import { makeBoardStore } from "../board/store";
import { landDiagram } from "./land";
import type { Diagram } from "./parse";
import { buildSpec } from "./spec";

const D: Diagram = {
  title: "Login",
  nodes: [
    { id: "a", label: "Start", shape: "pill", group: "X" },
    { id: "b", label: "Check", note: "is it valid", shape: "diamond", group: "X" },
    { id: "c", label: "Done", shape: "box", group: "Y" },
    { id: "d", label: "DB", shape: "ellipse", group: "Y" },
  ],
  edges: [{ from: "a", to: "b" }, { from: "b", to: "c", label: "yes" }, { from: "c", to: "d" }],
};
const run = () => {
  const store = makeBoardStore();
  const spec = buildSpec(D, "ink");
  const ids = landDiagram(store, spec, "dia-1", { x: 100, y: 100 });
  return { store, spec, ids, nodes: Object.values(store.getState().nodes) };
};

describe("S-2032 landDiagram", () => {
  it("노드·엣지·영역·제목·라벨·노트가 평범한 도형으로 놓인다", () => {
    const { nodes, spec } = run();
    const shapes = nodes.filter((n) => n.kind === "shape");
    expect(shapes.filter((n) => n.strokeStyle !== "dashed").map((n) => n.shape).sort()).toEqual(["diamond", "ellipse", "rectangle", "rectangle"]);
    expect(shapes.filter((n) => n.strokeStyle === "dashed").length).toBe(spec.layout.zones.length);
    expect(nodes.filter((n) => n.kind === "line").length).toBe(3);
    expect(nodes.filter((n) => n.kind === "line").every((n) => n.head === true)).toBe(true);
    const texts = nodes.filter((n) => n.kind === "text").map((n) => n.text);
    expect(texts).toEqual(expect.arrayContaining(["Login", "yes", "is it valid"]));
    expect(nodes.find((n) => n.text === "Start")).toMatchObject({ kind: "shape", shape: "rectangle", edges: "round" }); // 알약 = 둥근 상자
    expect(nodes.find((n) => n.text === "Done")).toMatchObject({ edges: "sharp" });
  });
  it("조각마다 diagramId, 전부 선택, 되돌리기 1단계", () => {
    const { store, ids, nodes } = run();
    expect(nodes.filter((n) => n.kind === "shape" || n.kind === "line").every((n) => n.diagramId === "dia-1")).toBe(true);
    expect([...store.getState().selection].sort()).toEqual([...ids].sort());
    expect(Object.keys(store.getState().nodes).length).toBe(ids.length);
    expect(store.getState().undo()).toBe(true);
    expect(Object.keys(store.getState().nodes)).toEqual([]);
  });
  it("영역은 조각들 뒤(z 가 더 낮다)", () => {
    const { nodes } = run();
    const zone = nodes.filter((n) => n.strokeStyle === "dashed");
    const box = nodes.find((n) => n.text === "Done")!;
    expect(zone.length).toBe(2);
    expect(zone.every((z) => z.z < box.z)).toBe(true);
  });
  it("화살표는 도형 가장자리에서 가장자리까지", () => {
    const { nodes, spec } = run();
    const a = spec.layout.nodes.find((n) => n.id === "a")!;
    const o = nodes.find((n) => n.text === "Start")!; // 노드 a 가 놓인 자리
    const line = nodes.filter((n) => n.kind === "line").sort((p, q) => p.y - q.y)[0]!; // a→b 가 가장 위
    const p0 = (line.points as { x: number; y: number }[])[0]!;
    expect(Math.abs(line.x + p0.x - (o.x + (spec.layout.edges[0]!.x1 - a.x)))).toBeLessThan(1.5);
    expect(Math.abs(line.y + p0.y - (o.y + a.h))).toBeLessThan(1.5);
  });
  it("기존 노드와 겹치면 빈자리로 밀어 놓는다", () => {
    const store = makeBoardStore();
    store.getState().addNode({ id: "big", kind: "tk", x: 0, y: 0, w: 900, h: 900, z: 1 });
    const spec = buildSpec(D, "ink");
    const ids = landDiagram(store, spec, "dia-2", { x: 100, y: 100 });
    const placed = ids.map((i) => store.getState().nodes[i]!);
    const left = Math.min(...placed.map((n) => n.x)), top = Math.min(...placed.map((n) => n.y));
    expect(left < 900 && 0 < left + spec.layout.width && top < 900 && 0 < top + spec.layout.height).toBe(false);
  });
});
