// S-917·S-915: 이벤트 칩 우클릭 메뉴와 "+N" 날짜 목록 팝오버. 둘 다 body 로 포탈한 role="menu"(밖을 누르거나 Esc 로 닫힘)
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Item, menuBox, useEscClose, useMenuKeys } from "../board/menus/menuKit";
import type { CalEvent } from "./calendar";
import { NOTE_COLORS, noteVar } from "./colors";
import { useT } from "../i18n";

function Pop({ at, testid, onClose, children }: { at: { x: number; y: number }; testid: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref); // useEscClose 보다 먼저(U3 NodeMenu 주석 참고)
  useEscClose(onClose);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [onClose]);
  return createPortal(
    <div ref={ref} role="menu" data-testid={testid} onContextMenu={(e) => e.preventDefault()} style={{ ...menuBox, position: "fixed", zIndex: 20000, left: at.x, top: at.y }}>{children}</div>,
    document.body,
  );
}

export function EventMenu({ at, onClose, onEdit, onDuplicate, onColor, onDelete }: {
  at: { x: number; y: number }; onClose: () => void; onEdit: () => void; onDuplicate: () => void; onColor: (c: string) => void; onDelete: () => void;
}) {
  const t = useT();
  const [colors, setColors] = useState(false);
  const done = (f: () => void) => () => { onClose(); f(); };
  return (
    <Pop at={at} testid="cal-event-menu" onClose={onClose}>
      <Item label={t("Edit")} onClick={done(onEdit)} />
      <Item label={t("Duplicate")} onClick={done(onDuplicate)} />
      <Item label={t("Color")} extra="›" onClick={() => setColors((v) => !v)} />
      {colors && NOTE_COLORS.map((c) => (
        <Item key={c} label={t(c)} style={{ paddingLeft: 20 }} extra={<span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: noteVar(c) }} />} onClick={done(() => onColor(c))} />
      ))}
      <Item label={t("Delete")} onClick={done(onDelete)} />
    </Pop>
  );
}

export function DayPop({ at, events, onClose, onPick }: { at: { x: number; y: number }; events: CalEvent[]; onClose: () => void; onPick: (id: string) => void }) {
  return (
    <Pop at={at} testid="cal-day-pop" onClose={onClose}>
      {events.map((e) => (
        <button key={e.id} role="menuitem" onClick={() => (onClose(), onPick(e.id))}
          style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: "5px 8px", border: 0, borderRadius: 4, background: "none", color: "inherit", font: "inherit", cursor: "pointer" }}>
          <span aria-hidden style={{ flex: "none", width: 8, height: 8, borderRadius: "50%", background: noteVar(e.color) }} />
          {e.allDay || !e.time ? e.title : `${e.time} ${e.title}`}
        </button>
      ))}
    </Pop>
  );
}
