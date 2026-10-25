// S-1680~S-1689: handoff 상태 기계 asking → waitingSummary(4분) → starting → delivering(신뢰 질문 2분) → done/cancelled.
// 실제 콘솔·Thread 연결은 Deps 로 주입(D15 가 연결). 시계도 주입.
import { START_WAIT_MS } from "../commandbar/deliver";
import { t } from "../i18n";
import { showsPrompt } from "../commandbar/prompts";
import { judge, type Snap } from "../commandbar/report";
import { brief, SUMMARY_REQUEST } from "./prompts";
import { CLIS, CLI_NAMES, type Base, type HSession } from "./types";

export const SUMMARY_WAIT_MS = 4 * 60_000;
export const TRUST_WAIT_MS = 2 * 60_000;
const POLL_MS = 500;

export type HSrc = { id: string; name: string; agent: boolean; status: string; selected?: boolean };
export interface HandoffDeps extends Base {
  /** 실행 중인 콘솔들 */
  sources(): HSrc[];
  session(id: string): HSession | undefined;
  /** 대상 CLI 새 콘솔을 beside 오른쪽에 만들고 id 를 돌려준다 */
  spawn(agentId: string, besideId: string): string;
  nameOf(id: string): string;
}

type Run = { cancelled: boolean };

export function createHandoff(d: HandoffDeps) {
  let cur: Run | null = null;

  /** S-1681: 멘션 > 선택된 하나 > 에이전트가 하나뿐 */
  function pick(from?: string): HSrc | string {
    const agents = d.sources().filter((s) => s.agent);
    const sel = agents.filter((s) => s.selected);
    const one = from ? agents.find((s) => s.id === from) : sel.length === 1 ? sel[0] : agents.length === 1 ? agents[0] : undefined;
    if (one) return one;
    return agents.length > 1 && !from ? t("Which console should hand it off? @ mention it.") : t("There is no agent to hand off from.");
  }

  async function start(o: { agentId: string; from?: string }): Promise<void> {
    if (!(CLIS as readonly string[]).includes(o.agentId)) return d.say(t("I can hand off to Claude Code, Codex, Gemini, Grok or OpenCode."));
    if (cur) return d.say(t("A handoff is already running."));
    const src = pick(o.from);
    if (typeof src === "string") return d.say(src);
    const run: Run = (cur = { cancelled: false });
    try {
      const summary = await ask(run, src);
      if (run.cancelled) return;
      const id = d.spawn(o.agentId, src.id);
      if (summary == null) return d.say(t("No summary came back. Started {name} with nothing typed.", { name: CLI_NAMES[o.agentId]! }));
      await deliver(run, id, brief(summary));
    } finally {
      cur = null;
    }
  }

  /** 1~2단계: 요약 요청을 넣고 4분까지 새 답을 기다린다. 못 받으면 null */
  async function ask(run: Run, src: HSrc): Promise<string | null> {
    const s = d.session(src.id);
    if (!s) return null;
    d.say(t("Asking {name} for a summary.", { name: src.name }));
    const before = await s.fetchReply().catch(() => null);
    const sentAt = d.now();
    await d.submit(s, SUMMARY_REQUEST);
    const o = { sentAt, sawWorking: false };
    while (d.now() - sentAt < SUMMARY_WAIT_MS) {
      await d.sleep(POLL_MS);
      if (run.cancelled) return null;
      const st = s.status();
      const snap: Snap = { status: st, lastOut: s.lastDataAt(), agent: s.isAgent(), blocked: st === "PAUSED" || st === "NEEDS YOU" || showsPrompt(s.tail(12)) };
      if (st === "WORKING") o.sawWorking = true;
      const v = judge(o, snap, d.now());
      if (v.state === "failed") return null;
      if (v.state === "finished") {
        const r = await s.fetchReply().catch(() => null);
        if (r && r !== before) return r;
      }
    }
    return null;
  }

  /** 3~4단계: 새 콘솔이 올라오면 입력. 신뢰 질문은 대신 답하지 않고 2분까지 기다린다 */
  async function deliver(run: Run, id: string, text: string): Promise<void> {
    const t0 = d.now();
    for (;;) {
      if (run.cancelled) return;
      const s = d.session(id);
      const waited = d.now() - t0;
      if (s && s.isAgent() && s.hasOutput() && s.status() !== "NEEDS YOU" && !showsPrompt(s.tail(12))) {
        await d.submit(s, text);
        return d.say(t("Brief delivered to {name}.", { name: d.nameOf(id) }));
      }
      if (waited >= (s?.hasOutput() ? TRUST_WAIT_MS : START_WAIT_MS)) return d.say(`${t("Not sent — paste it yourself:")}\n${text}`);
      await d.sleep(POLL_MS);
    }
  }

  return {
    start,
    /** S-1688: 기다리는 단계를 멈춘다. 멈춘 개수 */
    cancel(): number {
      if (!cur) return 0;
      cur.cancelled = true;
      return 1;
    },
    active: (): boolean => cur !== null,
  };
}
