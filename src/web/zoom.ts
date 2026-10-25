// S-1106: 페이지 확대 50~250%, 10% 단계. CSS 확대 = iframe 크기를 줄이고 scale.
export const ZOOMS: number[] = Array.from({ length: 21 }, (_, i) => 50 + i * 10);
export function zoomBox(zoom: number, size: { w: number; h: number }): { w: number; h: number; scale: number } {
  const scale = zoom / 100;
  return { w: size.w / scale, h: size.h / scale, scale };
}
