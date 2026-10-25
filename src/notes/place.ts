// S-840·S-844·S-849: 스티커·텍스트 놓기. 놓자마자 편집 상태로 둔다
import type { BoardStore } from "../board/boards";
import { placeNew } from "../board/kinds/registry";
import { useEditing } from "./editing";
import { STICKY_SIZE } from "./sticky";
import { TEXT_DEFAULT_W } from "./textNode";

type P = { x: number; y: number };
const TEXT_H = 34; // 첫 줄 높이(M 24px × 1.25 + 위아래 여백), 글이 늘면 노드가 맞춘다

/** 스티커를 a 가운데로 놓고 바로 입력 상태로(S-840) */
export function placeSticky(store: BoardStore, a: P): string {
  const box = { x: a.x - STICKY_SIZE.w / 2, y: a.y - STICKY_SIZE.h / 2, ...STICKY_SIZE };
  const id = placeNew(store, "sticky", undefined, box);
  store.getState().updateNode(id, box); // 빈자리 찾기로 밀리지 않게
  useEditing.getState().start(id);
  return id;
}
/** 텍스트 상자를 a 에 놓고 바로 입력 상태로(S-844). 되돌리기 1단계 — 비운 채 떠나면 그 단계도 버린다 */
export function placeText(store: BoardStore, a: P): string {
  const box = { x: a.x, y: a.y - TEXT_H / 2, w: TEXT_DEFAULT_W, h: TEXT_H };
  const id = placeNew(store, "text", undefined, box);
  store.getState().updateNode(id, box);
  useEditing.getState().start(id, store.getState().history.past.length);
  return id;
}
