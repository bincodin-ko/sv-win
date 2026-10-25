// S-1130·S-1131: 웹 타일마다 인스펙터 카드 하나. 순수 규칙(planInspect)과 창 이름, 보드에 놓는 inspectTile.
import { fitBounds } from "../board/viewport";
import type { BoardStore } from "../board/boards";
import { GAP } from "../board/placement";
import { placeNew } from "../board/kinds/registry";

export type NodeLike = { id: string; kind: string; wireTo?: unknown; tabs?: { id: string; url: string }[]; active?: string };

/** 개발자 도구 창 이름(S-1131) */
export const inspectWindow = (tileId: string): string => `inspect-${tileId}`;

export type InspectPlan = { existing: string } | { create: { wireTo: string; tab: string } };
/** 이미 이 타일의 카드가 있으면 그 id, 없으면 새 카드 사양(지금 열린 탭을 붙인다) */
export function planInspect(nodes: Record<string, NodeLike>, tileId: string): InspectPlan {
  const have = Object.values(nodes).find((n) => n.kind === "inspector" && n.wireTo === tileId);
  if (have) return { existing: have.id };
  const t = nodes[tileId];
  return { create: { wireTo: tileId, tab: t?.active ?? t?.tabs?.[0]?.id ?? "" } };
}

/** `{}`·More › Inspect on board(S-1130): 카드를 놓거나, 있으면 그 카드를 선택하고 타일과 함께 화면에 맞춘다 */
export function inspectTile(store: BoardStore, tileId: string): string {
  const s = store.getState();
  const tile = s.nodes[tileId];
  if (!tile) return "";
  const plan = planInspect(s.nodes, tileId);
  let id: string;
  if ("existing" in plan) {
    id = plan.existing;
    s.select([id]);
  } else id = placeNew(store, "inspector", plan.create, { x: tile.x + tile.w + GAP, y: tile.y });
  const card = store.getState().nodes[id];
  const el = typeof document === "undefined" ? null : document.querySelector<HTMLElement>('[data-testid="board"]');
  if (card && el && "existing" in plan) {
    const x0 = Math.min(tile.x, card.x), y0 = Math.min(tile.y, card.y);
    const x1 = Math.max(tile.x + tile.w, card.x + card.w), y1 = Math.max(tile.y + tile.h, card.y + card.h);
    store.getState().setViewport(fitBounds({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, { w: el.clientWidth, h: el.clientHeight }));
  }
  return id;
}
