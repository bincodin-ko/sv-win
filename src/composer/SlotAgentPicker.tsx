import { useState } from "react";
import type { AgentInfo } from "../agents/api";
import AgentPicker from "../console/AgentPicker";
import { cycleAgent } from "./slots";

/** 순환 목록(S-523): 내장(Shell 빼고) → Shell → 내 에이전트 */
export const cycleList = (agents: AgentInfo[]): string[] => [
  ...agents.filter((a) => a.builtin && a.id !== "shell"),
  ...agents.filter((a) => a.id === "shell"),
  ...agents.filter((a) => a.section === "yours"),
].map((a) => a.id);

export const Logo = ({ name }: { name: string }) => (
  <span aria-hidden style={{ width: 20, height: 20, borderRadius: 10, background: "var(--surface-2)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{name.charAt(0)}</span>
);

/** 슬롯 하나(preset 레인도 씀, B14): 클릭 = 다음 에이전트, 우클릭 = 전체 카탈로그(S-523). 설치 안 된 것도 허용(S-528) */
export default function SlotAgentPicker({ agent, agents, onChange }: { agent: string; agents: AgentInfo[]; onChange: (id: string) => void }) {
  const [menu, setMenu] = useState(false);
  const name = agents.find((a) => a.id === agent)?.name ?? agent;
  return (
    <div style={{ position: "relative" }}>
      <button data-testid="slot" data-agent={agent} onClick={() => onChange(cycleAgent(cycleList(agents), agent))}
        onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
        style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 10px", border: "1px solid var(--bd)", borderRadius: 8, background: "var(--surface-2)", color: "var(--fg-2)", font: "12px system-ui", cursor: "pointer" }}>
        <Logo name={name} />{name}
      </button>
      {menu && <AgentPicker current={agent} onPick={(id) => { onChange(id); setMenu(false); }} onClose={() => setMenu(false)} />}
    </div>
  );
}
