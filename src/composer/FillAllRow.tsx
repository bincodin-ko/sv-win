import { useState } from "react";
import type { AgentInfo } from "../agents/api";
import AgentPicker from "../console/AgentPicker";
import { Logo, cycleList } from "./SlotAgentPicker";
import { useT } from "../i18n";

/** Fill all: 로고를 누르면 모든 슬롯이 그 에이전트, + 는 카탈로그에서 골라 채운다(S-524) */
export default function FillAllRow({ agents, onFill }: { agents: AgentInfo[]; onFill: (id: string) => void }) {
  const t = useT();
  const [menu, setMenu] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, font: "12px system-ui", color: "var(--mute)" }}>
      <span>{t("Fill all")}</span>
      {cycleList(agents).map((id) => {
        const name = agents.find((a) => a.id === id)?.name ?? id;
        return <button key={id} data-testid="fill-all-agent" data-agent={id} title={name} onClick={() => onFill(id)} style={{ border: 0, background: "none", color: "var(--fg-2)", cursor: "pointer", padding: 0 }}><Logo name={name} /></button>;
      })}
      <div style={{ position: "relative" }}>
        <button data-testid="fill-all-more" title={t("More agents")} onClick={() => setMenu(true)} style={{ border: "1px solid var(--bd)", borderRadius: 10, width: 20, height: 20, background: "none", color: "var(--fg-2)", cursor: "pointer", padding: 0 }}>+</button>
        {menu && <AgentPicker current="" onPick={(id) => { onFill(id); setMenu(false); }} onClose={() => setMenu(false)} />}
      </div>
    </div>
  );
}
