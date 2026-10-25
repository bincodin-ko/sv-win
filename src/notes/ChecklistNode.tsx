// S-900~S-906 체크리스트 노드 본체. 머리줄(data-node-handle)만 끌리고 본문은 입력·스크롤이 자기 몫
import { useState } from "react";
import { useScope } from "../board/BoardScope";
import { addItem, cleanTitle, clearDone, editItem, progress, removeItem, toggleItem, TITLE_MAX, type Item } from "./checklist";
import { useT } from "../i18n";

const R = 9, C = 2 * Math.PI * R;
const btn: React.CSSProperties = { border: "1px solid var(--bd-2)", background: "var(--surface-2)", color: "var(--fg-2)", borderRadius: 6, padding: "2px 8px", font: "11px system-ui", cursor: "pointer" };
const input: React.CSSProperties = { flex: 1, minWidth: 0, background: "var(--well)", color: "var(--fg)", border: "1px solid var(--bd-2)", borderRadius: 4, padding: "3px 6px", font: "12px system-ui" };
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function Row({ item, onToggle, onEdit, onDelete }: { item: Item; onToggle: () => void; onEdit: (t: string) => void; onDelete: () => void }) {
  const t = useT();
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <div data-testid="check-item" data-item-id={item.id} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", font: "12px system-ui", color: "var(--fg-2)" }}>
      <button data-testid="check-box" role="checkbox" aria-checked={item.done} aria-label={item.text} onClick={onToggle}
        style={{ flex: "none", width: 16, height: 16, padding: 0, borderRadius: 4, border: "1px solid var(--bd-2)", background: item.done ? "var(--accent)" : "var(--well)", color: "var(--accent-text)", font: "11px/14px system-ui", cursor: "pointer" }}>{item.done ? "✓" : ""}</button>
      {editing ? (
        <input data-testid="check-edit" autoFocus defaultValue={item.text} style={input} onPointerDown={stop} onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.nativeEvent.isComposing) { onEdit(e.currentTarget.value); setEditing(false); } else if (e.key === "Escape") setEditing(false);
        }} onBlur={() => setEditing(false)} />
      ) : (
        <span data-testid="check-text" onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
          style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", textDecoration: item.done ? "line-through" : "none", color: item.done ? "var(--mute)" : undefined }}>{item.text}</span>
      )}
      {hover && !editing && <button data-testid="check-del" aria-label={t("Delete")} onClick={onDelete} style={{ ...btn, border: 0, background: "none", padding: "0 4px", color: "var(--mute)" }}>✕</button>}
    </div>
  );
}

export default function Checklist({ id }: { id: string }) {
  const t = useT();
  const { store: useBoard } = useScope();
  const node = useBoard((s) => s.nodes[id]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  if (!node) return null;
  const items = (node.items as Item[] | undefined) ?? [];
  const title = (node.title as string | undefined) ?? "Checklist";
  const shownTitle = title === "Checklist" ? t("Checklist") : title; // 저장된 기본 이름만 번역
  const pr = progress(items);
  const set = (patch: Record<string, unknown>) => { const s = useBoard.getState(); s.commit(); s.updateNode(id, patch); }; // 변경 1번 = 되돌리기 1단계
  const newItemId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return (
    <div data-testid="checklist" style={{ width: "100%", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 10, overflow: "hidden" }}>
      <div data-node-handle style={{ flex: "none", height: 40, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", borderBottom: "1px solid var(--bd)", cursor: "grab" }}>
        <svg data-testid="checklist-ring" data-done={pr.done} data-total={pr.total} data-ratio={String(pr.ratio)} width={22} height={22} viewBox="0 0 22 22" style={{ flex: "none" }}>
          <circle cx={11} cy={11} r={R} fill="none" stroke="var(--bd-2)" strokeWidth={3} />
          <circle cx={11} cy={11} r={R} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" strokeDasharray={`${pr.ratio * C} ${C}`} transform="rotate(-90 11 11)" />
        </svg>
        {renaming ? (
          <input data-testid="checklist-title-input" autoFocus defaultValue={title} maxLength={200} style={input} onPointerDown={stop} onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.nativeEvent.isComposing) { const t = cleanTitle(e.currentTarget.value, title); setRenaming(false); if (t !== title) set({ title: t }); } else if (e.key === "Escape") setRenaming(false);
          }} onBlur={() => setRenaming(false)} />
        ) : (
          <span data-testid="checklist-title" title={t("Double-click to rename (max {n})", { n: TITLE_MAX })} onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); }}
            style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", font: "600 13px system-ui", color: "var(--fg)" }}>{shownTitle}</span>
        )}
        <span data-testid="checklist-count" style={{ flex: "none", font: "11px system-ui", color: "var(--mute)" }}>{pr.label}</span>
        {pr.done > 0 && <button data-testid="checklist-clear" onPointerDown={stop} onClick={() => set({ items: clearDone(items).items })} style={btn}>{t("Clear done")}</button>}
      </div>
      <div data-wheel-own style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 10px" }}>
        {!items.length && !adding && <div data-testid="checklist-empty" style={{ padding: "10px 0", font: "12px system-ui", color: "var(--mute)" }}>{t("No objectives")}</div>}
        {items.map((it) => (
          <Row key={it.id} item={it} onToggle={() => set({ items: toggleItem(items, it.id) })} onEdit={(t) => set({ items: editItem(items, it.id, t) })} onDelete={() => set({ items: removeItem(items, it.id) })} />
        ))}
        {adding ? (
          <input data-testid="checklist-new" autoFocus value={draft} placeholder={t("Objective")} style={{ ...input, width: "100%", boxSizing: "border-box", marginTop: 4 }}
            onPointerDown={stop} onChange={(e) => setDraft(e.target.value)} onBlur={() => (setAdding(false), setDraft(""))}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") { setAdding(false); setDraft(""); }
              else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                if (!draft.trim()) { setAdding(false); setDraft(""); return; }
                set({ items: addItem(items, draft, newItemId()) });
                setDraft(""); // 열어 둔 채 다음 항목
              }
            }} />
        ) : (
          <button data-testid="checklist-add" onPointerDown={stop} onClick={() => setAdding(true)} style={{ ...btn, marginTop: 6 }}>{t("Add an objective")}</button>
        )}
      </div>
    </div>
  );
}
