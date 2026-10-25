import { describe, expect, it } from "vitest";
import { toExcalidraw } from "./exportExcalidraw";
import { pngSize } from "./exportPng";
import type { Diagram } from "./parse";
import { buildSpec, fileName, parseSpec } from "./spec";

const D: Diagram = {
  title: "Login flow",
  nodes: [
    { id: "a", label: "Start", shape: "pill" },
    { id: "b", label: "Valid?", note: "check it", shape: "diamond" },
    { id: "c", label: "Home", shape: "box" },
    { id: "d", label: "DB", shape: "ellipse" },
  ],
  edges: [{ from: "a", to: "b" }, { from: "b", to: "c", label: "yes" }, { from: "c", to: "d" }],
};
const spec = buildSpec(D, "ink");
const f = toExcalidraw(spec);
const el = (t: string) => f.elements.filter((e) => e.type === t);

describe("S-2039 toExcalidraw", () => {
  it("파일 머리: type·version·source·appState·files", () => {
    expect(f.type).toBe("excalidraw");
    expect(f.version).toBe(2);
    expect(typeof f.source).toBe("string");
    expect(typeof f.appState.viewBackgroundColor).toBe("string");
    expect(f.files).toEqual({});
  });
  it("요소: 상자·알약=rectangle, ellipse, diamond, 화살표 3, 글자", () => {
    expect(el("rectangle").length).toBe(2);
    expect(el("ellipse").length).toBe(1);
    expect(el("diamond").length).toBe(1);
    expect(el("arrow").length).toBe(3);
    expect(el("text").map((e) => e.text)).toEqual(expect.arrayContaining(["Login flow", "Start", "Valid?", "yes"]));
  });
  it("모든 요소에 필수 필드가 있고 id 는 겹치지 않는다", () => {
    for (const e of f.elements)
      for (const k of ["id", "type", "x", "y", "width", "height", "angle", "strokeColor", "backgroundColor", "fillStyle", "strokeWidth", "strokeStyle", "roughness", "opacity", "groupIds", "seed", "version", "versionNonce", "isDeleted", "boundElements", "updated", "link", "locked"])
        expect(e, `${e.type}.${k}`).toHaveProperty(k);
    expect(new Set(f.elements.map((e) => e.id)).size).toBe(f.elements.length);
  });
  it("화살표는 시작·끝 도형에 묶이고 머리가 있다", () => {
    const ids = new Set(f.elements.map((e) => e.id));
    for (const a of el("arrow")) {
      expect(ids.has((a.startBinding as { elementId: string }).elementId)).toBe(true);
      expect(ids.has((a.endBinding as { elementId: string }).elementId)).toBe(true);
      expect(a.endArrowhead).toBe("arrow");
      expect(Array.isArray(a.points)).toBe(true);
    }
  });
  it("도형 안 글자는 containerId 로 도형에 묶인다", () => {
    const t = el("text").find((e) => e.text === "Start")!;
    const box = f.elements.find((e) => e.id === t.containerId)!;
    expect(box.type).toBe("rectangle");
    expect(box.boundElements).toEqual(expect.arrayContaining([{ type: "text", id: t.id }]));
  });
});
describe("명세·이름·PNG 크기", () => {
  it("명세는 JSON 으로 왕복한다", () => {
    expect(parseSpec(JSON.stringify(spec))).toEqual(spec);
    expect(parseSpec("{깨짐")).toBeNull();
    expect(parseSpec(null)).toBeNull();
  });
  it("저장 이름 <제목>.<확장자>, 못 쓰는 글자는 뺀다", () => {
    expect(fileName("Login flow", "png")).toBe("Login flow.png");
    expect(fileName('a/b:c*?"<>|', "excalidraw")).toBe("abc.excalidraw");
    expect(fileName("  ", "png")).toBe("diagram.png");
  });
  it("PNG = (블록 + 둘레 여백 48×2) 의 2배", () => {
    expect(pngSize(spec)).toEqual({ w: (spec.layout.width + 96) * 2, h: (spec.layout.height + 96) * 2 });
  });
});
