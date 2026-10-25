import { describe, expect, it } from "vitest";
import { MAX_POINTS, WIDTHS, addPoint, hitStroke, pathD, toBox, type Pt } from "./stroke";

describe("S-863 점 거르기", () => {
  it("첫 점은 항상 받고 소수 1자리로 반올림한다", () => {
    const p: Pt[] = [];
    expect(addPoint(p, [10.04, 20.06], 1)).toBe(true);
    expect(p).toEqual([[10, 20.1]]);
  });
  it("직전 점과 2px 미만이면 버리고 2px 이상이면 받는다 (줌 1)", () => {
    const p: Pt[] = [[0, 0]];
    expect(addPoint(p, [1.9, 0], 1)).toBe(false);
    expect(addPoint(p, [2, 0], 1)).toBe(true);
    expect(p).toHaveLength(2);
  });
  it("간격은 2/줌 월드 px: 줌 2 면 1, 줌 0.5 면 4", () => {
    const a: Pt[] = [[0, 0]];
    expect(addPoint(a, [0.9, 0], 2)).toBe(false);
    expect(addPoint(a, [1, 0], 2)).toBe(true);
    const b: Pt[] = [[0, 0]];
    expect(addPoint(b, [3.9, 0], 0.5)).toBe(false);
    expect(addPoint(b, [4, 0], 0.5)).toBe(true);
  });
  it("상한 10,000개: 가득 차면 더 받지 않는다", () => {
    const p: Pt[] = Array.from({ length: MAX_POINTS }, (_, i) => [i * 3, 0] as Pt);
    expect(addPoint(p, [MAX_POINTS * 3 + 5, 0], 1)).toBe(false);
    expect(p).toHaveLength(MAX_POINTS);
  });
});

describe("S-861 경계 상자와 상대 좌표", () => {
  it("굵기 5개는 2,4,6,9,14", () => expect([...WIDTHS]).toEqual([2, 4, 6, 9, 14]));
  it("상자는 점들의 경계 + 굵기/2 여백, 점은 상자 왼쪽 위 기준 상대 좌표", () => {
    const b = toBox([[100, 50], [130, 80]], 4);
    expect(b).toEqual({ x: 98, y: 48, w: 34, h: 34, points: [[2, 2], [32, 32]] });
  });
  it("점 하나도 획이다: 상자는 굵기 × 굵기, 점은 가운데", () => {
    const b = toBox([[10, 10]], 14);
    expect(b).toEqual({ x: 3, y: 3, w: 14, h: 14, points: [[7, 7]] });
  });
  it("소수 1자리 점도 상대 좌표에 부동소수 잡음이 없다", () => {
    const b = toBox([[0.1, 0.2], [0.3, 0.7]], 2);
    for (const [x, y] of b.points) { expect(x).toBe(Math.round(x * 10) / 10); expect(y).toBe(Math.round(y * 10) / 10); }
  });
});

describe("S-864 클릭 판정", () => {
  const pts: Pt[] = [[0, 0], [100, 0]];
  it("획에서 굵기/2 + extra 이내면 맞고 넘으면 아니다", () => {
    expect(hitStroke(pts, 6, { x: 50, y: 7 }, 4)).toBe(true); // 3 + 4
    expect(hitStroke(pts, 6, { x: 50, y: 7.1 }, 4)).toBe(false);
  });
  it("끝점 너머는 끝점까지의 거리로 잰다", () => {
    expect(hitStroke(pts, 6, { x: 107, y: 0 }, 4)).toBe(true);
    expect(hitStroke(pts, 6, { x: 107.1, y: 0 }, 4)).toBe(false);
  });
  it("점 하나짜리 획도 판정된다", () => {
    expect(hitStroke([[5, 5]], 4, { x: 5, y: 8 }, 1)).toBe(true);
    expect(hitStroke([[5, 5]], 4, { x: 5, y: 8.1 }, 1)).toBe(false);
  });
});

describe("S-863 2차 곡선 보간", () => {
  it("M 으로 시작하고 점이 셋 이상이면 Q 를 쓴다", () => {
    const d = pathD([[0, 0], [10, 10], [20, 0]]);
    expect(d.startsWith("M0 0")).toBe(true);
    expect(d).toContain("Q");
  });
  it("점 하나는 길이 0 선(둥근 끝으로 점이 찍힘)", () => expect(pathD([[3, 4]])).toBe("M3 4L3 4"));
});
