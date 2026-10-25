// B4 S-335·S-336·S-344: 워크스페이스 새로 만들기·이름 바꾸기·닫기·전환·찾기. command bar(S-616)도 이 함수를 부른다.
import { create } from "zustand";
import { getStore } from "../board/boards";
import { flushAll, type RepoInfo, type Repos } from "../board/persist";
import { getSession } from "../console/session";
import { boardArchive, dirExists, pickFolder, reposGet, reposSet } from "../lib/ipc";
import { confirmUnsaved } from "../studio/unsaved";
import { confirmDialog } from "../ui/ConfirmDialog";
import { useUi } from "../ui/useUi";
import { closeRepoAsk, type AppKeyAction } from "./appKeys";
import { cycleConsole, cycleRegion, focusCommandBar } from "./regions";
import { handleOf, useShell } from "./useShell";
import { t, tp } from "../i18n";

export type WsItem = { id: string; name: string };
export const MAX_NAME = 24;

export function nextWorkspaceName(names: string[]): string {
  const used = new Set(names.map((n) => /^Workspace (\d+)$/.exec(n)?.[1]).filter(Boolean).map(Number));
  let n = 1;
  while (used.has(n)) n++;
  return `Workspace ${n}`;
}
/** 이름 입력 다듬기: 앞뒤 공백 지우고 24자까지. 빈 글이면 "" (저장하지 않는다) */
export const normalizeName = (input: string): string => input.trim().slice(0, MAX_NAME).trim();
export const canCloseWorkspace = (count: number): boolean => count > 1;
/** 번호(탭 순서, 1부터) → 이름 정확히(대소문자 무시) → 이름 앞부분 */
export function findWorkspace(list: WsItem[], query: string): WsItem | null {
  const q = query.trim().toLowerCase();
  if (/^\d+$/.test(q)) return list[Number(q) - 1] ?? null;
  return list.find((w) => w.name.toLowerCase() === q) ?? list.find((w) => w.name.toLowerCase().startsWith(q)) ?? null;
}

// ---- 동작(repos.json + boardArchive + useShell) ----
/** repos.json 의 repo·워크스페이스 목록을 화면이 따라 읽게 둔 사본(탭·repo chip) */
export const useRepoList = create<{ repos: RepoInfo[] }>(() => ({ repos: [] }));
export const refreshRepos = async (): Promise<void> => useRepoList.setState({ repos: (await reposGet()).repos });

