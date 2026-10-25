// S-1251·S-1263·S-1264: 카드 추가·연결
import type { BoardStore } from "../board/boards";
import { t } from "../i18n";
import { placeNew } from "../board/kinds/registry";
import { wiredTargets } from "../board/wired";

export type Target = { kind: "console" | "group"; id: string };
const BASE = "Orchestrator";
/** 쓰고 있는 이름을 건너뛴 다음 이름: Orchestrator, Orchestrator 2, … (S-1251) */
export function nextOrchestratorName(names: string[]): string {
  if (!names.includes(BASE)) return BASE;
  let n = 2;
  while (names.includes(`${BASE} ${n}`)) n++;
  return `${BASE} ${n}`;
}
/** 종류의 create: 레일에서 놓으면 이름 없음 → 항상 Orchestrator */
export const makeOrchestrator = (o?: Record<string, unknown>): Record<string, unknown> => ({
  name: typeof o?.name === "string" && o.name.trim() ? o.name.trim().slice(0, 24) : BASE,
  wired: Array.isArray(o?.wired) ? o.wired : [],
  collapsed: [],
});
/** 겹치지 않는 자리에 카드를 놓고 선택. groupId 가 있으면 그 그룹을 연결 (되돌리기 1단계) */
export function addOrchestrator(store: BoardStore, o: { groupId?: string; name?: string }): { id: string; name: string; consoles: number } {
  const s = store.getState();
  const names = Object.values(s.nodes).filter((n) => n.kind === "orchestrator").map((n) => String(n.name));
  const id = placeNew(store, "orchestrator", { name: o.name ?? nextOrchestratorName(names), wired: o.groupId ? [o.groupId] : [] });
  const n = store.getState().nodes[id]!;
  return { id, name: String(n.name), consoles: wiredTargets(store.getState().nodes, store.getState().groups, n).consoles.length };
}
/** 콘솔·그룹을 카드의 wired 에 더한다. 이미 있으면 "Already wired." (S-1264) */
export function connectTo(store: BoardStore, cardId: string, target: Target): string {
  const n = store.getState().nodes[cardId];
  if (!n) return t("I couldn't find that orchestrator.");
  if (((n.wired as string[] | undefined) ?? []).includes(target.id)) return t("Already wired.");
  store.getState().toggleWired(cardId, target.id);
  return target.kind === "group" ? t("Wired the group.") : t("Wired the console.");
}
