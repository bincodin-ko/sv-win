// S-1021~S-1038: Git 패널. 보드 왼쪽(레일 오른쪽)에 겹쳐 뜨는 너비 340.
import { useEffect, useState, type CSSProperties } from "react";
import { gitDiscard, gitInitHere, gitKeepOff, gitPublish, gitRemoveOversize, openUrl, type GitFile, type GitResult } from "../lib/ipc";
import { confirmDialog } from "../ui/ConfirmDialog";
import { useUi } from "../ui/useUi";
import { commitOnly, commitPush, pullOnly, pushOnly } from "./actions";
import { connectGh, copyInstall, INSTALL, useGh } from "./ghConnect";
import { GithubMark } from "./GithubPill";
import { suggestSubject } from "./suggest";
import { checkedOf, commitBlock, primaryLabel, repoOf, shownFiles, sumLines, useGit } from "./useGit";
import { getLang, tm, useT } from "../i18n";
import { relTime } from "../home/dateFmt";

const OK: GitResult = { ok: true, message: "", notGit: false, gitMissing: false, diverged: false, oversize: false };
const btn: CSSProperties = { height: 28, padding: "0 10px", borderRadius: 6, border: "1px solid var(--bd)", background: "var(--surface-2)", color: "var(--fg)", font: "12px system-ui", cursor: "pointer" };
const main: CSSProperties = { ...btn, height: 32, border: 0, background: "var(--accent)", color: "var(--accent-ink)", fontWeight: 600 };
const icon: CSSProperties = { ...btn, width: 26, height: 26, padding: 0, border: 0, background: "transparent", color: "var(--fg-2)" };
const head: CSSProperties = { font: "11px system-ui", letterSpacing: 0.6, color: "var(--fg-3)" };
const DISCARD_MSG = tm("Tracked files go back to the last commit and a copy of your version goes to the Recycle Bin; untracked files move to the Recycle Bin.");

const ago = (iso: string) => relTime(Math.max(0, (Date.now() - Date.parse(iso)) / 1000), getLang());
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

