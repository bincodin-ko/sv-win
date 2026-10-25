// S-1304·S-1305·S-1313 Mission Map 순수 모델: 보드 노드·그룹·세션 상태 → 열·선·집계·필터 결과
import type { Group } from "../board/groups";
import { t, tp } from "../i18n";
import type { BoardNode } from "../board/store";
import type { Status } from "../console/status";

export type MState = "working" | "needs" | "idle" | "done";
export type Filter = "all" | MState;
export type SessInfo = { status: Status; hooked: boolean; lastOut?: number };
export type MConsole = { id: string; name: string; agent: string; role: string | null; sub: string; groupId: string | null; state: MState; status: Status; glow: boolean };
export type MGroup = { id: string; name: string; role: string; total: number; working: number; memberIds: string[] };
export type MCard = { id: string; name: string; agents: number; consoleIds: string[]; groupIds: string[]; lastOrder: string | null };
/** from/to = "cmd" | "card:<id>" | "group:<id>" | "con:<id>" */
export type MLine = { id: string; from: string; to: string; dashed: boolean };
export type MModel = {
  empty: boolean;
  summary: string;
  counts: Record<MState, number>;
  structure: { orchestrators: number; teams: number; consoles: number; loops: number };
  cards: MCard[];
  groups: MGroup[];
  consoles: MConsole[];
  lines: MLine[];
};
export type Opts = { filter?: Filter; query?: string; now?: number; agentName?: (id: string) => string };
export const GLOW_MS = 1500;

/** S-1304: 상태 9가지 → 4가지. hook(live status)이 있는 콘솔의 READY 만 Idle, hook 없는 IDLE·READY 는 Working */
export function missionState(status: Status, hooked: boolean): MState {
  if (status === "DONE") return "done";
  if (status === "NEEDS YOU" || status === "ERROR") return "needs";
  if (status === "PAUSED" || (status === "READY" && hooked)) return "idle";
  return "working";
}
export const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? "" : "s"}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const has = (hay: string, q: string) => hay.toLowerCase().includes(q);

export function missionModel(nodes: Record<string, BoardNode>, groups: Group[], sess: (nodeId: string) => SessInfo | undefined, loops: number, o: Opts = {}): MModel {
  const filter = o.filter ?? "all", q = (o.query ?? "").trim().toLowerCase(), now = o.now ?? Date.now(), agentName = o.agentName ?? ((id: string) => id);
  const list = Object.values(nodes);
  const gById = new Map(groups.map((g) => [g.id, g]));
  const all: MConsole[] = list.filter((n) => n.kind === "console").map((n) => {
    const s = sess(n.id), g = gById.get(n.groupId as string);
    const status = s?.status ?? "DONE", state = missionState(status, !!s?.hooked);
    const agent = agentName(n.agentId as string), role = g ? cap(g.role) : null;
    return { id: n.id, name: n.name as string, agent, role, sub: [agent, role].filter(Boolean).join(" · "), groupId: g ? g.id : null, state, status, glow: state === "working" && s?.lastOut !== undefined && now - s.lastOut < GLOW_MS };
  });
  const orchs = list.filter((n) => n.kind === "orchestrator");
  const counts: Record<MState, number> = { working: 0, needs: 0, idle: 0, done: 0 };
  for (const c of all) counts[c.state]++;
  const structure = { orchestrators: orchs.length, teams: groups.filter((g) => all.some((c) => c.groupId === g.id)).length, consoles: all.length, loops };
  const summary = [t("Mission Map"), tp("{n} orchestrator", "{n} orchestrators", structure.orchestrators), tp("{n} team", "{n} teams", structure.teams), tp("{n} console", "{n} consoles", all.length), t("{n} working", { n: counts.working })].join(" · ");

  // 카드가 연결한 것: 그룹 id 또는 콘솔 id(살아 있는 것만)
  const wiredOf = (c: BoardNode) => {
    const w = ((c.wired as string[] | undefined) ?? []);
    return { groups: w.filter((id) => gById.has(id) && all.some((x) => x.groupId === id)), consoles: w.filter((id) => all.some((x) => x.id === id)) };
  };
  const wireds = orchs.map((c) => ({ c, w: wiredOf(c) }));

  const gHit = (id: string | null) => !!q && id !== null && has(gById.get(id)!.name, q);
  const visibleC = all.filter((c) => (filter === "all" || c.state === filter) && (!q || has(c.name, q) || has(c.agent, q) || (c.role !== null && has(c.role, q)) || gHit(c.groupId)));
  const vIds = new Set(visibleC.map((c) => c.id));

  const mGroups: MGroup[] = groups.flatMap((g) => {
    const mem = all.filter((c) => c.groupId === g.id);
    const shown = mem.filter((c) => vIds.has(c.id));
    return shown.length ? [{ id: g.id, name: g.name.trim() || cap(g.role), role: g.role, total: mem.length, working: mem.filter((c) => c.state === "working").length, memberIds: shown.map((c) => c.id) }] : [];
  });
  const gIds = new Set(mGroups.map((g) => g.id));

  const mCards: MCard[] = wireds.flatMap(({ c, w }) => {
    const members = new Set<string>(w.consoles);
    for (const x of all) if (x.groupId && w.groups.includes(x.groupId)) members.add(x.id);
    const connectedVisible = [...members].some((id) => vIds.has(id));
    const name = (c.name as string | undefined) || "Orchestrator";
    const show = connectedVisible || (filter === "all" && (!q || has(name, q)));
    return show ? [{ id: c.id, name, agents: members.size, consoleIds: w.consoles.filter((id) => vIds.has(id)), groupIds: w.groups.filter((id) => gIds.has(id)), lastOrder: (c.lastOrder as { text?: string } | undefined)?.text ?? null }] : [];
  });

  const lines: MLine[] = [];
  const add = (from: string, to: string, dashed = false) => lines.push({ id: `${from}>${to}`, from, to, dashed });
  const cardGroups = new Set<string>(), cardCons = new Set<string>();
  for (const k of mCards) {
    add("cmd", `card:${k.id}`);
    for (const g of wireds.find((x) => x.c.id === k.id)!.w.groups) cardGroups.add(g);
    for (const c of wireds.find((x) => x.c.id === k.id)!.w.consoles) cardCons.add(c);
    for (const g of k.groupIds) add(`card:${k.id}`, `group:${g}`);
    for (const c of k.consoleIds) add(`card:${k.id}`, `con:${c}`);
  }
  for (const g of mGroups) {
    for (const id of g.memberIds) add(`group:${g.id}`, `con:${id}`);
    if (!cardGroups.has(g.id)) add("cmd", `group:${g.id}`, true);
  }
  for (const c of visibleC) if (!c.groupId && !cardCons.has(c.id)) add("cmd", `con:${c.id}`, true);
  // 카드가 직접 연결한 콘솔이 그룹 밖에서 보이지 않는 경우는 위 카드 루프에서 이미 걸러졌다

  return { empty: all.length === 0, summary, counts, structure, cards: mCards, groups: mGroups, consoles: visibleC, lines };
}
