// S-1050~S-1056: 브랜치 카드(노드 종류 "branches"). 내용은 살아 있는 git 상태라 노드에 저장되는 필드는 kind 뿐.
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useScope } from "../board/BoardScope";
import { gitBranchDelete, gitBranches, gitBranchNew, gitSwitch, type GitBranch, type GitResult } from "../lib/ipc";
import { useShell } from "../shell/useShell";
import { useUi } from "../ui/useUi";
import { branchNameError, shownBranches } from "./branches";
import { repoOf, useGit } from "./useGit";
import { tp, useT } from "../i18n";
import { startPoll } from "../perf/poll";

const btn: CSSProperties = { height: 26, padding: "0 10px", borderRadius: 6, border: "1px solid var(--bd)", background: "var(--surface-2)", color: "var(--fg)", font: "12px system-ui", cursor: "pointer" };
const POLL_MS = 10_000;

export default function BranchesCard({ id: _id }: { id: string }) {
  const t = useT();
  const { wsId, visible } = useScope();
  const repo = useShell((s) => s.openRepos.find((r) => r.workspaces.some((w) => w.id === wsId))?.path ?? s.activeRepo ?? "");
  const st = useGit((s) => repoOf(s.by, repo).st);
  const [list, setList] = useState<GitBranch[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const sync = useCallback(async () => {
    if (!repo) return;
    await useGit.getState().refresh(repo);
    const b = await gitBranches(repo);
    setList(b.ok ? b.branches : []);
  }, [repo]);

  useEffect(() => {
    if (!visible) return;
    return startPoll(() => void sync(), POLL_MS);
  }, [visible, sync]);
  // 패널·명령줄이 브랜치를 바꿨을 때도 목록을 다시 읽는다
  useEffect(() => {
    if (!repo || !st || st.notGit) return;
    void gitBranches(repo).then((b) => setList(b.ok ? b.branches : []));
  }, [repo, st?.branch]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<GitResult>): Promise<boolean> => {
    let res: GitResult;
    try { res = await fn(); } catch (e) { res = { ok: false, message: String(e), notGit: false, gitMissing: false, diverged: false, oversize: false }; }
    setErr(res.ok ? null : res.message);
    await sync();
    return res.ok;
  };
  const create = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") return void setAdding(false);
    if (e.key !== "Enter") return;
    const name = e.currentTarget.value.trim();
    if (!name) return;
    const bad = branchNameError(name);
    if (bad) return void setErr(bad);
    if (await act(() => gitBranchNew(repo, name))) setAdding(false);
  };

  const rows = shownBranches(list);
  const n = st?.total ?? 0;
  return (
    <div data-testid="br-root" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--bd)", color: "var(--fg)", font: "12px system-ui" }}>
      <div data-node-handle style={{ height: 32, flex: "none", display: "flex", alignItems: "center", padding: "0 12px", borderBottom: "1px solid var(--bd)", cursor: "grab", font: "600 12px system-ui" }}>{t("Branches")}</div>
      {!st ? null : st.notGit ? (
        <div data-testid="br-notgit" style={{ padding: 12, color: "var(--fg-3)" }}>{t("Not a git repository")}</div>
      ) : (
        <>
          <div style={{ flex: "none", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }} onPointerDown={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span data-testid="br-current" style={{ font: "600 14px system-ui", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.branch}</span>
              <span data-testid="br-sync" style={{ color: "var(--fg-3)" }}>{`↑${st.ahead} ↓${st.behind}`}</span>
            </div>
            <div data-testid="br-edited" style={{ color: "var(--fg-3)" }}>{tp("{n} file edited", "{n} files edited", n)}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button data-testid="br-new" style={btn} onClick={() => setAdding(true)}>{t("New branch")}</button>
              <button data-testid="br-panel" style={btn} onClick={() => useUi.getState().openGit()}>{t("Panel")}</button>
            </div>
            {adding && (
              <input data-testid="br-new-input" autoFocus placeholder={t("branch-name")} onKeyDown={create} onBlur={() => setAdding(false)}
                style={{ marginTop: 4, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--accent)", background: "var(--panel-2)", color: "var(--text)", font: "inherit" }} />
            )}
            {err && <div data-testid="br-error" title={err} style={{ color: "var(--err-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{err.split("\n").find((l) => l.trim()) ?? err}</div>}
          </div>
          <div data-testid="br-list" data-wheel-own onPointerDown={(e) => e.stopPropagation()} style={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: "1px solid var(--bd)" }}>
            {rows.map((b) => (
              <div key={b.name} data-testid="br-row" data-name={b.name} data-current={b.current} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px 0 12px", height: 28 }}>
                <button onClick={() => !b.current && void act(() => gitSwitch(repo, b.name))} title={b.name}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", border: 0, background: "transparent", color: b.current ? "var(--accent-text)" : "var(--fg)", font: b.current ? "600 12px system-ui" : "12px system-ui", cursor: b.current ? "default" : "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: 0 }}>
                  {b.current ? "● " : ""}{b.name}
                </button>
                {!b.current && <button data-testid="br-delete" aria-label={t("Delete {name}", { name: b.name })} title={t("Delete branch")} onClick={() => void act(() => gitBranchDelete(repo, b.name))}
                  style={{ width: 24, height: 24, border: 0, background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}>🗑</button>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
