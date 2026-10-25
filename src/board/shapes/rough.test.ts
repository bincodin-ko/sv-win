import { describe, expect, it } from "vitest";
import { amplitude, linePath, outlinePoints, shapePath, strokePx, wobble, type ShapeOpts } from "./rough";

// S-822 굵기 px 2/4/6, S-827 진폭 Artist≈0.6배·Cartoonist≈1.5배, Architect 정확, 같은 seed 같은 모양
const base: ShapeOpts = { shape: "rectangle", w: 160, h: 100, edges: "sharp", roughness: 1, strokeWidth: 1, seed: 42 };
const maxDev = (a: { x: number; y: number }[], b: { x: number; y: number }[]) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i]!.x, p.y - b[i]!.y)));

describe("S-822 굵기 px", () => {
  it("1/2/3 = 2/4/6", () => expect([1, 2, 3].map(strokePx)).toEqual([2, 4, 6]));
});
describe("S-827 amplitude", () => {
  it("Architect 0, Artist 굵기×0.6, Cartoonist 굵기×1.5", () => {
    expect(amplitude(0, 2)).toBe(0);
    expect(amplitude(1, 2)).toBeCloseTo(0.6 * 4);
    expect(amplitude(2, 2)).toBeCloseTo(1.5 * 4);
    expect(amplitude(2, 3)).toBeGreaterThan(amplitude(1, 3));
  });
});
describe("S-827 shapePath", () => {
  it("같은 seed 는 같은 경로, 다른 seed 는 다른 경로", () => {
    expect(shapePath(base)).toBe(shapePath({ ...base }));
    expect(shapePath(base)).not.toBe(shapePath({ ...base, seed: 43 }));
    expect(shapePath(base).length).toBeGreaterThan(10);
  });
  it("Architect 사각형은 정확한 직선 경로", () => {
    expect(shapePath({ ...base, roughness: 0 })).toBe("M0 0H160V100H0Z");
  });
  it("Architect 둥근 사각형은 반지름 12 호", () => {
    const d = shapePath({ ...base, roughness: 0, edges: "round" });
    expect(d).toContain("A12 12 0 0 1");
    expect(d).not.toMatch(/[QL]/);
  });
  it("Architect 타원은 호 두 개, 마름모는 네 꼭짓점", () => {
    expect(shapePath({ ...base, roughness: 0, shape: "ellipse" })).toBe("M0 50A80 50 0 1 0 160 50A80 50 0 1 0 0 50Z");
    expect(shapePath({ ...base, roughness: 0, shape: "diamond" })).toBe("M80 0L160 50L80 100L0 50Z");
  });
  it("Edges 는 사각형에만: 타원·마름모는 edges 가 달라도 같다", () => {
    for (const shape of ["ellipse", "diamond"] as const) expect(shapePath({ ...base, shape, edges: "round" })).toBe(shapePath({ ...base, shape, edges: "sharp" }));
  });
});
describe("S-827 wobble 진폭", () => {
  const pts = outlinePoints("rectangle", 160, 100, "sharp");
  it("윤곽 점이 충분히 많고 모두 상자 안/가장자리", () => {
    expect(pts.length).toBeGreaterThanOrEqual(4);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(160);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });
  it("진폭 0 이면 그대로, 같은 seed 면 같은 결과, 이동량은 진폭 이하이고 진폭이 크면 더 크다", () => {
    expect(wobble(pts, 0, 1)).toEqual(pts);
    const a = amplitude(1, 2), c = amplitude(2, 2);
    expect(wobble(pts, a, 7)).toEqual(wobble(pts, a, 7));
    const da = maxDev(pts, wobble(pts, a, 7)), dc = maxDev(pts, wobble(pts, c, 7));
    expect(da).toBeGreaterThan(0);
    expect(da).toBeLessThanOrEqual(a * Math.SQRT2 + 1e-9);
    expect(dc).toBeLessThanOrEqual(c * Math.SQRT2 + 1e-9);
    expect(dc).toBeGreaterThan(da);
  });
});
describe("S-823 linePath", () => {
  const o = { p0: { x: 0, y: 0 }, p1: { x: 160, y: 0 }, bend: null, roughness: 0, strokeWidth: 1, seed: 3 };
  it("Architect 직선은 M..L, 곡선은 Q", () => {
    expect(linePath(o)).toBe("M0 0L160 0");
    expect(linePath({ ...o, bend: { x: 80, y: 40 } })).toBe("M0 0Q80 40 160 0");
  });
  it("Artist 는 같은 seed 면 같은 경로", () => {
    const r = { ...o, roughness: 1 };
    expect(linePath(r)).toBe(linePath({ ...r }));
    expect(linePath(r)).not.toBe(linePath({ ...r, seed: 4 }));
  });
});
