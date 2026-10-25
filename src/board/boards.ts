// B2 S-300: 워크스페이스마다 독립된 보드 저장소. `useBoard` 는 기본 저장소로 그대로 둔다.
import { makeBoardStore, useBoard } from "./store";

export type BoardStore = typeof useBoard;
/** 세션·제안이 자기 워크스페이스와 저장소를 알기 위한 묶음 */
export type Scope = { wsId: string; store: BoardStore };
export const DEFAULT_SCOPE: Scope = { wsId: "", store: useBoard };

/** 새 독립 저장소 하나를 만든다 */
export const createBoardStore = (): BoardStore => makeBoardStore();

/** wsId → 저장소(열린 워크스페이스마다) */
export const registry = new Map<string, BoardStore>();

/** wsId 의 저장소. 없으면 만들어 registry 에 넣는다. 같은 wsId 는 항상 같은 저장소 */
export const getStore = (wsId: string): BoardStore => {
  let s = registry.get(wsId);
  if (!s) registry.set(wsId, (s = createBoardStore()));
  return s;
};
