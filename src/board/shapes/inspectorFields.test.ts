import { describe, expect, it } from "vitest";
import type { BoardNode } from "../store";
import { applyFields, commonValue, fieldsFor, registerInspectorKind, sectionsFor } from "./inspectorFields";

const sh = (id: string, x: Record<string, unknown> = {}): BoardNode => ({ id, kind: "shape", x: 0, y: 0, w: 160, h: 100, z: 1, fill: "transparent", stroke: "default", opacity: 100, ...x });
const ln = (id: string, x: Record<string, unknown> = {}): BoardNode => ({ id, kind: "line", x: 0, y: 0, w: 160, h: 1, z: 1, stroke: "default", opacity: 100, ...x });

describe("S-825 sectionsFor", () => {
  it("도형은 5절", () => expect(sectionsFor([sh("a")])).toEqual(["lines", "fill", "shape", "text", "order"]));
  it("선·화살표에는 Fill 절이 없다(Text 도 없음)", () => expect(sectionsFor([ln("a")])).toEqual(["lines", "shape", "order"]));
  it("선택이 없거나 인스펙터가 없는 종류가 섞이면 닫힌다", () => {
    expect(sectionsFor([])).toEqual([]);
    expect(sectionsFor([sh("a"), { ...sh("b"), kind: "console" }])).toEqual([]);
  });
  it("도형+선을 같이 고르면 공통 절만", () => expect(sectionsFor([sh("a"), ln("b")])).toEqual(["lines", "shape", "order"]));
});
describe("S-825 fieldsFor", () => {
  it("도형(투명 채움): fillStyle 없음, edges 있음", () => {
    const f = fieldsFor([sh("a")]);
    expect(f).toEqual(expect.arrayContaining(["stroke", "strokeWidth", "strokeStyle", "roughness", "fill", "edges", "opacity", "font", "size", "align"]));
    expect(f).not.toContain("fillStyle");
  });
  it("색을 고르면 fillStyle 가 나타난다", () => expect(fieldsFor([sh("a", { fill: "red" })])).toContain("fillStyle"));
  it("선: Fill·Edges 필드가 없고 Opacity 는 있다", () => {
    const f = fieldsFor([ln("a")]);
    for (const k of ["fill", "fillStyle", "edges", "font", "size", "align"]) expect(f).not.toContain(k);
    expect(f).toEqual(expect.arrayContaining(["stroke", "strokeWidth", "strokeStyle", "roughness", "opacity"]));
  });
  it("도형+선: edges·fill 은 모두 도형일 때만", () => {
    const f = fieldsFor([sh("a"), ln("b")]);
    expect(f).not.toContain("edges");
    expect(f).not.toContain("fill");
  });
});
describe("S-846 텍스트 상자(C10)", () => {
  const tx = (id: string): BoardNode => ({ id, kind: "text", x: 0, y: 0, w: 240, h: 34, z: 1, stroke: "default" });
  it("Lines(글자색)·Text·Order 절만, Lines 는 stroke 필드뿐", () => {
    registerInspectorKind("text", ["lines", "text", "order"]);
    expect(sectionsFor([tx("a")])).toEqual(["lines", "text", "order"]);
    expect(fieldsFor([tx("a")])).toEqual(["stroke", "font", "size", "align"]);
  });
});
describe("S-825 commonValue·applyFields", () => {
  it("같으면 그 값, 다르면 undefined", () => {
    expect(commonValue([sh("a", { stroke: "red" }), sh("b", { stroke: "red" })], "stroke")).toBe("red");
    expect(commonValue([sh("a", { stroke: "red" }), sh("b")], "stroke")).toBeUndefined();
  });
  it("여럿에 한꺼번에 적용하고 되돌리기 1단계(commit 1번)", () => {
    const hist: string[] = [];
    let nodes: Record<string, BoardNode> = { a: sh("a"), b: sh("b") };
    const store = {
      getState: () => ({
        nodes,
        commit: () => void hist.push(JSON.stringify(nodes)),
        updateNode: (id: string, p: Partial<BoardNode>) => { nodes = { ...nodes, [id]: { ...nodes[id]!, ...p } }; },
      }),
    };
    applyFields(store as never, ["a", "b"], { stroke: "red", strokeWidth: 3 });
    expect(nodes.a!.stroke).toBe("red");
    expect(nodes.b!.strokeWidth).toBe(3);
    expect(hist).toHaveLength(1);
  });
});
