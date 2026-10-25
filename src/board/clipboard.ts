// S-026 앱 안 메모리 클립보드 + 붙여넣기 자리 (순수 함수 + 모듈 메모리)
import { findSpot } from "./placement";
import { bounds, intersects, type Rect } from "./selection";
export const PASTE_OFFSET = 24;
export type ClipNode = { kind: string; x: number; y: number; w: number; h: number; [k: string]: unknown };
export interface Clip { nodes: ClipNode[]; sourceIds: string[] }

let clip: Clip | null = null;

/** 노드 사본을 보관한다(id·z 는 붙일 때 새로 매긴다) */
export function copyToClip(nodes: ({ id: string } & ClipNode)[]): void {
  clip = { nodes: nodes.map(({ id: _id, z: _z, ...rest }) => structuredClone(rest) as ClipNode), sourceIds: nodes.map((n) => n.id) };
}
export const readClip = (): Clip | null => clip;

/**
 * 묶음(group)을 붙일 때 모두에게 더할 이동량. 기본 원본 +24,+24 (원본끼리는 겹쳐도 된다 = ignoreIds).
 * 그 자리에 다른 노드가 있으면 S-030(findSpot) 으로 안 겹치는 빈 자리.
 */
export function pasteShift(group: Rect[], existing: (Rect & { id: string })[], ignoreIds: string[]): { dx: number; dy: number } {
  const b = bounds(group)!;
  const cand = { ...b, x: b.x + PASTE_OFFSET, y: b.y + PASTE_OFFSET };
  if (!existing.some((e) => !ignoreIds.includes(e.id) && intersects(e, cand))) return { dx: PASTE_OFFSET, dy: PASTE_OFFSET };
  const spot = findSpot({ x: cand.x, y: cand.y }, { w: b.w, h: b.h }, existing);
  return { dx: spot.x - b.x, dy: spot.y - b.y };
}
