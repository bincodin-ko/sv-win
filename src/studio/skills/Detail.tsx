// 5묶음 E7 S-2074·S-2075·S-2076·S-2081·S-2084: 상세 — 범위·부르는 법(+Copy)·호출 방식·모델·크기·허용 도구·곁 파일·점검 결과·본문, Edit·Duplicate·Delete, Run on an agent.
import { useEffect, useState } from "react";
import { t, useT } from "../../i18n";
import { registry } from "../../board/boards";
import { getSession } from "../../console/session";
import { typeAndSubmit } from "../../console/submit";
import { useShell } from "../../shell/useShell";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { NO_FINDINGS } from "./checkup";
import { NEED_AGENT, claudeConsoles, runText } from "./run";
import { badgeOf, btn, field, mono, type Row } from "./view";

const val = (r: Row, k: string): string | undefined => { const v = r.p.fields.find((f) => f[0] === k)?.[1]; return Array.isArray(v) ? v.join(", ") : v; };
const dot = { error: "var(--err-text)", warn: "var(--skill-warn)", info: "var(--text-dim)" } as const;
const lbl = { color: "var(--text-dim)", width: 118, flex: "none" } as const;
const line = (k: string, v: string, id?: string) => (
  <div style={{ display: "flex", gap: 8, padding: "2px 0" }}><span style={lbl}>{k}</span><span data-testid={id} style={{ minWidth: 0, overflowWrap: "anywhere" }}>{v}</span></div>
);

/** 이 에이전트 콘솔들 중 지금 실행 중인 Claude Code 콘솔 */
function targets(): { wsId: string; list: { id: string; name: string }[] } {
  const { activeRepo, openRepos } = useShell.getState();
  const wsId = openRepos.find((r) => r.path === activeRepo)?.activeWs ?? "";
  const nodes = registry.get(wsId)?.getState().nodes ?? {};
  return { wsId, list: claudeConsoles(nodes, (id) => !!getSession(wsId, id)?.isAgent()) };
}

