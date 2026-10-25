// E6 S-1970~S-1996: Documents 스튜디오. 왼쪽 = 에이전트 줄 · 노력 칩 · DOCUMENTS 목록 · ASK FOR ANYTHING, 오른쪽 = 진행 줄 · 버전 · 종이.
// 실행 상태는 useDocs(컴포넌트 밖)에 있어 스튜디오를 닫아도 계속된다(S-1994).
import { useEffect, useMemo, useState } from "react";
import { t, useT } from "../../i18n";
import { agentsList, defaultAgent } from "../../agents/api";
import { placeNew } from "../../board/kinds/registry";
import { getStore } from "../../board/boards";
import { exportMarkdown, copyMarkdown } from "../../pdf/exportText";
import { useSettings } from "../../settings/useSettings";
import { useShell } from "../../shell/useShell";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { useUi } from "../../ui/useUi";
import type { Effort } from "../run";
import StudioFrame from "../StudioFrame";
import { closeStudioRequest, studioTitle } from "../useStudio";
import DocList from "./DocList";
import EffortChips from "./EffortChips";
import { useExporter } from "./exporter";
import { Flow, Pages, Skeleton } from "./Preview";
import { DOCS } from "./prompts";
import Toolbar from "./Toolbar";
import { BUSY, dismissNotice, EMPTY, loadVersions, removeVersion, select, showVersion, startRun, stopRun, useDocs } from "./useDocs";
import Versions from "./Versions";
import { agentName, agentRow, fmtDate, fmtElapsed, repoName, type AgentRow } from "./titles";

const EFFORTS: Effort[] = ["quick", "balanced", "thorough"];
const band = (c: string): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", font: "12px system-ui", borderBottom: "1px solid var(--studio-line)", color: c });
const plainBtn: React.CSSProperties = { border: "1px solid var(--studio-line)", background: "transparent", color: "var(--text)", borderRadius: 6, padding: "3px 10px", font: "12px system-ui", cursor: "pointer" };

