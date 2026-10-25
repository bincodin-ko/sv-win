import { describe, expect, it } from "vitest";
import { bendFromMid, curveMid, normalizeLine, snapAngle } from "./snap";

describe("S-823 snapAngle", () => {
  const a = { x: 10, y: 20 };
  it("Shift 가 없으면 그대로", () => expect(snapAngle(a, { x: 110, y: 40 }, false)).toEqual({ x: 110, y: 40 }));
  it("Shift 면 다른 끝 기준 15도 단위로, 길이는 그대로", () => {
    for (const p of [{ x: 110, y: 40 }, { x: -30, y: 90 }, { x: 15, y: -200 }, { x: 11, y: 22 }]) {
      const q = snapAngle(a, p, true);
      const deg = (Math.atan2(q.y - a.y, q.x - a.x) * 180) / Math.PI;
      expect(Math.abs(deg / 15 - Math.round(deg / 15))).toBeLessThan(1e-9);
      expect(Math.hypot(q.x - a.x, q.y - a.y)).toBeCloseTo(Math.hypot(p.x - a.x, p.y - a.y), 9);
    }
  });
  it("12도는 15도로, 7도는 0도로", () => {
    const r = (deg: number) => { const t = (deg * Math.PI) / 180; return snapAngle({ x: 0, y: 0 }, { x: 100 * Math.cos(t), y: 100 * Math.sin(t) }, true); };
    expect((Math.atan2(r(12).y, r(12).x) * 180) / Math.PI).toBeCloseTo(15, 9);
    expect(r(7).y).toBeCloseTo(0, 9);
  });
});
describe("S-823 normalizeLine", () => {
  it("끝점 경계 상자가 노드 상자, 점은 상자 안 상대 좌표", () => {
    const b = normalizeLine({ x: 100, y: 50 }, { x: 40, y: 120 }, null);
    expect([b.x, b.y, b.w, b.h]).toEqual([40, 50, 60, 70]);
    expect(b.points).toEqual([{ x: 60, y: 0 }, { x: 0, y: 70 }]);
    expect(b.bend).toBeNull();
  });
  it("수평선도 높이는 최소 1", () => {
    const b = normalizeLine({ x: 0, y: 5 }, { x: 160, y: 5 }, null);
    expect([b.x, b.y, b.w, b.h]).toEqual([0, 5, 160, 1]);
  });
  it("곡선이면 가운데 점까지 상자에 들어가고 bend 는 상대 좌표", () => {
    const p0 = { x: 0, y: 0 }, p1 = { x: 100, y: 0 }, c = { x: 50, y: -80 };
    expect(curveMid(p0, p1, c)).toEqual({ x: 50, y: -40 });
    const b = normalizeLine(p0, p1, c);
    expect(b.y).toBe(-40);
    expect(b.bend).toEqual({ x: 50, y: -40 });
    expect(b.points[0]).toEqual({ x: 0, y: 40 });
  });
  it("curveMid 직선이면 가운데, bendFromMid 는 그 점을 지나는 제어점", () => {
    expect(curveMid({ x: 0, y: 0 }, { x: 100, y: 40 }, null)).toEqual({ x: 50, y: 20 });
    const c = bendFromMid({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: -40 });
    expect(c).toEqual({ x: 50, y: -80 });
    expect(curveMid({ x: 0, y: 0 }, { x: 100, y: 0 }, c)).toEqual({ x: 50, y: -40 });
  });
});
