import { describe, expect, it } from "vitest";
import { LINE_LEN, SHAPE_CHOICES, SHAPE_SIZE, lineDefaults, shapeDefaults } from "./shapeChoices";

describe("S-820 flyout 항목", () => {
  it("6개, 순서 Rectangle Ellipse Diamond Line Arrow Sticky(C10)", () => {
    expect(SHAPE_CHOICES.map((c) => [c.id, c.label, c.kind])).toEqual([
      ["rectangle", "Rectangle", "shape"], ["ellipse", "Ellipse", "shape"], ["diamond", "Diamond", "shape"], ["line", "Line", "line"], ["arrow", "Arrow", "line"], ["sticky", "Sticky", "sticky"],
    ]);
  });
});
describe("S-821·S-822 기본값", () => {
  it("기본 크기 도형 160×100, 선 길이 160", () => {
    expect(SHAPE_SIZE).toEqual({ w: 160, h: 100 });
    expect(LINE_LEN).toBe(160);
  });
  it("도형 기본: --fg 계열 선, Thin, solid, Artist, 투명, hachure, round, 100", () => {
    expect(shapeDefaults()).toMatchObject({ stroke: "default", strokeWidth: 1, strokeStyle: "solid", roughness: 1, fill: "transparent", fillStyle: "hachure", edges: "round", opacity: 100 });
  });
  it("선 기본은 선 계열만(Fill·Edges 없음), 곡선 없음", () => {
    const d = lineDefaults();
    expect(d).toMatchObject({ stroke: "default", strokeWidth: 1, strokeStyle: "solid", roughness: 1, opacity: 100, bend: null });
    for (const k of ["fill", "fillStyle", "edges"]) expect(d).not.toHaveProperty(k);
  });
});
