// S-823: 선 끝점 15도 스냅과 선 노드 상자 계산 (순수)
import type { P } from "./rough";
const STEP = Math.PI / 12;
export function snapAngle(anchor: P, p: P, shift: boolean): P {
  if (!shift) return p;
  const len = Math.hypot(p.x - anchor.x, p.y - anchor.y);
  const a = Math.round(Math.atan2(p.y - anchor.y, p.x - anchor.x) / STEP) * STEP;
  return { x: anchor.x + len * Math.cos(a), y: anchor.y + len * Math.sin(a) };
}
/** 2차 곡선의 가운데(t=0.5) 점. c 가 없으면 직선 가운데 */
export const curveMid = (p0: P, p1: P, c: P | null): P =>
  c ? { x: 0.25 * p0.x + 0.5 * c.x + 0.25 * p1.x, y: 0.25 * p0.y + 0.5 * c.y + 0.25 * p1.y } : { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
/** 가운데 점 m 을 지나게 하는 제어점 */
export const bendFromMid = (p0: P, p1: P, m: P): P => ({ x: 2 * m.x - (p0.x + p1.x) / 2, y: 2 * m.y - (p0.y + p1.y) / 2 });
export type LineBox = { x: number; y: number; w: number; h: number; points: [P, P]; bend: P | null };
/** 절대 좌표 두 끝점과 휨 제어점(절대, 없으면 null) → 노드 상자와 상자 안 상대 좌표. 너비·높이는 최소 1 */
export function normalizeLine(p0: P, p1: P, c: P | null): LineBox {
  const m = curveMid(p0, p1, c);
  const xs = [p0.x, p1.x, m.x], ys = [p0.y, p1.y, m.y];
  const x = Math.min(...xs), y = Math.min(...ys);
  const rel = (p: P): P => ({ x: p.x - x, y: p.y - y });
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y), points: [rel(p0), rel(p1)], bend: c ? rel(c) : null };
}
