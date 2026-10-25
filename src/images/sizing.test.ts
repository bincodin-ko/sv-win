import { describe, expect, it } from "vitest";
import { fitLongSide, ratioResize } from "./sizing";

// S-881: 긴 변 460, 비율 유지. S-890: 크기 조절도 비율 고정
describe("fitLongSide", () => {
  it("가로가 길면 w=460", () => expect(fitLongSide(1000, 500)).toEqual({ w: 460, h: 230 }));
  it("세로가 길면 h=460", () => expect(fitLongSide(500, 1000)).toEqual({ w: 230, h: 460 }));
  it("작은 그림도 긴 변 460 으로", () => expect(fitLongSide(200, 100)).toEqual({ w: 460, h: 230 }));
  it("정사각형", () => expect(fitLongSide(64, 64)).toEqual({ w: 460, h: 460 }));
  it("비율이 그대로", () => { const s = fitLongSide(1920, 1080); expect(s.w / s.h).toBeCloseTo(1920 / 1080, 6); expect(s.w).toBe(460); });
  it("크기를 모르면(0) 4:3", () => expect(fitLongSide(0, 0)).toEqual({ w: 460, h: 345 }));
});

describe("ratioResize", () => {
  const s0 = { x: 100, y: 100, w: 460, h: 230 };
  const min = { w: 60, h: 60 };
  const ratio = (b: { w: number; h: number }) => b.w / b.h;
  it("se: 오른쪽으로 100 → w+100, 비율 유지, 왼쪽 위 고정", () => {
    const b = ratioResize(s0, "se", 100, 0, min);
    expect(b.w).toBe(560); expect(ratio(b)).toBeCloseTo(2, 6); expect(b.x).toBe(100); expect(b.y).toBe(100);
  });
  it("w: 왼쪽으로 50 끌면 w+50 이고 x 가 50 줄어든다", () => {
    const b = ratioResize(s0, "w", -50, 0, min);
    expect(b.w).toBe(510); expect(b.x).toBe(50); expect(ratio(b)).toBeCloseTo(2, 6);
  });
  it("n: 위로 40 끌면 h+40, w 는 비율대로, 아래 변 고정", () => {
    const b = ratioResize(s0, "n", 0, -40, min);
    expect(b.h).toBe(270); expect(b.w).toBe(540); expect(b.y + b.h).toBe(330); expect(ratio(b)).toBeCloseTo(2, 6);
  });
  it("s: 아래로 끌면 h 가 늘고 w 가 따라간다", () => {
    const b = ratioResize(s0, "s", 0, 20, min);
    expect(b.h).toBe(250); expect(b.w).toBe(500);
  });
  it("최소 크기 아래로 안 줄고 비율은 유지", () => {
    const b = ratioResize(s0, "se", -1000, 0, min);
    expect(b.w).toBeGreaterThanOrEqual(min.w); expect(b.h).toBeGreaterThanOrEqual(min.h); expect(ratio(b)).toBeCloseTo(2, 6);
    expect(b.h).toBe(60); expect(b.w).toBe(120);
  });
  it("nw: 왼쪽 위로 끌면 오른쪽 아래 모서리 고정", () => {
    const b = ratioResize(s0, "nw", -40, -10, min);
    expect(b.x + b.w).toBe(560); expect(b.y + b.h).toBe(330); expect(ratio(b)).toBeCloseTo(2, 6);
  });
});
