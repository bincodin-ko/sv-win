// S-881·S-890: 이미지 노드 크기. 긴 변 460, 비율 유지. 순수 함수
export const IMAGE_LONG_SIDE = 460;
export type Box = { x: number; y: number; w: number; h: number };

/** 원본 크기(nw,nh) → 긴 변 460 인 노드 크기. 크기를 모르면(0) 4:3 */
export function fitLongSide(nw: number, nh: number): { w: number; h: number } {
  if (!(nw > 0 && nh > 0)) return { w: IMAGE_LONG_SIDE, h: (IMAGE_LONG_SIDE * 3) / 4 };
  const m = Math.max(nw, nh);
  return { w: (nw * IMAGE_LONG_SIDE) / m, h: (nh * IMAGE_LONG_SIDE) / m };
}

/** 비율 고정 크기 조절: 핸들(n·ne·e…)을 (dx,dy) 만큼 끌었을 때의 새 사각형. 최소 크기 아래로 안 줄고 비율은 s0 그대로 */
export function ratioResize(s0: Box, handle: string, dx: number, dy: number, min: { w: number; h: number }): Box {
  const r = s0.w / s0.h;
  const vertical = handle === "n" || handle === "s"; // 위·아래 변만 끌면 높이가 기준, 나머지는 너비가 기준
  let w = vertical ? (s0.h + (handle === "n" ? -dy : dy)) * r : s0.w + (handle.includes("w") ? -dx : dx);
  w = Math.max(w, min.w, min.h * r);
  const h = w / r;
  return { x: handle.includes("w") ? s0.x + s0.w - w : s0.x, y: handle.includes("n") ? s0.y + s0.h - h : s0.y, w, h };
}
