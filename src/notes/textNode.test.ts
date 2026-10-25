import { describe, expect, it } from "vitest";
import { TEXT_ALIGNS, TEXT_FONTS, TEXT_MIN_W, TEXT_SIZES, isEmptyText, makeText } from "./textNode";

describe("S-845 글꼴·크기·정렬 표", () => {
  it("글꼴 8개, 이름과 순서", () => {
    expect(TEXT_FONTS.map((f) => f.label)).toEqual(["Sketch", "Clean", "Serif", "Rounded", "Mono", "Typewriter", "Marker", "Script"]);
  });
  it("글꼴 스택 첫 글꼴(추측 표)", () => {
    const first = (l: string) => TEXT_FONTS.find((f) => f.label === l)!.stack;
    expect(first("Sketch")).toContain("Segoe Print");
    expect(first("Clean")).toContain("Segoe UI");
    expect(first("Serif")).toContain("Georgia");
    expect(first("Rounded")).toContain("Arial Rounded MT Bold");
    expect(first("Mono")).toContain("Cascadia Mono");
    expect(first("Typewriter")).toContain("Courier New");
    expect(first("Marker")).toContain("Ink Free");
    expect(first("Script")).toContain("Segoe Script");
  });
  it("크기 4개 S/M/L/XL = 16/24/36/52", () => expect(TEXT_SIZES).toEqual({ S: 16, M: 24, L: 36, XL: 52 }));
  it("정렬 3개", () => expect([...TEXT_ALIGNS]).toEqual(["left", "center", "right"]));
});
describe("S-844 빈 글 판정", () => {
  it("빈 글·공백만이면 비었다", () => {
    for (const t of ["", "   ", "\n\n", " \t\n", undefined, null]) expect(isEmptyText(t)).toBe(true);
  });
  it("글자가 하나라도 있으면 안 비었다", () => {
    for (const t of ["a", " a ", "\nx"]) expect(isEmptyText(t)).toBe(false);
  });
});
describe("S-846·S-848 새 텍스트 상자", () => {
  it("기본 필드: 글자색 default, Clean, M, 왼쪽 정렬, 불투명", () => {
    expect(makeText()).toMatchObject({ text: "", stroke: "default", font: "clean", size: "M", align: "left", opacity: 100 });
    expect(makeText("hi")).toMatchObject({ text: "hi" });
  });
  it("최소 너비가 있다", () => expect(TEXT_MIN_W).toBeGreaterThan(0));
});
