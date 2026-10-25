import { useEffect, useState } from "react";
import { agentsList, defaultAgent, type AgentInfo } from "../agents/api";
import { useBoardStore } from "../board/BoardScope";
import { useUi } from "../ui/useUi";
import GroupComposer from "./GroupComposer";
import { spawnTeam } from "./spawnTeam";

// useUi.composer 가 열려 있으면 그린다(S-520). 에이전트 목록·기본 에이전트가 읽힌 뒤에 나타난다
export default function ComposerHost() {
  const c = useUi((s) => s.composer);
  const store = useBoardStore();
  const [data, setData] = useState<{ agents: AgentInfo[]; def: string } | null>(null);
  useEffect(() => {
    if (!c.open) return setData(null);
    let live = true;
    void Promise.all([agentsList(), defaultAgent()]).then(([agents, def]) => live && setData({ agents, def }));
    return () => { live = false; };
  }, [c.open]);
  if (!c.open || !data) return null;
  const close = () => useUi.getState().closeComposer();
  return (
    <GroupComposer n={c.slots.length || 6} at={c.at} agents={data.agents} defaultAgent={data.def} onClose={close}
      onSpawn={(t) => { spawnTeam(t, store, c.world); close(); }} />
  );
}
