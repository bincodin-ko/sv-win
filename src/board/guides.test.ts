import { describe, expect, it } from "vitest";
import { computeGuides, TOL } from "./guides";

const r = (x: number, y: number, w = 100, h = 100) => ({ x, y, w, h });
type Segs = ReturnType<typeof computeGuides>;
const align = (s: Segs) => s.filter((g) => g.kind === "align");
const gap = (s: Segs) => s.filter((g) => g.kind === "gap");

describe("S-025 정렬 가이드", () => {
  it("허용 오차는 4단위", () => {
    expect(TOL).toBe(4);
  });
  it("왼쪽 가장자리가 맞으면 세로선이 이웃의 왼쪽 x 에 그려지고 두 사각형을 잇는다", () => {
    const g = align(computeGuides(r(100, 300), [r(102, 0, 60)]));
    expect(g.length).toBe(1);
    expect(g[0]).toMatchObject({ x1: 102, x2: 102 });
    expect(Math.min(g[0]!.y1, g[0]!.y2)).toBe(0);
    expect(Math.max(g[0]!.y1, g[0]!.y2)).toBe(400);
  });
  it("가운데 x 가 같으면 선", () => {
    const g = align(computeGuides(r(50, 300, 100), [r(0, 0, 200)])); // 중심 100 = 100
    expect(g.length).toBe(1);
    expect(g[0]).toMatchObject({ x1: 100, x2: 100 });
  });
  it("오른쪽 가장자리도", () => {
    const g = align(computeGuides(r(0, 300, 150), [r(50, 0, 98)])); // 오른쪽 150 vs 148
    expect(g.length).toBe(1);
    expect(g[0]).toMatchObject({ x1: 148, x2: 148 });
  });
  it("가로 방향(위쪽 가장자리)도 마찬가지", () => {
    const g = align(computeGuides(r(300, 98), [r(0, 100, 100, 60)]));
    expect(g.length).toBe(1);
    expect(g[0]).toMatchObject({ y1: 100, y2: 100 });
  });
  it("오차 4 까지는 선, 5 부터는 없음", () => {
    expect(align(computeGuides(r(4, 300), [r(0, 0, 60)])).length).toBe(1);
    expect(align(computeGuides(r(5, 300), [r(0, 0, 60)])).length).toBe(0);
  });
  it("달라붙지 않는다: 움직이는 사각형을 바꾸지 않는다", () => {
    const m = Object.freeze(r(101, 300));
    expect(() => computeGuides(m, [r(100, 0)])).not.toThrow();
    expect(m).toEqual(r(101, 300));
  });
  it("이웃이 없으면 빈 배열", () => {
    expect(computeGuides(r(0, 0), [])).toEqual([]);
  });
});

describe("S-025 간격 가이드", () => {
  // A(0..100) 빈틈 B(300..400): 가운데 100짜리를 150 에 두면 양쪽 50 으로 같다
  const A = r(0, 0), B = r(300, 0);
  it("양쪽 이웃과의 간격이 같으면 간격 선 2개", () => {
    const g = gap(computeGuides(r(150, 0), [A, B]));
    expect(g.length).toBe(2);
    expect(Math.abs(g[0]!.x2 - g[0]!.x1)).toBe(50);
    expect(Math.abs(g[1]!.x2 - g[1]!.x1)).toBe(50);
  });
  it("오차 안(두 간격 차 4)이면 보이고 밖(10)이면 안 보인다", () => {
    expect(gap(computeGuides(r(152, 0), [A, B])).length).toBe(2);
    expect(gap(computeGuides(r(160, 0), [A, B])).length).toBe(0);
  });
  it("이웃 둘 사이 간격과 같은 간격으로 옆에 놓아도 보인다 (A _ B _ M)", () => {
    const g = gap(computeGuides(r(400, 0), [r(0, 0), r(200, 0)])); // A-B 100, B-M 100
    expect(g.length).toBe(2);
  });
  it("세로 방향도 같다", () => {
    const g = gap(computeGuides(r(0, 150), [r(0, 0), r(0, 300)]));
    expect(g.length).toBe(2);
    expect(Math.abs(g[0]!.y2 - g[0]!.y1)).toBe(50);
  });
  it("같은 줄이 아닌(안 겹치는) 노드는 간격 계산에 안 넣는다", () => {
    expect(gap(computeGuides(r(150, 0), [A, r(300, 500)])).length).toBe(0);
  });
});
