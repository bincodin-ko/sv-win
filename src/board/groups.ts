// B7 그룹 바탕 (S-500~S-512). 순수 함수.
import { roleOf, type Role } from "../commandbar/roles";
import type { BoardNode } from "./store";
import { t } from "../i18n";
import { roleLabel } from "./roles";

export type Group = { id: string; name: string; role: Role };
export type GRect = { x: number; y: number; w: number; h: number };
export type GroupLookup = { kind: "found"; group: Group } | { kind: "ambiguous" } | { kind: "notFound" };

/** 할로 여백(월드 px). 값은 추측(S-502) */
export const GROUP_PAD = 32;
/** 그룹 이름 최대 글자 수(S-506) */
export const GROUP_NAME_MAX = 24;

/** 안 쓴 가장 작은 N 의 "Group N" (S-500) */
export function nextGroupName(groups: Group[]): string {
  const used = new Set(groups.flatMap((g) => { const m = /^Group (\d+)$/.exec(g.name); return m ? [Number(m[1])] : []; }));
  let n = 1;
  while (used.has(n)) n++;
  return `Group ${n}`;
}
/** 화면에 그릴 그룹 이름(S-2436): 저장된 이름("Group 3"·역할 기본 이름)은 영어 그대로 두고 표시만 번역. 사용자가 지은 이름은 그대로 */
export function groupLabel(g: Group): string {
  const m = /^Group (\d+)$/.exec(g.name.trim());
  if (m) return t("Group {n}", { n: m[1]! });
  const name = g.name.trim();
  return !name || name === groupTitle({ ...g, name: "" }) ? roleLabel(g.role) : name;
}
/** 이 그룹 소속 노드들 (S-511) */
export function membersOf(nodes: Record<string, BoardNode>, groupId: string): BoardNode[] {
  return Object.values(nodes).filter((n) => n.groupId === groupId);
}
/** 멤버 경계 상자에 pad 를 사방으로 더한 틀. 멤버가 없으면 null (S-502) */
export function groupBounds(members: BoardNode[], pad: number): GRect | null {
  if (!members.length) return null;
  const x0 = Math.min(...members.map((n) => n.x)), y0 = Math.min(...members.map((n) => n.y));
  const x1 = Math.max(...members.map((n) => n.x + n.w)), y1 = Math.max(...members.map((n) => n.y + n.h));
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}
/** 표시 이름: 이름이 비면 역할 이름("backend" -> "Backend") (S-506) */
export function groupTitle(g: Group): string {
  return g.name.trim() || g.role.charAt(0).toUpperCase() + g.role.slice(1);
}
/** "group" 뒤의 말(번호·이름) 또는 "the <role> group" 해석 (S-511, S-577) */
export function groupByName(groups: Group[], text: string): GroupLookup {
  const pick = (hits: Group[]): GroupLookup => (hits.length === 1 ? { kind: "found", group: hits[0]! } : hits.length ? { kind: "ambiguous" } : { kind: "notFound" });
  let t = text.trim().toLowerCase();
  const r = /^the\s+(\S+)\s+group$/.exec(t);
  const role = r && roleOf(r[1]!);
  if (role) return pick(groups.filter((g) => g.role === role));
  if (/^\d+$/.test(t)) t = `group ${t}`;
  return pick(groups.filter((g) => g.name.trim().toLowerCase() === t));
}
/** 실행 중인 멤버 수 (S-502) */
export function runningCount(members: BoardNode[], isRunning: (id: string) => boolean): number {
  return members.filter((n) => isRunning(n.id)).length;
}
/** 놓은 노드의 중심이 들어 있는 할로의 그룹 id, 없으면 null. 겹치면 면적이 작은 쪽 (S-504) */
export function dropTarget(c: { x: number; y: number }, groups: Group[], bounds: Record<string, GRect>): string | null {
  let best: string | null = null, area = Infinity;
  for (const g of groups) {
    const b = bounds[g.id];
    if (b && c.x >= b.x && c.x <= b.x + b.w && c.y >= b.y && c.y <= b.y + b.h && b.w * b.h < area) { best = g.id; area = b.w * b.h; }
  }
  return best;
}
/** 끌기 시작 때의 할로들. 멤버 2개 이상인 그룹을 통째로 끌면 함께 움직이므로 뺀다(소속 안 바뀜) (S-504) */
export function dragHalos(nodes: Record<string, BoardNode>, groups: Group[], dragged: string[]): Record<string, GRect> {
  const out: Record<string, GRect> = {};
  for (const g of groups) {
    const m = membersOf(nodes, g.id);
    const b = groupBounds(m, GROUP_PAD);
    if (b && !(m.length > 1 && m.every((n) => dragged.includes(n.id)))) out[g.id] = b;
  }
  return out;
}
