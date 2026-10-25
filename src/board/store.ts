import { create } from "zustand";
import { agentsList, defaultAgent, settingsGet, settingsSet } from "../agents/api";
import { nextName } from "../console/names";
import { useSettings } from "../settings/useSettings";
import { copyToClip, readClip, pasteShift, type ClipNode } from "./clipboard";
import { emptyHistory, record, redo as histRedo, undo as histUndo, type History } from "./history";
import { GROUP_NAME_MAX, groupTitle, nextGroupName, type Group } from "./groups";
import { GAP, findSpot } from "./placement";
import { gridLayout } from "../composer/slots";
import { bounds } from "./selection";
import { getKind } from "./kinds/registry";
import { pruneWired, toggleWired as toggleW } from "./wired";
import { clampCoord, clampZoom, type View } from "./viewport";

export type BoardNode = { id: string; kind: string; x: number; y: number; w: number; h: number; z: number; [k: string]: unknown };

export const CONSOLE_W = 720;
export const CONSOLE_H = 440;
export const CONSOLE_MIN_W = 360;
export const CONSOLE_MIN_H = 200;
export type ConsoleNode = BoardNode & { kind: "console"; name: string; agentId: string; textSize: number | null; yolo: boolean; groupId?: string; profile?: string; cwd?: string };
export const isConsole = (n: BoardNode | undefined): n is ConsoleNode => n?.kind === "console";

/** 되돌리기 한 단계 = 노드와 그룹(S-510) */
type Snap = { nodes: Record<string, BoardNode>; groups: Group[] };

type BoardState = {
  viewport: View;
  nodes: Record<string, BoardNode>;
  setViewport: (v: View) => void;
  addNode: (n: BoardNode) => void;
  updateNode: (id: string, patch: Partial<BoardNode>) => void;
  removeNode: (id: string) => void;
  /** 새 콘솔을 겹치지 않는 자리에 놓는다(S-030). at = 기준점(노드 왼쪽 위, 월드 좌표), 없으면 화면 가운데. 새 id 를 돌려준다 */
  /** A6: 선택(노드 id 목록)·되돌리기·도구 */
  selection: string[];
  tool: string;
  /** B7: 그룹 목록(S-508). 콘솔의 소속은 노드의 groupId */
  groups: Group[];
  /** 선택한 콘솔 둘 이상을 새 그룹으로(S-500). 새 그룹 id, 거절이면 null. 1단계 기록 */
  createGroup: (ids: string[], opts?: { name?: string; role?: Group["role"] }) => string | null;
  /** 그룹을 풀고 콘솔은 남긴다(S-501). 1단계 기록 */
  dissolveGroup: (id: string) => void;
  /** 이름을 바꾼다(S-506): 앞뒤 공백 제거, 24자까지 */
  renameGroup: (id: string, name: string) => void;
  /** 콘솔의 소속을 바꾼다(null = 빠짐). 기록 단계를 만들지 않는다(끌기 시작의 commit 에 포함, S-504). 멤버 0개가 된 그룹은 사라진다(S-505) */
  setGroupOf: (nodeId: string, groupId: string | null) => void;
  history: History<Snap>;
  select: (ids: string[]) => void;
  setTool: (t: string) => void;
  /** 지금 상태를 되돌리기 기록에 한 단계로 남긴다(끌기 시작 때 1번) */
  commit: () => void;
  moveBy: (ids: string[], dx: number, dy: number) => void;
  /** U3 S-2646: Tidy up — 여러 노드의 자리를 한 번에 바꾼다. commit 한 번(되돌리기 한 단계). 바꿀 게 없으면 기록도 없다 */
  arrange: (positions: Record<string, { x: number; y: number }>) => void;
  /** noCommit = true 면 되돌리기 기록을 새로 만들지 않는다(지우개 한 드래그를 1단계로 합칠 때, S-867) */
  removeNodes: (ids: string[], noCommit?: boolean) => void;
  /** S-1226: 카드의 wired 에 대상(콘솔 또는 그룹 id)을 넣거나 뺀다. 기본은 되돌리기 1단계, noCommit = 연결 모드가 Done 까지 한 단계로 묶을 때(S-1227) */
  toggleWired: (cardId: string, targetId: string, noCommit?: boolean) => void;
  copy: (ids: string[]) => void;
  /** 클립보드를 붙인다. at = 묶음 왼쪽 위(월드 좌표), 없으면 원본 +24,+24(겹치면 S-030). 새 id 들을 돌려준다 */
  paste: (at?: { x: number; y: number }) => string[];
  duplicate: (ids: string[]) => string[];
  undo: () => boolean;
  redo: () => boolean;
  bringToFront: (ids: string[]) => void;
  /** C1 S-810: 선택한 노드를 맨 뒤로(z 최소, 서로의 순서 유지). 1단계 기록 */
  sendToBack: (ids: string[]) => void;
  spawnConsole: (agentId: string, at?: { x: number; y: number }, opts?: { textSize?: number | null; profile?: string | null; cwd?: string }) => string;
  /** B8: 콘솔 여럿을 격자 덩어리로 한 번에 놓는다(S-526). group 이 있고 둘 이상이면 같은 단계에서 묶는다(S-527). at = 덩어리 왼쪽 위 */
  spawnMany: (agentIds: string[], at?: { x: number; y: number }, group?: { name: string; role: Group["role"] }) => { ids: string[]; groupId: string | null };
  /** A7: 무장된 에이전트(S-043, null = 없음)·최근 에이전트 ≤3(S-012). 설정 파일에 저장 */
  armedAgent: string | null;
  recentAgents: string[];
  setArmed: (id: string | null) => void;
  /** 콘솔을 놓고 선택하고 최근 목록에 올린다(레일·고리·빈 보드 공용). 새 id */
  spawnAgent: (agentId: string, at?: { x: number; y: number }, opts?: { cwd?: string }) => string;
  /** 시작 때 한 번: 저장된 무장·최근 읽기(무장이 없으면 기본 에이전트, S-043) */
  loadPrefs: () => Promise<void>;
};

