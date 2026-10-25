// A8 보드 저장 (S-200~S-209).
import { useBoard as defaultStore, type BoardNode } from "./store";
import type { BoardStore } from "./boards";
import type { Group } from "./groups";
import type { View } from "./viewport";
import { showNotice } from "../lib/notice";
import { t } from "../i18n";
import { isHub } from "../shell/hubPath";

export const FORMAT_VERSION = 1;
export const SAVED_BY = "symvibe-win";
export const READONLY_BANNER = "이 보드는 더 새 버전에서 저장돼 변경이 저장되지 않음";

export type WorkspaceInfo = { id: string; name: string; repoPath: string };
export type RepoInfo = { path: string; name: string; workspaces: { id: string; name: string }[] };
export type Repos = { repos: RepoInfo[]; lastRepo: string | null; lastWorkspace?: Record<string, string>; hubs?: { id: string; name: string }[] };
export type LoadResult = { json: string | null; source: "main" | "prev" | "empty"; archived: boolean };

// 프로세스·스크롤백 필드는 파일에 넣지도, 불러오지도 않는다 (S-109, S-201)
const RUNTIME_KEYS = ["ptyId", "pid", "scrollback", "buffer", "exited"];
const clean = (n: BoardNode): BoardNode =>
  Object.fromEntries(Object.entries(n).filter(([k]) => !RUNTIME_KEYS.includes(k))) as BoardNode;

/** S-1141: 손대지 않은 자동 웹 타일(auto:true, 탭 하나)은 저장하지 않는다. 거기 매달린 인스펙터 카드도 같이 뺀다 */
const dropAuto = (all: BoardNode[]): BoardNode[] => {
  const gone = new Set(all.filter((n) => n.kind === "web" && n.auto === true && ((n.tabs as unknown[] | undefined)?.length ?? 1) <= 1).map((n) => n.id));
  return gone.size ? all.filter((n) => !gone.has(n.id) && !(n.kind === "inspector" && gone.has(n.wireTo as string))) : all;
};

/** 파일에 쓰는 JSON 문자열 (S-201) */
export function serialize(state: { viewport: View; nodes: Record<string, BoardNode>; groups?: Group[] }, ws: WorkspaceInfo): string {
  return JSON.stringify({
    formatVersion: FORMAT_VERSION,
    savedBy: SAVED_BY,
    workspace: ws,
    viewport: state.viewport,
    nodes: dropAuto(Object.values(state.nodes)).map(clean),
    groups: state.groups ?? [],
  });
}

/** 파일 내용 → 보드 상태. formatVersion 이 앱보다 높으면 readOnly (S-206) */
export function deserialize(json: string): { viewport: View; nodes: Record<string, BoardNode>; groups: Group[]; workspace: WorkspaceInfo; readOnly: boolean } {
  const o = JSON.parse(json);
  const nodes: Record<string, BoardNode> = {};
  for (const n of (o.nodes ?? []) as BoardNode[]) nodes[n.id] = clean(n);
  return {
    viewport: o.viewport ?? { x: 0, y: 0, zoom: 1 },
    nodes,
    groups: Array.isArray(o.groups) ? o.groups : [], // 옛 파일은 []. 모르는 필드는 그대로(S-508)
    workspace: o.workspace ?? { id: "", name: "", repoPath: "" },
    readOnly: (o.formatVersion ?? 1) > FORMAT_VERSION,
  };
}

export type Autosave = {
  /** 보드가 바뀌었다 */
  touch(): void;
  /** 미저장 변경이 있으면 지금 저장 */
  flush(): Promise<void>;
  /** 백그라운드 워크스페이스는 1분마다 (S-202) */
  setBackground(b: boolean): void;
  dispose(): void;
};

const all = new Set<Autosave>();

/** 저장 일정 (S-202): 마지막 변경 2초 뒤, 첫 미저장 변경 7초 상한, 백그라운드 1분 */
export function createAutosave(opts: { save: () => void | Promise<void> }): Autosave {
  let dirty = false;
  let bg = false;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let cap: typeof quiet;
  let slow: typeof quiet;
  let lastNotice = -Infinity; // S-2666: 같은 보드의 연속 실패는 30초에 한 번만 알린다
  const stop = () => {
    clearTimeout(quiet);
    clearTimeout(cap);
    clearTimeout(slow);
    quiet = cap = slow = undefined;
  };
  const run = async () => {
    stop();
    if (!dirty) return;
    dirty = false;
    try {
      await opts.save();
    } catch (e) {
      dirty = true;
      console.error("보드 저장 실패", e);
      if (Date.now() - lastNotice >= 30_000) {
        lastNotice = Date.now();
        showNotice(t("Couldn't save the board. It will keep trying."));
      }
    }
  };
  const a: Autosave = {
    touch() {
      dirty = true;
      if (bg) {
        slow ??= setTimeout(run, 60000);
        return;
      }
      clearTimeout(quiet);
      quiet = setTimeout(run, 2000);
      cap ??= setTimeout(run, 7000);
    },
    flush: run,
    setBackground(b) {
      bg = b;
    },
    dispose() {
      stop();
      all.delete(a);
    },
  };
  all.add(a);
  return a;
}

