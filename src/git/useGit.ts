// S-1036: repo 경로별 git 상태 저장소(패널·pill·브랜치 카드가 같이 본다).
import { create } from "zustand";
import { gitLog, gitOversize, gitStatus, type GitBigFile, type GitCommit, type GitFile, type GitResult, type GitStatus } from "../lib/ipc";
import { t, tm, tp } from "../i18n";

export const MAX_SHOWN = 400;
export const DIVERGED = tm("Your branch and the remote have diverged. Merge in a console.");
export type Busy = "commit" | "push" | "pull" | "publish" | "init" | "discard" | "other";
export interface RepoGit {
  st: GitStatus | null;
  log: GitCommit[];
  /** 사용자가 체크를 뺀 경로(처음엔 전부 체크이므로 빼낸 것만 기억 — 새 파일은 자동 체크) */
  unchecked: string[];
  busy: Busy | null;
  error: string | null;
  done: string | null;
  msg: string;
  big: GitBigFile[];
  oversizeRejected: boolean;
}
export const blank: RepoGit = { st: null, log: [], unchecked: [], busy: null, error: null, done: null, msg: "", big: [], oversizeRejected: false };

export const shownFiles = (st: GitStatus): { rows: GitFile[]; more: number } => {
  const rows = (st.files ?? []).slice(0, MAX_SHOWN); // 저장소가 아닐 때도 모양이 온다
  return { rows, more: Math.max(0, (st.total ?? 0) - rows.length) };
};
export const checkedOf = (st: GitStatus | null, unchecked: string[]): string[] =>
  st ? shownFiles(st).rows.map((f) => f.path).filter((p) => !unchecked.includes(p)) : [];
export const sumLines = (files: GitFile[], checked: string[]): { add: number; del: number } => {
  const on = new Set(checked);
  let add = 0, del = 0;
  for (const f of files) if (on.has(f.path)) { add += Math.max(0, f.add); del += Math.max(0, f.del); } // 바이너리(−1)는 0
  return { add, del };
};
export const primaryLabel = (st: GitStatus, n: number): string => st.detached ? tp("Commit {n} file", "Commit {n} files", n) : tp("Commit & Push {n} file", "Commit & Push {n} files", n);
export type Block = "none-checked" | "no-message" | "conflict" | "busy" | null;
export const commitBlock = (st: GitStatus | null, n: number, msg: string, busy: Busy | null): Block =>
  busy ? "busy" : st?.conflict ? "conflict" : n === 0 ? "none-checked" : !msg.trim() ? "no-message" : null;

interface GitStore {
  by: Record<string, RepoGit>;
  refresh: (repo: string) => Promise<void>;
  loadLog: (repo: string) => Promise<void>;
  checkBig: (repo: string) => Promise<void>;
  toggle: (repo: string, path: string) => void;
  all: (repo: string) => void;
  none: (repo: string) => void;
  setMsg: (repo: string, msg: string) => void;
  /** 동작 하나를 돌린다. 이미 다른 동작이 돌고 있으면 null(S-1037) */
  run: (repo: string, busy: Busy, fn: () => Promise<GitResult>) => Promise<GitResult | null>;
}
export const useGit = create<GitStore>((set, get) => {
  const patch = (repo: string, p: Partial<RepoGit> | ((r: RepoGit) => Partial<RepoGit>)) =>
    set((s) => {
      const r = s.by[repo] ?? blank;
      return { by: { ...s.by, [repo]: { ...r, ...(typeof p === "function" ? p(r) : p) } } };
    });
  const stOf = (repo: string) => get().by[repo]?.st ?? null;
  return {
    by: {},
    refresh: async (repo) => {
      const st = await gitStatus(repo);
      patch(repo, (r) => ({ st, unchecked: r.unchecked.filter((p) => (st.files ?? []).some((f) => f.path === p)) }));
    },
    loadLog: async (repo) => {
      const l = await gitLog(repo, 100);
      patch(repo, { log: l.ok ? l.commits : [] });
    },
    checkBig: async (repo) => {
      const st = stOf(repo);
      const paths = checkedOf(st, get().by[repo]?.unchecked ?? []);
      const res = paths.length ? await gitOversize(repo, paths) : null;
      patch(repo, { big: res?.ok ? res.files : [] });
    },
    toggle: (repo, path) => patch(repo, (r) => ({ unchecked: r.unchecked.includes(path) ? r.unchecked.filter((p) => p !== path) : [...r.unchecked, path] })),
    all: (repo) => patch(repo, { unchecked: [] }),
    none: (repo) => patch(repo, (r) => ({ unchecked: r.st ? (r.st.files ?? []).map((f) => f.path) : [] })),
    setMsg: (repo, msg) => patch(repo, { msg }),
    run: async (repo, busy, fn) => {
      if (get().by[repo]?.busy) return null;
      patch(repo, { busy, error: null, done: null, oversizeRejected: false });
      let res: GitResult;
      try { res = await fn(); } catch (e) { res = { ok: false, message: String(e), notGit: false, gitMissing: false, diverged: false, oversize: false }; }
      patch(repo, { error: res.ok ? null : res.diverged ? t(DIVERGED) : res.message, oversizeRejected: res.oversize });
      try { await get().refresh(repo); } finally { patch(repo, { busy: null }); }
      return res;
    },
  };
});
export const repoOf = (by: Record<string, RepoGit>, repo: string): RepoGit => by[repo] ?? blank;
