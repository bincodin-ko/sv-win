// B8 S-530: 콘솔 N개 + 그룹을 되돌리기 1단계로. 명령 실행기·preset 배치도 이 함수를 쓴다.
import type { Role } from "../commandbar/roles";
import type { BoardStore } from "../board/boards";
import { useBoard } from "../board/store";
import { MAX_SLOTS } from "./slots";

export type TeamSpec = { name: string; role: Role; agents: string[] };
/** 12 개까지(S-533, 넘으면 clamped). 에이전트가 하나면 그룹 없이 콘솔만(S-526). at = 덩어리 왼쪽 위(월드 좌표) */
export function spawnTeam(spec: TeamSpec, store: BoardStore = useBoard, at?: { x: number; y: number }): { ids: string[]; groupId: string | null; clamped: boolean } {
  const agents = spec.agents.slice(0, MAX_SLOTS);
  return { ...store.getState().spawnMany(agents, at, { name: spec.name, role: spec.role }), clamped: spec.agents.length > MAX_SLOTS };
}
