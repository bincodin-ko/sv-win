// B2 S-300·S-301·S-343: 앱 셸 상태 — 열린 repo·워크스페이스, 어느 것이 보이는지(홈/보드)
// 상태 바꾸기만 한다(순수). 불러오기·화면은 AppShell. 닫으면 저장하고 저장소를 놓는다(loadWorkspace/unloadWorkspace).
import { create } from "zustand";
import { registry, getStore } from "../board/boards";
import { attachBoard, openRepoWs, type WorkspaceInfo } from "../board/persist";
import type { BoardStore } from "../board/boards";
import { prepareRestore, setRepoPath } from "../console/offers";
import { removeRepoFrom } from "../home/repoList";
import { boardLoad, boardSave, dirExists, reposGet, reposSet } from "../lib/ipc";

import { isHub } from "./hubPath";
export { isHub };
export type WsRef = { path: string; id: string; name: string };
export type OpenWs = { id: string; name: string; loaded: boolean; readOnly?: boolean };
export type OpenRepo = { path: string; workspaces: OpenWs[]; activeWs: string | null };
type Shell = {
  openRepos: OpenRepo[];
  activeRepo: string | null;
  view: "home" | "board";
  /** 워크스페이스를 연다(없으면 repo 도 열고, 불러오고, 그 탭을 보인다) */
  openWorkspace: (ws: WsRef) => void;
  /** 이미 열린 워크스페이스를 보인다(다른 건 숨기기만) */
  showWorkspace: (wsId: string) => void;
  showHome: () => void;
  /** 워크스페이스 하나를 닫는다(그 콘솔만 끝남) */
  closeWorkspace: (wsId: string) => void;
  /** repo 와 그 워크스페이스 전부를 닫는다 */
  closeRepo: (path: string) => void;
  /** 불러오기가 끝났다 */
  markLoaded: (wsId: string, readOnly: boolean) => void;
};

const mapWs = (repos: OpenRepo[], id: string, f: (w: OpenWs) => OpenWs) =>
  repos.map((r) => (r.workspaces.some((w) => w.id === id) ? { ...r, workspaces: r.workspaces.map((w) => (w.id === id ? f(w) : w)) } : r));

export const useShell = create<Shell>((set, get) => ({
  openRepos: [],
  activeRepo: null,
  view: "board",
  openWorkspace: (ws) =>
    set((s) => {
      const repos = s.openRepos.some((r) => r.path === ws.path) ? s.openRepos : [...s.openRepos, { path: ws.path, workspaces: [], activeWs: null }];
      return {
        openRepos: repos.map((r) =>
          r.path !== ws.path ? r : { ...r, activeWs: ws.id, workspaces: r.workspaces.some((w) => w.id === ws.id) ? r.workspaces : [...r.workspaces, { id: ws.id, name: ws.name, loaded: false }] },
        ),
        activeRepo: ws.path,
        view: "board",
      };
    }),
  showWorkspace: (wsId) =>
    set((s) => {
      const repo = s.openRepos.find((r) => r.workspaces.some((w) => w.id === wsId));
      if (!repo) return s;
      return { openRepos: s.openRepos.map((r) => (r === repo ? { ...r, activeWs: wsId } : r)), activeRepo: repo.path, view: "board" };
    }),
  showHome: () => set({ view: "home" }),
  closeWorkspace: (wsId) => {
    unloadWorkspace(wsId);
    set((s) => {
      const repos = s.openRepos
        .map((r) => {
          const workspaces = r.workspaces.filter((w) => w.id !== wsId);
          return { ...r, workspaces, activeWs: r.activeWs === wsId ? (workspaces.at(-1)?.id ?? null) : r.activeWs };
        })
        .filter((r) => r.workspaces.length > 0);
      return { openRepos: repos, activeRepo: repos.some((r) => r.path === s.activeRepo) ? s.activeRepo : (repos.at(-1)?.path ?? null) };
    });
  },
  closeRepo: (path) => {
    for (const w of get().openRepos.find((r) => r.path === path)?.workspaces ?? []) unloadWorkspace(w.id);
    set((s) => {
      const repos = s.openRepos.filter((r) => r.path !== path);
      return { openRepos: repos, activeRepo: s.activeRepo === path ? (repos.at(-1)?.path ?? null) : s.activeRepo };
    });
  },
  markLoaded: (wsId, readOnly) => set((s) => ({ openRepos: mapWs(s.openRepos, wsId, (w) => ({ ...w, loaded: true, readOnly })) })),
}));

/** 이 워크스페이스가 Hub 보드에 속하는가 */
export const isHubWs = (wsId: string): boolean => isHub(useShell.getState().openRepos.find((r) => r.workspaces.some((w) => w.id === wsId))?.path);

type Handle = Awaited<ReturnType<typeof attachBoard>>;
const handles = new Map<string, Promise<Handle>>();
export const handleOf = (wsId: string) => handles.get(wsId);

/** 워크스페이스 보드를 불러와 자기 저장소에 넣고 저장을 건다. 같은 id 는 한 번만(S-304 지연 불러오기). init = 보드가 뜨기 전에 한 번 */
export function loadWorkspace(ws: WorkspaceInfo, init?: (store: BoardStore) => void): Promise<Handle> {
  let p = handles.get(ws.id);
  if (!p) {
    setRepoPath(isHub(ws.repoPath) ? null : ws.repoPath, ws.id);
    p = attachBoard(ws, { load: boardLoad, save: boardSave }, (nodes) => prepareRestore(ws.id, nodes), getStore(ws.id)).then((h) => {
      init?.(getStore(ws.id));
      useShell.getState().markLoaded(ws.id, h.readOnly);
      return h;
    });
    handles.set(ws.id, p);
  }
  return p;
}

/** 닫을 때: 마지막으로 저장하고 저장소를 놓는다 */
function unloadWorkspace(wsId: string): void {
  const p = handles.get(wsId);
  handles.delete(wsId);
  registry.delete(wsId);
  void p?.then(async (h) => {
    await h.autosave.flush();
    h.detach();
  });
}

// ---- B3 홈 화면: repo 열기·제거 ----
/** repo 의 보드를 연다(S-316): 이미 열려 있으면 그 repo 로 돌아가고, 아니면 워크스페이스를 열어 보인다. 연 repo 는 lastRepo. 폴더가 없으면 false */
export async function openRepo(path: string): Promise<boolean> {
  const io = { reposGet, reposSet, dirExists };
  const ws = await openRepoWs(io, path); // lastRepo 저장도 여기서
  if (!ws) return false;
  const open = useShell.getState().openRepos.find((r) => r.path === path);
  if (open?.activeWs) useShell.getState().showWorkspace(open.activeWs);
  else useShell.getState().openWorkspace({ path, id: ws.id, name: ws.name });
  return true;
}

/** repo 를 목록에서 뺀다(S-319): 열린 보드는 저장·닫고(콘솔 끝) repos.json 에서 뺀다 */
export async function removeRepo(path: string): Promise<void> {
  useShell.getState().closeRepo(path);
  await reposSet(removeRepoFrom(await reposGet(), path));
}
