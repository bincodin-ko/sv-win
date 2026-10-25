// D12 S-1622: Accounts 한 행 — 이름·부제·[Use]/ACTIVE·아이콘 3개(콘솔 열기·이름 바꾸기·Remove)
import { useState, type CSSProperties } from "react";
import type { AccountRow } from "./profiles";
import { useT } from "../i18n";

const btn: CSSProperties = { height: 26, minWidth: 26, border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel-2)", color: "var(--text)", cursor: "pointer", font: "12px system-ui" };

export default function ProfileRow({ row, onUse, onConsole, onRename, onRemove }: {
  row: AccountRow;
  onUse: () => void;
  onConsole?: () => void;
  /** 새 이름을 받아 저장. 실패하면 던진다 */
  onRename?: (name: string) => Promise<void>;
  onRemove?: () => void;
}) {
  const t = useT();
  const key = row.id ?? "default";
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  const commit = async (v: string) => {
    setEditing(false);
    if (!onRename || !v.trim() || v.trim() === row.name) return;
    try {
      await onRename(v);
      setErr("");
    } catch (e) {
      setErr(String(e));
    }
  };
  return (
    <div data-testid={`account-row-${key}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input data-testid="account-rename-input" autoFocus maxLength={40} defaultValue={row.name}
            onKeyDown={(e) => { e.stopPropagation(); if (e.nativeEvent.isComposing) return; if (e.key === "Enter") void commit(e.currentTarget.value); else if (e.key === "Escape") setEditing(false); }}
            onBlur={(e) => editing && void commit(e.currentTarget.value)}
            style={{ width: "100%", background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, font: "inherit", padding: "1px 4px" }} />
        ) : (
          <b>{row.name}</b>
        )}
        <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{row.sub}</div>
        {err && <div data-testid="account-error" style={{ color: "var(--usage-red)", fontSize: 11 }}>{err}</div>}
      </div>
      {row.active ? (
        <span data-testid={`account-active-${key}`} style={{ color: "var(--accent)", font: "600 11px system-ui", letterSpacing: 0.5 }}>{t("ACTIVE")}</span>
      ) : (
        <button data-testid={`account-use-${key}`} onClick={onUse} style={{ ...btn, padding: "0 10px" }}>{t("Use")}</button>
      )}
      {onConsole && <button data-testid={`account-console-${key}`} title={t("Open a console with this account")} aria-label={t("Open console")} onClick={onConsole} style={btn}>&gt;_</button>}
      {onRename && <button data-testid={`account-rename-${key}`} title={t("Rename")} aria-label={t("Rename")} onClick={() => setEditing(true)} style={btn}>✎</button>}
      {onRemove && <button data-testid={`account-remove-${key}`} title={t("Remove")} aria-label={t("Remove")} onClick={onRemove} style={btn}>×</button>}
    </div>
  );
}
