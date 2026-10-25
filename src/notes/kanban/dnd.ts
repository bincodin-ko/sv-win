// C8 포인터 끌기 계산 (순수). 카드·열 끌기 모두 이것으로 놓을 자리를 정한다.
export const DRAG_PX = 3;
/** 3px 미만은 클릭 */
export const isDragMove = (dx: number, dy: number): boolean => Math.hypot(dx, dy) >= DRAG_PX;
/** 중심 목록(오름차순) 중 pos 보다 앞선 개수 = 끼울 자리 */
export const slotAt = (centers: number[], pos: number): number => centers.filter((c) => c < pos).length;
/** x 에서 가장 가까운 열(안이면 그 열, 같은 거리면 앞). 열이 없으면 null */
export function columnAt(rects: { id: string; left: number; right: number }[], x: number): string | null {
  let best: string | null = null, bd = Infinity;
  for (const r of rects) {
    const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    if (d < bd) (bd = d, (best = r.id));
  }
  return best;
}
