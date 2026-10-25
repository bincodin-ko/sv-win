// B13 배치 계획 (S-642, S-643). 순수 함수.
import { CONSOLE_H, CONSOLE_W } from "../board/store";
import { BH, BW, type PresetDef } from "./defs";

const TILE_GAP = 24;
export type PlanOpts = {
  center: { x: number; y: number };
  /** 레인 번호 -> 에이전트 id (손댄 레인) */
  agentOverrides?: Record<number, string>;
  defaultAgent: string;
  /** 지금 목록에 있는 에이전트 id 들 */
  installed: string[];
  /** 만들 수 있는 노드 종류(console 은 항상) */
  knownKinds: string[];
  /** 종류별 기본 크기(registry) */
  sizes?: Record<string, { w: number; h: number }>;
};
export type PlannedConsole = { x: number; y: number; agentId: string; group: string | null };
export type Plan = {
  consoles: PlannedConsole[];
  groups: { name: string; role: string }[];
  tiles: { kind: string; x: number; y: number; w: number; h: number; opts?: Record<string, unknown> }[];
  skipped: string[];
};

/** S-643: 없는 id 는 Claude Code, 지워진 내 에이전트(custom:…)는 Shell */
export function resolveAgent(agent: string, defaultAgent: string, installed: string[]): string {
  const id = agent === "default" ? defaultAgent : agent;
  return installed.includes(id) ? id : id.startsWith("custom:") ? "shell" : "claude";
}

export function planDeploy(def: PresetDef, o: PlanOpts): Plan {
  const consoles: PlannedConsole[] = [];
  const groups: Plan["groups"] = [];
  def.lanes.forEach((l, li) => {
    const agentId = resolveAgent(o.agentOverrides?.[li] ?? l.agent, o.defaultAgent, o.installed);
    const group = l.count >= 2 ? l.group : null; // 그룹은 콘솔 2개부터 (S-500)
    if (group) groups.push({ name: group, role: l.role });
    for (let i = 0; i < l.count; i++)
      consoles.push({ x: l.x + (i % l.cols) * (CONSOLE_W + 24), y: l.y + Math.floor(i / l.cols) * (CONSOLE_H + 24), agentId, group });
  });
  const known = new Set(["console", ...o.knownKinds]);
  // 칸(gx)마다 세로로 쌓는다: 크기는 registry 기본 크기, 가운데 정렬(S-1161).
  // S-1791: 아래 레인 덩어리(gy>=1)가 있는 칸은 BH 까지만 쌓고, 넘치는 타일은 가장 오른쪽 레인 칸 다음 빈 칸(쌓이는 대로 오른쪽으로) 맨 위로
  const lanesAt = def.lanes.map((l) => ({ gx: Math.round(l.x / BW), gy: Math.round(l.y / BH) }));
  const limit = (gx: number) => (lanesAt.some((l) => l.gx === gx && l.gy >= 1) ? BH : Infinity);
  const spill = Math.max(-1, ...lanesAt.map((l) => l.gx), ...def.tiles.map((t) => t.gx)) + 1;
  const used: Record<number, number> = {};
  const tiles: Plan["tiles"] = def.tiles.filter((t) => known.has(t.kind)).map(({ kind, gx, opts }) => {
    const { w, h } = o.sizes?.[kind] ?? { w: 640, h: 420 };
    if ((used[gx] ?? 0) + h > limit(gx)) gx = spill;
    const y = used[gx] ?? 0;
    used[gx] = y + h + TILE_GAP;
    return { kind, x: gx * BW + (BW - w) / 2, y, w, h, ...(opts ? { opts } : {}) };
  });
  const skipped = [...new Set(def.tiles.filter((t) => !known.has(t.kind)).map((t) => t.kind))];
  // 덩어리 가운데가 center 가 되게 옮긴다
  const rects = [...consoles.map((c) => ({ x: c.x, y: c.y, w: CONSOLE_W, h: CONSOLE_H })), ...tiles];
  const x0 = Math.min(...rects.map((r) => r.x)), x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y0 = Math.min(...rects.map((r) => r.y)), y1 = Math.max(...rects.map((r) => r.y + r.h));
  const dx = Math.round(o.center.x - (x0 + x1) / 2), dy = Math.round(o.center.y - (y0 + y1) / 2);
  const mv = <T extends { x: number; y: number }>(r: T): T => ({ ...r, x: r.x + dx, y: r.y + dy });
  return { consoles: consoles.map(mv), groups, tiles: tiles.map(mv), skipped };
}
