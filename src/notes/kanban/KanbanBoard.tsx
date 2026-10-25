// 칸반 노드 본문 (S-930~S-945). 상태는 노드 필드 title·columns 에만 있고, 바꿀 때마다 commit 1번(되돌리기 1단계) + 노드 갱신(자동 저장).
import { Fragment, useRef, useState } from "react";
import { useScope } from "../../board/BoardScope";
import { confirmDialog } from "../../ui/ConfirmDialog";
import CardDialog, { type CardValues } from "./CardDialog";
import { cardEntries } from "./CardMenu";
import Column, { NameInput, type Drag } from "./Column";
import { columnEntries } from "./ColumnMenu";
import PopMenu, { type Entry } from "./PopMenu";
import { columnAt, isDragMove, slotAt } from "./dnd";
import * as K from "./kanban";
import { tp, useT } from "../../i18n";

type Dialog = { mode: "new"; colId: string } | { mode: "edit"; cardId: string };
type Pop = { at: { x: number; y: number }; entries: Entry[] };

export default function Kanban({ id }: { id: string }) {
  const t = useT();
  const { store: useBoard } = useScope();
  const node = useBoard((s) => s.nodes[id]);
  const cols = (node?.columns as K.Column[] | undefined) ?? [];
  const title = (node?.title as string | undefined) ?? "Board";
  const shownTitle = title === "Board" ? t("Board") : title; // 저장된 기본 이름만 번역
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  /** 한 동작 = 되돌리기 1단계. 바뀐 게 없으면 기록하지 않는다 */
  const apply = (f: (c: K.Column[]) => K.Column[]) => {
    const s = useBoard.getState();
    const now = (s.nodes[id]?.columns as K.Column[]) ?? [];
    const next = f(now);
    if (next === now) return;
    s.commit();
    s.updateNode(id, { columns: next });
  };
  const setTitle = (t: string | null) => {
    setEditTitle(false);
    const s = useBoard.getState();
    if (t && t !== title) (s.commit(), s.updateNode(id, { title: t }));
  };

  // ── 포인터 끌기: 카드·열 (HTML5 DnD 아님). 3px 이상 움직여야 끌기, 놓는 것 1번 = 1단계
  const startDrag = (e: React.PointerEvent, kind: "card" | "col", dragId: string) => {
    if (e.button !== 0 || (e.target as Element).closest("button, input, textarea")) return;
    const x0 = e.clientX, y0 = e.clientY;
    let on = false;
    let tgt: Drag | null = null;
    const where = (x: number, y: number): Drag => {
      const els = [...scroller.current!.querySelectorAll<HTMLElement>('[data-testid="kb-col"]')];
      const rects = els.map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.colId!, left: r.left, right: r.right }; });
      if (kind === "col") return { kind, id: dragId, col: "", slot: slotAt(rects.map((r) => (r.left + r.right) / 2), x) };
      const col = columnAt(rects, x) ?? "";
      const cards = [...(els.find((el) => el.dataset.colId === col)?.querySelectorAll<HTMLElement>('[data-testid="kb-card"]') ?? [])];
      return { kind, id: dragId, col, slot: slotAt(cards.map((el) => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; }), y) };
    };
    const move = (m: PointerEvent) => {
      if (!on && !isDragMove(m.clientX - x0, m.clientY - y0)) return;
      on = true;
      setDrag((tgt = where(m.clientX, m.clientY)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDrag(null);
      if (on && tgt) apply((c) => (kind === "card" ? K.moveCard(c, dragId, tgt!.col, tgt!.slot) : K.moveColumnTo(c, dragId, tgt!.slot)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // ── 메뉴
  const openColMenu = (c: K.Column, at: { x: number; y: number }) => setPop({ at, entries: columnEntries(cols, c, {
    rename: () => setRenaming(c.id),
    addCard: () => setDialog({ mode: "new", colId: c.id }),
    color: (color) => apply((cs) => K.setColumnColor(cs, c.id, color)),
    sort: () => apply((cs) => K.sortByPriority(cs, c.id)),
    move: (d) => apply((cs) => K.moveColumn(cs, c.id, d)),
    clearDone: () => apply((cs) => K.clearDone(cs, c.id)),
    remove: async () => {
      // 카드가 있을 때만 묻는다(S-934)
      if (c.cards.length && !(await confirmDialog({ title: t("Delete column {name}?", { name: K.columnLabel(c.name) }), message: tp("Its {n} card goes with it.", "Its {n} cards go with it.", c.cards.length), confirmLabel: t("Delete"), danger: true }))) return;
      apply((cs) => K.deleteColumn(cs, c.id));
    },
  }) });
  const openCardMenu = (cardId: string, at: { x: number; y: number }) => {
    const card = cols.flatMap((c) => c.cards).find((k) => k.id === cardId);
    if (card) setPop({ at, entries: cardEntries(cols, card, {
      toggle: () => apply((cs) => K.toggleDone(cs, cardId)),
      edit: () => setDialog({ mode: "edit", cardId }),
      duplicate: () => apply((cs) => K.duplicateCard(cs, cardId)),
      moveTo: (to) => apply((cs) => K.moveCard(cs, cardId, to, Infinity)),
      remove: () => apply((cs) => K.deleteCard(cs, cardId)), // 묻지 않음(S-939)
    }) });
  };

  const editing = dialog?.mode === "edit" ? cols.flatMap((c) => c.cards).find((k) => k.id === dialog.cardId) : undefined;
  const colLine = drag?.kind === "col" ? drag.slot : -1;
  const vbar = <div key="ins" data-testid="kb-insert" style={{ width: 0, margin: "0 -5px", position: "relative", flex: "none" }}><div style={{ position: "absolute", top: 0, bottom: 0, left: -1, width: 2, borderRadius: 1, background: "var(--accent)" }} /></div>;

  return (
    <div data-testid="kb-root" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--bd)", color: "var(--fg)" }}>
      <div data-node-handle style={{ height: 32, flex: "none", display: "flex", alignItems: "center", padding: "0 12px", borderBottom: "1px solid var(--bd)", cursor: "grab", font: "600 12px system-ui" }}>
        {editTitle ? (
          <input data-testid="kb-title-input" autoFocus defaultValue={title} onPointerDown={(e) => e.stopPropagation()} onBlur={() => setEditTitle(false)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) setTitle(e.currentTarget.value.trim() || null); else if (e.key === "Escape") setEditTitle(false); }}
            style={{ width: 200, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--accent)", background: "var(--panel-2)", color: "var(--text)", font: "inherit" }} />
        ) : (
          <span data-testid="kb-title" onDoubleClick={(e) => (e.stopPropagation(), setEditTitle(true))} style={{ display: "inline-block" }}>{shownTitle}</span>
        )}
      </div>
      <div ref={scroller} data-testid="kb-board-scroll" data-wheel-own style={{ flex: 1, minHeight: 0, overflowX: "auto", overflowY: "hidden", display: "flex", alignItems: "stretch", gap: 10, padding: 10 }}>
        {cols.map((c, i) => (
          <Fragment key={c.id}>
            {colLine === i && vbar}
            <Column col={c} drag={drag} editing={renaming === c.id}
              onRename={(name) => { setRenaming(null); if (name) apply((cs) => K.renameColumn(cs, c.id, name)); }}
              onAddCard={() => setDialog({ mode: "new", colId: c.id })}
              onMenu={(at) => openColMenu(c, at)}
              onHeadDown={(e) => startDrag(e, "col", c.id)}
              onCardDown={(e, cardId) => startDrag(e, "card", cardId)}
              onCardMenu={openCardMenu} />
          </Fragment>
        ))}
        {colLine === cols.length && colLine >= 0 && vbar}
        <div style={{ width: 160, flex: "none" }}>
          {adding ? (
            <NameInput initial="" onDone={(name) => { setAdding(false); if (name) apply((cs) => K.addColumn(cs, name)); }} />
          ) : (
            <button data-testid="kb-add-col" onClick={() => setAdding(true)} style={{ width: "100%", padding: "6px 8px", textAlign: "left", border: "1px dashed var(--bd-2)", borderRadius: 8, background: "none", color: "var(--mute-2)", font: "12px system-ui", cursor: "pointer" }}>{t("+ Column")}</button>
          )}
        </div>
      </div>
      {pop && <PopMenu at={pop.at} entries={pop.entries} onClose={() => setPop(null)} />}
      {dialog && (
        <CardDialog mode={dialog.mode} initial={editing ? { title: editing.title, notes: editing.notes, due: editing.due, priority: editing.priority } : { title: "", notes: "", due: null, priority: "none" }}
          onCancel={() => setDialog(null)}
          onSubmit={(v: CardValues) => {
            apply((cs) => (dialog.mode === "new" ? K.addCard(cs, dialog.colId, v) : K.editCard(cs, dialog.cardId, v)));
            setDialog(null);
          }} />
      )}
    </div>
  );
}
