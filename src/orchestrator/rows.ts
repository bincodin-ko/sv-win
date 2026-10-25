// S-1253~S-1255: 카드 머리·행의 순수 규칙
import type { Group } from "../board/groups";
import { tm, tp } from "../i18n";
import { isConsole, type BoardNode } from "../board/store";
import { wiredTargets } from "../board/wired";
import type { Status } from "../console/status";

export type Badge = "running" | "needs you" | "ready" | "paused" | "error" | "done" | "idle";
export type Row = { id: string; name: string; agentName: string; status: Status; badge: Badge };
export type Section = { groupId: string | null; title: string; working: number; total: number; rows: Row[]; collapsed: boolean };

const BADGE: Record<Status, Badge> = { STARTING: "running", WORKING: "running", RUNNING: "running", "NEEDS YOU": "needs you", READY: "ready", PAUSED: "paused", ERROR: "error", DONE: "done", IDLE: "idle" };
export const badgeOf = (s: Status): Badge => BADGE[s];
/** 일하는 콘솔 = 뱃지가 running (S-1253 카운터·S-1254 구역 w) */
export const isWorking = (s: Status): boolean => BADGE[s] === "running";
/** 뱃지 글(저장 값 아님) — 그릴 때 t(BADGE_LABELS[badge]) */
export const BADGE_LABELS: Record<Badge, string> = { running: tm("running"), "needs you": tm("needs you"), ready: tm("ready"), paused: tm("paused"), error: tm("error"), done: tm("done"), idle: tm("idle") };
/** "N agents · M groups" / 그룹이 하나면 이름 / 0이면 "N agents" */
export function headerText(agents: number, groupNames: string[]): string {
  const a = tp("{n} agent", "{n} agents", agents);
  return groupNames.length === 0 ? a : `${a} · ${groupNames.length === 1 ? groupNames[0] : tp("{n} group", "{n} groups", groupNames.length)}`;
}
export const counterText = (statuses: Status[]): string => `${statuses.filter(isWorking).length}/${statuses.length}`;

/** 연결된 그룹마다 구역, 그룹 밖 연결 콘솔은 맨 위 헤더 없는 구역. 한 콘솔은 한 행(그룹 구역 우선, S-1254) */
export function buildSections(nodes: Record<string, BoardNode>, groups: Group[], card: BoardNode, info: (id: string) => { status: Status; agentName: string }): Section[] {
  const t = wiredTargets(nodes, groups, card);
  const collapsed = (card.collapsed as string[] | undefined) ?? [];
  const rowOf = (n: BoardNode): Row => {
    const i = info(n.id);
    return { id: n.id, name: String(n.name ?? n.id), agentName: i.agentName, status: i.status, badge: BADGE[i.status] };
  };
  const section = (groupId: string | null, title: string, rows: Row[]): Section => ({ groupId, title, rows, total: rows.length, working: rows.filter((r) => isWorking(r.status)).length, collapsed: groupId !== null && collapsed.includes(groupId) });
  const inGroup = new Set<string>();
  const secs = t.groups.map((gid) => {
    const g = groups.find((x) => x.id === gid)!;
    const rows = Object.values(nodes).filter((n) => isConsole(n) && n.groupId === gid).map(rowOf);
    rows.forEach((r) => inGroup.add(r.id));
    const w = rows.filter((r) => isWorking(r.status)).length;
    return section(gid, `${g.name.toUpperCase()} ${w}/${rows.length}`, rows);
  });
  const loose = t.consoles.filter((id) => !inGroup.has(id)).map((id) => rowOf(nodes[id]!));
  return [...(loose.length ? [section(null, "", loose)] : []), ...secs];
}
