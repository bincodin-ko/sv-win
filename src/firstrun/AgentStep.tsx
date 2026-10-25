// S-397: ③ Choose your default agent — 이 PC에서 찾은 것이 먼저(agentsList 의 구역 순서), Yolo 체크(꺼짐)
import type { AgentInfo } from "../agents/api";
import { TITLES } from "../console/AgentPicker";
import { useSettings } from "../settings/useSettings";
import { useT } from "../i18n";

export default function AgentStep({ list, sel, onSel }: { list: AgentInfo[]; sel: string; onSel: (id: string) => void }) {
  const t = useT();
  const yolo = useSettings((s) => s.s.yolo) === true;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{t("Choose your default agent")}</div>
      <div style={{ display: "grid", gap: 2, maxHeight: 220, overflow: "auto" }}>
        {(Object.keys(TITLES) as (keyof typeof TITLES)[]).map((sec) => {
          const items = list.filter((a) => a.section === sec);
          return items.length === 0 ? null : (
            <div key={sec}>
              <div style={{ padding: "4px 0", color: "var(--text-dim)", fontSize: 11 }}>{t(TITLES[sec])}</div>
              {items.map((a) => (
                <button key={a.id} data-agent-id={a.id} data-testid={`fr-agent-${a.id}`} aria-pressed={a.id === sel} onClick={() => onSel(a.id)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", border: 0, borderRadius: 6, background: a.id === sel ? "var(--border)" : "none", color: a.installed ? "inherit" : "var(--text-dim)", font: "inherit", cursor: "pointer" }}>
                  {a.name}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <label style={{ display: "flex", gap: 8 }}>
        <input data-testid="fr-yolo" type="checkbox" checked={yolo} onChange={(e) => useSettings.getState().patch({ yolo: e.target.checked })} />
        {t("Yolo: skip permission prompts")}
      </label>
    </div>
  );
}
