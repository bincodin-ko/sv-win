// S-910~S-919 캘린더 노드 본체. 머리줄(data-node-handle)만 끌리고, 이벤트 칩은 포인터 이벤트로 끈다(HTML5 DnD 아님)
import { useState } from "react";
import { useScope } from "../board/BoardScope";
import { DayPop, EventMenu } from "./EventMenu";
import EventDialog from "./EventDialog";
import { duplicateEvent, eventsOn, monthGrid, monthTitle, moveEvent, shiftMonth, todayStr, visibleIn, weekdayNames, type CalEvent } from "./calendar";
import { noteVar } from "./colors";
import { useT } from "../i18n";

const btn: React.CSSProperties = { border: "1px solid var(--bd-2)", background: "var(--surface-2)", color: "var(--fg-2)", borderRadius: 6, padding: "2px 8px", font: "11px system-ui", cursor: "pointer" };
const CELL = '[data-testid="cal-cell"]';
type Dlg = { id?: string; date: string };
type Pt = { x: number; y: number };

export default function Calendar({ id }: { id: string }) {
  const t = useT();
  const { store: useBoard } = useScope();
  const node = useBoard((s) => s.nodes[id]);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [menu, setMenu] = useState<(Pt & { id: string }) | null>(null);
  const [pop, setPop] = useState<(Pt & { date: string }) | null>(null);
  const [drop, setDrop] = useState<string | null>(null);
  if (!node) return null;
  const now = new Date();
  const year = (node.year as number | undefined) ?? now.getFullYear();
  const month = (node.month as number | undefined) ?? now.getMonth() + 1;
  const events = (node.events as CalEvent[] | undefined) ?? [];
  const today = todayStr();
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const set = (patch: Record<string, unknown>) => { const s = useBoard.getState(); s.commit(); s.updateNode(id, patch); }; // 변경 1번 = 되돌리기 1단계
  const view = (patch: { year: number; month: number }) => useBoard.getState().updateNode(id, patch); // 보는 달 이동은 되돌리기에 안 넣는다
  const newId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const editing = dlg?.id ? events.find((e) => e.id === dlg.id) : undefined;

  const startDrag = (e: React.PointerEvent, ev: CalEvent) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false, over: string | null = null;
    const move = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 3) return; // 3px 미만은 클릭
      moved = true;
      over = (document.elementFromPoint(m.clientX, m.clientY)?.closest(CELL) as HTMLElement | null)?.dataset.date ?? null;
      setDrop(over);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDrop(null);
      if (moved && over && over !== ev.date) set({ events: moveEvent(useBoard.getState().nodes[id]!.events as CalEvent[], ev.id, over) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return (
    <div data-testid="calendar" style={{ width: "100%", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 10, overflow: "hidden", font: "12px system-ui", color: "var(--fg-2)" }}>
      <div data-node-handle style={{ flex: "none", height: 40, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", borderBottom: "1px solid var(--bd)", cursor: "grab" }}>
        <span data-testid="cal-title" style={{ flex: 1, font: "600 13px system-ui", color: "var(--fg)" }}>{monthTitle(year, month)}</span>
        <button data-testid="cal-new" style={btn} onClick={() => setDlg({ date: today.startsWith(ym) ? today : `${ym}-01` })}>{t("New event")}</button>
        <button data-testid="cal-today" style={btn} onClick={() => view({ year: now.getFullYear(), month: now.getMonth() + 1 })}>{t("Today")}</button>
        <button data-testid="cal-prev" aria-label={t("Previous month")} style={btn} onClick={() => view(shiftMonth(year, month, -1))}>‹</button>
        <button data-testid="cal-next" aria-label={t("Next month")} style={btn} onClick={() => view(shiftMonth(year, month, 1))}>›</button>
      </div>
      <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", padding: "4px 0", color: "var(--mute)", textAlign: "center", fontSize: 11 }}>
        {weekdayNames().map((w) => <span key={w}>{w}</span>)}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gridTemplateRows: "repeat(6, minmax(0, 1fr))", borderTop: "1px solid var(--bd)" }}>
        {monthGrid(year, month).map((d) => {
          const { shown, more } = visibleIn(events, d);
          return (
            <div key={d} data-testid="cal-cell" data-date={d} data-today={d === today} data-drop={drop === d}
              onDoubleClick={(e) => { e.stopPropagation(); setDlg({ date: d }); }}
              style={{ minWidth: 0, minHeight: 0, overflow: "hidden", padding: 2, borderRight: "1px solid var(--bd)", borderBottom: "1px solid var(--bd)", background: drop === d ? "var(--surface-2)" : undefined, outline: drop === d ? "2px solid var(--accent)" : undefined, outlineOffset: -2, color: d.startsWith(ym) ? undefined : "var(--mute-3)" }}>
              <span style={{ display: "inline-grid", placeItems: "center", minWidth: 18, height: 18, borderRadius: 9, fontSize: 11, background: d === today ? "var(--accent)" : undefined, color: d === today ? "var(--accent-text)" : undefined }}>{Number(d.slice(8))}</span>
              {shown.map((ev) => (
                <div key={ev.id} data-testid="cal-chip" data-event-id={ev.id} data-date={ev.date} data-color={ev.color} data-time={ev.allDay ? undefined : ev.time}
                  onPointerDown={(e) => startDrag(e, ev)} onDoubleClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ id: ev.id, x: e.clientX, y: e.clientY }); }}
                  style={{ display: "flex", alignItems: "center", gap: 3, height: 15, margin: "1px 0", padding: "0 3px", borderRadius: 3, background: "var(--surface-2)", color: "var(--fg-2)", fontSize: 10, cursor: "grab", touchAction: "none", userSelect: "none" }}>
                  <span aria-hidden style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: noteVar(ev.color) }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.allDay || !ev.time ? ev.title : `${ev.time} ${ev.title}`}</span>
                </div>
              ))}
              {more > 0 && (
                <button data-testid="cal-more" onClick={(e) => setPop({ date: d, x: e.clientX, y: e.clientY })} onDoubleClick={(e) => e.stopPropagation()}
                  style={{ border: 0, background: "none", color: "var(--mute)", font: "10px system-ui", padding: "0 3px", cursor: "pointer" }}>+{more}</button>
              )}
            </div>
          );
        })}
      </div>
      {dlg && (
        <EventDialog key={dlg.id ?? "new"} submitLabel={editing ? "Save" : "Add event"}
          initial={editing ?? { title: "", date: dlg.date, allDay: true, notes: "", color: "Amber" }}
          onCancel={() => setDlg(null)}
          onSubmit={(f) => {
            set({ events: editing ? events.map((e) => (e.id === editing.id ? { id: e.id, ...f } : e)) : [...events, { id: newId(), ...f }] });
            setDlg(null);
          }} />
      )}
      {menu && (
        <EventMenu at={menu} onClose={() => setMenu(null)}
          onEdit={() => setDlg({ id: menu.id, date: "" })}
          onDuplicate={() => set({ events: duplicateEvent(events, menu.id, newId()) })}
          onColor={(c) => set({ events: events.map((e) => (e.id === menu.id ? { ...e, color: c } : e)) })}
          onDelete={() => set({ events: events.filter((e) => e.id !== menu.id) })} />
      )}
      {pop && <DayPop at={pop} events={eventsOn(events, pop.date)} onClose={() => setPop(null)} onPick={(eid) => setDlg({ id: eid, date: "" })} />}
    </div>
  );
}
