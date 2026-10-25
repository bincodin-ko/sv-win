// B13 내가 저장한 layout (S-647, S-648). 순수 함수.
import { getKind } from "../board/kinds/registry";
import { CONSOLE_H, CONSOLE_W, type BoardNode } from "../board/store";

export type SavedNode = { kind: string; x: number; y: number; w: number; h: number; title?: string; text?: string; color?: string; agentId?: string };
export type SavedLayout = { name: string; nodes: SavedNode[] };

/** 저장하는 것만 골라낸다(S-647): 종류·위치·크기·제목·글·색, 콘솔이면 에이전트. 그룹·선·웹 주소·이미지·카드·도형 스타일·잉크는 버린다 */
/** 저장 대상인가(S-647): 잉크와 create 없는 종류(image·diagram·branches)는 아니다. 등록 안 된 종류(콘솔)는 저장 */
export function isSavable(n: BoardNode): boolean {
  const k = getKind(n.kind);
  return n.kind !== "ink" && !(k && !k.create);
}

export function captureLayout(nodes: BoardNode[]): SavedNode[] {
  return nodes.filter(isSavable).map((n) => {
    const out: SavedNode = { kind: n.kind, x: n.x, y: n.y, w: n.w, h: n.h };
    for (const k of ["title", "text", "color"] as const) if (typeof n[k] === "string") out[k] = n[k] as string;
    if (n.kind === "console" && typeof n.agentId === "string") out.agentId = n.agentId;
    return out;
  });
}

/** 안 쓴 가장 작은 N 의 "Set N" */
export function nextSetName(saved: { name: string }[]): string {
  const used = new Set(saved.map((s) => /^Set (\d+)$/.exec(s.name)?.[1]).filter(Boolean).map(Number));
  let n = 1;
  while (used.has(n)) n++;
  return `Set ${n}`;
}

/** 덩어리 가운데가 center 에 오게 옮긴 노드들. 콘솔은 기본 크기(좌상단 유지) */
export function stampLayout(layout: SavedLayout, center: { x: number; y: number }): SavedNode[] {
  const ns = layout.nodes.map((n) => (n.kind === "console" ? { ...n, w: CONSOLE_W, h: CONSOLE_H } : n));
  if (!ns.length) return [];
  const x0 = Math.min(...ns.map((n) => n.x)), x1 = Math.max(...ns.map((n) => n.x + n.w));
  const y0 = Math.min(...ns.map((n) => n.y)), y1 = Math.max(...ns.map((n) => n.y + n.h));
  const dx = Math.round(center.x - (x0 + x1) / 2), dy = Math.round(center.y - (y0 + y1) / 2);
  return ns.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy }));
}
