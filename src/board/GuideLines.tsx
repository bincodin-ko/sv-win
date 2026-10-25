import type { Seg } from "./guides";
import type { View } from "./viewport";

// S-025 정렬(주황)·간격(청록) 가이드 선. 월드 좌표 → 보드 안쪽 화면 좌표(월드 원점 = 보드 가운데 + 팬)
export default function GuideLines({ segs, view, size }: { segs: Seg[]; view: View; size: { w: number; h: number } }) {
  const sx = (x: number) => size.w / 2 + view.x + x * view.zoom;
  const sy = (y: number) => size.h / 2 + view.y + y * view.zoom;
  return (
    <>
      {segs.map((g, i) => {
        const x = Math.min(sx(g.x1), sx(g.x2)), y = Math.min(sy(g.y1), sy(g.y2));
        const w = Math.abs(sx(g.x2) - sx(g.x1)), h = Math.abs(sy(g.y2) - sy(g.y1));
        return (
          <div key={i} data-testid="guide" data-kind={g.kind}
            style={{ position: "absolute", left: x, top: y, width: Math.max(w, 1), height: Math.max(h, 1), background: g.kind === "align" ? "var(--accent)" : "var(--guide-2)", pointerEvents: "none", zIndex: 50000 }} />
        );
      })}
    </>
  );
}
