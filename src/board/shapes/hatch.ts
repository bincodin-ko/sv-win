// S-828: 채움 선 (순수). 45도 평행선 / 교차선 / 꽉 채움(선 없음)
import { strokePx } from "./rough";
export type Seg = { x1: number; y1: number; x2: number; y2: number };
export type FillStyle = "hachure" | "cross" | "solid";
/** 선 간격 = 굵기 px × 4 (추측: 굵기에 비례) */
export const hatchGap = (strokeWidth: number): number => strokePx(strokeWidth) * 4;
export function hatchLines(style: FillStyle, w: number, h: number, strokeWidth: number): Seg[] {
  if (style === "solid") return [];
  const g = hatchGap(strokeWidth), out: Seg[] = [];
  for (let k = g; k < w + h; k += g) { // x + y = k
    const x1 = Math.min(w, k), x2 = Math.max(0, k - h);
    out.push({ x1, y1: k - x1, x2, y2: k - x2 });
  }
  if (style === "cross") {
    for (let k = -h + g; k < w; k += g) { // x - y = k
      const x1 = Math.max(0, k), x2 = Math.min(w, k + h);
      out.push({ x1, y1: x1 - k, x2, y2: x2 - k });
    }
  }
  return out;
}
