// S-2951~S-2955·S-2903·S-2980~S-2986: 못 읽은 문장을 planner 에 묻고 답을 실행 정책대로 이어 간다
import { askConfirm } from "../commandbar/confirm";
import type { ExecCtx } from "../commandbar/executor";
import type { Intent, Target } from "../commandbar/intent";
import { useThread } from "../commandbar/thread";
import { t } from "../i18n";
import { showNotice } from "../lib/notice";
import { guard } from "../orchestrator/scope";
import { useSettings } from "../settings/useSettings";
import { failText } from "./fail";
import { policyOf, summarize } from "./policy";
import type { BoardCtx } from "./prompt";
import { abortPlanner, closePlanner, plannerAsk, plannerLive, type AskResult } from "./session";
import { isApi } from "./providers";
import { plannerOn, usePlanner } from "./state";

export type RunDeps = {
  runIntent: (i: Intent, ctx: ExecCtx) => Promise<void>;
  board: () => Promise<BoardCtx>;
  say: (text: string) => void;
  note: (text: string) => void;
  /** 시험용으로 바꿔 끼운다. 기본은 plannerAsk */
  ask?: (sentence: string, board: BoardCtx) => Promise<AskResult>;
};

let gen = 0; // cancelPlanner 가 올린다 — 그 전에 시작한 요청의 답은 버린다
let inflight = 0;

// S-2903: planner 설정이 바뀌면 떠 있던 세션을 닫는다
useSettings.subscribe((s, p) => {
  if (s.s.planner !== p.s.planner || s.s.plannerModel !== p.s.plannerModel || s.s.plannerBaseUrl !== p.s.plannerBaseUrl) closePlanner(); // S-3303
});

/** true = planner 가 처리했다(실패 문구 포함). false = 호출한 쪽이 기존 needsPlanner 문구를 쓴다 */
export async function runPlanner(text: string, ctx: ExecCtx, d: RunDeps): Promise<boolean> {
  if (!plannerOn() || useSettings.getState().s.planner === "off") return false;
  const my = gen;
  const board = await d.board();
  const live = plannerLive() || isApi(useSettings.getState().s.planner); // S-3304: API 는 늘 thinking
  inflight++;
  usePlanner.setState({ busy: { repo: ctx.repo, phase: live ? "thinking" : "starting", since: Date.now() } });
  if (!useThread.getState().open) showNotice(live ? t("Thinking…") : t("Starting the planner…")); // S-2981
  let r: AskResult;
  try {
    r = await (d.ask ?? plannerAsk)(text, board);
  } finally {
    if (my === gen && --inflight === 0) usePlanner.setState({ busy: null });
  }
  if (my !== gen || ("fail" in r && r.fail.reason === "cancelled")) return true; // S-2955: 취소됨 — 뒤늦은 답은 무시
  if ("fail" in r) {
    const f = failText(r.fail as Exclude<typeof r.fail, { reason: "cancelled" }>);
    if (f === null) return false;
    d.say(f);
    return true;
  }
  const { ok: i, why } = r.plan;
  const blocked = ctx.scope && guard(i, ctx.scope); // S-2940
  if (blocked) {
    d.say(blocked);
    return true;
  }
  const name = (x: Target): string =>
    x.kind === "console" ? board.consoles.find((c) => c.id === x.id)?.name ?? "" : x.kind === "group" ? board.groups.find((g) => g.id === x.id)?.name ?? "" : x.kind === "cli" ? x.agentId : "all";
  const sum = summarize(i, name);
  d.note(why ? t("Plan – {summary} ← {why}", { summary: sum, why }) : t("Plan – {summary}", { summary: sum })); // S-2953
  if (policyOf(i) === "confirm") askConfirm(ctx.repo, t("Run this? {summary}", { summary: sum }), () => d.runIntent(i, ctx));
  else await d.runIntent(i, ctx);
  return true;
}

/** S-2955: 생각 중인 요청을 버린다. 버릴 것이 있었으면 true */
export function cancelPlanner(): boolean {
  if (inflight === 0) return false;
  gen++;
  inflight = 0;
  usePlanner.setState({ busy: null });
  abortPlanner();
  return true;
}
