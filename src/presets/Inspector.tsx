// B14 inspector: 고른 preset 의 레인 목록. 레인 클릭 = 에이전트 순환, 우클릭 = 전체 카탈로그(S-646), Fill every lane with…(S-645)
import type { AgentInfo } from "../agents/api";
import SlotAgentPicker, { Logo, cycleList } from "../composer/SlotAgentPicker";
import type { PresetDef } from "./defs";
import { fillEvery, laneAgents } from "./ui";
import { useT } from "../i18n";

export default function Inspector({ def, agents, defaultAgent, overrides, onChange }: { def: PresetDef | null; agents: AgentInfo[]; defaultAgent: string; overrides: Record<number, string>; onChange: (o: Record<number, string>) => void }) {
  const t = useT();
  if (!def) return <div data-testid="preset-inspector" style={{ color: "var(--text-dim)", font: "13px system-ui" }}>{t("Pick a preset to see its lanes.")}</div>;
  const cur = laneAgents(def, overrides, defaultAgent);
  return (
    <div data-testid="preset-inspector" style={{ display: "grid", gap: 8, alignContent: "start", font: "13px system-ui" }}>
      <div style={{ fontWeight: 600 }}>{t(def.name)}</div>
      {def.lanes.map((l, i) => (
        <div key={i} style={{ display: "grid", gap: 4 }}>
          <div style={{ color: "var(--text-dim)", fontSize: 12 }}>{l.group} · {l.count}</div>
          <SlotAgentPicker agent={cur[i]!} agents={agents} onChange={(id) => onChange({ ...overrides, [i]: id })} />
        </div>
      ))}
      <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>{t("Fill every lane with…")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {cycleList(agents).map((id) => {
          const name = agents.find((a) => a.id === id)?.name ?? id;
          return (
            <button key={id} data-testid="fill-lane-agent" data-agent={id} title={name} aria-label={t("Fill every lane with {name}", { name })} onClick={() => onChange(fillEvery(def, id))}
              style={{ all: "unset", cursor: "pointer", padding: 2, borderRadius: 12 }}><Logo name={name} /></button>
          );
        })}
      </div>
    </div>
  );
}
