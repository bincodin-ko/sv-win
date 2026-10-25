// D13 S-1380~S-1388: Scan repo 시작·진행·결과 화면, 그리고 행 Refresh 결과 줄 (S-1361·S-1386)
import { AGENTS, cancelRefresh, cancelScan, addSelected, discardScan, openAgentConsole, resolveRefresh, startScan } from "./scan";
import { kindVar } from "./facts";
import { QUALITY_COUNT, type Quality } from "./prompts";
import { useScan } from "./useScan";
import { tm, useT } from "../i18n";
import { useSettings } from "../settings/useSettings";

const btn = (primary = false): React.CSSProperties => ({ cursor: "pointer", padding: "5px 14px", borderRadius: 8, border: primary ? 0 : "1px solid var(--bd)", background: primary ? "var(--accent)" : "none", color: primary ? "var(--accent-text)" : "var(--text)", font: "600 13px system-ui" });
const pill = (on: boolean): React.CSSProperties => ({ cursor: "pointer", padding: "4px 12px", borderRadius: 999, border: `1px solid ${on ? "var(--accent)" : "var(--bd)"}`, background: on ? "var(--panel-2)" : "none", color: on ? "var(--accent)" : "var(--text-dim)", font: "12px system-ui" });
const lab: React.CSSProperties = { color: "var(--text-dim)", fontSize: 11, letterSpacing: 0.5, margin: "14px 0 6px" };
const dim: React.CSSProperties = { color: "var(--text-dim)", fontSize: 12 };
const nameOf = (id: string) => AGENTS.find((a) => a.id === id)?.name ?? id;
const QUALITIES: [Quality, string][] = [["quick", tm("Quick")], ["balanced", tm("Balanced")], ["thorough", tm("Thorough")]];
const STEPS = [["launch", tm("Launch")], ["read", tm("Read the repo")], ["write", tm("Write facts")]] as const;

