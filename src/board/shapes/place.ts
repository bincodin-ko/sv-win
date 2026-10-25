// S-821: 도형 하나를 놓는다. 클릭(b 없음) = 기본 크기를 a 가운데로, 드래그 = a 에서 b 까지. 놓기 1번 = 되돌리기 1단계
import type { BoardStore } from "../boards";
import { placeNew } from "../kinds/registry";
import { LINE_LEN, SHAPE_SIZE, type ShapeChoice } from "./shapeChoices";
import type { P } from "./rough";
import { normalizeLine } from "./snap";
import { placeSticky } from "../../notes/place";

export const MIN_SHAPE = 24; // S-830: 최소 24×24 (추측)

export function placeShape(store: BoardStore, choice: ShapeChoice, a: P, b?: P): string {
  if (choice.kind === "sticky") return placeSticky(store, a); // C10: 눌린 자리가 가운데
  if (choice.kind === "line") {
    const p0 = b ? a : { x: a.x - LINE_LEN / 2, y: a.y }, p1 = b ?? { x: a.x + LINE_LEN / 2, y: a.y };
    const id = placeNew(store, "line", { head: choice.id === "arrow" }, p0);
    const l = normalizeLine(p0, p1, null);
    store.getState().updateNode(id, { x: l.x, y: l.y, w: l.w, h: l.h, points: l.points, bend: null });
    return id;
  }
  const box = b
    ? { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(MIN_SHAPE, Math.abs(b.x - a.x)), h: Math.max(MIN_SHAPE, Math.abs(b.y - a.y)) }
    : { x: a.x - SHAPE_SIZE.w / 2, y: a.y - SHAPE_SIZE.h / 2, ...SHAPE_SIZE };
  const id = placeNew(store, "shape", { shape: choice.id }, box);
  store.getState().updateNode(id, box); // placeNew 의 빈자리 찾기(findSpot)로 밀리지 않게 자리·크기를 그대로
  return id;
}
