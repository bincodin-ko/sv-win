import { useEffect, useState } from "react";
import { agentsList } from "../agents/api";
import { useUi } from "../ui/useUi";
import { useT } from "../i18n";
import { useBoardStore } from "./BoardScope";

const btn: React.CSSProperties = { pointerEvents: "auto", background: "var(--surface)", color: "var(--fg-2)", border: "1px solid var(--bd)", borderRadius: 8, padding: "6px 14px", font: "13px system-ui", cursor: "pointer" };

// S-012: 노드가 없을 때 가운데 안내. 최근 에이전트 ≤3 + Spawn an agent(무장된 에이전트)
export default function EmptyBoard() {
  const t = useT();
  const useBoard = useBoardStore();
  const recent = useBoard((s) => s.recentAgents);
  const armed = useBoard((s) => s.armedAgent);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => void agentsList().then((l) => setNames(Object.fromEntries(l.map((a) => [a.id, a.name])))), []);
  const spawn = (id: string) => useBoard.getState().spawnAgent(id);
  return (
    <div data-testid="empty-board" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, pointerEvents: "none", color: "var(--mute)", font: "14px system-ui" }}>
      <div>{t("This board is empty")}</div>
      {recent.length > 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          {recent.map((id) => <button key={id} data-recent={id} style={btn} onClick={() => spawn(id)}>{names[id] ?? id}</button>)}
        </div>
      )}
      <button style={btn} onClick={() => spawn(armed ?? "shell")}>{t("Spawn an agent")}</button>
      <div style={{ display: "flex", gap: 8 }}>
        {[2, 4, 8].map((n) => <button key={n} style={btn} onClick={() => useBoard.getState().spawnMany(Array(n).fill(armed ?? "shell"))}>{t("Spawn {n}", { n })}</button>)}
      </div>
      <button style={btn} onClick={() => useUi.setState({ presetsOpen: true })}>{t("Start from a preset")}</button>
    </div>
  );
}
