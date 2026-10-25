// S-020~S-024 선택 판정 (순수 함수)
export interface Rect { x: number; y: number; w: number; h: number }

/** 두 점으로 만든 상자(왼쪽 위 + 양수 크기) */
export function normBox(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** 걸침(맞닿기만 하면 아님) */
export const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 상자에 걸친 노드. additive(Shift)면 기존 선택(base)에 더한다 */
export function boxSelect(nodes: (Rect & { id: string })[], box: Rect, base: string[], additive: boolean): string[] {
  const hits = nodes.filter((n) => intersects(n, box)).map((n) => n.id);
  return additive ? [...base, ...hits.filter((id) => !base.includes(id))] : hits;
}

/** 클릭: 그것만 / Shift 면 더하기·빼기 */
export const clickSelect = (sel: string[], id: string, shift: boolean): string[] =>
  !shift ? [id] : sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id];

/** 화살표 키 → 옮길 양(1, Shift 면 10) */
export function arrowDelta(key: string, shift: boolean): { dx: number; dy: number } | null {
  const s = shift ? 10 : 1;
  const d: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] };
  const v = d[key];
  return v ? { dx: v[0], dy: v[1] } : null;
}

/** 사각형들의 바깥 사각형 */
export function bounds(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w)), y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
