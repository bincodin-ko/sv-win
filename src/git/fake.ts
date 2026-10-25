// S-1039: 브라우저(시험)용 가짜 git. 상태는 window.__fakeGit.repos[경로]에 두고 명령이 그 객체를 바꾼다. 호출 기록 window.__fakeGitLog.
// FakeRepo(모두 선택): notRepo, branch, detached, upstream(null=없음), ahead, behind, remoteUrl(null=없음), files[{path,status,add,del,size?}],
//   log[], conflict, diverged(Pull 이 diverged 로 실패), pushOversize(100MB 로 push 거절), branches[], dirtyBlock[](C14: 이 브랜치로 전환하면 덮어쓰기 거절), unmerged[](C14: 이 브랜치 삭제는 병합 안 됨 거절). 전역: delay(쓰기 명령 지연 ms).
import type { GitResult } from "../lib/ipc";
import { branchNameError } from "./branches";

interface FakeFile { path: string; status: string; add: number; del: number; size?: number }
interface FakeRepo {
  notRepo?: boolean; branch: string; detached: boolean; upstream: string | null; ahead: number; behind: number; remoteUrl: string | null;
  files: FakeFile[]; log: { hash: string; subject: string; author: string; time: string }[]; conflict: boolean;
  diverged?: boolean; pushOversize?: boolean; branches: string[]; dirtyBlock?: string[]; unmerged?: string[];
}
type FakeWin = { __fakeGit?: { repos?: Record<string, Partial<FakeRepo>>; delay?: number }; __fakeGitLog?: string[]; __fakeGh?: { installed: boolean; user?: string | null } };
const w = () => window as unknown as FakeWin;
const BIG = 100 * 1024 * 1024;
const defaults = (): FakeRepo => ({ branch: "main", detached: false, upstream: "origin/main", ahead: 0, behind: 0, remoteUrl: "https://github.com/fake/repo.git", files: [], log: [], conflict: false, branches: ["main"] });

function repoAt(path: string): FakeRepo {
  const g = (w().__fakeGit ??= {});
  const repos = (g.repos ??= {});
  const r = (repos[path] ??= {});
  for (const [k, v] of Object.entries(defaults())) if (!(k in r)) (r as Record<string, unknown>)[k] = v;
  return r as FakeRepo;
}
const base = (): GitResult => ({ ok: true, message: "", notGit: false, gitMissing: false, diverged: false, oversize: false });
const fail = (message: string, f: Partial<GitResult> = {}): GitResult => ({ ...base(), ok: false, message, ...f });
const webOf = (u: string | null) => { const m = u?.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/); return m ? `https://github.com/${m[1]}` : null; };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 새 저장소(git init -b main): remote·upstream 없음 */
export function fakeGitInit(path: string): void {
  const g = (w().__fakeGit ??= {});
  (g.repos ??= {})[path] = { remoteUrl: null, upstream: null };
}

export async function fakeGitCall(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  const { repo: path, ...rest } = args as { repo: string } & Record<string, unknown>;
  (w().__fakeGitLog ??= []).push(`${cmd} ${JSON.stringify(rest)}`);
  const r = repoAt(path);
  if (r.notRepo && cmd !== "git_publish") return { ...fail("not a git repository", { notGit: true }), branch: "", detached: false, upstream: null, ahead: 0, behind: 0, remoteUrl: null, webUrl: null, files: [], total: 0, conflict: false, commits: [], branches: [] };
  if (/^git_(commit|push|pull|publish|remove_oversize)$/.test(cmd)) await sleep(w().__fakeGit?.delay ?? 0);
  const paths = (rest.paths as string[] | undefined) ?? [];
  switch (cmd) {
    case "git_status":
      return { ...base(), branch: r.branch, detached: r.detached, upstream: r.upstream, ahead: r.ahead, behind: r.behind, remoteUrl: r.remoteUrl, webUrl: webOf(r.remoteUrl),
        files: r.files.slice(0, 400).map(({ path: p, status, add, del }) => ({ path: p, status, add, del })), total: r.files.length, conflict: r.conflict };
    case "git_log": return { ...base(), commits: r.log.slice(0, Number(rest.n ?? 100)) };
    case "git_commit": {
      if (r.conflict) return fail("Resolve the merge conflicts first");
      if (!String(rest.message ?? "").trim()) return fail("Aborting commit due to empty commit message");
      r.files = r.files.filter((f) => !paths.includes(f.path));
      r.log.unshift({ hash: Math.random().toString(16).slice(2, 9), subject: String(rest.message), author: "you", time: new Date().toISOString() });
      if (r.upstream) r.ahead += 1;
      return base();
    }
    case "git_push":
      if (!r.remoteUrl) return fail("No configured push destination");
      if (r.pushOversize) return fail("File is larger than GitHub's file size limit of 100 MB", { oversize: true });
      r.ahead = 0;
      r.upstream ??= `origin/${r.branch}`;
      return base();
    case "git_pull":
      if (r.diverged) return fail("Not possible to fast-forward, aborting.", { diverged: true });
      r.behind = 0;
      return base();
    case "git_discard": r.files = r.files.filter((f) => f.path !== rest.path); return base();
    case "git_oversize": return { ...base(), files: r.files.filter((f) => paths.includes(f.path) && (f.size ?? 0) > BIG).map((f) => ({ path: f.path, size: f.size! })) };
    case "git_keep_off": r.files = r.files.filter((f) => !paths.includes(f.path)); return base();
    case "git_remove_oversize":
      r.files.forEach((f) => delete f.size);
      r.pushOversize = false;
      r.ahead = 0;
      r.branches.push("hv-oversize-backup");
      return base();
    case "git_publish": {
      const gh = w().__fakeGh ?? { installed: true, user: null };
      if (!gh.installed) return fail("gh not installed");
      if (!gh.user) return fail("You are not logged into any GitHub hosts");
      if (r.remoteUrl) return fail("remote origin already exists");
      r.files = [];
      r.remoteUrl = `https://github.com/${gh.user}/${rest.name}.git`;
      r.upstream = `origin/${r.branch}`;
      r.ahead = 0;
      return base();
    }
    case "git_branches": return { ...base(), branches: r.branches.map((name) => ({ name, current: name === r.branch })) };
    case "git_switch":
      if (!r.branches.includes(String(rest.name))) return fail("invalid reference");
      if (r.dirtyBlock?.includes(String(rest.name))) return fail("Your local changes would be overwritten by checkout. Commit or stash them first.");
      r.branch = String(rest.name);
      return base();
    case "git_branch_new": {
      const bad = branchNameError(String(rest.name));
      if (bad) return fail(bad);
      if (r.branches.includes(String(rest.name))) return fail(`a branch named '${rest.name}' already exists`);
      r.branches.push(String(rest.name)); r.branch = String(rest.name); r.upstream = null;
      return base();
    }
    case "git_branch_delete":
      if (rest.name === r.branch) return fail("Cannot delete the current branch");
      if (r.unmerged?.includes(String(rest.name))) return fail(`the branch '${rest.name}' is not fully merged`);
      r.branches = r.branches.filter((b) => b !== rest.name);
      return base();
    default: return fail(`unknown command ${cmd}`);
  }
}
