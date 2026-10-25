// S-860·S-865: 펜을 켜면 레일 옆에 열리는 팔레트 — COLOR 8색 원, WIDTH 5단계 점
import { useT } from "../../i18n";
import { INK_COLORS, inkVar } from "../ink-colors";
import { useInkPen } from "./pen";
import { WIDTHS } from "./stroke";

const label: React.CSSProperties = { font: "600 9px system-ui", letterSpacing: 0.8, color: "var(--mute)", margin: "2px 0 4px" };

export default function Palette() {
  const t = useT();
  const { color, width, setColor, setWidth } = useInkPen();
  return (
    <div data-testid="ink-palette" onPointerDown={(e) => e.stopPropagation()}
      style={{ position: "absolute", left: 64, top: "50%", transform: "translateY(-50%)", padding: 8, background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 12, boxShadow: "0 4px 16px var(--scrim-40)" }}>
      <div style={label}>{t("COLOR")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 20px)", gap: 6 }}>
        {INK_COLORS.map((c, i) => (
          <button key={c} data-testid={`ink-color-${i}`} data-active={color === c} aria-label={t(c)} title={t(c)} onClick={() => setColor(c)}
            style={{ width: 20, height: 20, borderRadius: 10, padding: 0, background: inkVar(c), border: "1px solid var(--bd-2)", outline: color === c ? "2px solid var(--accent)" : "none", outlineOffset: 1, cursor: "pointer" }} />
        ))}
      </div>
      <div style={{ ...label, marginTop: 10 }}>{t("WIDTH")}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {WIDTHS.map((w, i) => (
          <button key={w} data-testid={`ink-width-${i}`} data-active={width === w} aria-label={t("width {w}", { w })} title={`${w}px`} onClick={() => setWidth(w)}
            style={{ width: 22, height: 22, padding: 0, background: "transparent", border: 0, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <span style={{ width: w + 2, height: w + 2, borderRadius: "50%", background: width === w ? "var(--accent)" : "var(--fg-3)" }} />
          </button>
        ))}
      </div>
    </div>
  );
}
