// 칸반 열 하나 (S-931): 머리(색 점·이름·개수·⋯) · 카드 목록(열 안 세로 스크롤) · + Add card
import { Fragment, useState } from "react";
import { noteVar } from "../colors";
import CardView from "./CardView";
import { columnLabel, NAME_MAX, type Column as Col } from "./kanban";
import { useT } from "../../i18n";

export type Drag = { kind: "card" | "col"; id: string; col: string; slot: number };

/** portal 이 아닌 곳에서 Esc/Enter 로 끝나는 한 줄 입력(+ Column, Rename 공용) */
export function NameInput({ initial, onDone, width }: { initial: string; onDone: (name: string | null) => void; width?: number | string }) {
  const t = useT();
  const [v, setV] = useState(initial);
  return (
    <input data-testid="kb-col-input" autoFocus value={v} maxLength={NAME_MAX} placeholder={t("Column name")} onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) onDone(v.trim() || null); else if (e.key === "Escape") onDone(null); }}
      onBlur={() => onDone(null)} onPointerDown={(e) => e.stopPropagation()}
      style={{ width: width ?? "100%", minWidth: 0, boxSizing: "border-box", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--accent)", background: "var(--panel-2)", color: "var(--text)", font: "12px system-ui" }} />
  );
}

export default function Column({ col, drag, editing, onRename, onAddCard, onMenu, onHeadDown, onCardDown, onCardMenu }: {
  col: Col; drag: Drag | null; editing: boolean;
  onRename: (name: string | null) => void; onAddCard: () => void; onMenu: (at: { x: number; y: number }) => void;
  onHeadDown: (e: React.PointerEvent) => void; onCardDown: (e: React.PointerEvent, cardId: string) => void;
  onCardMenu: (cardId: string, at: { x: number; y: number }) => void;
}) {
  const t = useT();
  const cardDrag = drag?.kind === "card" ? drag : null;
  const line = cardDrag && cardDrag.col === col.id ? cardDrag.slot : -1;
  const bar = <div key="ins" data-testid="kb-insert" style={{ height: 0, margin: "-6px 0", position: "relative", flex: "none" }}><div style={{ position: "absolute", left: 0, right: 0, top: -1, height: 2, borderRadius: 1, background: "var(--accent)" }} /></div>;
  return (
    <div data-testid="kb-col" data-col-id={col.id} data-col-name={col.name} data-drop={!!cardDrag && cardDrag.col === col.id}
      style={{ width: 220, flex: "none", display: "flex", flexDirection: "column", minHeight: 0, borderRadius: 8, background: "var(--panel-2)", border: `1px solid ${cardDrag && cardDrag.col === col.id ? "var(--accent)" : "var(--bd)"}`, opacity: drag?.kind === "col" && drag.id === col.id ? 0.4 : 1 }}>
      <div data-testid="kb-col-head" data-color={col.color ?? "none"} onPointerDown={onHeadDown}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", cursor: "grab", userSelect: "none", touchAction: "none" }}>
        <span data-testid="kb-col-dot" style={{ width: 8, height: 8, borderRadius: 4, flex: "none", background: noteVar(col.color) ?? "var(--mute-3)" }} />
        {editing ? <NameInput initial={col.name} onDone={onRename} /> : (
          <span data-testid="kb-col-name" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.6, font: "600 11px system-ui", color: "var(--fg-2)" }}>{columnLabel(col.name)}</span>
        )}
        <span data-testid="kb-col-count" style={{ font: "11px system-ui", color: "var(--mute)" }}>{col.cards.length}</span>
        <button data-testid="kb-col-menu-btn" aria-label={t("Column menu")} aria-haspopup="menu"
          onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); onMenu({ x: b.left, y: b.bottom + 2 }); }}
          style={{ border: 0, background: "none", color: "var(--mute)", cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>⋯</button>
      </div>
      <div data-testid="kb-cards" data-wheel-own style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, padding: "0 6px 6px" }}>
        {col.cards.map((k, i) => (
          <Fragment key={k.id}>
            {line === i && bar}
            <CardView card={k} dragging={cardDrag?.id === k.id} onPointerDown={(e) => onCardDown(e, k.id)} onMenu={(at) => onCardMenu(k.id, at)} />
          </Fragment>
        ))}
        {line === col.cards.length && line >= 0 && bar}
      </div>
      <button data-testid="kb-add-card" onClick={onAddCard}
        style={{ flex: "none", margin: "0 6px 6px", padding: "5px 8px", textAlign: "left", border: 0, borderRadius: 6, background: "none", color: "var(--mute-2)", font: "12px system-ui", cursor: "pointer" }}>{t("+ Add card")}</button>
    </div>
  );
}
