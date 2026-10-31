// S-689: NEEDS YOU·ERROR 콘솔을 차례로 돈다 (순수 pickNext + 화면 맞춤 jumpToNext). B16
import { DEFAULT_SCOPE, registry } from "../board/boards";
import { fitBounds } from "../board/viewport";
import { isConsole } from "../board/store";
import { useLive } from "../livestatus/useLive";
import { useShell } from "./useShell";

/** list(오래된 순) 에서 last 다음 것. last 가 없거나 목록에 없으면 첫 번째, 목록이 비면 null */
export function pickNext(list: string[], last: string | null): string | null {
  if (!list.length) return null;
  const i = last === null ? -1 : list.indexOf(last);
  return list[(i + 1) % list.length]!;
}

let last: string | null = null;

/** 다음 NEEDS YOU·ERROR 콘솔로: 그 워크스페이스를 보이고, 콘솔을 선택하고, 화면에 꽉 맞춘다. 갈 곳이 없으면 false */
export function jumpToNext(): boolean {
  const key = pickNext(useLive.getState().needs, last);
  if (!key) return false;
  last = key;
  return jumpTo(key);
}

/** sessionKey 의 콘솔로: 그 워크스페이스를 보이고, 콘솔을 선택하고, 화면에 꽉 맞춘다. 없으면 false */
export function jumpTo(key: string): boolean {
  const [wsId, nodeId] = JSON.parse(key) as [string, string];
  if (wsId) useShell.getState().showWorkspace(wsId);
  const store = wsId ? registry.get(wsId) : DEFAULT_SCOPE.store;
  const n = store?.getState().nodes[nodeId];
  if (!store || !isConsole(n)) return false;
  store.getState().select([nodeId]);
  store.getState().setViewport(fitBounds({ x: n.x, y: n.y, w: n.w, h: n.h }, { w: window.innerWidth, h: window.innerHeight }));
  return true;
}