function RunBox({ r }: { r: Row }) {
  useT();
  const [args, setArgs] = useState("");
  const [msg, setMsg] = useState("");
  const [menu, setMenu] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => { setMsg(""); setMenu(null); setArgs(""); }, [r.id]);
  const send = async (wsId: string, tg: { id: string; name: string }) => {
    const s = getSession(wsId, tg.id);
    if (!s) return setMsg(t(NEED_AGENT));
    setMenu(null);
    await typeAndSubmit(s, runText(r.e.plugin, r.p.name, args));
    setMsg(t("Sent to {name}.", { name: tg.name }));
  };
  const run = () => {
    const { wsId, list } = targets();
    if (list.length === 0) { setMenu(null); return setMsg(t(NEED_AGENT)); }
    if (list.length === 1) return void send(wsId, list[0]!);
    setMsg(""); setMenu(list);
  };
  return (
    <div style={{ borderTop: "1px solid var(--studio-line)", paddingTop: 12, marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
        <textarea data-testid="skill-run-args" rows={1} value={args} onChange={(e) => setArgs(e.target.value)} placeholder={val(r, "argument-hint") ?? t("Arguments (optional)")} style={{ ...field, flex: 1, resize: "vertical" }} />
        <button data-testid="skill-run" style={btn} onClick={run}>{t("Run on an agent")}</button>
      </div>
      {menu && (
        <div role="menu" style={{ marginTop: 6, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          {menu.map((t) => <button key={t.id} role="menuitem" data-testid="skill-run-target" style={btn} onClick={() => void send(targets().wsId, t)}>{t.name}</button>)}
        </div>
      )}
      {msg && <div data-testid="skill-run-msg" style={{ marginTop: 6, color: "var(--text-dim)" }}>{msg}</div>}
    </div>
  );
}

interface Props { r: Row; hasRepo: boolean; onEdit: () => void; onDuplicate: (scope: "personal" | "project") => void; onDelete: () => void }

export default function Detail({ r, hasRepo, onEdit, onDuplicate, onDelete }: Props) {
  useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [r.id]);
  const plugin = r.e.scope === "plugin";
  const invoke = `${r.e.plugin ? `${r.e.plugin}:` : ""}${r.p.name}`;
  const hint = val(r, "argument-hint");
  const copy = () => { void navigator.clipboard?.writeText(`/${invoke}`).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const manual = val(r, "disable-model-invocation")?.toLowerCase() === "true";
  const model = val(r, "model"), tools = val(r, "allowed-tools");
  const del = async () => {
    if (await confirmDialog({ title: t("Delete skill?"), message: t('Move "{name}" to the Trash?', { name: r.p.name }), confirmLabel: t("Delete"), danger: true })) onDelete();
  };
  return (
    <div data-testid="skill-detail" style={{ padding: "14px 18px", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{r.p.name}</div>
        <span style={{ fontSize: 11, color: "var(--text-dim)", border: "1px solid var(--bd-3)", borderRadius: 4, padding: "0 5px" }}>{badgeOf(r.e)}</span>
        <div style={{ flex: 1 }} />
        {!plugin && <button data-testid="skill-edit" style={btn} onClick={onEdit}>{t("Edit")}</button>}
        <button data-testid="skill-dup-personal" style={btn} onClick={() => onDuplicate("personal")}>{t("Duplicate to Personal")}</button>
        <button data-testid="skill-dup-project" style={btn} disabled={!hasRepo} onClick={() => onDuplicate("project")}>{t("Duplicate to Project")}</button>
        {!plugin && <button data-testid="skill-delete" style={btn} onClick={() => void del()}>{t("Delete")}</button>}
      </div>
      {r.p.description && <p style={{ color: "var(--fg-3)", margin: "8px 0" }}>{r.p.description}</p>}
      {r.loser && <div data-testid="skill-collide" style={{ color: "var(--skill-warn)", margin: "6px 0" }}>{r.loser}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0" }}>
        <span style={lbl}>{t("Invoke")}</span>
        <code data-testid="skill-invoke" style={{ ...mono, background: "var(--skill-code-bg)", padding: "2px 8px", borderRadius: 4 }}>{`/${invoke}${hint ? ` ${hint}` : ""}`}</code>
        <button data-testid="skill-copy" style={btn} onClick={copy}>{copied ? t("Copied") : t("Copy")}</button>
      </div>
      {line(t("Calling"), manual ? t("Manual only") : t("Claude can call it on its own"), "skill-mode")}
      {val(r, "context") === "fork" && line(t("Context"), t("Runs in a subagent"))}
      {model && line(t("Model"), model)}
      {line(t("Size"), t("~{n} tokens", { n: Math.ceil(r.e.raw.length / 4) }), "skill-tokens")}
      {tools && line(t("Allowed tools"), tools)}
      {r.e.sideFiles.length > 0 && line(t("Files"), r.e.sideFiles.join(", "))}
      <div style={{ margin: "12px 0 4px", fontWeight: 600 }}>{t("Checkup")}</div>
      <div data-testid="skill-findings">
        {r.findings.length === 0 ? <div style={{ color: "var(--text-dim)" }}>{t(NO_FINDINGS)}</div> : r.findings.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "2px 0" }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: dot[f.level], flex: "none" }} />
            <span style={{ color: "var(--text-dim)", width: 90, flex: "none" }}>{f.field}</span>
            <span>{f.text}</span>
          </div>
        ))}
      </div>
      <pre data-testid="skill-body" style={{ ...mono, margin: "12px 0 0", padding: 10, maxHeight: 280, overflow: "auto", background: "var(--skill-code-bg)", borderRadius: 6, whiteSpace: "pre-wrap" }}>{r.p.body}</pre>
      <RunBox r={r} />
    </div>
  );
}