const newId = () => `ws-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const openRepoOf = (path: string) => useShell.getState().openRepos.find((r) => r.path === path);
const openIds = (path: string) => openRepoOf(path)?.workspaces.map((w) => w.id) ?? [];
const nodeIds = (wsId: string) => Object.keys(getStore(wsId).getState().nodes);
const runningIds = (wsId: string) => nodeIds(wsId).filter((id) => getSession(wsId, id)?.isRunning());
const killAll = (wsId: string) => nodeIds(wsId).forEach((id) => getSession(wsId, id)?.kill());
// repos.json 읽고-고치고-쓰기는 한 줄로 세운다(AppShell 의 lastWorkspace 기록과 겹쳐 서로 덮어쓰지 않게). f 가 같은 객체를 돌려주면 쓰지 않는다
let chain: Promise<unknown> = Promise.resolve();
export const updateRepos = (f: (r: Repos) => Repos): Promise<void> =>
  (chain = chain.then(async () => {
    const r = await reposGet();
    const n = f(r);
    if (n !== r) await reposSet(n);
    await refreshRepos();
  }).catch((e) => console.error("repos.json 갱신 실패", e))) as Promise<void>;
const editRepos = (f: (r: RepoInfo[], last: Record<string, string>) => RepoInfo[]) =>
  updateRepos((r) => {
    const last = { ...r.lastWorkspace };
    return { ...r, repos: f(r.repos, last), lastWorkspace: last };
  });
const mapRepo = (repos: RepoInfo[], path: string, f: (r: RepoInfo) => RepoInfo) => repos.map((r) => (r.path === path ? f(r) : r));

/** S-335 새 워크스페이스("Workspace N")를 더하고 그 탭으로 간다 */
export async function createWorkspace(repoPath: string): Promise<WsItem | null> {
  const repo = (await reposGet()).repos.find((r) => r.path === repoPath);
  if (!repo) return null;
  const ws = { id: newId(), name: nextWorkspaceName(repo.workspaces.map((w) => w.name)) };
  await editRepos((rs) => mapRepo(rs, repoPath, (r) => ({ ...r, workspaces: [...r.workspaces, ws] })));
  useShell.getState().openWorkspace({ path: repoPath, ...ws });
  return ws;
}

/** S-335 이름 바꾸기. 빈 글이면 바꾸지 않는다 */
export async function renameWorkspace(repoPath: string, wsId: string, input: string): Promise<void> {
  const name = normalizeName(input);
  if (name) await editRepos((rs) => mapRepo(rs, repoPath, (r) => ({ ...r, workspaces: r.workspaces.map((w) => (w.id === wsId ? { ...w, name } : w)) })));
}

/** 탭 전환. 아직 안 열린 탭은 이때 연다(S-304) */
export function switchWorkspace(repoPath: string, ws: WsItem): void {
  const s = useShell.getState();
  if (openIds(repoPath).includes(ws.id)) s.showWorkspace(ws.id);
  else s.openWorkspace({ path: repoPath, ...ws });
}

/** S-336 탭 닫기: 확인 → 콘솔 종료 → 저장 → 열린 목록·repos.json 에서 뺌 → Archive. 하나뿐이면 거절 */
export async function closeWorkspaceFlow(repoPath: string, wsId: string, confirmed = false): Promise<boolean> {
  const list = useRepoList.getState().repos.find((r) => r.path === repoPath)?.workspaces ?? [];
  const ws = list.find((w) => w.id === wsId);
  if (!ws || !canCloseWorkspace(list.length)) return false;
  const isOpen = openIds(repoPath).includes(wsId);
  const n = isOpen ? runningIds(wsId).length : 0;
  const ok = confirmed || await confirmDialog({ // confirmed = 명령 바에서 이미 스레드로 확인했다(S-602)
    title: t("Close {name}?", { name: ws.name }),
    message: (n ? tp("{n} running console will end.", "{n} running consoles will end.", n) + " " : "") + t("The board is kept in the archive."),
    confirmLabel: t("Close workspace"),
    danger: true,
  });
  if (!ok) return false;
  const sh = useShell.getState();
  if (isOpen) {
    killAll(wsId);
    const h = await handleOf(wsId);
    await h?.autosave.flush(); // 닫은 뒤 늦은 저장이 Archive 를 되살리지 않게 먼저 저장하고 떼어 낸다
    h?.detach();
    if (openIds(repoPath).length === 1) {
      const other = list.find((w) => w.id !== wsId)!; // 열린 탭이 0개가 되면 repo 가 열린 목록에서 사라지므로 다른 탭을 먼저 연다
      sh.openWorkspace({ path: repoPath, ...other });
    }
    useShell.getState().closeWorkspace(wsId);
  }
  await editRepos((rs, last) => {
    if (last[repoPath] === wsId) delete last[repoPath];
    return mapRepo(rs, repoPath, (r) => ({ ...r, workspaces: r.workspaces.filter((w) => w.id !== wsId) }));
  });
  await boardArchive(wsId);
  return true;
}

/** S-333 repo 닫기: (확인) → 보드 저장 → 콘솔 종료(S-105) → 열린 목록에서 제거 → 홈 */
export async function closeRepoFlow(repoPath: string, source: "button" | "key"): Promise<boolean> {
  const ids = openIds(repoPath);
  if (!ids.length) return false;
  if (!(await confirmUnsaved())) return false; // S-1810: 저장 안 한 스튜디오 편집
  if (useUi.getState().studio.open) useUi.getState().closeStudio();
  const n = ids.reduce((a, id) => a + runningIds(id).length, 0);
  if (closeRepoAsk(source, n)) {
    const name = useRepoList.getState().repos.find((r) => r.path === repoPath)?.name ?? baseName(repoPath);
    const ok = await confirmDialog({
      title: t("Close {name}?", { name }),
      message: n ? tp("{n} running console will end. Boards are saved.", "{n} running consoles will end. Boards are saved.", n) : t("Boards are saved."),
      confirmLabel: t("Close repo"),
      danger: true,
    });
    if (!ok) return false;
  }
  await flushAll();
  ids.forEach(killAll);
  useShell.getState().closeRepo(repoPath);
  useShell.getState().showHome();
  return true;
}

/** S-332 repo 를 연다(안 열렸으면 열고, 열렸으면 전환). repos.json 에 없으면 더한다 */
export async function openRepo(path: string): Promise<boolean> {
  if (!(await dirExists(path))) return false;
  let first: WsItem | undefined;
  await updateRepos((r) => {
    const found = r.repos.find((x) => x.path === path);
    const repo: RepoInfo = found?.workspaces.length ? found : { path, name: found?.name ?? baseName(path), workspaces: [{ id: newId(), name: "Workspace 1" }] };
    first = repo.workspaces.find((w) => w.id === r.lastWorkspace?.[path]) ?? repo.workspaces[0];
    return { ...r, repos: found ? mapRepo(r.repos, path, () => repo) : [...r.repos, repo], lastRepo: path };
  });
  const open = openRepoOf(path);
  if (open?.activeWs) useShell.getState().showWorkspace(open.activeWs);
  else if (first) switchWorkspace(path, first);
  return true;
}

/** D5: 홈 화면이 마운트되면 폴더 추가 동작을 여기 건다(홈에서 Ctrl+O = 목록에 더하고 홈에 머묾) */
export const homeHooks: { addFolder: (() => Promise<void>) | null } = { addFolder: null };

/** S-2625 이전/다음 워크스페이스 탭(끝에서 처음으로) */
export function stepWorkspace(dir: 1 | -1): void {
  const path = useShell.getState().activeRepo;
  const list = useRepoList.getState().repos.find((r) => r.path === path)?.workspaces ?? [];
  const cur = useShell.getState().openRepos.find((r) => r.path === path)?.activeWs;
  if (!path || list.length < 2) return;
  const i = list.findIndex((w) => w.id === cur);
  switchWorkspace(path, list[(i + dir + list.length) % list.length]!);
}

/** S-342 앱 키 실행 */
export async function runAppKey(a: AppKeyAction): Promise<void> {
  const s = useShell.getState();
  if (a === "regionNext" || a === "regionPrev") return cycleRegion(a === "regionNext" ? 1 : -1);
  if (a === "consoleNext" || a === "consolePrev") return cycleConsole(a === "consoleNext" ? 1 : -1);
  if (a === "commandBar") return focusCommandBar();
  if (a === "tabNext" || a === "tabPrev") return stepWorkspace(a === "tabNext" ? 1 : -1);
  if (a === "home") s.showHome();
  else if (a === "closeRepo") {
    if (s.activeRepo) await closeRepoFlow(s.activeRepo, "key");
  } else if (s.view === "home") await homeHooks.addFolder?.();
  else {
    const p = await pickFolder();
    if (p) await openRepo(p);
  }
}
