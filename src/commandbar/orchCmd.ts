// D15 S-1732·S-1733: add an orchestrator / connect … to the orchestrator -> D6 함수 (orchestrator/add.ts)
import { getStore, type BoardStore } from "../board/boards";
import { groupTitle } from "../board/groups";
import { addOrchestrator, connectTo } from "../orchestrator/add";
import { t } from "../i18n";
import { orchestratorAddedText } from "./answers";
import type { Intent } from "./intent";

const parseKey = (k: string): [string, string] => JSON.parse(k) as [string, string];

/** 답 글을 돌려준다. groupId 는 sessionKey(ws, 그룹) — 다른 워크스페이스 그룹이면 그 보드에 놓는다 */
export function addOrchestratorCmd(i: Extract<Intent, { t: "addOrchestrator" }>, here: BoardStore): string {
  if (!i.groupId) return orchestratorAddedText(null, addOrchestrator(here, { name: i.name }).consoles);
  const [wsId, gid] = parseKey(i.groupId);
  const store = getStore(wsId);
  const g = store.getState().groups.find((x) => x.id === gid);
  if (!g) return t("I couldn't find that group.");
  return orchestratorAddedText(groupTitle(g), addOrchestrator(store, { groupId: gid, name: i.name }).consoles);
}

export function connectCmd(i: Extract<Intent, { t: "connect" }>, here: BoardStore, wsId: string): string {
  const cards = Object.values(here.getState().nodes).filter((n) => n.kind === "orchestrator");
  if (!cards.length) return t("There's no orchestrator on the board. Say add an orchestrator first.");
  let card = cards.length === 1 ? cards[0] : undefined;
  if (i.card) {
    const ref = i.card.trim();
    const num = /^\d+$/.test(ref);
    const want = num ? (ref === "1" ? "Orchestrator" : `Orchestrator ${ref}`) : ref;
    card = cards.find((n) => String(n.name).toLowerCase() === want.toLowerCase()) ?? (num ? cards[Number(ref) - 1] : undefined);
    if (!card) return t("I couldn't find \"orchestrator {ref}\".", { ref });
  } else if (!card) return t("Which orchestrator? {list}", { list: cards.map((n) => String(n.name)).join(", ") });
  if (i.target.kind !== "group" && i.target.kind !== "console") return t("I can only wire a group or a console.");
  const [ws, id] = parseKey(i.target.id);
  if (ws !== wsId) return t("I can only wire things on this board.");
  return t(connectTo(here, card.id, { kind: i.target.kind, id })); // orchestrator/add.ts 의 영어 답을 사전에서 찾는다
}
