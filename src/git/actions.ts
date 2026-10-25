// C17 명령줄도 그대로 부르는 동작 함수. 이름 고정. 이미 다른 동작이 돌고 있으면 null.
import { gitCommit, gitPull, gitPush, type GitResult } from "../lib/ipc";
import { suggestSubject } from "./suggest";
import { checkedOf, repoOf, useGit } from "./useGit";
import { t, tp } from "../i18n";

export interface CommitOpts { message?: string; paths?: string[] }

async function commit(repo: string, o: CommitOpts, push: boolean): Promise<GitResult | null> {
  const r = repoOf(useGit.getState().by, repo);
  const paths = o.paths ?? checkedOf(r.st, r.unchecked);
  const message = (o.message ?? r.msg) || suggestSubject((r.st?.files ?? []).filter((f) => paths.includes(f.path)));
  const noPush = !push || !!r.st?.detached;
  const out = await useGit.getState().run(repo, push ? "push" : "commit", async () => {
    const c = await gitCommit(repo, paths, message);
    return c.ok && !noPush ? gitPush(repo) : c;
  });
  if (out?.ok) {
    useGit.setState((s) => ({ by: { ...s.by, [repo]: { ...repoOf(s.by, repo), msg: "", done: tp("Committed {n} file", "Committed {n} files", paths.length) + (noPush ? "" : t(" · pushed")) } } }));
  }
  return out;
}
export const commitPush = (repo: string, o: CommitOpts = {}) => commit(repo, o, true);
export const commitOnly = (repo: string, o: CommitOpts = {}) => commit(repo, o, false);
export const pushOnly = (repo: string) => useGit.getState().run(repo, "push", () => gitPush(repo));
export const pullOnly = (repo: string) => useGit.getState().run(repo, "pull", () => gitPull(repo));
