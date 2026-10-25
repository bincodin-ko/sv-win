// S-2960~S-2968: 숨은 planner 세션 하나를 띄워 두고 재사용한다. 흐름은 memory/ask.ts 를 본뜸(runHidden 은 끝나면 닫으므로 import 안 함).
import { agentsList } from "../agents/api";
import type { Intent } from "../commandbar/intent";
import { hiddenSession, type HiddenOpts, type HiddenSession } from "../hidden/probe";
import { readReply, type ReplyTarget } from "../hidden/reply";
import { realClock, type Clock } from "../hidden/screen";
import { codexFindSession, isTauri, plannerDir } from "../lib/ipc";
import { profileEnvFor } from "../profiles/env";
import { useSettings } from "../settings/useSettings";
import type { PlanFail } from "./fail";
import { buildRequest, makeHandles, PRIMER, type BoardCtx } from "./prompt";
import { extractJson, validatePlan } from "./schema";
import { baseUrlFor, isApi, modelFor, type ProviderId } from "./providers";
import { apiAsk, cancelApi, type ApiAskArgs, type ApiResult } from "./providers/api";
import { cliArgs } from "./providers/cli";
import { plannerAgent, usePlanner } from "./state";

export const IDLE_MS = 10 * 60_000;
export const READY_MS = 45_000;
export const ANSWER_MS = 20_000;
export const NUDGE_MS = 8_000; // 최종 확인 6번: 보낸 뒤 이만큼 지나도 답이 없고 화면이 조용하면 Enter 한 번
export const RESEND_MS = 14_000; // 그래도 없으면 요청을 한 번 더(같은 id 라 늦게 온 답도 받는다)
const QUIET_MS = 3_000;
const POLL_MS = 500;
const OPENCODE_POLL_MS = 2_000; // ponytail: opencode export 는 읽을 때마다 프로세스를 띄운다. 기록 파일을 직접 읽게 되면 0.5초로
const LIFE_MS = 24 * 3_600_000; // hiddenSession 의 timeoutMs 는 세션 수명 — 띄워 두는 세션이라 사실상 끄고 IDLE_MS 로 닫는다

export type AskFail = PlanFail | { reason: "cancelled" };
export type AskResult = { plan: { ok: Intent; why?: string } } | { fail: AskFail };
export type PlannerDeps = {
  clock: Clock;
  open: (o: HiddenOpts) => Promise<HiddenSession>;
  read: (t: ReplyTarget) => Promise<string | null>;
  find: (cwd: string, startedAt: number, configDir?: string) => Promise<string | null>;
  agent: () => Promise<ProviderId | "off" | "no agent">;
  model: (agent: ProviderId) => string;
  baseUrl: () => string;
  api: (a: ApiAskArgs) => Promise<ApiResult>;
  dir: () => Promise<string>;
  env: (agent: string) => Promise<[string, string][]>;
};
const DEFAULTS: PlannerDeps = {
  clock: realClock,
  open: hiddenSession,
  read: readReply,
  find: (cwd, at, cfg) => codexFindSession(cwd, at, [], cfg).catch(() => null),
  agent: async () => {
    const set = String(useSettings.getState().s.planner ?? "claude");
    if (set === "off") return "off";
    const a = plannerAgent(set, (await agentsList()).filter((x) => x.installed).map((x) => x.id)); // S-2904: 부를 때마다 읽는다
    return a === "off" ? "no agent" : a; // 설정이 off 가 아닌데 쓸 CLI 가 하나도 없을 때
  },
  model: (a) => modelFor(useSettings.getState().s, a),
  baseUrl: () => baseUrlFor(useSettings.getState().s),
  api: apiAsk,
  dir: plannerDir,
  env: profileEnvFor,
};
/** 시험용: 비Tauri 에서만 window.__plannerAnswerMs 로 답 시간을 줄인다 */
const answerMs = (): number => (!isTauri() && typeof window !== "undefined" ? (window as unknown as { __plannerAnswerMs?: number }).__plannerAnswerMs : undefined) ?? ANSWER_MS;

type St = { agent: ProviderId; s: HiddenSession; env: [string, string][]; primed: boolean; sid?: string };
let st: St | null = null;
let idleCancel: (() => void) | null = null;
let seq = 0;
let epoch = 0; // abortPlanner 가 올린다
let tail: Promise<unknown> = Promise.resolve();

export const nextId = (): string => `r${++seq}`;
export const plannerLive = (): boolean => st !== null;
export function closePlanner(): void {
  idleCancel?.();
  idleCancel = null;
  const s = st;
  st = null; // 닫힌 세션은 다음 요청에서 새로 뜬다(프라이머 다시)
  s?.s.close(); // 이 PID 만
}
/** 기다리는 요청을 cancelled 로 끝낸다(세션은 둔다. 뒤늦은 답은 id 가 달라 안 섞인다) */
export const abortPlanner = (): void => {
  epoch++;
  cancelApi(); // S-3355: 기다리는 API 요청도 끊는다
};

const fail = (reason: AskFail["reason"], detail?: string): AskResult => ({ fail: (detail === undefined ? { reason } : { reason, detail }) as AskFail });
const blockedFail = (screen: string, cli: string): AskResult => (/sign in|log in|login/i.test(screen) ? { fail: { reason: "login", cli } } : fail("blocked"));

