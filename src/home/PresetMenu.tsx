// B14 S-649: compose bar 의 preset pill + 메뉴. 무장된 것(이름·"N agents · M teams"·해제) · 저장한 것(고르면 무장, 마우스를 올리면 제거 버튼) · New preset(라이브러리, S-321)
import { useEffect, useState, type CSSProperties } from "react";
import { useArmedPreset } from "../presets/armed";
import { PRESETS } from "../presets/defs";
import SavedItem from "../presets/SavedItem";
import { cardSummary, summaryOf } from "../presets/ui";
import { useSaved } from "../presets/useSaved";
import { useUi } from "../ui/useUi";
import { useT } from "../i18n";

const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, font: "13px system-ui" };

export default function PresetMenu({ pill }: { pill: CSSProperties }) {
  const t = useT();
  const armed = useArmedPreset((s) => s.armed);
  const saved = useSaved((s) => s.list);
  const [open, setOpen] = useState(false);
  useEffect(() => void useSaved.getState().load(), []);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("keydown", esc);
    return () => (window.removeEventListener("click", close), window.removeEventListener("keydown", esc));
  }, [open]);
  const sumOf = (name: string) => {
    const d = PRESETS.find((p) => p.name === name);
    if (d) return cardSummary(d);
    const l = saved.find((x) => x.name === name);
    return l ? summaryOf(l.nodes.filter((n) => n.kind === "console").length, 0) : "";
  };
  return (
    <span style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button data-testid="preset-pill" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} style={{ ...pill, color: armed ? "var(--text)" : "var(--text-dim)" }}>{armed ? t(armed) : t("No preset")}</button>
      {open && (
        <div data-testid="preset-menu" role="menu" style={{ position: "absolute", left: 0, bottom: "100%", marginBottom: 6, minWidth: 240, padding: 4, display: "grid", borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", zIndex: 5 }}>
          <button data-testid="preset-new" role="menuitem" onClick={() => (setOpen(false), useUi.setState({ presetsOpen: true }))} style={{ all: "unset", cursor: "pointer", padding: "6px 10px", font: "13px system-ui" }}>{t("New preset")}</button>
          {armed && (
            <div data-testid="preset-armed" style={rowStyle}>
              <b>{t(armed)}</b><span style={{ color: "var(--text-dim)", fontSize: 12, flex: 1 }}>{sumOf(armed)}</span>
              <button aria-label={t("Clear preset")} onClick={() => useArmedPreset.getState().arm(null)} style={{ all: "unset", cursor: "pointer", padding: "0 6px" }}>×</button>
            </div>
          )}
          {saved.map((l) => (
            <SavedItem key={l.name} name={l.name} hint={sumOf(l.name)} remove
              onPick={() => (setOpen(false), useArmedPreset.getState().arm(l.name))}
              onDelete={() => void useSaved.getState().remove(l.name)} />
          ))}
        </div>
      )}
    </span>
  );
}
