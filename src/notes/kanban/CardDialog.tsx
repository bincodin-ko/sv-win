// NEW CARD / EDIT CARD 대화상자 (S-936). 제목·노트·날짜 칩·우선순위 칩.
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dueFrom, type Priority } from "./kanban";
import { stopBoard } from "./PopMenu";
import { tm, useT } from "../../i18n";
import { useModal } from "../../ui/useModal";

export type CardValues = { title: string; notes: string; due: string | null; priority: Priority };
const PRIOS: [Priority, string][] = [["none", tm("None")], ["low", tm("Low")], ["med", tm("Med")], ["high", tm("High")]];
const DUES: [string, string][] = [["today", tm("Today")], ["tomorrow", tm("Tomorrow")], ["nextweek", tm("Next week")]];
const chip = (on: boolean): React.CSSProperties => ({ padding: "3px 10px", borderRadius: 12, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "var(--panel-2)", color: on ? "var(--accent-text)" : "var(--text)", font: "12px system-ui", cursor: "pointer" });
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", font: "13px system-ui" };

export default function CardDialog({ mode, initial, onSubmit, onCancel }: { mode: "new" | "edit"; initial: CardValues; onSubmit: (v: CardValues) => void; onCancel: () => void }) {
  const t = useT();
  const [v, setV] = useState(initial);
  const title = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useModal(box, { onClose: onCancel, initialFocus: () => title.current });
  const ok = v.title.trim() !== "";
  const submit = () => ok && onSubmit(v);
  const now = new Date();
  const label = mode === "new" ? t("NEW CARD") : t("EDIT CARD");
  return createPortal(
    <div {...stopBoard} style={{ position: "fixed", inset: 0, zIndex: 20000, display: "grid", placeItems: "center", background: "var(--scrim)" }}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={label}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type !== "date" && !e.nativeEvent.isComposing) submit(); }}
        style={{ width: 380, padding: 20, borderRadius: 10, background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 12, letterSpacing: 1, color: "var(--text-dim)" }}>{label}</h2>
        <input ref={title} data-testid="kb-dlg-title" placeholder={t("Title")} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} style={field} />
        <textarea data-testid="kb-dlg-notes" placeholder={t("Notes")} rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} style={{ ...field, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {DUES.map(([k, name]) => {
            const on = v.due === dueFrom(k, now);
            return <button key={k} aria-pressed={on} style={chip(on)} onClick={() => setV({ ...v, due: on ? null : dueFrom(k, now) })}>{t(name)}</button>;
          })}
          <input type="date" data-testid="kb-dlg-date" aria-label={t("Pick date")} value={v.due ?? ""} onChange={(e) => setV({ ...v, due: e.target.value || null })} style={{ ...field, width: "auto", padding: "2px 6px" }} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {PRIOS.map(([k, name]) => <button key={k} aria-pressed={v.priority === k} style={chip(v.priority === k)} onClick={() => setV({ ...v, priority: k })}>{t(name)}</button>)}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          <button disabled={!ok} onClick={submit} style={{ background: "var(--accent)", color: "var(--accent-text)", border: 0, borderRadius: 6, padding: "4px 12px", opacity: ok ? 1 : 0.4 }}>{mode === "new" ? t("Add card") : t("Save")}</button>
          <button onClick={onCancel}>{t("Cancel")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
