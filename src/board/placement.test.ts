import { describe, expect, it } from "vitest";
import { findSpot, type Rect } from "./placement";

const size = { w: 720, h: 440 };
const stepX = 720 + 24;
const stepY = 440 + 24;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("S-030 빈 자리 나선 탐색", () => {
  it("비어 있으면 기준점 그대로", () => {
    expect(findSpot({ x: 10, y: 20 }, size, [])).toEqual({ x: 10, y: 20 });
  });
  it("기준점이 막히면 오른쪽 한 칸(크기+간격 24)", () => {
    const e: Rect[] = [{ x: 0, y: 0, ...size }];
    expect(findSpot({ x: 0, y: 0 }, size, e)).toEqual({ x: stepX, y: 0 });
  });
  it("나선 순서: 오른쪽 → 아래 → 왼쪽 → 위", () => {
    const base = { x: 0, y: 0 };
    const placed: Rect[] = [];
    const got: { x: number; y: number }[] = [];
    for (let i = 0; i < 9; i++) {
      const p = findSpot(base, size, placed);
      got.push(p);
      placed.push({ ...p, ...size });
    }
    const cells = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    expect(got).toEqual(cells.map(([cx, cy]) => ({ x: cx * stepX, y: cy * stepY })));
  });
  it("결과는 어떤 기존 사각형과도 겹치지 않고 간격 24 이상 띄운다", () => {
    const e: Rect[] = [{ x: 100, y: 100, w: 500, h: 300 }, { x: 700, y: 50, w: 300, h: 900 }, { x: -400, y: 0, w: 400, h: 400 }];
    const p = findSpot({ x: 120, y: 120 }, size, e);
    for (const r of e) expect(overlap({ ...p, ...size }, { x: r.x - 24, y: r.y - 24, w: r.w + 48, h: r.h + 48 })).toBe(false);
  });
  it("크기가 다르면 그 크기 기준 격자", () => {
    const small = { w: 360, h: 200 };
    expect(findSpot({ x: 0, y: 0 }, small, [{ x: 0, y: 0, ...small }])).toEqual({ x: 384, y: 0 });
  });
});
