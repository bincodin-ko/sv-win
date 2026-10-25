// D15 S-1738: handoff·forward intent -> src/handoff/ (deps 주입식). 둘 다 모듈 하나씩만 만들고, 부를 때마다 world 를 갈아 끼운다.
import { getStore, type BoardStore } from "../board/boards";
import { GAP } from "../board/placement";
import { getSession } from "../console/session";
import { sessionKey } from "../console/sessionKey";
import { typeAndSubmit } from "../console/submit";
import { t } from "../i18n";
import { createForward, type Dest } from "../handoff/forward";
import { createHandoff } from "../handoff/handoff";
import { CLI_NAMES } from "../handoff/types";
import { deliver } from "./deliver";
import type { Intent, Target } from "./intent";
import type { Cand } from "./pick";
import { recentOrders } from "./report";

export type HCon = { key: string; wsId: string; id: string; name: string; agentId: string; groupKey?: string; store: BoardStore };
export type World = { repo: string; wsId: string; say(t: string): void; cons: HCon[]; resolve(t: Target): HCon[] };

let w: World;
const parse = (k: string): [string, string] => JSON.parse(k) as [string, string];
const sess = (key: string) => { const [ws, id] = parse(key); return getSession(ws, id); };
const nameOf = (key: string): string => { const [ws, id] = parse(key); return String(getStore(ws).getState().nodes[id]?.name ?? key); };
const clock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };
const cand = (c: HCon): Cand => { const s = sess(c.key); return { id: c.key, name: c.name, status: s?.status() ?? "DONE", agent: !!s?.isAgent() }; };

const handoff = createHandoff({
  ...clock,
  say: (t) => w.say(t),
  submit: (s, t) => typeAndSubmit(s, t),
  sources: () => w.cons.map((c) => {
    const s = sess(c.key);
    return { id: c.key, name: c.name, agent: !!s?.isAgent(), status: s?.status() ?? "DONE", selected: c.wsId === w.wsId && c.store.getState().selection.includes(c.id) };
  }),
  session: (k) => sess(k),
  spawn: (agentId, besideKey) => {
    const [ws, id] = parse(besideKey);
    const st = getStore(ws);
    const src = st.getState().nodes[id];
    return sessionKey(ws, st.getState().spawnAgent(agentId, src ? { x: src.x + src.w + GAP, y: src.y } : undefined)); // 겹치면 findSpot 이 비킨다
  },
  nameOf,
});

const forward = createForward({
  ...clock,
  say: (t) => w.say(t),
  submit: (s, t) => typeAndSubmit(s, t),
  orders: (key) => {
    const [ws, id] = parse(key);
    const o = recentOrders(w.repo).find((x) => x.wsId === ws && x.nodeId === id);
    return o && { sentAt: o.sentAt, verdict: o.verdict };
  },
  reply: async (key) => (await sess(key)?.fetchReply()) ?? null,
  nameOf,
  send: async (key, text) => { const s = sess(key); if (s) await deliver(key, s, text); },
});

export function runHandoff(i: Extract<Intent, { t: "handoff" }>, world: World): Promise<void> {
  w = world;
  return handoff.start({ agentId: i.agentId, from: i.from });
}

const destOf = (tg: Target): Dest => {
  const cands = w.resolve(tg).map(cand);
  if (tg.kind === "cli") return { label: CLI_NAMES[tg.agentId] ?? tg.agentId, cli: true, cands };
  if (tg.kind === "group") { const [ws, id] = parse(tg.id); return { label: getStore(ws).getState().groups.find((g) => g.id === id)?.name ?? t("that group"), cands }; }
  return { label: cands[0]?.name ?? t("everyone"), cands };
};

/** `they` = 가장 최근 주문을 받은 콘솔들 (ponytail: 첫 주문과 10초 안에 나간 주문을 한 묶음으로 본다) */
const BATCH_MS = 10_000;
export function runForward(i: Extract<Intent, { t: "forward" }>, world: World): Promise<void> {
  w = world;
  let sources: string[];
  if (i.they) {
    const os = recentOrders(w.repo);
    if (!os.length) { w.say(t("There are no recent orders to wait for. Name the consoles, like: when Otto finishes pass it to Codex")); return Promise.resolve(); }
    sources = [...new Set(os.filter((o) => os[0]!.sentAt - o.sentAt <= BATCH_MS).map((o) => sessionKey(o.wsId, o.nodeId)))];
  } else sources = [...new Set(i.sources.flatMap((t) => w.resolve(t).map((c) => c.key)))];
  if (!sources.length) { w.say(t("I couldn't find any console to wait for.")); return Promise.resolve(); }
  return forward.add({ sources, dests: i.dests.map(destOf), everyone: i.everyone });
}

/** cancel that: 기다리는 handoff·forward 를 멈춘다. 멈춘 개수 */
export const cancelHandoffs = (): number => handoff.cancel() + forward.cancel();
