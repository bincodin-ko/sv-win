// 홈 화면 repo 목록의 순수 규칙 (S-316~S-319, S-323). 화면(RepoList)과 저장(repos.json)은 따로.
import type { Repos } from "../board/persist";

export const NAME_MAX = 24;

/** 이름은 24자까지 (S-318) */
export const clampName = (s: string): string => [...s].slice(0, NAME_MAX).join("");

/** 이름 바꾸기 입력의 끝: Enter=저장할 이름(24자, 공백 지움; 비면 취소), Escape=취소(null) */
export function editResult(key: string, draft: string, _current: string): string | null {
  if (key !== "Enter") return null;
  return clampName(draft.trim()) || null;
}

/** 같은 폴더인지(슬래시 방향·끝 슬래시·대소문자 무시) */
const norm = (p: string) => p.replace(/[\\]/g, "/").replace(/\/+$/, "").toLowerCase();
export const samePath = (a: string, b: string): boolean => norm(a) === norm(b);

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

/** repo 이름만 바꾼다(폴더·경로는 그대로) */
export const renameRepo = (r: Repos, path: string, name: string): Repos => ({
  ...r,
  repos: r.repos.map((x) => (x.path === path ? { ...x, name: clampName(name) } : x)),
});

/** ↑↓ 이동: 끝에서 멈춘다(돌아가지 않는다). n=0이면 -1 */
export const moveSel = (i: number, delta: number, n: number): number => (n <= 0 ? -1 : Math.min(n - 1, Math.max(0, i + delta)));

/** 폴더들을 추가한다. 이미 있는 폴더는 목록을 늘리지 않고 그 행을 고르기만 한다. 새로 추가한 마지막 폴더가 lastRepo */
export function addFolders(r: Repos, paths: string[]): { repos: Repos; selected: string | null } {
  const list = [...r.repos];
  let selected: string | null = null;
  let last = r.lastRepo;
  for (const p of paths) {
    const have = list.find((x) => samePath(x.path, p));
    if (have) selected = have.path;
    else {
      list.push({ path: p, name: clampName(baseName(p)), workspaces: [] });
      selected = last = p;
    }
  }
  return { repos: { ...r, repos: list, lastRepo: last }, selected };
}

/** repo 를 목록에서 뺀다. lastRepo 가 그 repo 였으면 비운다(null) */
export function removeRepoFrom(r: Repos, path: string): Repos {
  const { [path]: _gone, ...lastWorkspace } = r.lastWorkspace ?? {};
  return { ...r, repos: r.repos.filter((x) => x.path !== path), lastRepo: r.lastRepo === path ? null : r.lastRepo, lastWorkspace };
}
