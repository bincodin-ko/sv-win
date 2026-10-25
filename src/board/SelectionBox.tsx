import type { Rect } from "./selection";

// S-021 선택 상자. box = 보드 안쪽 화면 좌표(px)
export default function SelectionBox({ box }: { box: Rect }) {
  return (
    <div
      data-testid="selection-box"
      style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, boxSizing: "border-box", border: "1px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)", pointerEvents: "none", zIndex: 50000 }}
    />
  );
}