/** 종료 때 모든 보드 저장 (A9 가 부름) */
export async function flushAll(): Promise<void> {
  await Promise.all([...all].map((a) => a.flush()));
}

export type BoardIo = {
  load: (id: string) => Promise<LoadResult>;
  save: (id: string, json: string) => Promise<void>;
};

/** 보드를 불러와 useBoard 에 넣고 변경을 지켜 저장한다 (S-206~S-209) */
export async function attachBoard(ws: WorkspaceInfo, io: BoardIo, onLoaded?: (nodes: Record<string, BoardNode>) => Promise<void>, useBoard: BoardStore = defaultStore): Promise<{ readOnly: boolean; autosave: Autosave; detach: () => void }> {
  const r = await io.load(ws.id);
  let readOnly = false;
  if (r.json) {
    const d = deserialize(r.json);
    readOnly = d.readOnly;
    await onLoaded?.(d.nodes); // A9: 콘솔이 마운트되기 전에 복원 표시·Resume 제안을 준비
    useBoard.setState({ nodes: d.nodes, viewport: d.viewport, groups: d.groups });
  }
  const autosave = createAutosave({
    save: () => (readOnly ? undefined : io.save(ws.id, serialize(useBoard.getState(), ws))),
  });
  const unsub = useBoard.subscribe((s, prev) => {
    if (s.nodes !== prev.nodes || s.groups !== prev.groups || s.viewport !== prev.viewport) autosave.touch();
  });
  return {
    readOnly,
    autosave,
    detach() {
      unsub();
      autosave.dispose();
    },
  };
}

export type StartIo = {
  reposGet: () => Promise<Repos>;
  reposSet: (r: Repos) => Promise<void>;
  dirExists: (path: string) => Promise<boolean>;
};
export type StartResult = { kind: "board"; ws: WorkspaceInfo } | { kind: "home" };

const newWsId = () => `ws-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** repo 를 연다(S-316): 폴더가 없으면 null. 워크스페이스가 없으면 Workspace 1 을 만들고, lastRepo 로 저장한다 */
export async function openRepoWs(io: StartIo, path: string): Promise<WorkspaceInfo | null> {
  if (!(await io.dirExists(path))) return null;
  const r = await io.reposGet();
  const repo = r.repos.find((x) => x.path === path);
  if (!repo) return null;
  let changed = r.lastRepo !== path;
  if (!repo.workspaces.length) {
    repo.workspaces = [{ id: newWsId(), name: "Workspace 1" }];
    changed = true;
  }
  if (changed) await io.reposSet({ ...r, lastRepo: path });
  const w = repo.workspaces.find((x) => x.id === r.lastWorkspace?.[path]) ?? repo.workspaces[0]!; // S-307
  return { id: w.id, name: w.name, repoPath: path };
}

/** 앱 시작 흐름 (S-324): 설정 reopenLastRepo 가 켜져 있고 lastRepo 폴더가 있으면 그 보드, 아니면 홈. 선택창은 띄우지 않는다 */
export async function startWorkspace(io: StartIo, opts: { reopenLastRepo: boolean }): Promise<StartResult> {
  if (!opts.reopenLastRepo) return { kind: "home" };
  const { lastRepo, hubs } = await io.reposGet();
  const hub = isHub(lastRepo) ? hubs?.find((h) => `hub:${h.id}` === lastRepo) : undefined; // H5 S-2874: Hub 는 폴더 확인 없이 hubs 에 있으면 연다
  if (isHub(lastRepo)) return hub ? { kind: "board", ws: { id: hub.id, name: hub.name, repoPath: lastRepo! } } : { kind: "home" };
  const ws = lastRepo ? await openRepoWs(io, lastRepo) : null;
  return ws ? { kind: "board", ws } : { kind: "home" };
}