export default function DocumentsStudio({ arg }: { arg?: string }) {
  useT();
  const repo = useShell((s) => s.activeRepo) ?? "";
  const st = useDocs((s) => s.repos[repo]) ?? EMPTY;
  const settings = useSettings((s) => s.s);
  const [agents, setAgents] = useState<AgentRow[]>(agentRow([], "claude"));
  const [mode, setMode] = useState<"flow" | "pages">("flow");
  const [pagesOff, setPagesOff] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const exp = useExporter();
  const { run, view, versions } = st;

  useEffect(() => {
    let dead = false;
    Promise.all([agentsList().catch(() => []), defaultAgent().catch(() => "claude")]).then(([l, d]) => !dead && setAgents(agentRow(l, d)));
    void loadVersions(repo).then(() => {
      if (dead || !arg) return;
      if (arg === "ask" || DOCS.some((d) => d.id === arg)) select(repo, { docId: arg });
    });
    return () => { dead = true; };
  }, [repo, arg]);
  useEffect(() => {
    if (!run) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run]);

  const chosen = agents.find((a) => a.id === settings.docsAgent && a.installed) ?? agents.find((a) => a.installed) ?? agents[0]!;
  const effort: Effort = EFFORTS.includes(settings.docsEffort as Effort) ? (settings.docsEffort as Effort) : "balanced";
  const doc = DOCS.find((d) => d.id === view.docId);
  const docVersions = useMemo(() => versions.filter((v) => v.docId === view.docId), [versions, view.docId]);
  const showRun = !!run && (view.docId === null || view.docId === run.docId);
  const ver = !showRun && view.versionId ? versions.find((v) => v.id === view.versionId) : undefined;
  const md = showRun ? run!.text : ver ? st.md[ver.id] : undefined;
  const hasText = !!md;
  const incomplete = ver?.status === "incomplete";
  const flat = mode === "pages" && hasText && !showRun ? "pages" : "flow";
  const title = ver?.title ?? doc?.name ?? view.ask ?? "";
  const gen = () => {
    if (!view.docId) return;
    void startRun(repo, { docId: view.docId, ask: view.ask ?? (ver && view.docId === "ask" ? ver.title : undefined), agentId: chosen.id, effort });
  };
  const meta = { title, agent: agentName(ver?.agent ?? chosen.id), repo: repoName(repo), date: fmtDate(ver?.startedAt ?? now), md: md ?? "" };
  const pdfOpts = { ...meta, draft: incomplete };

  const add = () => {
    const wsId = useShell.getState().openRepos.find((r) => r.path === repo)?.activeWs;
    if (!wsId || !md) return;
    placeNew(getStore(wsId), "document", { title, md, agent: meta.agent, date: meta.date, incomplete, repo: meta.repo });
    useUi.getState().closeStudio(); // S-1993: 놓고 스튜디오를 닫는다
  };
  const remove = async () => {
    if (!ver) return;
    const ok = await confirmDialog({ title: t("Remove from library"), message: t("Remove this version for good? It does not go to the Recycle Bin."), confirmLabel: t("Remove"), danger: true });
    if (ok) await removeVersion(repo, ver.id);
  };
  const busy = !!run;
  const noAgent = !chosen.installed;

  return (
    <StudioFrame title={studioTitle("Documents")} onClose={closeStudioRequest} left={
      <div style={{ paddingTop: 10 }}>
        <div data-testid="doc-agents" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 12px 10px" }}>
          {agents.map((a) => (
            <button key={a.id} data-testid={`doc-agent-${a.id}`} aria-pressed={a.id === chosen.id} disabled={!a.installed} title={a.installed ? a.name : a.why ?? t("not found on PATH")}
              onClick={() => useSettings.getState().patch({ docsAgent: a.id })}
              style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 8, border: `1px solid ${a.id === chosen.id ? "var(--accent)" : "var(--studio-line)"}`, background: "transparent", color: "var(--text)", font: "12px system-ui", cursor: a.installed ? "pointer" : "not-allowed", opacity: a.installed ? 1 : 0.4 }}>
              <span aria-hidden style={{ width: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--surface-2)", font: "600 11px system-ui" }}>{a.name[0]}</span>
              {a.name}
            </button>
          ))}
        </div>
        {agents.filter((a) => a.why).map((a) => <div key={a.id} data-testid={`doc-why-${a.id}`} style={{ padding: "0 12px 8px", color: "var(--text-dim)", font: "12px system-ui" }}>{a.why}</div>)}
        <EffortChips agent={chosen.id} effort={effort} versions={versions} onPick={(e) => useSettings.getState().patch({ docsEffort: e })} />
        <DocList docId={view.docId} versions={versions} ask={view.ask} onPick={(id) => select(repo, { docId: id })} onAsk={(t) => select(repo, { docId: "ask", ask: t })} />
      </div>
    }>
      {run && <div data-testid="doc-progress" style={band("var(--text-dim)")}>{agentName(run.agentId)} · {t(run.phase)} · {fmtElapsed(now - run.startedAt)}</div>}
      {st.notice && (
        <div data-testid="doc-notice" role="alert" style={band("var(--err-text)")}>
          <span style={{ flex: 1 }}>{t(st.notice)}</span>
          <button aria-label={t("Dismiss")} style={plainBtn} onClick={() => dismissNotice(repo)}>×</button>
        </div>
      )}
      {(run || hasText) && (
        <Toolbar
          writing={run ? t("Writing with {agent} · {time}", { agent: agentName(run.agentId), time: now - run.startedAt < 60000 ? "<1m" : `${Math.floor((now - run.startedAt) / 60000)}m` }) : null}
          mode={flat} onMode={setMode} pagesOff={pagesOff} busy={busy} hasText={hasText} incomplete={incomplete} paper={settings.pdfPaper === "a4" ? "a4" : "letter"}
          onPaper={(p) => useSettings.getState().patch({ pdfPaper: p })} onAgain={gen} onAdd={add} onStop={() => stopRun(repo)}
          onExportPdf={() => void exp.go(pdfOpts)} onExportMd={() => void exportMarkdown(title, md ?? "").catch(() => {})} onCopyMd={() => void copyMarkdown(md ?? "")}
        />
      )}
      {ver && docVersions.length > 0 && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--studio-line)" }}>
          <div data-testid="doc-title" style={{ font: "600 14px system-ui", marginBottom: 6 }}>{ver.title}</div>
          <Versions list={docVersions} current={ver.id} onPick={(id) => void showVersion(repo, id)} onRemove={() => void remove()} />
        </div>
      )}
      {incomplete && (
        <div data-testid="doc-incomplete" style={band("var(--warn)")}>
          <span style={{ flex: 1 }}>{t("Incomplete — this run did not finish.")}</span>
          <button data-testid="doc-regenerate" style={plainBtn} disabled={busy} onClick={gen}>{t("Regenerate")}</button>
          <button data-testid="doc-export-draft" style={plainBtn} onClick={() => void exp.go(pdfOpts)}>{t("Export draft PDF")}</button>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", background: hasText || showRun ? "var(--doc-skel)" : undefined }}>
        {showRun && !hasText ? <Skeleton />
          : hasText ? (flat === "pages" ? <Pages opts={{ ...pdfOpts, paper: settings.pdfPaper === "a4" ? "a4" : "letter" }} onFail={(why) => (setPagesOff(why), setMode("flow"))} /> : <Flow md={md!} />)
          : ver ? <div style={{ padding: 24, color: "var(--text-dim)" }}>{t("Loading…")}</div>
          : (
            <div data-testid="doc-blank" style={{ margin: "auto", maxWidth: 420, padding: 24, textAlign: "center", display: "grid", gap: 10, justifyItems: "center" }}>
              {view.docId === null ? <div style={{ color: "var(--text-dim)" }}>{t("Pick a document on the left.")}</div>
                : view.docId === "ask" && !view.ask ? <div style={{ color: "var(--text-dim)" }}>{t("Type what you want written, then press Enter.")}</div>
                : (
                  <>
                    <div data-testid="doc-blank-title" style={{ font: "600 18px system-ui" }}>{doc && !ver ? t(title) : title}</div>
                    {doc && <div style={{ color: "var(--text-dim)" }}>{t(doc.blurb)}</div>}
                    <button data-testid="doc-generate" disabled={busy || noAgent} onClick={gen}
                      style={{ marginTop: 8, padding: "8px 18px", borderRadius: 8, border: 0, background: "var(--accent)", color: "var(--accent-text)", font: "600 13px system-ui", cursor: busy || noAgent ? "not-allowed" : "pointer", opacity: busy || noAgent ? 0.5 : 1 }}>{t("Generate with {name}", { name: chosen.name })}</button>
                    {busy && <div data-testid="doc-busy" style={{ color: "var(--text-dim)", fontSize: 12 }}>{t(BUSY)}</div>}
                    <div data-testid="doc-plan-note" style={{ color: "var(--text-dim)", fontSize: 11 }}>{t("Uses one turn of your {name} plan.", { name: chosen.name })}</div>
                  </>
                )}
            </div>
          )}
      </div>
      {exp.toast}
    </StudioFrame>
  );
}
