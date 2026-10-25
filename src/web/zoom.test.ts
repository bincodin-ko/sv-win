import { describe, expect, it } from "vitest";
import { ZOOMS, zoomBox } from "./zoom";

// S-1106: 50%~250% 10% 단계, CSS 확대 = iframe 너비를 줄이고 scale 적용.
describe("zoom (S-1106)", () => {
  it("50~250 을 10 단계로 21개", () => {
    expect(ZOOMS.length).toBe(21);
    expect(ZOOMS[0]).toBe(50);
    expect(ZOOMS[ZOOMS.length - 1]).toBe(250);
    expect(ZOOMS.every((z, i) => i === 0 || z - ZOOMS[i - 1]! === 10)).toBe(true);
    expect(ZOOMS).toContain(100);
  });
  it("120% 의 iframe 너비·높이 = 본문 / 1.2, scale 1.2", () => {
    const b = zoomBox(120, { w: 600, h: 300 });
    expect(b.w).toBeCloseTo(500, 6);
    expect(b.h).toBeCloseTo(250, 6);
    expect(b.scale).toBeCloseTo(1.2, 6);
  });
  it("100% 는 그대로, 50% 는 두 배 넓은 iframe 을 절반으로", () => {
    expect(zoomBox(100, { w: 600, h: 300 })).toEqual({ w: 600, h: 300, scale: 1 });
    const h = zoomBox(50, { w: 600, h: 300 });
    expect([h.w, h.h, h.scale]).toEqual([1200, 600, 0.5]);
  });
});
