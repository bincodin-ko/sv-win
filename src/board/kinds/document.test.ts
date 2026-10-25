import { describe, expect, it } from "vitest";
import "./document";
import { getKind } from "./registry";

// S-1993: Document 카드 — 기본 460×520, 크기 조절, 지우개 대상, 필드 title·md·agent·date·incomplete
describe("document 카드 종류", () => {
  it("기본값", () => {
    const k = getKind("document")!;
    expect(k).toBeDefined();
    expect(k.defaultSize).toEqual({ w: 460, h: 520 });
    expect(k.resizable).toBe(true);
    expect(k.eraserTarget).toBe(true);
    expect(k.bodyDrag).toBe(false);
  });
  it("create 는 필드를 그대로 담는다(그 순간의 복사본)", () => {
    const f = { title: "Repo Architecture", md: "# A", agent: "claude", date: "Oct 24, 2026", incomplete: true };
    expect(getKind("document")!.create!(f)).toMatchObject(f);
  });
});
