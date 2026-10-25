// S-861~S-865 획 계산 (순수)
export type Pt = [number, number];
/** S-865 굵기 5단계 (월드 px) */
export const WIDTHS = [2, 4, 6, 9, 14] as const;
/** S-863 획 하나의 점 수 상한 */
export const MAX_POINTS = 10000;
export const r1 = (n: number): number => Math.round(n * 10) / 10;

/** 점 하나를 더한다: 첫 점이거나 직전 저장 점과 2/zoom(월드) 이상 떨어졌고 상한 미만일 때만, 소수 1자리로. 더했으면 true */
export function addPoint(pts: Pt[], p: Pt, zoom: number): boolean {
  if (pts.length >= MAX_POINTS) return false;
  const last = pts[pts.length - 1];
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 2 / zoom - 1e-9) return false;
  pts.push([r1(p[0]), r1(p[1])]);
  return true;
}

export type StrokeBox = { x: number; y: number; w: number; h: number; points: Pt[] };
/** 월드 점들 → 노드 상자(점 경계 + 굵기/2 여백, 점 하나여도 굵기×굵기)와 상자 왼쪽 위 기준 상대 좌표 */
export function toBox(pts: Pt[], width: number): StrokeBox {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const min = [Math.min(...xs), Math.min(...ys)], max = [Math.max(...xs), Math.max(...ys)];
  const h2 = width / 2, ox = min[0]! - h2, oy = min[1]! - h2;
  return { x: r1(ox), y: r1(oy), w: r1(max[0]! - min[0]! + width), h: r1(max[1]! - min[1]! + width), points: pts.map((p) => [r1(p[0] - ox), r1(p[1] - oy)] as Pt) };
}

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
/** S-864 상대 좌표 p 가 획에서 width/2 + extra 이내인가 */
export function hitStroke(points: Pt[], width: number, p: { x: number; y: number }, extra: number): boolean {
  const lim = width / 2 + extra + 1e-9;
  if (points.length === 1) return Math.hypot(p.x - points[0]![0], p.y - points[0]![1]) <= lim;
  for (let i = 1; i < points.length; i++) if (segDist(p.x, p.y, points[i - 1]!, points[i]!) <= lim) return true;
  return false;
}

/** S-863 SVG path d: 점 사이 가운데를 이은 2차 곡선. 점 하나는 길이 0 선(둥근 끝이 점이 된다) */
export function pathD(points: Pt[]): string {
  const [f, ...rest] = points;
  if (!f) return "";
  if (!rest.length) return `M${f[0]} ${f[1]}L${f[0]} ${f[1]}`;
  let d = `M${f[0]} ${f[1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!, q = points[i + 1]!;
    d += `Q${p[0]} ${p[1]} ${(p[0] + q[0]) / 2} ${(p[1] + q[1]) / 2}`;
  }
  const l = points[points.length - 1]!;
  return d + `L${l[0]} ${l[1]}`;
}
