// B13 plan 을 보드에 적용 (S-642, S-644). store 함수(commit + 한 번의 setState)만 쓴다: 되돌리기 1단계.
import type { Group } from "../board/groups";
import { getKind } from "../board/kinds/registry";
import { findSpot } from "../board/placement";
import { CONSOLE_H, CONSOLE_W, isConsole, type BoardNode, type useBoard } from "../board/store";
import { nextName } from "../console/names";
import type { PresetDef } from "./defs";
import { planDeploy, type PlanOpts } from "./plan";
import { stampLayout, type SavedLayout } from "./saved";

export type Store = typeof useBoard;
type Item = { wire?: boolean; node: { kind: string; x: number; y: number; w: number; h: number; [k: string]: unknown }; group: string | null };

/** 지금 보이는 화면 가운데(월드 좌표). store.spawnConsole 의 기준과 같은 식 */
export const viewCenter = (s: Store) => {
  const v = s.getState().viewport;
  return { x: -v.x / v.zoom, y: -v.y / v.zoom };
};

/** registry create 로 기본 내용을 만들고, opts 중 그 내용에 이미 있는 필드(칸반 title 등)만 덮는다. create 가 opts 를 읽는 종류(웹 url)는 create 에 맡긴다 */
function createWith(kind: string, opts?: Record<string, unknown>): Record<string, unknown> {
  const made = getKind(kind)?.create?.(opts) ?? {};
  return { ...made, ...Object.fromEntries(Object.entries(opts ?? {}).filter(([k]) => k in made)) };
}

/** def 의 타일 종류 중 registry 에 있는 것과 기본 크기 (S-1160·S-1161) */
export function registryOpts(def: PresetDef): { knownKinds: string[]; sizes: Record<string, { w: number; h: number }> } {
  const sizes: Record<string, { w: number; h: number }> = {};
  for (const t of def.tiles) {
    const k = getKind(t.kind);
    if (k) sizes[t.kind] = k.defaultSize;
  }
  return { knownKinds: Object.keys(sizes), sizes };
}

/** 덩어리를 기존 노드와 겹치지 않는 가장 가까운 자리로 옮겨 한 단계로 놓는다 */
function place(s: Store, items: Item[], groupDefs: { name: string; role: Group["role"] }[]): string[] {
  if (!items.length) return [];
  const { nodes, groups } = s.getState();
  const x0 = Math.min(...items.map((i) => i.node.x)), y0 = Math.min(...items.map((i) => i.node.y));
  const w = Math.max(...items.map((i) => i.node.x + i.node.w)) - x0, h = Math.max(...items.map((i) => i.node.y + i.node.h)) - y0;
  const spot = findSpot({ x: x0, y: y0 }, { w, h }, Object.values(nodes));
  const [dx, dy] = [spot.x - x0, spot.y - y0];
  s.getState().commit();
  const all = { ...nodes };
  const gs = [...groups];
  const gid = new Map<string, string>();
  for (const g of groupDefs) {
    let n = gs.length + 1;
    while (gs.some((x) => x.id === `g${n}`)) n++;
    gs.push({ id: `g${n}`, name: g.name, role: g.role });
    gid.set(g.name, `g${n}`);
  }
  let z = Object.values(all).reduce((m, n) => Math.max(m, n.z), 0);
  const ids: string[] = [];
  const loose: string[] = []; // 그룹 없는 콘솔 id (orchestrator 연결용, S-1790)
  for (const { node, group } of items) {
    const p = node.kind === "console" ? "c" : node.kind;
    let i = 1;
    while (all[`${p}${i}`]) i++;
    const id = `${p}${i}`;
    const names = Object.values(all).flatMap((n) => (isConsole(n) ? [n.name] : []));
    all[id] = {
      ...node, id, x: node.x + dx, y: node.y + dy, z: ++z,
      ...(node.kind === "console" ? { name: nextName(names) } : {}),
      ...(group && gid.has(group) ? { groupId: gid.get(group) } : {}),
    } as BoardNode;
    ids.push(id);
    if (node.kind === "console" && !(group && gid.has(group))) loose.push(id);
  }
  // S-1790: 연결할 orchestrator 는 이 preset 이 만든 모든 그룹과 그룹 없는 콘솔에 연결
  items.forEach((it, k) => { if (it.wire) all[ids[k]!] = { ...all[ids[k]!]!, wired: [...gid.values(), ...loose] }; });
  s.setState({ nodes: all, groups: gs, selection: ids });
  return ids;
}

/** preset 하나를 한 번의 되돌리기 단계로 놓는다. 새 콘솔 id 들과 건너뛴 타일 종류를 돌려준다 */
export function deployPreset(s: Store, def: PresetDef, o: PlanOpts): { ids: string[]; skipped: string[] } {
  const p = planDeploy(def, o);
  const items: Item[] = p.consoles.map((c) => ({
    node: { kind: "console", x: c.x, y: c.y, w: CONSOLE_W, h: CONSOLE_H, agentId: c.agentId, textSize: null, yolo: false },
    group: c.group,
  }));
  // 새 종류 타일: 종류별 기본 내용(칸반 빈 4열·웹 주소 탭)을 registry 의 create 로 채운다(S-1162)
  for (const t of p.tiles) items.push({ node: { ...createWith(t.kind, t.opts), kind: t.kind, x: t.x, y: t.y, w: t.w, h: t.h }, group: null, wire: t.kind === "orchestrator" });
  const roles = Object.fromEntries(def.lanes.map((l) => [l.group, l.role]));
  return { ids: place(s, items, p.groups.map((g) => ({ name: g.name, role: roles[g.name]! }))), skipped: p.skipped };
}

/** 저장한 layout 을 center 에 한 번의 되돌리기 단계로 찍는다(그룹은 저장하지 않는다, S-647) */
export function stampSaved(s: Store, l: SavedLayout, center: { x: number; y: number }): string[] {
  const items: Item[] = stampLayout(l, center).map((n) => {
    const { agentId, ...rest } = n;
    if (n.kind === "console") return { node: { ...rest, agentId: agentId ?? "claude", textSize: null, yolo: false }, group: null };
    // 콘솔 말고 registry 에 만드는 법이 있는 종류는 기본 내용을 채운다(S-1163). 저장한 제목·글·색은 그 위에 얹는다
    const made = getKind(n.kind)?.create?.();
    return { node: made ? { ...made, ...rest } : rest, group: null };
  });
  return place(s, items, []);
}
