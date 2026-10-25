// S-954: 여러 개를 놓은 지점 둘레 격자 배치 후보 (순수). 각 후보는 findSpot 의 시작점이 되어 겹침이 걸러진다
export const CELL = { w: 520, h: 400 };
export function gridBases(at: { x: number; y: number }, n: number): { x: number; y: number }[] {
  const cols = Math.ceil(Math.sqrt(n));
  return Array.from({ length: n }, (_, i) => ({ x: at.x + (i % cols) * CELL.w, y: at.y + Math.floor(i / cols) * CELL.h }));
}
