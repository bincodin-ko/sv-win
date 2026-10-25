// U3 S-2645~S-2647: Tidy up. 순수 함수 tidyLayout + store 를 부르는 tidyBoard.
import type { BoardStore } from "./boards";

export const TIDY_GAP = 24;
/** S-2647: Tidy 키(Board 의 keydown). 바꾸려면 이 한 줄 */
export const TIDY_KEY = { ctrl: true, shift: true, key: "t" };
/** 메뉴 항목 오른쪽에 보이는 키 이름(번역하지 않는다) */
export const TIDY_KEY_LABEL = [TIDY_KEY.ctrl && "Ctrl", TIDY_KEY.shift && "Shift", TIDY_KEY.key.toUpperCase()].filter(Boolean).join("+");
export type TidyItem = { id: string; x: number; y: number; w: number; h: number };
/** 그림·도형·선은 옮기지 않는다(S-2645) */
const SKIP = new Set(["ink", "shape", "line"]);

/**
 * 읽기 순서(위→아래, 같은 줄이면 왼→오)로 세워 열 수 ceil(sqrt n) 격자에 놓는다. 칸 = 가장 큰 너비·높이 + gap,
 * 격자 왼쪽 위 = 경계 상자 왼쪽 위. 같은 줄 = 줄 첫 노드의 y 에서 가장 낮은 노드 높이의 절반 안.
 */
export function tidyLayout(items: TidyItem[], gap: number = TIDY_GAP): Record<string, { x: number; y: number }> {
  if (!items.length) return {};
  const tol = Math.min(...items.map((i) => i.h)) / 2;
  const rows: TidyItem[][] = [];
  for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.at(-1);
    if (row && it.y - row[0]!.y <= tol) row.push(it);
    else rows.push([it]);
  }
  const order = rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
  const cols = Math.ceil(Math.sqrt(order.length));
  const cw = Math.max(...items.map((i) => i.w)) + gap, ch = Math.max(...items.map((i) => i.h)) + gap;
  const x0 = Math.min(...items.map((i) => i.x)), y0 = Math.min(...items.map((i) => i.y));
  return Object.fromEntries(order.map((it, i) => [it.id, { x: x0 + (i % cols) * cw, y: y0 + Math.floor(i / cols) * ch }]));
}

/** S-2646: 노드 2개 이상 선택이면 선택만, 아니면 보드 전체(그림·도형 빼고). 대상이 2개 미만이면 아무 일 없음 */
export function tidyBoard(store: BoardStore): void {
  const { nodes, selection, arrange } = store.getState();
  const ok = (id: string) => !!nodes[id] && !SKIP.has(nodes[id]!.kind);
  const sel = selection.filter(ok);
  const ids = sel.length >= 2 ? sel : Object.keys(nodes).filter(ok);
  if (ids.length < 2) return;
  arrange(tidyLayout(ids.map((id) => { const { x, y, w, h } = nodes[id]!; return { id, x, y, w, h }; }), TIDY_GAP));
}