export default function GitPanel({ repo, wsId }: { repo: string; wsId: string }) {
  const t = useT();
  const r = useGit((s) => repoOf(s.by, repo));
  const g = useGit.getState();
  const gh = useGh((s) => s.st);
  const [history, setHistory] = useState(false);
  const [sure, setSure] = useState(false);
  const st = r.st;
  const checked = checkedOf(st, r.unchecked);
  const rows = st && !st.notGit && !st.gitMissing ? shownFiles(st) : { rows: [], more: 0 };
  const sum = sumLines(rows.rows, checked);
  const block = commitBlock(st, checked.length, r.msg, r.busy);
  const hasRemote = !!st?.remoteUrl;
  const key = checked.join("\n");

  useEffect(() => void useGh.getState().refresh(), []);
  useEffect(() => void g.loadLog(repo), [repo, st]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void g.checkBig(repo), [repo, key, st?.total]); // eslint-disable-line react-hooks/exhaustive-deps

  const discard = async (f: GitFile) => {
    if (!(await confirmDialog({ title: t("Discard changes to {path}?", { path: f.path }), message: t(DISCARD_MSG), confirmLabel: t("Discard"), danger: true }))) return;
    await g.run(repo, "discard", () => gitDiscard(repo, f.path, f.status !== "?"));
  };
  const keepOff = () => g.run(repo, "other", () => gitKeepOff(repo, r.big.map((b) => b.path)));
  const removeOversize = () => {
    if (!sure) return setSure(true);
    setSure(false);
    void g.run(repo, "push", () => gitRemoveOversize(repo));
  };

  const publish = (
    <Publish repo={repo} wsId={wsId} gh={gh} busy={!!r.busy} />
  );

  return (
    <div data-testid="git-panel" role="region" aria-label="GitHub" onPointerDown={(e) => e.stopPropagation()}
      style={{ position: "fixed", left: 64, top: 56, bottom: 60, width: 340, zIndex: 950, display: "flex", flexDirection: "column", background: "var(--surface)", color: "var(--fg)", border: "1px solid var(--bd)", borderRadius: 12, boxShadow: "0 12px 32px var(--scrim)", font: "13px system-ui", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 10px 4px 12px" }}>
        <GithubMark size={16} />
        <strong data-testid="git-repo" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{baseName(repo)}</strong>
        {st && !st.notGit && !st.gitMissing && <span data-testid="git-branch" style={{ color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.branch}</span>}
        <span style={{ flex: 1 }} />
        <button data-testid="git-history-btn" aria-label={t("History")} aria-pressed={history} title={t("History")} style={icon} onClick={() => setHistory(!history)}>🕘</button>
        {st?.webUrl && <button data-testid="git-open-web" aria-label={t("Open on GitHub")} title={t("Open on GitHub")} style={icon} onClick={() => void openUrl(st.webUrl!).catch(() => {})}>↗</button>}
        <button data-testid="git-refresh" aria-label={t("Refresh")} title={t("Refresh")} style={icon} onClick={() => void g.refresh(repo)}>⟳</button>
        <button data-testid="git-close" aria-label={t("Close")} title={t("Close")} style={icon} onClick={() => useUi.getState().closeGit()}>✕</button>
      </div>
      {st && !st.notGit && !st.gitMissing && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px 8px" }}>
          <span data-testid="git-sync" title={t("Counts are as of your last fetch; this panel never fetches on its own.")} style={{ color: "var(--fg-3)", font: "12px system-ui" }}>
            {st.ahead === 0 && st.behind === 0 ? t("In sync") : t("↑{ahead} ahead · ↓{behind} behind", { ahead: st.ahead, behind: st.behind })}
          </span>
          <span style={{ flex: 1 }} />
          {hasRemote && st.behind > 0 && <button data-testid="git-pull" style={btn} disabled={!!r.busy} onClick={() => void pullOnly(repo)}>{r.busy === "pull" ? t("Pulling…") : "Pull"}</button>}
          {hasRemote && !st.detached && (st.ahead > 0 || !st.upstream) && (
            <button data-testid="git-push" style={btn} disabled={!!r.busy} onClick={() => void pushOnly(repo)}>{r.busy === "push" ? t("Pushing…") : st.upstream ? "Push" : t("Publish branch")}</button>
          )}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 12px 8px", display: "grid", alignContent: "start", gap: 8 }}>
        {!st ? <span style={{ color: "var(--fg-3)" }}>…</span>
          : st.gitMissing ? <span data-testid="git-missing">{t("Git not found")}</span>
          : st.notGit ? (
            <button data-testid="git-create-repo" style={main} disabled={!!r.busy} onClick={() => void g.run(repo, "init", async () => { await gitInitHere(repo, true); return OK; })}>{t("Create repository")}</button>
          ) : !hasRemote ? publish
          : history ? (
            <>
              <div data-testid="git-history-head" style={head}>{t("HISTORY")}</div>
              {r.log.slice(0, 100).map((c) => (
                <div key={c.hash} data-testid="git-history-item" style={{ display: "grid", gap: 2 }}>
                  <span><code style={{ color: "var(--fg-3)" }}>{c.hash}</code> {c.subject}</span>
                  <span style={{ color: "var(--fg-3)", font: "11px system-ui" }}>{c.author} · {ago(c.time)}</span>
                </div>
              ))}
            </>
          ) : (
            <>
              {st.total > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span data-testid="git-changes-head" style={head}>{t("CHANGES {n}/{total} +{add} −{del}", { n: checked.length, total: st.total, add: sum.add, del: sum.del })}</span>
                  <span style={{ flex: 1 }} />
                  <button data-testid="git-all" style={{ ...btn, height: 22 }} onClick={() => g.all(repo)}>{t("All")}</button>
                  <button data-testid="git-none" style={{ ...btn, height: 22 }} onClick={() => g.none(repo)}>{t("None")}</button>
                </div>
              )}
              {rows.rows.map((f) => (
                <Row key={f.path} f={f} on={!r.unchecked.includes(f.path)} toggle={() => g.toggle(repo, f.path)} discard={() => void discard(f)} />
              ))}
              {rows.more > 0 && <span data-testid="git-more" style={{ color: "var(--fg-3)" }}>{t("+{n} more not shown", { n: rows.more })}</span>}
              {st.total === 0 && <span data-testid="git-clean" style={{ color: "var(--fg-2)" }}>{t("Working tree clean")}</span>}
              {st.total > 0 && (
                <div style={{ display: "flex", gap: 6 }}>
                  <input data-testid="git-msg" value={r.msg} placeholder="Commit message" onChange={(e) => g.setMsg(repo, e.target.value)}
                    style={{ flex: 1, minWidth: 0, height: 30, padding: "0 8px", borderRadius: 6, border: "1px solid var(--bd)", background: "var(--well)", color: "var(--fg)", font: "13px system-ui" }} />
                  <button data-testid="git-sparkle" aria-label={t("Suggest message")} title={t("Suggest a message from the changes")} style={btn}
                    onClick={() => g.setMsg(repo, suggestSubject(rows.rows.filter((f) => checked.includes(f.path))))}>✦</button>
                </div>
              )}
              {r.big.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--warn)" }}>
                  <span data-testid="git-big-warn" style={{ flex: 1 }}>{t("{n} files over 100 MB", { n: r.big.length })}</span>
                  <button data-testid="git-keep-off" style={btn} disabled={!!r.busy} onClick={() => void keepOff()}>{t("Keep off GitHub")}</button>
                </div>
              )}
              {st.total > 0 && (
                <div style={{ display: "grid", gap: 6 }}>
                  <button data-testid="git-commit-push" style={{ ...main, opacity: block ? 0.5 : 1 }} disabled={!!block}
                    onClick={() => void (st.detached ? commitOnly(repo) : commitPush(repo))}>
                    {r.busy === "push" ? t("Pushing…") : r.busy === "commit" ? t("Committing…") : primaryLabel(st, checked.length)}
                  </button>
                  {st.upstream && !st.detached && <button data-testid="git-commit-only" style={btn} disabled={!!block} onClick={() => void commitOnly(repo)}>{t("Commit only")}</button>}
                  {block === "conflict" && <span data-testid="git-block" style={{ color: "var(--err-text)" }}>{t("Resolve the merge conflicts first")}</span>}
                </div>
              )}
              {r.oversizeRejected && (
                <button data-testid="git-remove-oversize" style={btn} onBlur={() => setSure(false)} onClick={removeOversize}>
                  {sure ? t("Click again — keeps the old history on hv-oversize-backup") : t("Remove from commits & push")}
                </button>
              )}
              {r.log.length > 0 && (
                <>
                  <div data-testid="git-recent-head" style={{ ...head, marginTop: 6 }}>{t("RECENT")}</div>
                  {r.log.slice(0, 5).map((c) => (
                    <div key={c.hash} data-testid="git-recent-item" style={{ color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</div>
                  ))}
                </>
              )}
            </>
          )}
      </div>
      {(r.done || r.error) && (
        <div style={{ padding: "6px 12px 10px", display: "grid", gap: 2 }}>
          {r.done && <span data-testid="git-done" style={{ color: "var(--ok)" }}>{r.done}</span>}
          {r.error && <span data-testid="git-error" style={{ color: "var(--err-text)" }}>{r.error}</span>}
        </div>
      )}
    </div>
  );
}

function Row({ f, on, toggle, discard }: { f: GitFile; on: boolean; toggle: () => void; discard: () => void }) {
  const t = useT();
  const [hover, setHover] = useState(false);
  return (
    <div data-testid="git-row" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onContextMenu={(e) => { e.preventDefault(); discard(); }}
      style={{ display: "flex", alignItems: "center", gap: 6, height: 24 }}>
      <input data-testid="git-check" type="checkbox" checked={on} onChange={toggle} aria-label={f.path} />
      <span data-testid="git-status" style={{ width: 14, color: "var(--fg-3)", font: "11px ui-monospace, monospace" }}>{f.status}</span>
      <span data-testid="git-path" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</span>
      {hover && (
        <>
          <span data-testid="git-lines" style={{ color: "var(--fg-3)", font: "11px system-ui" }}>{f.add < 0 ? t("binary") : `+${f.add} −${f.del}`}</span>
          <button data-testid="git-discard" aria-label={t("Discard {path}", { path: f.path })} title={t("Discard changes")} style={{ ...icon, width: 22, height: 22 }} onClick={discard}>↩</button>
        </>
      )}
    </div>
  );
}

function Publish({ repo, wsId, gh, busy }: { repo: string; wsId: string; gh: { installed: boolean; user: string | null } | null; busy: boolean }) {
  const t = useT();
  const [name, setName] = useState(baseName(repo));
  const [priv, setPriv] = useState(true);
  const [copied, setCopied] = useState(false);
  return (
    <div data-testid="git-publish" style={{ display: "grid", gap: 8 }}>
      <strong>{t("Publish to GitHub")}</strong>
      {!gh ? <span style={{ color: "var(--fg-3)" }}>…</span>
        : !gh.installed ? (
          <>
            <span>{t("Install gh")}</span>
            <code style={{ padding: 6, borderRadius: 6, background: "var(--well)" }}>{INSTALL}</code>
            <button data-testid="git-install-copy" style={btn} onClick={async () => setCopied(await copyInstall())}>{copied ? t("Copied") : t("Copy install command")}</button>
          </>
        ) : !gh.user ? (
          <button data-testid="git-connect" style={main} onClick={() => connectGh(wsId)}>{t("Connect account")}</button>
        ) : (
          <>
            <input data-testid="git-pub-name" value={name} onChange={(e) => setName(e.target.value)} aria-label={t("Repository name")}
              style={{ height: 30, padding: "0 8px", borderRadius: 6, border: "1px solid var(--bd)", background: "var(--well)", color: "var(--fg)", font: "13px system-ui" }} />
            <div style={{ display: "flex", gap: 12 }}>
              <label><input data-testid="git-pub-private" type="radio" name="vis" checked={priv} onChange={() => setPriv(true)} /> {t("Private")}</label>
              <label><input data-testid="git-pub-public" type="radio" name="vis" checked={!priv} onChange={() => setPriv(false)} /> {t("Public")}</label>
            </div>
            <button data-testid="git-pub-go" style={main} disabled={busy || !name.trim()} onClick={() => void useGit.getState().run(repo, "publish", () => gitPublish(repo, name.trim(), priv))}>
              {busy ? t("Publishing…") : t("Create repo & push everything")}
            </button>
          </>
        )}
    </div>
  );
}
