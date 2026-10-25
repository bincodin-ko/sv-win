// S-913: 이벤트 대화상자(New·Edit 공용). role="dialog" 라 열려 있는 동안 보드 키는 쉰다(S-031). 노드가 변형(transform) 안이라 body 로 포탈
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModal } from "../ui/useModal";
import type { CalEvent } from "./calendar";
import { NOTE_COLORS, noteVar } from "./colors";
import { useT } from "../i18n";

const field: React.CSSProperties = { background: "var(--well)", color: "var(--fg)", border: "1px solid var(--bd-2)", borderRadius: 6, padding: "5px 8px", font: "13px system-ui", boxSizing: "border-box" };

export default function EventDialog({ initial, submitLabel, onSubmit, onCancel }: {
  initial: Omit<CalEvent, "id">; submitLabel: "Add event" | "Save"; onSubmit: (e: Omit<CalEvent, "id">) => void; onCancel: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [allDay, setAllDay] = useState(initial.allDay);
  const [time, setTime] = useState(initial.time ?? "09:00");
  const [color, setColor] = useState(initial.color);
  const [notes, setNotes] = useState(initial.notes);
  const box = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  useModal(box, { onClose: onCancel, initialFocus: () => titleRef.current });
  const ok = !!title.trim() && !!date;
  const submit = () => ok && onSubmit({ title: title.trim(), date, allDay, ...(allDay ? {} : { time }), notes, color });
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 20000, display: "grid", placeItems: "center", background: "var(--scrim)" }} onPointerDown={(e) => e.stopPropagation()}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={submitLabel === "Save" ? t("Edit event") : t("New event")} onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}
        style={{ width: 340, padding: 18, display: "grid", gap: 10, borderRadius: 10, background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", font: "13px system-ui" }}>
        <input ref={titleRef} placeholder={t("Event title")} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()} style={{ ...field, fontSize: 15 }} />
        <input data-testid="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={field} />
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input data-testid="ev-allday" type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> {t("All day")}
        </label>
        {!allDay && <input data-testid="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={field} />}
        <div style={{ display: "flex", gap: 8 }}>
          {NOTE_COLORS.map((c) => (
            <button key={c} data-testid={`ev-color-${c}`} aria-label={t(c)} aria-pressed={color === c} title={t(c)} onClick={() => setColor(c)}
              style={{ width: 22, height: 22, borderRadius: "50%", background: noteVar(c), border: color === c ? "2px solid var(--fg)" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
          ))}
        </div>
        <textarea data-testid="ev-notes" placeholder={t("Notes")} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...field, resize: "none" }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button data-testid="ev-submit" disabled={!ok} onClick={submit}
            style={{ background: "var(--accent)", color: "var(--accent-text)", border: 0, borderRadius: 6, padding: "4px 12px", opacity: ok ? 1 : 0.5 }}>{submitLabel === "Save" ? t("Save") : t("Add event")}</button>
          <button onClick={onCancel}>{t("Cancel")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