export default function ScanFlow() {
  const t = useT();
  const s = useScan();
  const agent = s.agents.find((a) => a.id === s.agent);
  const plan = agent && <div data-testid="scan-plan" style={{ ...dim, marginTop: 12 }}>{t("Uses a turn on your {name} plan.", { name: agent.name })}</div>;

  if (s.stage === "start") {
    return (
      <div data-testid="scan-flow">
        <b style={{ fontSize: 14 }}>{t("Scan repo")}</b>
        <div style={dim}>{t("An agent reads the repository and proposes facts. It changes nothing in your files.")}</div>
        <div style={lab}>{t("AGENT")}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {s.agents.map((a) => (
            <button key={a.id} data-testid={`scan-agent-${a.id}`} aria-pressed={s.agent === a.id} onClick={() => { useScan.setState({ agent: a.id }); useSettings.getState().patch({ memoryAgent: a.id }); }} style={pill(s.agent === a.id)}>{a.label}</button>
          ))}
          {!s.agents.length && <span data-testid="scan-install-hint" style={dim}>{t("Install Claude Code or Codex")}</span>}
        </div>
        <div style={lab}>{t("QUALITY")}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {QUALITIES.map(([q, name]) => (
            <button key={q} data-testid={`scan-quality-${q}`} aria-pressed={s.quality === q} title={t("about {n} facts", { n: QUALITY_COUNT[q] })} onClick={() => useScan.setState({ quality: q })} style={pill(s.quality === q)}>{t(name)}</button>
          ))}
        </div>
        <div data-testid="scan-hint" style={{ ...dim, marginTop: 8 }}>{t("Proposes about 6 to 14 facts. Nothing is saved until you choose Add to memory.")}</div>
        {plan}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button data-testid="scan-go" disabled={!agent} onClick={() => void startScan()} style={{ ...btn(true), opacity: agent ? 1 : 0.4 }}>{agent ? t("Scan with {label}", { label: agent.label }) : t("Scan")}</button>
          <button data-testid="scan-back" onClick={discardScan} style={btn()}>{t("Cancel")}</button>
        </div>
      </div>
    );
  }

  if (s.stage === "running") {
    return (
      <div data-testid="scan-flow">
        <b style={{ fontSize: 14 }}>{t("Scanning with {name}", { name: agent?.name ?? "" })}</b>
        <ol style={{ listStyle: "none", padding: 0, margin: "12px 0" }}>
          {STEPS.map(([id, name], i) => {
            const st = i < s.phase ? "done" : i === s.phase ? "active" : "todo";
            return (
              <li key={id} data-testid={`scan-phase-${id}`} data-state={st} style={{ padding: "3px 0", color: st === "todo" ? "var(--text-dim)" : "var(--text)", fontWeight: st === "active" ? 700 : 400 }}>
                {st === "done" ? "✓" : st === "active" ? "…" : "○"} {t(name)}
              </li>
            );
          })}
        </ol>
        {plan}
        <div style={{ marginTop: 16 }}><button data-testid="scan-cancel" onClick={cancelScan} style={btn()}>{t("Cancel")}</button></div>
      </div>
    );
  }

  if (s.stage === "review") {
    const n = s.rows.filter((r) => r.checked).length;
    const toggle = (i: number, checked: boolean) => useScan.setState({ rows: s.rows.map((r, j) => (j === i ? { ...r, checked } : r)) });
    return (
      <div data-testid="scan-flow">
        <div style={lab}>{t("REVIEW PROPOSALS")}</div>
        {s.rows.map((r, i) => (
          <label key={i} data-testid="scan-proposal" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", border: "1px solid var(--bd)", borderRadius: 8, marginBottom: 6, cursor: "pointer" }}>
            <input data-testid="scan-check" type="checkbox" checked={r.checked} onChange={(e) => toggle(i, e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ flex: "none", fontSize: 11, fontWeight: 700, color: `var(${kindVar(r.kind)})`, minWidth: 84, marginTop: 2 }}>{t(r.kind)}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{r.title}</b>
              {r.dup && <span data-testid="scan-dup" style={{ ...dim, marginLeft: 8 }}>{t("already in memory")}</span>}
              <div style={{ ...dim, whiteSpace: "pre-wrap" }}>{r.body}</div>
            </span>
          </label>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button data-testid="scan-discard" onClick={discardScan} style={btn()}>{t("Discard")}</button>
          <span style={{ flex: 1 }} />
          <button data-testid="scan-add" disabled={!n} onClick={() => void addSelected()} style={{ ...btn(true), opacity: n ? 1 : 0.4 }}>{t("Add {n} to memory", { n })}</button>
        </div>
      </div>
    );
  }

  if (s.stage === "error" && s.error) {
    return (
      <div data-testid="scan-flow">
        <div data-testid="scan-error" style={{ color: "var(--danger)", marginBottom: 12 }}>{s.error.text}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {s.error.kind === "blocked" && s.error.agent && <button data-testid="scan-open-console" onClick={() => openAgentConsole(s.error!.agent!)} style={btn(true)}>{t("Open console")}</button>}
          <button data-testid="scan-retry" onClick={() => useScan.setState({ stage: "start", error: null })} style={btn()}>{t("Back")}</button>
        </div>
      </div>
    );
  }
  return null;
}

/** 행 Refresh 한 번의 진행·결과 줄 (S-1386). 패널 목록 위에 놓인다 */
export function RefreshNote({ repo }: { repo: string }) {
  const t = useT();
  const r = useScan((s) => s.refresh);
  if (!r) return null;
  const box: React.CSSProperties = { border: "1px solid var(--bd)", borderRadius: 8, padding: "8px 10px", marginBottom: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
  const title = <b style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</b>;
  return (
    <div data-testid="refresh-note" style={box}>
      {title}
      {r.status === "running" && <><span data-testid="refresh-running" style={dim}>{t("Checking against the repo…")} {t("Uses a turn on your {name} plan.", { name: r.agent ? nameOf(r.agent) : t("agent") })}</span><span style={{ flex: 1 }} /><button data-testid="refresh-cancel" onClick={cancelRefresh} style={btn()}>{t("Cancel")}</button></>}
      {r.status === "ok" && <><span>{t("Still accurate")}</span><span style={{ flex: 1 }} /><button data-testid="refresh-keep" onClick={() => void resolveRefresh(repo, "keep")} style={btn()}>{t("OK")}</button></>}
      {r.status === "changed" && <><span style={dim}>{t("Suggested text")}</span><div style={{ flexBasis: "100%", whiteSpace: "pre-wrap" }}>{r.body}</div><span style={{ flex: 1 }} /><button data-testid="refresh-keep" onClick={() => void resolveRefresh(repo, "keep")} style={btn()}>{t("Keep")}</button><button data-testid="refresh-update" onClick={() => void resolveRefresh(repo, "update")} style={btn(true)}>{t("Update")}</button></>}
      {r.status === "gone" && <><span>{t("No longer true")}</span><span style={{ flex: 1 }} /><button data-testid="refresh-keep" onClick={() => void resolveRefresh(repo, "keep")} style={btn()}>{t("Keep")}</button><button data-testid="refresh-delete" onClick={() => void resolveRefresh(repo, "delete")} style={btn(true)}>{t("Delete")}</button></>}
      {r.status === "error" && <><span style={{ color: "var(--danger)" }}>{r.text}</span><span style={{ flex: 1 }} /><button data-testid="refresh-keep" onClick={() => void resolveRefresh(repo, "keep")} style={btn()}>{t("OK")}</button></>}
    </div>
  );
}