function track(r: AskResult): AskResult {
  if ("plan" in r) usePlanner.setState({ status: "ready", lastFail: undefined });
  else if (r.fail.reason === "login") usePlanner.setState({ status: "login" });
  else if (r.fail.reason === "none") usePlanner.setState({ status: "ready" });
  else if (!["off", "no agent", "long", "cancelled"].includes(r.fail.reason)) usePlanner.setState({ status: "failed", lastFail: r.fail.reason });
  return r;
}

export function plannerAsk(sentence: string, ctx: BoardCtx, deps: Partial<PlannerDeps> = {}): Promise<AskResult> {
  const d = { ...DEFAULTS, ...deps };
  const my = epoch;
  const run = tail.then(() => ask(sentence, ctx, d, my)); // S-2964: 한 줄로 차례대로
  tail = run.catch(() => {});
  return run.then(track);
}

async function ask(sentence: string, ctx: BoardCtx, d: PlannerDeps, my: number): Promise<AskResult> {
  if (epoch !== my) return fail("cancelled");
  const agent = await d.agent();
  if (agent === "off" || agent === "no agent") return fail(agent);
  const id = nextId();
  const handles = makeHandles(ctx);
  const req = buildRequest({ id, sentence, ctx, handles });
  if (typeof req !== "string") return fail("long");
  if (isApi(agent)) {
    // S-3350: 숨은 세션·프라이머 상태는 건드리지 않는다. 시간 제한은 Rust 가 한다
    const r = await d.api({ id, provider: agent, model: d.model(agent), baseUrl: d.baseUrl(), req, handles, timeoutMs: answerMs() });
    return epoch !== my ? fail("cancelled") : r;
  }
  if (st && st.agent !== agent) closePlanner(); // S-2903: 에이전트가 바뀌면 옛 세션 닫기
  idleCancel?.();
  idleCancel = null;
  try {
    // 세션 준비(띄움+신뢰 질문+준비 조용함+질문 보냄) 최대 45초 — 답 20초와 따로 센다
    let abandoned = false;
    const send = async () => {
      if (!st) {
        const env = await d.env(agent);
        const s = await d.open({ agentId: agent, cwd: await d.dir(), args: cliArgs(agent, d.model(agent)), env, timeoutMs: LIFE_MS, manual: true, emptyFolder: true, waitPrompt: true, clock: d.clock });
        if (abandoned) {
          s.close();
          throw new Error("abandoned");
        }
        st = { agent, s, env, primed: false };
      }
      const cur = st;
      return cur.s.type(cur.primed ? req : `${PRIMER}\n${req}`); // primed 는 이 세션의 답이 transcript 에 보인 뒤에만 켠다(아래)
    };
    let cancelReady = () => {};
    const limit = new Promise<"timeout">((res) => void (cancelReady = d.clock.after(READY_MS, () => res("timeout"))));
    const r = await Promise.race([send(), limit]).catch(() => "error" as const);
    cancelReady();
    if (r === "timeout" || r === "error") {
      abandoned = true;
      closePlanner();
      return fail("start");
    }
    if (r.blocked) {
      closePlanner();
      return blockedFail(r.screen, agent);
    }
    const cur = st!;
    const sentAt = d.clock.now();
    const limitMs = answerMs();
    let nudged = false, resent = false;
    for (;;) {
      if (epoch !== my || st !== cur) return fail("cancelled"); // abort 이거나 도중에 닫힘(설정 변경)
      if (agent === "codex" && !cur.sid) cur.sid = (await d.find(cur.s.cwd, cur.s.startedAt, cur.env[0]?.[1])) ?? undefined; // S-2961: 한 번 찾아 저장
      const sid = cur.s.sessionId ?? cur.sid;
      const reply = sid || agent === "gemini" || agent === "opencode" ? await d.read({ agentId: agent, cwd: cur.s.cwd, sessionId: sid, startedAtMs: cur.s.startedAt, configDir: cur.env[0]?.[1] }).catch(() => null) : null;
      const j = reply ? extractJson(reply) : null;
      if (j && typeof j === "object" && (j as { id?: unknown }).id === id) {
        cur.primed = true; // 프라이머를 읽고 우리 id 로 답했다 = 전달 확인
        const v = validatePlan(j, { id, handles });
        if ("ok" in v) return v.why === undefined ? { plan: { ok: v.ok } } : { plan: { ok: v.ok, why: v.why } };
        return "none" in v ? fail("none", v.none) : fail("bad", v.bad);
      }
      const waited = d.clock.now() - sentAt;
      if (!resent && waited >= RESEND_MS && waited < limitMs && d.clock.now() - cur.s.lastOutputAt() >= QUIET_MS) {
        resent = true; // ponytail: 화면 조용함(스피너 없음)으로 "안 먹었다"를 추정. transcript 의 사용자 줄을 읽는 통로가 생기면 그걸로 바꾼다
        await cur.s.type(cur.primed ? req : `${PRIMER}\n${req}`).catch(() => null); // 프라이머가 아직 확인 안 됐으면 함께
      } else if (!nudged && waited >= NUDGE_MS && d.clock.now() - cur.s.lastOutputAt() >= QUIET_MS) {
        nudged = true;
        cur.s.enter();
      }
      if (waited >= limitMs) {
        closePlanner();
        return fail("timeout");
      }
      const q = await cur.s.waitQuiet(0, 250).catch(() => null); // 막힘을 알아보는 자리
      if (q?.blocked) {
        closePlanner();
        return blockedFail(q.screen, agent);
      }
      await d.clock.sleep(agent === "opencode" ? OPENCODE_POLL_MS : POLL_MS);
    }
  } finally {
    if (st) idleCancel = d.clock.after(IDLE_MS, closePlanner); // S-2965
  }
}