let seq = 0;

const snap = (s: { nodes: Record<string, BoardNode>; groups?: Group[] }): Snap => ({ nodes: s.nodes, groups: s.groups ?? [] });
/** 멤버가 없는 그룹은 사라진다(S-505) */
const live = (groups: Group[], nodes: Record<string, BoardNode>) => groups.filter((g) => Object.values(nodes).some((n) => n.groupId === g.id));

/** S-1222: 모든 카드의 wired 에서 gone 을 뺀다(wired 가 있는 노드만 새로) */
const pruneAll = (nodes: Record<string, BoardNode>, gone: string[]): Record<string, BoardNode> =>
  Object.fromEntries(Object.entries(nodes).map(([k, n]) => [k, Array.isArray(n.wired) && (n.wired as string[]).some((x) => gone.includes(x)) ? { ...n, wired: pruneWired(n.wired as string[], gone) } : n]));

const fix = (n: BoardNode): BoardNode => ({ ...n, x: clampCoord(n.x), y: clampCoord(n.y) });

/** 노드 사본들을 새 id·새 이름·맨 위 z 로 놓는다(S-026). 새 세션은 콘솔이 마운트되며 시작된다. 1단계 기록 */
export function newId(kind: string, nodes: Record<string, BoardNode>): string {
  const p = kind === "console" ? "c" : kind;
  let id = `${p}${++seq}`;
  while (nodes[id]) id = `${p}${++seq}`;
  return id;
}

