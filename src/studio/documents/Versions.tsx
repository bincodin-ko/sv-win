// E6 S-1988·S-1990: 제목 아래 버전 목록(최신 먼저, Incomplete 배지) + 지금 버전의 메뉴(Remove from library)
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import type { DocMeta } from "../../lib/ipc";
import { versionLabel } from "./titles";

export default function Versions({ list, current, onPick, onRemove }: { list: DocMeta[]; current: string | null; onPick: (id: string) => void; onRemove: () => void }) {
  const t = useT();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.preventDefault(), setMenu(false));
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", away), document.removeEventListener("keydown", esc));
  }, [menu]);
  return (
    <div data-testid="doc-versions" style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      {list.map((v) => (
        <button key={v.id} data-testid="doc-version" aria-current={v.id === current} onClick={() => onPick(v.id)}
          style={{ display: "inline-flex", gap: 6, alignItems: "center", padding: "2px 8px", borderRadius: 10, border: `1px solid ${v.id === current ? "var(--accent)" : "var(--studio-line)"}`, background: v.id === current ? "var(--studio-sel)" : "transparent", color: "var(--text)", font: "11px system-ui", cursor: "pointer" }}>
          {versionLabel(v)}
          {v.status === "incomplete" && <span data-testid="doc-version-badge" style={{ padding: "0 5px", borderRadius: 6, background: "var(--warn)", color: "var(--accent-ink)", fontSize: 10 }}>{t("Incomplete")}</span>}
        </button>
      ))}
      {current && (
        <div ref={ref} style={{ position: "relative" }}>
          <button data-testid="doc-version-menu" aria-label={t("Version menu")} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}
            style={{ border: 0, background: "transparent", color: "var(--text-dim)", cursor: "pointer", font: "16px/1 system-ui" }}>⋯</button>
          {menu && (
            <div role="menu" style={{ position: "absolute", left: 0, top: "100%", zIndex: 5, minWidth: 170, padding: 4, borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 8px 24px var(--scrim-40)" }}>
              <button role="menuitem" onClick={() => (setMenu(false), onRemove())}
                style={{ width: "100%", textAlign: "left", padding: "6px 10px", border: 0, borderRadius: 6, background: "transparent", color: "var(--err-text)", font: "13px system-ui", cursor: "pointer" }}>{t("Remove from library")}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
