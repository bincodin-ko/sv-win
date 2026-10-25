// E6 S-1971·S-1974·S-1975: DOCUMENTS 목록 9개(버전 있는 항목 옆 점) + 맨 아래 "ASK FOR ANYTHING" 입력
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import type { DocMeta } from "../../lib/ipc";
import { DOCS } from "./prompts";

const label: React.CSSProperties = { padding: "10px 14px 4px", font: "600 10px system-ui", letterSpacing: ".08em", color: "var(--text-dim)" };

export default function DocList({ docId, versions, ask, onPick, onAsk }: { docId: string | null; versions: DocMeta[]; ask?: string; onPick: (id: string) => void; onAsk: (text: string) => void }) {
  const t = useT();
  const [text, setText] = useState(ask ?? "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (docId === "ask") input.current?.focus(); }, [docId]);
  const go = () => text.trim() && onAsk(text.trim());
  return (
    <>
      <div style={label}>{t("DOCUMENTS")}</div>
      <div data-testid="doc-list" role="listbox" aria-label={t("Documents")} style={{ display: "grid", padding: "0 8px" }}>
        {DOCS.map((d) => {
          const on = docId === d.id;
          return (
            <button key={d.id} role="option" aria-selected={on} data-testid={`doc-item-${d.id}`} onClick={() => onPick(d.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", minHeight: 50, padding: "6px 8px", border: 0, borderRadius: 6, background: on ? "var(--studio-sel)" : "transparent", color: "var(--text)", font: "13px system-ui", cursor: "pointer" }}>
              <span style={{ flex: 1 }}>{t(d.name)}</span>
              {versions.some((v) => v.docId === d.id) && <span data-testid={`doc-dot-${d.id}`} aria-label={t("has versions")} style={{ width: 6, height: 6, borderRadius: 3, background: "var(--accent)" }} />}
            </button>
          );
        })}
      </div>
      <div style={{ ...label, paddingTop: 14 }}>{t("ASK FOR ANYTHING")}</div>
      <div style={{ display: "flex", gap: 6, padding: "0 12px 12px" }}>
        <input ref={input} data-testid="doc-ask-input" value={text} placeholder={t("a migration plan from REST to GraphQL")} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); go(); } }}
          style={{ flex: 1, minWidth: 0, padding: "6px 8px", borderRadius: 6, border: `1px solid ${docId === "ask" ? "var(--accent)" : "var(--studio-line)"}`, background: "var(--bg)", color: "var(--text)", font: "13px system-ui" }} />
        <button data-testid="doc-ask-go" aria-label={t("Select this request")} title={t("Select")} disabled={!text.trim()} onClick={go}
          style={{ width: 30, borderRadius: 6, border: 0, background: "var(--accent)", color: "var(--accent-text)", cursor: "pointer", opacity: text.trim() ? 1 : 0.4 }}>→</button>
      </div>
    </>
  );
}