export const makeBoardStore = () => create<BoardState>((set, get) => {
  function insert(items: ClipNode[], sourceIds: string[], at?: { x: number; y: number }): string[] {
    if (!items.length) return [];
    const { nodes } = get();
    const b = bounds(items)!;
    const { dx, dy } = at ? { dx: at.x - b.x, dy: at.y - b.y } : pasteShift(items, Object.values(nodes), sourceIds);
    get().commit();
    const all = { ...get().nodes };
    let z = Object.values(all).reduce((m, n) => Math.max(m, n.z), 0);
    const made: string[] = [];
    for (const { groupId: _g, ...it } of items as (ClipNode & { groupId?: string })[]) { // 그룹은 복사되지 않는다(S-509)
      const id = newId(it.kind, all);
      const names = Object.values(all).flatMap((n) => (isConsole(n) ? [n.name] : []));
      all[id] = fix({ ...it, id, x: it.x + dx, y: it.y + dy, z: ++z, ...(it.kind === "console" ? { name: nextName(names), resume: undefined } : {}) });
      made.push(id);
    }
    // S-813: wireTo 는 같이 복사된 대상이 있으면 새 id 로 잇고 없으면 끊는다
    const newOf = new Map(sourceIds.map((old, i) => [old, made[i]!]));
    for (const id of made) {
      const to = all[id]!.wireTo;
      if (to === undefined) continue;
      const { wireTo: _w, ...rest } = all[id]!;
      all[id] = newOf.has(to as string) ? { ...rest, wireTo: newOf.get(to as string)! } : (rest as BoardNode);
    }
    // S-1222: wired 도 같다(그룹은 복사되지 않으니 그룹 id 는 끊긴다)
    for (const id of made) {
      if (!Array.isArray(all[id]!.wired)) continue;
      all[id] = { ...all[id]!, wired: (all[id]!.wired as string[]).flatMap((t) => (newOf.has(t) ? [newOf.get(t)!] : [])) };
    }
    set({ nodes: all, selection: made });
    return made;
  }
  return {
  armedAgent: null,
  recentAgents: [],
  setArmed: (id) => { set({ armedAgent: id }); void settingsSet({ armedAgent: id }); },
  spawnAgent: (agentId, at, opts) => {
    const id = get().spawnConsole(agentId, at, opts);
    const recentAgents = [agentId, ...get().recentAgents.filter((a) => a !== agentId)].slice(0, 3);
    set({ selection: [id], recentAgents });
    void settingsSet({ recentAgents });
    return id;
  },
  loadPrefs: async () => {
    const s = await settingsGet();
    const known = new Set((await agentsList()).map((a) => a.id));
    const saved = typeof s.armedAgent === "string" && known.has(s.armedAgent) ? s.armedAgent : null;
    const armed = saved ?? (await defaultAgent());
    set((st) => ({ armedAgent: st.armedAgent ?? armed, recentAgents: Array.isArray(s.recentAgents) ? (s.recentAgents as string[]).slice(0, 3) : st.recentAgents }));
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: {},
  setViewport: (v) => set({ viewport: { ...v, zoom: clampZoom(v.zoom) } }),
  addNode: (n) => set((s) => ({ nodes: { ...s.nodes, [n.id]: fix(n) } })),
  updateNode: (id, patch) => set((s) => (s.nodes[id] ? { nodes: { ...s.nodes, [id]: fix({ ...s.nodes[id], ...patch }) } } : s)),
  removeNode: (id) => get().removeNodes([id]),
  selection: [],
  tool: "select",
  groups: [],
  createGroup: (ids, opts) => {
    const { nodes, groups = [] } = get();
    const cons = [...new Set(ids)].filter((id) => isConsole(nodes[id]));
    if (cons.length < 2) return null;
    get().commit();
    let id = `g${groups.length + 1}`;
    for (let i = groups.length + 1; groups.some((g) => g.id === id); ) id = `g${++i}`;
    const next = { ...nodes };
    for (const c of cons) next[c] = { ...next[c]!, groupId: id };
    const role = opts?.role ?? "general";
    // D12: 이름이 비면 역할 이름(general 이면 Group N)으로 채운다
    const name = opts?.name?.trim().slice(0, GROUP_NAME_MAX) || (role === "general" ? nextGroupName(groups) : groupTitle({ id, name: "", role }));
    const g: Group = { id, name, role };
    set({ nodes: next, groups: live([...groups, g], next) });
    return id;
  },
  dissolveGroup: (id) => {
    const { nodes, groups = [] } = get();
    if (!groups.some((g) => g.id === id)) return;
    get().commit();
    set({
      groups: groups.filter((g) => g.id !== id),
      nodes: pruneAll(Object.fromEntries(Object.entries(nodes).map(([k, n]) => { if (n.groupId !== id) return [k, n]; const { groupId: _g, ...rest } = n; return [k, rest as BoardNode]; })), [id]),
    });
  },
  renameGroup: (id, name) => {
    const { groups = [] } = get();
    if (!groups.some((g) => g.id === id)) return;
    get().commit();
    set({ groups: groups.map((g) => (g.id === id ? { ...g, name: name.trim().slice(0, GROUP_NAME_MAX) } : g)) });
  },
  setGroupOf: (nodeId, groupId) => {
    const { nodes, groups = [] } = get();
    const n = nodes[nodeId];
    if (!isConsole(n) || (groupId !== null && !groups.some((g) => g.id === groupId)) || (n.groupId ?? null) === groupId) return;
    const { groupId: _g, ...rest } = n;
    const next = { ...nodes, [nodeId]: (groupId === null ? rest : { ...rest, groupId }) as BoardNode };
    set({ nodes: next, groups: live(groups, next) });
  },
  history: emptyHistory(),
  select: (ids) => set({ selection: ids }),
  setTool: (t) => set({ tool: t }),
  commit: () => set((s) => ({ history: record(s.history, snap(s)) })),
  arrange: (positions) => {
    const ids = Object.keys(positions).filter((id) => get().nodes[id]);
    if (!ids.length) return;
    get().commit();
    for (const id of ids) get().updateNode(id, positions[id]!);
  },
  moveBy: (ids, dx, dy) => {
    get().commit();
    for (const id of ids) {
      const n = get().nodes[id];
      if (n) get().updateNode(id, { x: n.x + dx, y: n.y + dy });
    }
  },
  removeNodes: (ids, noCommit) => {
    const gone = ids.filter((id) => get().nodes[id]);
    if (!gone.length) return;
    if (!noCommit) get().commit();
    set((s) => {
      // S-812: deleteWithTarget 종류는 대상과 같이(연쇄), S-811: 남은 노드의 끊긴 wireTo 는 지운다
      for (let more = true; more; ) {
        more = false;
        for (const n of Object.values(s.nodes)) {
          if (!gone.includes(n.id) && typeof n.wireTo === "string" && gone.includes(n.wireTo) && getKind(n.kind)?.deleteWithTarget) (gone.push(n.id), (more = true));
        }
      }
      const nodes = Object.fromEntries(Object.entries(s.nodes).filter(([id]) => !gone.includes(id)).map(([id, n]) => {
        if (typeof n.wireTo !== "string" || !gone.includes(n.wireTo)) return [id, n];
        const { wireTo: _w, ...rest } = n;
        return [id, rest as BoardNode];
      }));
      const groups = live(s.groups ?? [], nodes);
      const lost = (s.groups ?? []).filter((g) => !groups.some((x) => x.id === g.id)).map((g) => g.id); // 멤버 전멸로 사라진 그룹도
      return { nodes: pruneAll(nodes, [...gone, ...lost]), groups, selection: s.selection.filter((id) => !gone.includes(id)) };
    });
  },
  toggleWired: (cardId, targetId, noCommit) => {
    const n = get().nodes[cardId];
    if (!n) return;
    if (!noCommit) get().commit();
    set((s) => ({ nodes: { ...s.nodes, [cardId]: { ...n, wired: toggleW(n.wired as string[] | undefined, targetId) } } }));
  },
  copy: (ids) => copyToClip(ids.flatMap((id) => (get().nodes[id] ? [get().nodes[id]!] : []))),
  paste: (at) => {
    const c = readClip();
    return c ? insert(c.nodes, c.sourceIds, at) : [];
  },
  duplicate: (ids) => {
    const list = ids.flatMap((id) => (get().nodes[id] ? [get().nodes[id]!] : []));
    return list.length ? insert(list.map(({ id: _i, z: _z, ...rest }) => rest as ClipNode), list.map((n) => n.id)) : [];
  },
  undo: () => {
    const s = get(), u = histUndo(s.history, snap(s));
    if (u) set({ ...u.state, history: u.h, selection: s.selection.filter((id) => u.state.nodes[id]) });
    return !!u;
  },
  redo: () => {
    const s = get(), u = histRedo(s.history, snap(s));
    if (u) set({ ...u.state, history: u.h, selection: s.selection.filter((id) => u.state.nodes[id]) });
    return !!u;
  },
  bringToFront: (ids) => {
    const ordered = Object.values(get().nodes).filter((n) => ids.includes(n.id)).sort((p, q) => p.z - q.z);
    if (!ordered.length) return;
    get().commit();
    const top = Object.values(get().nodes).reduce((m, n) => Math.max(m, n.z), 0);
    ordered.forEach((n, i) => get().updateNode(n.id, { z: top + 1 + i }));
  },
  sendToBack: (ids) => {
    const ordered = Object.values(get().nodes).filter((n) => ids.includes(n.id)).sort((p, q) => p.z - q.z);
    if (!ordered.length) return;
    get().commit();
    const low = Object.values(get().nodes).reduce((m, n) => Math.min(m, n.z), Infinity);
    ordered.forEach((n, i) => get().updateNode(n.id, { z: low - ordered.length + i }));
  },
  spawnMany: (agentIds, at, group) => {
    const agents = agentIds.slice(0, 12);
    if (!agents.length) return { ids: [], groupId: null };
    get().commit();
    const { nodes, viewport: v } = get();
    const list = Object.values(nodes);
    const { cols, rows, cells } = gridLayout(agents.length, { w: CONSOLE_W, h: CONSOLE_H });
    const block = { w: cols * CONSOLE_W + (cols - 1) * GAP, h: rows * CONSOLE_H + (rows - 1) * GAP };
    const base = at ?? { x: -v.x / v.zoom - block.w / 2, y: -v.y / v.zoom - block.h / 2 };
    const spot = findSpot(base, block, list);
    const next = { ...nodes };
    const names = list.filter(isConsole).map((n) => n.name);
    let z = list.reduce((m, n) => Math.max(m, n.z), 0);
    const ids = agents.map((agentId, i) => {
      const id = newId("console", next);
      const name = nextName(names);
      names.push(name);
      next[id] = fix({ id, kind: "console", x: spot.x + cells[i]!.x, y: spot.y + cells[i]!.y, w: CONSOLE_W, h: CONSOLE_H, z: ++z, name, agentId, textSize: null, yolo: false } as ConsoleNode);
      return id;
    });
    set({ nodes: next, selection: ids });
    if (!group || ids.length < 2) return { ids, groupId: null };
    const h = get().history; // createGroup 이 한 단계를 더 쌓으므로 되돌려 둔다(S-527)
    const groupId = get().createGroup(ids, group);
    set({ history: h });
    return { ids, groupId };
  },
  spawnConsole: (agentId, at, opts) => {
    get().commit();
    const { nodes, viewport: v } = get();
    const list = Object.values(nodes);
    const base = at ?? { x: -v.x / v.zoom - CONSOLE_W / 2, y: -v.y / v.zoom - CONSOLE_H / 2 };
    const spot = findSpot(base, { w: CONSOLE_W, h: CONSOLE_H }, list);
    let id = `c${++seq}`;
    while (nodes[id]) id = `c${++seq}`;
    const z = list.reduce((m, n) => Math.max(m, n.z), 0) + 1;
    // D12 S-1625: 새 콘솔은 만들 때 쓰는 계정(profileUse)을 필드로 박는다. 이후 Use 를 바꿔도 이 콘솔은 그대로
    const use = (useSettings.getState().s.profileUse as Record<string, string | null | undefined> | undefined)?.[agentId];
    const profile = (opts && "profile" in opts ? opts.profile : use) || undefined;
    const node: ConsoleNode = {
      id, kind: "console", ...spot, w: CONSOLE_W, h: CONSOLE_H, z,
      name: nextName(list.filter(isConsole).map((n) => n.name)),
      agentId, textSize: opts?.textSize ?? null, yolo: false,
      ...(opts?.cwd ? { cwd: opts.cwd } : {}),
      ...(profile && (agentId === "claude" || agentId === "codex") ? { profile } : {}),
    };
    set((s) => ({ nodes: { ...s.nodes, [id]: fix(node) } }));
    return id;
  },
};
});

/** 기본 저장소: 시험·`?term` 계열과 BoardScope 밖 코드가 쓴다. 워크스페이스는 boards.ts 의 getStore */
export const useBoard = makeBoardStore();

if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) Object.assign(window, { __setArmed: (id: string | null) => useBoard.setState({ armedAgent: id }) }); // 시험용
