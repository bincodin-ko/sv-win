// S-1360~S-1364·S-1368·S-1377: Memory 모달 — 탭 · 빈 상태 · 목록 · 편집 폼 · Place card on board
// 일부러 role="dialog" 가 아니다: 그러면 보드의 Esc 순서(S-1229)가 멈춘다. Esc 는 패널 안 포커스에서는 여기서, 밖에서는 보드가 닫는다.
import { useEffect, useState } from "react";
import { getStore } from "../board/boards";
import { placeNew } from "../board/kinds/registry";
import { useT } from "../i18n";
import { useShell } from "../shell/useShell";
import { useUi } from "../ui/useUi";
import FactForm from "./FactForm";
import { findCard, kindVar, repoName, summary } from "./facts";
import ScanFlow, { RefreshNote } from "./ScanFlow";
import { refreshFact, scanRepo } from "./scan";
import { useScan } from "./useScan";
import { useMemory } from "./useMemory";

const btn = (primary = false): React.CSSProperties => ({ cursor: "pointer", padding: "5px 14px", borderRadius: 8, border: primary ? 0 : "1px solid var(--bd)", background: primary ? "var(--accent)" : "none", color: primary ? "var(--accent-text)" : "var(--text)", font: "600 13px system-ui" });
const tabStyle = (on: boolean): React.CSSProperties => ({ all: "unset", cursor: "pointer", padding: "6px 2px", marginRight: 16, borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`, color: on ? "var(--text)" : "var(--text-dim)", font: "600 13px system-ui" });

export default function MemoryPanel() {
  const t = useT();
  const shell = useShell((s) => s);
  const repo = shell.view === "board" ? shell.activeRepo : null;
  const { data, tab, editing, error } = useMemory();
  const close = () => useUi.getState().closeMemory();
  const scanning = useScan((s) => s.stage !== "idle" && s.repo === repo); // D13: Scan 시작·진행·결과 화면이 목록 자리를 쓴다 (S-1388)
  const refreshing = useScan((s) => (s.refresh?.status === "running" ? s.refresh.factId : null));
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    useMemory.setState({ tab: repo ? "repo" : "all" });
    void useMemory.getState().load(repo);
    return () => useMemory.getState().reset(); // 편집 중 닫으면 버림(S-1366)
  }, [repo]);
  const repoFacts = repo ? data[repo] ?? [] : [];
  const allFacts = data._all ?? [];
  const cur = repo && tab === "repo" ? repoFacts : allFacts;
  const editingFact = editing?.id ? [...repoFacts, ...allFacts].find((f) => f.id === editing.id) : undefined;

  const placeCard = () => {
    const ws = shell.openRepos.find((r) => r.path === repo)?.activeWs;
    if (!ws) return;
    const store = getStore(ws), s = store.getState();
    const ex = findCard(s.nodes);
    if (ex) { // 이미 있으면 그 카드로 카메라를 옮겨 선택한다(S-1368)
      const n = s.nodes[ex]!, z = s.viewport.zoom;
      s.setViewport({ x: -(n.x + n.w / 2) * z, y: -(n.y + n.h / 2) * z, zoom: z });
      s.select([ex]);
    } else placeNew(store, "memory");
    close();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "grid", placeItems: "center", background: "var(--scrim-50)" }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div data-testid="memory-panel" role="region" aria-label={t("Memory")} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}
        style={{ width: "min(640px, 94vw)", maxHeight: "86vh", display: "flex", flexDirection: "column", background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 14, font: "13px system-ui" }}>
        <div style={{ display: "flex", alignItems: "flex-start", padding: "14px 16px 8px" }}>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 15 }}>{t("Memory")}</b>
            <div style={{ color: "var(--text-dim)", fontSize: 12 }}>{t("What your agents should know — pushed from a memory card when you say so")}</div>
          </div>
          <button data-testid="memory-close" aria-label={t("Close")} onClick={close} style={{ all: "unset", cursor: "pointer", padding: "0 8px", fontSize: 18 }}>×</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
          {repo && <button data-testid="memory-tab-repo" aria-selected={tab === "repo"} role="tab" onClick={() => useMemory.getState().setTab("repo")} style={tabStyle(tab === "repo")}>{repoName(repo)} ({repoFacts.length})</button>}
          <button data-testid="memory-tab-all" aria-selected={tab === "all" || !repo} role="tab" onClick={() => useMemory.getState().setTab("all")} style={tabStyle(tab === "all" || !repo)}>{t("All repos")} ({allFacts.length})</button>
          <span style={{ flex: 1 }} />
          <button data-testid="memory-scan" disabled={!repo} onClick={() => repo && void scanRepo(repo)} style={{ ...btn(), marginRight: 8, opacity: repo ? 1 : 0.4 }}>{t("Scan repo")}</button>
          <button data-testid="memory-new" onClick={() => useMemory.getState().startNew()} style={btn(true)}>{t("New memory")}</button>
        </div>
        <div style={{ overflow: "auto", padding: 16 }}>
          {error && <div data-testid="memory-error" style={{ color: "var(--danger)", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          {repo && <RefreshNote repo={repo} />}
          {scanning ? <ScanFlow />
            : editing ? <FactForm key={editing.id ?? "new"} repo={repo} initial={editing} fact={editingFact} />
            : cur.length === 0 ? (
              <div data-testid="memory-empty" style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{t("No memory yet")}</div>
                <button data-testid="memory-empty-scan" disabled={!repo} onClick={() => repo && void scanRepo(repo)} style={{ ...btn(), marginRight: 8, opacity: repo ? 1 : 0.4 }}>{t("Scan repo")}</button>
                <button data-testid="memory-empty-write" onClick={() => useMemory.getState().startNew()} style={btn(true)}>{t("Write memory")}</button>
              </div>
            ) : cur.map((f) => (
              <div key={f.id} data-testid="memory-row" data-id={f.id} onClick={() => useMemory.getState().startEdit(f)} onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--bd)", borderRadius: 8, marginBottom: 6, cursor: "pointer" }}>
                <span data-testid="memory-kind" style={{ flex: "none", fontSize: 11, fontWeight: 700, color: `var(${kindVar(f.kind)})`, minWidth: 84 }}>{t(f.kind)}</span>
                <b style={{ flex: "none", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</b>
                <span style={{ flex: 1, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary(f.body)}</span>
                {(hover === f.id || refreshing === f.id) && repo && <button data-testid="memory-refresh" aria-label={t("Refresh")} title={t("Refresh")} onClick={(e) => { e.stopPropagation(); void refreshFact(repo, f); }} style={{ all: "unset", cursor: "pointer", padding: "0 4px" }}>{refreshing === f.id ? "⟳" : "↻"}</button>}
              </div>
            ))}
        </div>
        {!editing && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex" }}>
            <button data-testid="memory-place" disabled={!repo} onClick={placeCard} style={{ ...btn(), opacity: repo ? 1 : 0.4 }}>{t("Place card on board")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
