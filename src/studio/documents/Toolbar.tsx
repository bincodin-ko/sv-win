// E6 S-1992: 도구줄. 글이 있을 때 Flow/Pages · ↻ · Add to board · + 메뉴 · 주황 Export PDF. 만드는 중에는 "Writing with Claude · 1m" + 빨간 Stop
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";

export interface ToolbarProps {
  /** 만드는 중이면 안내 줄 문구("Writing with Claude Code · 1m") */
  writing: string | null;
  mode: "flow" | "pages";
  onMode: (m: "flow" | "pages") => void;
  /** 있으면 Pages 를 못 쓴다(툴팁 문구) */
  pagesOff: string | null;
  /** 지금 만드는 중이라 ↻ 를 누를 수 없다 */
  busy: boolean;
  hasText: boolean;
  /** Incomplete 글: Export PDF 대신 띠의 Export draft PDF 를 쓴다 */
  incomplete: boolean;
  paper: "letter" | "a4";
  onPaper: (p: "letter" | "a4") => void;
  onAgain: () => void;
  onAdd: () => void;
  onExportPdf: () => void;
  onExportMd: () => void;
  onCopyMd: () => void;
  onStop: () => void;
}

const ib = (on = false): React.CSSProperties => ({ height: 28, minWidth: 28, padding: "0 8px", borderRadius: 6, border: `1px solid ${on ? "var(--accent)" : "var(--studio-line)"}`, background: on ? "var(--studio-sel)" : "transparent", color: "var(--text)", font: "12px system-ui", cursor: "pointer" });
const mi: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "6px 10px", border: 0, borderRadius: 6, background: "transparent", color: "var(--text)", font: "13px system-ui", cursor: "pointer" };

export default function Toolbar(p: ToolbarProps) {
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
  const pick = (f: () => void) => () => (setMenu(false), f());
  return (
    <div data-testid="doc-toolbar" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderBottom: "1px solid var(--studio-line)" }}>
      {p.writing !== null && <span data-testid="doc-writing" style={{ flex: 1, font: "12px system-ui", color: "var(--text-dim)" }}>{p.writing}</span>}
      {p.writing !== null && <button data-testid="doc-stop" onClick={p.onStop} style={{ ...ib(), background: "var(--doc-stop)", borderColor: "var(--doc-stop)", color: "#fff", fontWeight: 600 }}>{t("Stop")}</button>}{/* theme-fixed */}
      {p.writing === null && p.hasText && (
        <>
          <button data-testid="doc-mode-flow" aria-pressed={p.mode === "flow"} title={t("Flowing preview")} onClick={() => p.onMode("flow")} style={ib(p.mode === "flow")}>{t("Flow")}</button>
          <button data-testid="doc-mode-pages" aria-pressed={p.mode === "pages"} title={p.pagesOff ? t(p.pagesOff) : t("Page-by-page preview, exactly what the PDF will be")} disabled={!!p.pagesOff} onClick={() => p.onMode("pages")} style={{ ...ib(p.mode === "pages"), opacity: p.pagesOff ? 0.4 : 1 }}>{t("Pages")}</button>
          <span style={{ flex: 1 }} />
          <button data-testid="doc-again" aria-label={t("Generate again")} title={t("Generate again with the agent and effort selected now")} disabled={p.busy} onClick={p.onAgain} style={{ ...ib(), opacity: p.busy ? 0.4 : 1 }}>↻</button>
          <button data-testid="doc-add-board" onClick={p.onAdd} style={ib()}>{t("Add to board")}</button>
          <div ref={ref} style={{ position: "relative" }}>
            <button data-testid="doc-more" aria-label={t("More export options")} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} style={ib(menu)}>+</button>
            {menu && (
              <div role="menu" style={{ position: "absolute", right: 0, top: "100%", zIndex: 5, minWidth: 170, marginTop: 4, padding: 4, borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 8px 24px var(--scrim-40)" }}>
                <button role="menuitem" style={mi} onClick={pick(p.onExportMd)}>{t("Export Markdown")}</button>
                <button role="menuitem" style={mi} onClick={pick(p.onCopyMd)}>{t("Copy Markdown")}</button>
                <button role="menuitemradio" aria-checked={p.paper === "letter"} style={mi} onClick={pick(() => p.onPaper("letter"))}>{p.paper === "letter" ? "✓ " : ""}{t("Letter")}</button>
                <button role="menuitemradio" aria-checked={p.paper === "a4"} style={mi} onClick={pick(() => p.onPaper("a4"))}>{p.paper === "a4" ? "✓ " : ""}A4</button>
              </div>
            )}
          </div>
          {!p.incomplete && <button data-testid="doc-export-pdf" onClick={p.onExportPdf} style={{ ...ib(), background: "var(--accent)", borderColor: "var(--accent)", color: "var(--accent-text)", fontWeight: 600 }}>{t("Export PDF")}</button>}
        </>
      )}
    </div>
  );
}
