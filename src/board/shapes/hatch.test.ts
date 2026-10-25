import { describe, expect, it } from "vitest";
import { hatchGap, hatchLines } from "./hatch";

// S-828: Hachure = 45도 평행선, Cross-hatch = 두 방향 교차선, Solid = 선 없음(꽉 채움). 간격은 굵기에 비례
const dirs = (L: { x1: number; y1: number; x2: number; y2: number }[]) => new Set(L.map((s) => Math.sign((s.x2 - s.x1) * (s.y2 - s.y1))));
describe("S-828 hatch", () => {
  it("간격은 굵기에 비례해 커진다", () => {
    expect(hatchGap(1)).toBeGreaterThan(0);
    expect(hatchGap(2)).toBeCloseTo(hatchGap(1) * 2);
    expect(hatchGap(3)).toBeCloseTo(hatchGap(1) * 3);
  });
  it("solid 는 선이 없다", () => expect(hatchLines("solid", 160, 100, 1)).toEqual([]));
  it("hachure 는 모두 45도, 상자 가장자리에서 가장자리로, 한 방향", () => {
    const L = hatchLines("hachure", 160, 100, 1);
    expect(L.length).toBeGreaterThan(5);
    for (const s of L) {
      expect(Math.abs(Math.abs(s.x2 - s.x1) - Math.abs(s.y2 - s.y1))).toBeLessThan(1e-9);
      for (const v of [s.x1, s.x2]) {
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(160 + 1e-9);
      }
      for (const v of [s.y1, s.y2]) {
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(100 + 1e-9);
      }
    }
    expect(dirs(L).size).toBe(1);
  });
  it("cross 는 두 방향이고 hachure 의 약 2배", () => {
    const h = hatchLines("hachure", 160, 100, 1), c = hatchLines("cross", 160, 100, 1);
    expect(dirs(c).size).toBe(2);
    expect(c.length).toBeGreaterThanOrEqual(h.length * 2 - 2);
    expect(c.length).toBeLessThanOrEqual(h.length * 2 + 2);
  });
  it("굵기가 굵으면 선 수가 줄어든다", () => {
    expect(hatchLines("hachure", 160, 100, 3).length).toBeLessThan(hatchLines("hachure", 160, 100, 1).length);
  });
});
