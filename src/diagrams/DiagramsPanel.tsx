// E3 S-2021~S-2024: Diagrams 패널(flyout). 위에서 아래: MODEL · STYLE · FROM YOUR PROJECT · 입력 · STARTER SHAPES
import { useEffect, useState } from "react";
import { tm, useT } from "../i18n";
import { agentsList, type AgentInfo } from "../agents/api";
import { useScope } from "../board/BoardScope";
import { menuBox, useEscClose } from "../board/menus/menuKit";
import { useSettings } from "../settings/useSettings";
import { useShell } from "../shell/useShell";
import type { Effort } from "../studio/run";
import { DIAGRAM_TOPICS } from "./prompt";
import { agentName, canStart, startRun, useRun } from "./runner";
import { placeStarter, STARTERS } from "./starters";
import { useDiagramStyle } from "./style";

const AGENTS = ["claude", "codex"];
const EFFORTS: { id: Effort; label: string }[] = [{ id: "quick", label: tm("Quick") }, { id: "balanced", label: tm("Balanced") }, { id: "thorough", label: tm("Thorough") }];
const head: React.CSSProperties = { font: "600 10px system-ui", letterSpacing: 1, color: "var(--fg-3)", margin: "10px 0 4px" };
const chip = (on: boolean, off = false): React.CSSProperties => ({ padding: "4px 9px", border: "1px solid " + (on ? "var(--accent)" : "var(--bd)"), borderRadius: 14, background: on ? "var(--accent)" : "transparent", color: on ? "var(--accent-ink)" : "inherit", font: "12px system-ui", cursor: off ? "default" : "pointer", opacity: off ? 0.4 : 1 });
const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" };
const btn: React.CSSProperties = { padding: "5px 10px", border: "1px solid var(--bd)", borderRadius: 8, background: "var(--surface-2)", color: "inherit", font: "12px system-ui", cursor: "pointer" };

export default function DiagramsPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { wsId, store } = useScope();
  const repo = useShell((s) => s.activeRepo);
  const s = useSettings((x) => x.s), patch = useSettings((x) => x.patch);
  const style = useDiagramStyle((x) => x.style), setStyle = useDiagramStyle((x) => x.set);
  const running = useRun((r) => !!r.run && !r.run.error);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [text, setText] = useState("");
  useEscClose(onClose);
  useEffect(() => void agentsList().then(setAgents), []);
  const agentId = (s.diagramsAgent as string) ?? (AGENTS.includes(s.defaultAgent as string) ? (s.defaultAgent as string) : "claude"); // Documents 와 같은 기본
  const effort = ((s.diagramsEffort as Effort) ?? "balanced");
  const start = (subject: string) => {
    if (!canStart({ repo, running, subject })) return;
    store.getState().setTool("select");
    void startRun({ subject, agentId, effort, style, repo: repo!, wsId, store });
    setText("");
  };
  const starter = (id: (typeof STARTERS)[number]["id"]) => { placeStarter(store, id); store.getState().setTool("select"); };
  return (
    <div data-testid="diagrams-panel" role="group" aria-label={t("Diagrams")} onPointerDown={(e) => e.stopPropagation()}
      style={{ ...menuBox, left: "calc(100% + 10px)", top: 40, width: "var(--dia-panel-w)", padding: 12 }}>
      {!repo && <div data-testid="dia-need-repo" style={{ color: "var(--accent)", marginBottom: 6 }}>{t("Open a repo first.")}</div>}
      <div style={{ ...head, marginTop: 0 }}>{t("MODEL")}</div>
      <div style={row}>
        {AGENTS.map((id) => {
          const installed = agents.find((a) => a.id === id)?.installed ?? false;
          return <button key={id} data-testid={`dia-agent-${id}`} data-installed={installed} aria-pressed={agentId === id} disabled={!installed || running} style={chip(agentId === id, !installed)} onClick={() => patch({ diagramsAgent: id })}>{agentName(id)}</button>;
        })}
        <span style={{ flex: 1 }} />
        {EFFORTS.map((e) => <button key={e.id} data-testid={`dia-effort-${e.id}`} aria-pressed={effort === e.id} disabled={running} style={chip(effort === e.id)} onClick={() => patch({ diagramsEffort: e.id })}>{t(e.label)}</button>)}
      </div>
      <div style={head}>{t("STYLE")}</div>
      <div style={row}>
        {(["ink", "colorful"] as const).map((id) => <button key={id} data-testid={`dia-style-${id}`} aria-pressed={style === id} style={chip(style === id)} onClick={() => setStyle(id)}>{id === "ink" ? t("Ink") : t("Colorful")}</button>)}
      </div>
      <div style={head}>{t("FROM YOUR PROJECT")}</div>
      <div style={row}>
        {DIAGRAM_TOPICS.map((tp) => <button key={tp.id} data-testid={`dia-topic-${tp.id}`} disabled={!repo || running} style={{ ...btn, opacity: !repo || running ? 0.5 : 1 }} onClick={() => start(tp.id)}>{t(tp.label)}</button>)}
      </div>
      <div style={{ ...row, marginTop: 10, flexWrap: "nowrap" }}>
        <input data-testid="dia-input" value={text} disabled={!repo || running} placeholder={t("Describe a diagram…")} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); start(text); } }}
          style={{ flex: 1, minWidth: 0, padding: "5px 8px", border: "1px solid var(--bd)", borderRadius: 8, background: "var(--well)", color: "var(--fg)", font: "12px system-ui" }} />
        <button data-testid="dia-generate" disabled={!canStart({ repo, running, subject: text })} style={{ ...btn, background: "var(--accent)", color: "var(--accent-ink)", border: 0, opacity: canStart({ repo, running, subject: text }) ? 1 : 0.5 }} onClick={() => start(text)}>{t("Generate")}</button>
      </div>
      <div style={head}>{t("STARTER SHAPES")}</div>
      <div style={row}>
        {STARTERS.map((st) => <button key={st.id} data-testid={`dia-starter-${st.id}`} style={btn} onClick={() => starter(st.id)}>{t(st.label)}</button>)}
      </div>
    </div>
  );
}
