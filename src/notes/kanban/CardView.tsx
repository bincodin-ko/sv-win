// 카드 모양 (S-938): 제목, 날짜 칩, 우선순위 점. done = 취소선 + 흐린 색.
import { dueLabel, type Card } from "./kanban";
import { tm, useT } from "../../i18n";

const PRIO: Record<string, string> = { high: tm("High"), med: tm("Med"), low: tm("Low") };
const DOT: Record<string, string> = { high: "var(--danger)", med: "var(--accent)", low: "var(--info)" };

export default function CardView({ card, dragging, onPointerDown, onMenu }: {
  card: Card; dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onMenu: (at: { x: number; y: number }) => void;
}) {
  const t = useT();
  const due = card.due ? dueLabel(card.due, new Date()) : null;
  return (
    <div data-testid="kb-card" data-card-id={card.id} data-done={card.done} onPointerDown={onPointerDown}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMenu({ x: e.clientX, y: e.clientY }); }}
      style={{ padding: "7px 8px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--bd)", font: "13px system-ui", color: "var(--fg)", cursor: "grab", userSelect: "none", opacity: dragging ? 0.4 : 1, touchAction: "none" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <span data-testid="kb-card-title" style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", textDecoration: card.done ? "line-through" : "none", opacity: card.done ? 0.5 : 1 }}>{card.title}</span>
        <button data-testid="kb-card-menu-btn" aria-label={t("Card menu")} aria-haspopup="menu"
          onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); onMenu({ x: b.left, y: b.bottom + 2 }); }}
          style={{ border: 0, background: "none", color: "var(--mute)", cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>⋯</button>
      </div>
      {(due || card.priority !== "none") && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 5, font: "11px system-ui" }}>
          {due && <span data-testid="kb-card-due" data-overdue={due.overdue} style={{ padding: "1px 6px", borderRadius: 8, background: "var(--panel-2)", color: due.overdue ? "var(--err-text)" : "var(--mute-2)" }}>{due.text}</span>}
          {card.priority !== "none" && <span data-testid="kb-card-prio" data-priority={card.priority} title={t(PRIO[card.priority] ?? card.priority)} style={{ width: 8, height: 8, borderRadius: 4, background: DOT[card.priority] }} />}
        </div>
      )}
    </div>
  );
}
