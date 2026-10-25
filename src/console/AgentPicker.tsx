import { useEffect, useState } from "react";
import { agentsList, type AgentInfo } from "../agents/api";
import { noteCatalogPick } from "../agents/custom";
import { t, useT } from "../i18n";
import { useProfiles } from "../profiles/useProfiles";

// 구역 제목: 읽을 때 번역(getter) — SpawnFlyout·AgentStep·Agents 가 그대로 쓴다
export const TITLES = {
  get detected() { return t("Detected on your system"); },
  get yours() { return t("Your agents"); },
  get notInstalled() { return t("Not installed yet"); },
};

// S-069 에이전트 뱃지를 누르면 열리는 목록(내장 + Shell + 내 에이전트, 3구역). 고르면 onPick(agentId).
export default function AgentPicker({ current, profile, onPick, onAccount, onClose }: { current: string; profile?: string; onPick: (id: string) => void; onAccount?: (id: string | null) => void; onClose: () => void }) {
  const t = useT();
  const [list, setList] = useState<AgentInfo[]>([]);
  const accounts = useProfiles((s) => s.list).filter((p) => p.agent === current);
  useEffect(() => {
    void agentsList().then(setList);
    void useProfiles.getState().load();
  }, []);
  const acct = (id: string | null, name: string) => (
    <button key={id ?? "default"} data-testid={`account-item-${id ?? "default"}`} data-checked={(profile ?? null) === id} onClick={() => onAccount?.(id)}
      style={{ display: "block", width: "100%", textAlign: "left", padding: "4px 8px", border: 0, borderRadius: 4, background: (profile ?? null) === id ? "var(--surface-2)" : "none", color: "inherit", font: "inherit", cursor: "pointer" }}>
      {(profile ?? null) === id ? "✓ " : ""}{name}
    </button>
  );
  return (
    <div data-testid="agent-picker" style={{ position: "absolute", top: "100%", left: 0, zIndex: 10, minWidth: 200, background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 8, padding: 4, font: "12px system-ui", color: "var(--fg-2)" }}
      onPointerDown={(e) => e.stopPropagation()} onMouseLeave={onClose}>
      {(["detected", "yours", "notInstalled"] as const).map((sec) => {
        const items = list.filter((a) => a.section === sec);
        return items.length === 0 ? null : (
          <div key={sec}>
            <div style={{ padding: "4px 8px", color: "var(--mute)", fontSize: 11 }}>{t(TITLES[sec])}</div>
            {items.map((a) => (
              <button key={a.id} data-agent-id={a.id} onClick={() => { void noteCatalogPick(a); onPick(a.id); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "4px 8px", border: 0, borderRadius: 4, background: a.id === current ? "var(--surface-2)" : "none", color: a.installed ? "inherit" : "var(--mute)", font: "inherit", cursor: "pointer" }}>
                {a.name}
              </button>
            ))}
          </div>
        );
      })}
      {onAccount && accounts.length > 0 && (current === "claude" || current === "codex") && (
        <div data-testid="account-section">
          <div style={{ padding: "4px 8px", color: "var(--mute)", fontSize: 11 }}>{t("ACCOUNT")}</div>
          {acct(null, t("Your sign-in"))}
          {accounts.map((p) => acct(p.id, p.name))}
        </div>
      )}
    </div>
  );
}
