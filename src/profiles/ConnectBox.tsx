// D12 S-1623: CONNECT ANOTHER ACCOUNT — 이름 입력 + "+ Connect". 프로필을 만들고 그 환경의 콘솔을 보드에 놓는다(로그인은 사용자가)
import { useState } from "react";
import type { ProfileAgent } from "../lib/ipc";
import { placeConsole, useProfiles } from "./useProfiles";
import { useT } from "../i18n";

export default function ConnectBox({ agent }: { agent: ProfileAgent }) {
  const t = useT();
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const p = await useProfiles.getState().create(agent, name);
      setName("");
      setErr("");
      placeConsole(agent, p.id);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ color: "var(--text-dim)", font: "600 10px system-ui", letterSpacing: 0.8 }}>{t("CONNECT ANOTHER ACCOUNT")}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input data-testid="connect-name" value={name} maxLength={40} placeholder={t("e.g. Personal Max")} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.nativeEvent.isComposing) void go(); }}
          style={{ flex: 1, minWidth: 0, background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, font: "inherit", padding: "4px 8px" }} />
        <button data-testid="connect-btn" disabled={busy} onClick={() => void go()}
          style={{ border: "1px solid var(--accent)", borderRadius: 6, background: "var(--accent)", color: "var(--accent-text)", padding: "0 12px", cursor: "pointer", font: "12px system-ui" }}>{t("+ Connect")}</button>
      </div>
      {err && <div data-testid="connect-error" style={{ color: "var(--usage-red)", fontSize: 11 }}>{err}</div>}
      <div data-testid="accounts-worktree" style={{ color: "var(--text-dim)", fontSize: 11 }}>{t("If both accounts edit files, give each its own git worktree.")}</div>
    </div>
  );
}
