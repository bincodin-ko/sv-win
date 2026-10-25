// D12 S-1620~S-1624·S-1630·S-1631: usage popover 의 accounts 뷰(Claude Code·Codex 프로필 목록 + Connect)
import { useEffect, useState } from "react";
import type { ProfileAgent } from "../lib/ipc";
import { tm, useT } from "../i18n";
import { useSettings } from "../settings/useSettings";
import ConnectBox from "../profiles/ConnectBox";
import ProfileRow from "../profiles/ProfileRow";
import { accountRows } from "../profiles/profiles";
import { placeConsole, setUse, useProfiles } from "../profiles/useProfiles";

export const KEYCHAIN_WARNING =
  tm("On this PC, Claude Code may keep its sign-in in Windows Credential Manager, which profiles can't fully isolate yet. After switching, verify the account with /status inside the console.");

export default function AccountsView({ agent }: { agent: ProfileAgent }) {
  const t = useT();
  const { list, signed } = useProfiles();
  const use = useSettings((s) => (s.s.profileUse as Record<string, string | null | undefined> | undefined)?.[agent]);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => void useProfiles.getState().load(), []);
  const rows = accountRows(list, agent, use, signed);
  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await useProfiles.getState().remove(agent, removing.id);
      setErr("");
    } catch (e) {
      setErr(String(e));
    }
    setRemoving(null);
  };
  return (
    <div data-testid="accounts-view" style={{ display: "grid", gap: 10 }}>
      {agent === "claude" && (
        <div data-testid="accounts-warning" style={{ padding: "8px 10px", border: "1px solid var(--usage-amber)", borderRadius: 8, color: "var(--usage-amber)", fontSize: 12 }}>{t(KEYCHAIN_WARNING)}</div>
      )}
      {rows.map((r) => (
        <ProfileRow key={r.id ?? "default"} row={r} onUse={() => setUse(agent, r.id)}
          onConsole={r.id ? () => placeConsole(agent, r.id) : undefined}
          onRename={r.id ? (n) => useProfiles.getState().rename(agent, r.id!, n) : undefined}
          onRemove={r.id ? () => setRemoving({ id: r.id!, name: r.name }) : undefined} />
      ))}
      {removing && (
        <div data-testid="account-remove-confirm" role="alertdialog" style={{ padding: 10, border: "1px solid var(--usage-red)", borderRadius: 8, display: "grid", gap: 8 }}>
          <div>{t("Remove {name}? Its saved sign-in is deleted for good; settings and conversation history move to the Recycle Bin.", { name: removing.name })}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button data-testid="account-remove-cancel" onClick={() => setRemoving(null)} style={{ padding: "4px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel-2)", color: "var(--text)", cursor: "pointer" }}>{t("Cancel")}</button>
            <button data-testid="account-remove-ok" onClick={() => void confirmRemove()} style={{ padding: "4px 12px", border: 0, borderRadius: 6, background: "var(--usage-red)", color: "var(--on-fill)", cursor: "pointer" }}>{t("Remove")}</button>
          </div>
        </div>
      )}
      {err && <div data-testid="accounts-error" style={{ color: "var(--usage-red)", fontSize: 11 }}>{err}</div>}
      <ConnectBox agent={agent} />
      <div data-testid="accounts-terms" style={{ color: "var(--text-dim)", fontSize: 11 }}>{t("Whether you may hold several accounts is up to each provider. Symvibe never pools or rotates accounts.")}</div>
    </div>
  );
}
