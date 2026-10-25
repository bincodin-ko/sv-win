// S-2271: Thread 머리의 지구본. 누르면 작은 메뉴(Automatic + 25개 언어), 고르면 speechLanguage 저장, 옆에 현재 코드(Automatic 이면 비움)
import { useEffect, useRef, useState } from "react";
import { GLOBE_CHOICES, globeCode } from "../commandbar/globe";
import { useT } from "../i18n";
import { useSettings } from "../settings/useSettings";

export default function Globe() {
  const t = useT();
  const lang = useSettings((s) => s.s.speechLanguage);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc, true);
    return () => (window.removeEventListener("pointerdown", away, true), window.removeEventListener("keydown", esc, true));
  }, [open]);
  const cur = globeCode(lang).toLowerCase() || "auto";
  return (
    <span ref={box} style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
      <button data-testid="thread-globe" aria-label={t("Speech language")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        style={{ background: "none", border: 0, color: "var(--text-dim)", cursor: "pointer", padding: 0, display: "grid" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>
      </button>
      <span data-testid="thread-lang" style={{ font: "600 10px system-ui", color: "var(--text-dim)", minWidth: 14 }}>{globeCode(lang)}</span>
      {open && (
        <div role="menu" aria-label={t("Speech language")} style={{ position: "absolute", top: "100%", right: 0, zIndex: 960, maxHeight: 260, overflowY: "auto", minWidth: 150, padding: 4, background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px var(--scrim)" }}>
          {GLOBE_CHOICES.map((c) => (
            <button key={c.code} role="menuitem" data-testid={`globe-opt-${c.code}`} onClick={() => (useSettings.getState().patch({ speechLanguage: c.code }), setOpen(false))}
              style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 12, background: c.code === cur ? "var(--panel-2)" : "none", border: 0, color: "inherit", cursor: "pointer", padding: "4px 8px", font: "12px system-ui", textAlign: "left", borderRadius: 4 }}>
              <span>{t(c.name)}</span>{c.code === cur && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
