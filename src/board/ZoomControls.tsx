import { useT } from "../i18n";
import { useBoardStore } from "./BoardScope";
import { zoomAt, zoomStep } from "./viewport";

const btn: React.CSSProperties = { background: "none", border: 0, color: "inherit", font: "inherit", padding: "4px 8px", cursor: "pointer" };

// 우하단 − / 퍼센트 / +. 퍼센트를 누르면 100%(화면 가운데 기준)
export default function ZoomControls() {
  const t = useT();
  const useBoard = useBoardStore();
  const v = useBoard((s) => s.viewport);
  const set = useBoard((s) => s.setViewport);
  return (
    <div
      style={{ position: "absolute", right: 12, bottom: 12, display: "flex", alignItems: "center", background: "var(--surface)", color: "var(--fg-2)", border: "1px solid var(--bd)", borderRadius: 8, fontSize: 12 }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button data-testid="zoom-out" title={t("Zoom out")} aria-label={t("Zoom out")} style={btn} onClick={() => set(zoomStep(v, -1))}>−</button>
      <button data-testid="zoom-pct" title={t("Reset to 100%")} style={{ ...btn, minWidth: 44 }} onClick={() => set(zoomAt(v, { x: 0, y: 0 }, 1 / v.zoom))}>
        {Math.round(v.zoom * 100)}%
      </button>
      <button data-testid="zoom-in" title={t("Zoom in")} aria-label={t("Zoom in")} style={btn} onClick={() => set(zoomStep(v, 1))}>+</button>
    </div>
  );
}
