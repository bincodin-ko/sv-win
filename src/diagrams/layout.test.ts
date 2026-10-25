import { describe, expect, it } from "vitest";
import { layoutDiagram, type Layout } from "./layout";
import type { Diagram, DiagramNode } from "./parse";

const N = (id: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, label: id, shape: "box", ...extra });
const D = (nodes: DiagramNode[], edges: [string, string][] = [], title = "T"): Diagram => ({ title, nodes, edges: edges.map(([from, to]) => ({ from, to })) });
const at = (l: Layout, id: string) => l.nodes.find((n) => n.id === id)!;
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("S-2031 layoutDiagram 층", () => {
  it("가장 긴 경로로 층을 정한다: a→b→c, a→c 이면 c 는 2층", () => {
    const l = layoutDiagram(D([N("a"), N("b"), N("c")], [["a", "b"], ["b", "c"], ["a", "c"]]));
    expect([at(l, "a").layer, at(l, "b").layer, at(l, "c").layer]).toEqual([0, 1, 2]);
    expect(at(l, "b").y).toBeGreaterThan(at(l, "a").y + at(l, "a").h);
  });
  it("층 간격 64, 같은 층 간격 48", () => {
    const l = layoutDiagram(D([N("a"), N("b"), N("c")], [["a", "b"], ["a", "c"]]));
    expect(at(l, "b").y - (at(l, "a").y + at(l, "a").h)).toBe(64);
    const [b, c] = [at(l, "b"), at(l, "c")].sort((p, q) => p.x - q.x);
    expect(c!.x - (b!.x + b!.w)).toBe(48);
  });
  it("고리(a→b→c→a)도 끝난다", () => {
    const l = layoutDiagram(D([N("a"), N("b"), N("c")], [["a", "b"], ["b", "c"], ["c", "a"]]));
    expect(l.nodes.map((n) => n.layer).sort()).toEqual([0, 1, 2]);
  });
  it("크기: box 140~220×56, pill 160×44, ellipse 160×64, diamond 170×96, 노트가 있으면 높이 +20", () => {
    const l = layoutDiagram(D([N("a", { label: "x" }), N("b", { shape: "pill" }), N("c", { shape: "ellipse" }), N("d", { shape: "diamond" }), N("e", { label: "A very long label of many words here indeed", note: "n" })]));
    expect(at(l, "a")).toMatchObject({ w: 140, h: 56 });
    expect(at(l, "e").w).toBe(220);
    expect(at(l, "e").h).toBe(76);
    expect(at(l, "b")).toMatchObject({ w: 160, h: 44 });
    expect(at(l, "c")).toMatchObject({ w: 160, h: 64 });
    expect(at(l, "d")).toMatchObject({ w: 170, h: 96 });
  });
  it("조각끼리 겹치지 않고 모두 (0,0) 이상, 블록 안에 든다", () => {
    const nodes = Array.from({ length: 14 }, (_, i) => N(`n${i}`, { shape: (["box", "ellipse", "diamond", "pill"] as const)[i % 4] }));
    const edges = nodes.slice(1).map((n, i): [string, string] => [`n${Math.floor(i / 2)}`, n.id]);
    const l = layoutDiagram(D(nodes, edges));
    for (let i = 0; i < l.nodes.length; i++) {
      const a = l.nodes[i]!;
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(l.width);
      expect(a.y + a.h).toBeLessThanOrEqual(l.height);
      for (const b of l.nodes.slice(i + 1)) expect(overlap(a, b)).toBe(false);
    }
  });
  it("제목은 맨 위 가운데", () => {
    const l = layoutDiagram(D([N("a"), N("b")], [["a", "b"]], "My title"));
    expect(l.title.text).toBe("My title");
    expect(l.title.y).toBeLessThan(Math.min(...l.nodes.map((n) => n.y)));
    expect(l.title.x + l.title.w / 2).toBeCloseTo(l.width / 2, 0);
  });
  it("화살표는 도형 가장자리에서 가장자리까지(위→아래 한 줄이면 a 아래 끝 → b 위 끝)", () => {
    const l = layoutDiagram(D([N("a"), N("b")], [["a", "b"]]));
    const e = l.edges[0]!;
    expect(e.y1).toBeCloseTo(at(l, "a").y + at(l, "a").h, 0);
    expect(e.y2).toBeCloseTo(at(l, "b").y, 0);
  });
  it("결정성: 같은 입력은 같은 결과", () => {
    const d = D([N("a"), N("b"), N("c"), N("d")], [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"]]);
    expect(layoutDiagram(d)).toEqual(layoutDiagram(d));
  });
});

describe("S-2031 영역 규칙", () => {
  const g = (id: string, group?: string) => N(id, group ? { group } : {});
  it("그룹이 1개면 영역 없음", () => {
    expect(layoutDiagram(D([g("a", "X"), g("b", "X")], [["a", "b"]])).zones).toEqual([]);
  });
  it("그룹 2개가 안 겹치면 점선 영역 2개(+24 여백)", () => {
    const l = layoutDiagram(D([g("a", "X"), g("b", "X"), g("c", "Y"), g("d", "Y")], [["a", "b"], ["b", "c"], ["c", "d"]]));
    expect(l.zones.map((z) => z.group).sort()).toEqual(["X", "Y"]);
    const x = l.zones.find((z) => z.group === "X")!;
    const a = at(l, "a");
    expect(x.x).toBeLessThanOrEqual(a.x - 24);
    expect(x.y).toBeLessThanOrEqual(a.y - 24);
  });
  it("그룹 2개가 겹치면 영역 없음(한 층에 X Y X Y 로 섞임)", () => {
    const l = layoutDiagram(D([g("a", "X"), g("b", "Y"), g("c", "X"), g("d", "Y")]));
    expect(l.nodes.length).toBe(4);
    expect(l.zones).toEqual([]);
  });
});
