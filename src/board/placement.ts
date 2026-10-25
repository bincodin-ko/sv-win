// S-030 빈 자리 찾기 (순수 함수)
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const GAP = 24;

/** base(왼쪽 위)에서 시작해 (w+gap)×(h+gap) 격자로 오른쪽→아래→왼쪽→위 나선을 돌며 기존 사각형과 겹치지 않는 첫 칸의 왼쪽 위를 돌려준다 */
export function findSpot(base: { x: number; y: number }, size: { w: number; h: number }, existing: Rect[], gap = GAP): { x: number; y: number } {
  const free = (x: number, y: number) =>
    existing.every((r) => !(x < r.x + r.w + gap && r.x - gap < x + size.w && y < r.y + r.h + gap && r.y - gap < y + size.h));
  const at = (cx: number, cy: number) => ({ x: base.x + cx * (size.w + gap), y: base.y + cy * (size.h + gap) });
  let cx = 0, cy = 0;
  if (free(at(0, 0).x, at(0, 0).y)) return at(0, 0);
  const dirs: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  // 변 길이 1,1,2,2,3,3… 로 돈다. existing 가 유한하니 반드시 끝난다
  for (let leg = 0, len = 1; ; leg++) {
    const [dx, dy] = dirs[leg % 4]!;
    for (let i = 0; i < len; i++) {
      cx += dx;
      cy += dy;
      const p = at(cx, cy);
      if (free(p.x, p.y)) return p;
    }
    if (leg % 2 === 1) len++;
  }
}
