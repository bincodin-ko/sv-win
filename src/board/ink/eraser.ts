// S-866 지우개가 고르는 노드 (순수)
import type { BoardNode } from "../store";
import { hitStroke, type Pt } from "./stroke";

/** S-868 지우개 커서 반지름(화면 px) */
export const ERASER_R = 8;
/** docs_board: 콘솔과 orchestrator 카드는 지우개가 절대 지우지 않는다 */
const NEVER = new Set(["console", "orchestrator"]);
type P = { x: number; y: number };

/**
 * a→b 를 따라 지나간 자리(월드, 반지름 r)에서 지울 노드 id 들.
 * ink 는 지나간 자리에 닿은 것 모두, 그 밖의 노드는 자리마다 포인터 아래 가장 위 1개(그것이 can 이 아니면 아무것도 안 지운다). can = registry 의 eraserTarget
 */
export function sweep(nodes: BoardNode[], a: P, b: P, r: number, can: (n: BoardNode) => boolean): string[] {
  const out = new Set<string>();
  const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (r / 2)));
  for (let i = 0; i <= k; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / k, y: a.y + ((b.y - a.y) * i) / k };
    let top: BoardNode | undefined;
    for (const n of nodes) {
      if (n.kind === "ink") {
        const pad = r + ((n.width as number) ?? 0) / 2;
        if (can(n) && p.x >= n.x - pad && p.x <= n.x + n.w + pad && p.y >= n.y - pad && p.y <= n.y + n.h + pad && hitStroke((n.points as Pt[]) ?? [], (n.width as number) ?? 0, { x: p.x - n.x, y: p.y - n.y }, r)) out.add(n.id);
      } else if (p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h && (!top || n.z >= top.z)) top = n;
    }
    if (top && !NEVER.has(top.kind) && can(top)) out.add(top.id);
  }
  return [...out];
}
