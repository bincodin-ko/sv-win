// S-1371~S-1373: Push 문구 만들기·대상 나누기·전송
import type { BoardStore } from "../board/boards";
import { wiredTargets } from "../board/wired";
import { getSession } from "../console/session";
import { typeAndSubmit, type Writable } from "../console/submit";
import { t } from "../i18n";
import { memoryLoad, type MemoryFact } from "../lib/ipc";
import { useShell } from "../shell/useShell";

export const PUSH_CAP = 3400;
const INTRO = "Background context for this project (not a task). Reply OK when you have read it.";
export type PushResult = { at: number; sent: number; busy: number; omitted: number };
export type PushTarget = Writable & { isAgent(): boolean; status(): string; isPaused(): boolean };

/** 사실 부분(공백으로 이은 합계)이 cap 을 넘지 않는 앞쪽만 넣는다. 빠진 개수는 끝에 적는다 */
export function composePush(facts: Pick<MemoryFact, "kind" | "title" | "body">[], cap = PUSH_CAP): { text: string; included: number; omitted: number } {
  const items = facts.map((f) => `- [${f.kind}] ${f.title}: ${f.body}`.replace(/\s+/g, " ").trim());
  let used = 0, included = 0;
  for (const it of items) {
    const next = used + it.length + (included ? 1 : 0);
    if (next > cap) break;
    used = next; included++;
  }
  const omitted = items.length - included;
  const text = [INTRO, ...items.slice(0, included)].join(" ") + (omitted ? ` (${omitted} more facts not included)` : "");
  return { text, included, omitted };
}

export const pushLine = (p: Pick<PushResult, "sent" | "busy" | "omitted">): string =>
  p.sent === 0 ? t("Nothing sent") : t("Sent to {n}", { n: p.sent }) + (p.busy ? ` · ${t("{n} busy", { n: p.busy })}` : "") + (p.omitted ? ` · ${t("{n} left out", { n: p.omitted })}` : "");

/** 에이전트 콘솔만 대상. 권한/질문 대기·일시 중지·시작 중은 busy 로 세고 보내지 않는다 */
export async function pushTo(targets: PushTarget[], text: string): Promise<{ sent: number; busy: number }> {
  const agents = targets.filter((t) => t.isAgent());
  const busy = agents.filter((t) => t.isPaused() || ["NEEDS YOU", "PAUSED", "STARTING"].includes(t.status()));
  const send = agents.filter((t) => !busy.includes(t));
  await Promise.all(send.map((t) => typeAndSubmit(t, text)));
  return { sent: send.length, busy: busy.length };
}

/** 카드의 Push. 사실이 없으면 null. 결과는 카드의 lastPush 에 저장 */
export async function pushMemory(store: BoardStore, wsId: string, cardId: string): Promise<PushResult | null> {
  const repo = useShell.getState().openRepos.find((r) => r.workspaces.some((w) => w.id === wsId))?.path;
  const m = await memoryLoad(repo ?? "");
  const { text, omitted } = composePush([...(repo ? m.repo : []), ...m.all]);
  const s = store.getState();
  const card = s.nodes[cardId];
  if (!card || !(repo ? m.repo.length : 0) && !m.all.length) return null;
  const targets = wiredTargets(s.nodes, s.groups, card).consoles.flatMap((id) => { const x = getSession(wsId, id); return x ? [x] : []; });
  const r = await pushTo(targets, text);
  const res: PushResult = { at: Date.now(), ...r, omitted };
  store.getState().updateNode(cardId, { lastPush: res });
  return res;
}
