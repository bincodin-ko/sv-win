import { describe, expect, it } from "vitest";
import { layoutDiagram } from "./layout";
import type { Diagram } from "./parse";
import { COLORFUL, paints, useDiagramStyle } from "./style";

const n = (id: string, group?: string) => ({ id, label: id, shape: "box" as const, ...(group ? { group } : {}) });
const D = (nodes: Diagram["nodes"], edges: [string, string][] = []): Diagram => ({ title: "T", nodes, edges: edges.map(([from, to]) => ({ from, to })) });

describe("S-2033 스타일", () => {
  it("Ink = 윤곽선만 기본 잉크 색, 채움 없음", () => {
    const l = layoutDiagram(D([n("a"), n("b")], [["a", "b"]]));
    const p = paints(l, "ink");
    expect(p.nodes.a).toEqual({ stroke: "default", fill: "transparent" });
    expect(p.nodes.b).toEqual({ stroke: "default", fill: "transparent" });
  });
  it("Colorful 은 층마다 색 이름을 돌려 쓴다(윤곽·채움 같은 이름)", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const l = layoutDiagram(D(ids.map((i) => n(i)), ids.slice(1).map((i, k): [string, string] => [ids[k]!, i])));
    const p = paints(l, "colorful");
    expect(ids.map((i) => p.nodes[i]!.stroke)).toEqual([...COLORFUL, COLORFUL[0]]);
    expect(p.nodes.b!.fill).toBe(p.nodes.b!.stroke);
  });
  it("Colorful 은 그룹이 있으면 그룹마다 같은 색, 영역도 그 색", () => {
    const l = layoutDiagram(D([n("a", "X"), n("b", "X"), n("c", "Y"), n("d", "Y")], [["a", "b"], ["b", "c"], ["c", "d"]]));
    const p = paints(l, "colorful");
    expect(p.nodes.a!.stroke).toBe(p.nodes.b!.stroke);
    expect(p.nodes.a!.stroke).not.toBe(p.nodes.c!.stroke);
    expect(p.zones.X!.stroke).toBe(p.nodes.a!.stroke);
  });
  it("색은 잉크 팔레트 이름만 쓴다", () => {
    expect(COLORFUL).toEqual(["red", "orange", "yellow", "green", "blue", "violet"]);
  });
  it("S-2022 스타일은 앱을 켤 때마다 Ink (메모리 상태, 저장 안 함)", () => {
    expect(useDiagramStyle.getState().style).toBe("ink");
  });
});
