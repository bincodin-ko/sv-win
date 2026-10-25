// 보드 좌표 계산(순수 함수). view = 화면 가운데에서 world 원점까지의 이동(x,y)과 배율(zoom).
// 화면점(가운데 기준) = world * zoom + (x, y)
export type View = { x: number; y: number; zoom: number };
export type Size = { w: number; h: number };
export type Bounds = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;
export const BOARD_HALF = 12000;
export const ZOOM_STEP = 1.2;
export const FIT_MARGIN = 48;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const clampZoom = (z: number) => clamp(z, MIN_ZOOM, MAX_ZOOM);
export const clampCoord = (v: number) => clamp(v, -BOARD_HALF, BOARD_HALF);
export const screenToWorld = (v: View, p: Pt): Pt => ({ x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom });
export const worldToScreen = (v: View, p: Pt): Pt => ({ x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y });
export const panBy = (v: View, dx: number, dy: number): View => ({ ...v, x: v.x + dx, y: v.y + dy });

// 포인터(화면 가운데 기준) 아래 world 점을 고정한 채 배율을 factor 배로(범위 고정)
export function zoomAt(v: View, p: Pt, factor: number): View {
  const w = screenToWorld(v, p);
  const zoom = clampZoom(v.zoom * factor);
  return { zoom, x: p.x - w.x * zoom, y: p.y - w.y * zoom };
}

export const zoomStep = (v: View, dir: 1 | -1): View => zoomAt(v, { x: 0, y: 0 }, dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);

export function fitBounds(b: Bounds | null, s: Size, margin = FIT_MARGIN): View {
  if (!b) return { x: 0, y: 0, zoom: 1 };
  const zoom = clampZoom(Math.min(s.w / (b.w + 2 * margin), s.h / (b.h + 2 * margin)));
  return { zoom, x: -(b.x + b.w / 2) * zoom, y: -(b.y + b.h / 2) * zoom };
}
