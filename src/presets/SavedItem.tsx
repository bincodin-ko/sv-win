// B14 저장한 layout 한 줄: 클릭 = onPick, 우클릭 = Delete preset 메뉴(묻지 않고 지움, S-648). remove = 마우스를 올리면 보이는 제거 버튼(홈, S-649)
import { useState } from "react";
import { useT } from "../i18n";

const row: React.CSSProperties = { textAlign: "left", padding: "6px 10px", border: 0, borderRadius: 6, background: "transparent", color: "var(--text)", font: "13px system-ui", cursor: "pointer" };

export default function SavedItem({ name, hint, role, remove, onPick, onDelete }: { name: string; hint?: string; role?: "menuitem"; remove?: boolean; onPick: () => void; onDelete: () => void }) {
  const t = useT();
  const [ctx, setCtx] = useState(false);
  const [hover, setHover] = useState(false);
  return (
    <div data-testid="preset-saved-item" data-name={name} style={{ display: "grid" }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx(true); }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setCtx(false); }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button role={role} onClick={onPick} style={{ ...row, flex: 1 }}>{name}</button>
        {hint && <span style={{ color: "var(--text-dim)", font: "11px system-ui" }}>{hint}</span>}
        {remove && hover && <button data-testid="preset-remove" aria-label={t("Remove {name}", { name })} onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ ...row, padding: "2px 6px" }}>×</button>}
      </div>
      {ctx && <button role="menuitem" onClick={onDelete} style={{ ...row, color: "var(--danger)" }}>{t("Delete preset")}</button>}
    </div>
  );
}
