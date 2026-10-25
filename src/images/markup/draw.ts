// S-886·S-887: Markup 요소 → 캔버스 그리기 명령. 순수 함수 (좌표는 원본 이미지 픽셀)
export type Tool = "arrow" | "rectangle" | "ellipse" | "line" | "pen" | "highlight" | "text";
export type Pt = { x: number; y: number };
export type MarkEl = { tool: Tool; color: string; width: number; pts: Pt[]; text?: string };
export type Cmd =
  | { t: "path"; pts: Pt[]; color: string; width: number; alpha: number }
  | { t: "rect"; x: number; y: number; w: number; h: number; color: string; width: number; alpha: number }
  | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number; color: string; width: number; alpha: number }
  | { t: "text"; text: string; x: number; y: number; size: number; color: string; alpha: number };

export const HIGHLIGHT_ALPHA = 0.35; // 추측(S-887)
export const HIGHLIGHT_MULT = 3;
const HEAD_ANGLE = Math.PI / 6;
/** 글자 크기 = 굵기에 비례 */
export const textSize = (width: number): number => width * 6;

/** 요소 하나의 명령들. scale = 굵기·글자 크기에 곱할 배율(큰 이미지용). 너무 작은 도형(점)은 []. */
export function elementCommands(el: MarkEl, scale = 1): Cmd[] {
  const { tool, color, pts } = el;
  const w = el.width * scale;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  if (!a || !b) return [];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  switch (tool) {
    case "text":
      return el.text ? [{ t: "text", text: el.text, x: a.x, y: a.y, size: textSize(el.width) * scale, color, alpha: 1 }] : [];
    case "pen":
      return [{ t: "path", pts, color, width: w, alpha: 1 }];
    case "highlight":
      return [{ t: "path", pts, color, width: w * HIGHLIGHT_MULT, alpha: HIGHLIGHT_ALPHA }];
    case "rectangle":
    case "ellipse": {
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), rw = Math.abs(b.x - a.x), rh = Math.abs(b.y - a.y);
      if (rw < 1 && rh < 1) return [];
      return tool === "rectangle"
        ? [{ t: "rect", x, y, w: rw, h: rh, color, width: w, alpha: 1 }]
        : [{ t: "ellipse", cx: x + rw / 2, cy: y + rh / 2, rx: rw / 2, ry: rh / 2, color, width: w, alpha: 1 }];
    }
    case "line":
    case "arrow": {
      if (len < 1) return [];
      const shaft: Cmd = { t: "path", pts: [a, b], color, width: w, alpha: 1 };
      if (tool === "line") return [shaft];
      const hl = Math.min(len * 0.4, (el.width * 3 + 12) * scale);
      const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      const wing = (th: number): Pt => ({ x: b.x - hl * (u.x * Math.cos(th) - u.y * Math.sin(th)), y: b.y - hl * (u.x * Math.sin(th) + u.y * Math.cos(th)) });
      return [shaft, { t: "path", pts: [wing(HEAD_ANGLE), b, wing(-HEAD_ANGLE)], color, width: w, alpha: 1 }];
    }
  }
}
export const allCommands = (els: MarkEl[], scale = 1): Cmd[] => els.flatMap((e) => elementCommands(e, scale));
/** Ctrl+Z: 마지막 하나를 뺀 새 목록 */
export const popLast = <T,>(els: T[]): T[] => els.slice(0, -1);
/** Clear all */
export const clearAll = <T,>(_els: T[]): T[] => [];
