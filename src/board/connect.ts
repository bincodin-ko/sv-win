// S-1226·S-1227: 연결 모드의 토글. 첫 토글만 되돌리기 단계를 만들고 나머지는 같은 단계(Done 까지 1단계)
import { useUi } from "../ui/useUi";
import type { BoardStore } from "./boards";

let committed = false;
useUi.subscribe((s, p) => { if (s.connect !== p.connect) committed = false; }); // 연결 모드가 바뀌면 새 단계부터

/** 이 워크스페이스가 연결 모드의 카드를 가졌으면 그 카드 id */
export const connectCard = (wsId: string): string | null => { const c = useUi.getState().connect; return c && c.wsId === wsId ? c.cardId : null; };

/** 콘솔/그룹 id 를 연결 중인 카드의 wired 에 넣거나 뺀다. 처리했으면 true */
export function connectToggle(store: BoardStore, wsId: string, targetId: string): boolean {
  const card = connectCard(wsId);
  if (!card || !store.getState().nodes[card]) return false;
  store.getState().toggleWired(card, targetId, committed);
  committed = true;
  return true;
}
