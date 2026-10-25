import { useEffect, useRef, useState } from "react";
import { agentsList, type AgentInfo } from "../../agents/api";
import { noteCatalogPick } from "../../agents/custom";
import { TITLES } from "../../console/AgentPicker";
import { Item, menuBox, useEscClose, useMenuKeys } from "../menus/menuKit";
import { useBoardStore } from "../BoardScope";
import { useT } from "../../i18n";

// S-042: 무장 → 내 에이전트 ≤3 → 설치된 내장 ≤5 → Shell → All agents(3구역). 행을 고르면 그 에이전트가 무장된다
export default function SpawnFlyout({ onClose }: { onClose: () => void }) {
  const t = useT();
  const useBoard = useBoardStore();
  const [list, setList] = useState<AgentInfo[]>([]);
  const [all, setAll] = useState(false);
  const armed = useBoard((s) => s.armedAgent);
  const setArmed = useBoard((s) => s.setArmed);
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref, list); // 목록이 오면 첫 항목으로 다시 포커스. useEscClose 보다 먼저(U3 NodeMenu 주석 참고)
  useEscClose(onClose);
  useEffect(() => void agentsList().then(setList), []);

  const pick = (id: string) => { setArmed(id); onClose(); };
  const row = (a: AgentInfo, isArmed = false) => (
    <Item key={a.id} label={a.name} data-agent-id={a.id} data-armed={isArmed ? "true" : undefined} extra={isArmed ? "✓" : undefined}
      style={a.installed ? undefined : { color: "var(--mute)" }} onClick={() => { void noteCatalogPick(a); pick(a.id); }} />
  );
  const top = list.find((a) => a.id === armed);
  const rest = list.filter((a) => a.id !== armed);
  const shell = rest.find((a) => a.id === "shell");
  const sections = Object.keys(TITLES) as (keyof typeof TITLES)[];
  return (
    <div ref={ref} data-testid="spawn-flyout" role="menu" aria-label={t("Spawn agent")} onPointerDown={(e) => e.stopPropagation()}
      style={{ ...menuBox, left: "calc(100% + 10px)", top: 40, minWidth: 190 }}>
      {top && row(top, true)}
      {rest.filter((a) => a.section === "yours").slice(0, 3).map((a) => row(a))}
      {rest.filter((a) => a.builtin && a.installed && a.id !== "shell").slice(0, 5).map((a) => row(a))}
      {shell && row(shell)}
      <Item label="All agents" extra="›" onClick={() => setAll((v) => !v)} />
      {all && (
        <div data-testid="all-agents" style={{ borderTop: "1px solid var(--bd)", marginTop: 4, maxHeight: 320, overflow: "auto" }}>
          {sections.map((sec) => {
            const items = rest.filter((a) => a.section === sec);
            return (
              <div key={sec}>
                <div data-section style={{ padding: "4px 8px", color: "var(--mute)", fontSize: 11 }}>{t(TITLES[sec])}</div>
                {items.length ? items.map((a) => row(a)) : <div style={{ padding: "2px 8px", color: "var(--mute-3)" }}>{t("None")}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
