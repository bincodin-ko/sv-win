// E3 S-2026·S-1978~1985 공용 실행기 (E6 Documents 도 가져다 씀). D2 의 runHidden·readReply 위에 얹는다
import { runHidden, type HiddenSession } from "../hidden/probe";
import { readReply, type ReplyTarget } from "../hidden/reply";
import { realClock, type Clock } from "../hidden/screen";
import { profileEnvFor } from "../profiles/env";

export type Effort = "quick" | "balanced" | "thorough";
export type StudioPhase = "launching" | "thinking" | "writing" | "finishing";
export type StudioResult =
  | { ok: true; text: string }
  | { stopped: true; text: string }
  | { timeout: true; text: string }
  | { blocked: true; why: string }
  | { error: string };
export interface StudioRunOpts {
  agentId: string;
  cwd: string;
  prompt: string;
  /** 프롬프트를 보낸 때부터 이만큼이면 멈춘다 */
  limitMs: number;
  /** 출력(PTY·transcript 증가)이 이만큼 없으면 멈춘다 (기본 200초) */
  noOutputMs?: number;
  onStatus?: (p: StudioPhase) => void;
  /** 1초마다 transcript 의 지금까지 글 (바뀔 때만) */
  onText?: (text: string) => void;
  signal?: AbortSignal;
  clock?: Clock;
}

export const NO_OUTPUT_MS = 200000; // S-1983
const LIMIT_MIN = { quick: 6, balanced: 12, thorough: 25 } as const;
export const effortLimitMs = (e: Effort): number => LIMIT_MIN[e] * 60000;

const POLL_MS = 1000; // S-1981
const QUIET_MS = 8000; // 새 답이 이만큼 조용하면 끝 (D2 waitReply 와 같음)
const FINISHING_MS = 3000; // 단계 판정 추측: 이만큼 조용하면 finishing
const LAUNCH_SLACK_MS = 120000; // 세션 여는 시간 여유

/** S-1985: Codex 업데이트 질문이면 "Skip" 선택지의 번호 + Enter 를 돌려준다. 못 알아보면 null (문구는 CLI 버전마다 달라 여기 한 곳) */
export function skipCodexUpdate(screen: string): string | null {
  if (!/update available|new version|update (is )?required/i.test(screen)) return null;
  let until: string | null = null;
  for (const line of screen.split("\n")) {
    const m = /^\s*[›>❯]?\s*(\d)[.)]\s*(skip\b.*)$/i.exec(line);
    if (!m) continue;
    if (!/until/i.test(m[2]!)) return `${m[1]}\r`;
    until ??= `${m[1]}\r`;
  }
  return until;
}

export async function studioRun(o: StudioRunOpts): Promise<StudioResult> {
  const clock = o.clock ?? realClock;
  const noOutputMs = o.noOutputMs ?? NO_OUTPUT_MS;
  let sess: HiddenSession | undefined;
  let text = "";
  const onAbort = () => sess?.close();
  o.signal?.addEventListener("abort", onAbort);
  const stopped = () => o.signal?.aborted === true;
  o.onStatus?.("launching");
  try {
    const env = await profileEnvFor(o.agentId);
    if (stopped()) return { stopped: true, text };
    return await runHidden(
      {
        agentId: o.agentId,
        cwd: o.cwd,
        env,
        timeoutMs: o.limitMs + LAUNCH_SLACK_MS,
        clock,
        answerBlocked: o.agentId === "codex" ? skipCodexUpdate : undefined,
      },
      async (s): Promise<StudioResult> => {
        sess = s;
        if (stopped()) return { stopped: true, text };
        const target: ReplyTarget = { agentId: o.agentId, cwd: o.cwd, sessionId: s.sessionId, startedAtMs: s.startedAt, configDir: env[0]?.[1] };
        const baseline = await readReply(target);
        const sent = await s.type(o.prompt); // 대신 답하는 입력은 이 한 번뿐
        if (stopped()) return { stopped: true, text };
        if (sent.blocked) return { blocked: true, why: sent.screen };
        o.onStatus?.("thinking");
        const sentAt = clock.now();
        let lastGrow = sentAt;
        let phase: StudioPhase = "thinking";
        const setPhase = (p: StudioPhase) => {
          if (p !== phase) o.onStatus?.((phase = p));
        };
        for (;;) {
          if (stopped()) return { stopped: true, text };
          const r = await readReply(target);
          if (r && r !== baseline && r !== text) {
            text = r;
            lastGrow = clock.now();
            o.onText?.(r);
          }
          const now = clock.now();
          const quiet = now - Math.max(s.lastOutputAt(), lastGrow);
          if (text) {
            if (quiet >= QUIET_MS) return { ok: true, text };
            setPhase(quiet >= FINISHING_MS ? "finishing" : "writing");
          }
          if (now - sentAt >= o.limitMs || now - Math.max(s.lastOutputAt(), lastGrow, sentAt) >= noOutputMs) return { timeout: true, text };
          const st = await s.waitQuiet(0, POLL_MS).catch(() => null); // 막힘을 알아보는 자리(준비 전이면 timeout 은 무시)
          if (stopped()) return { stopped: true, text };
          if (st?.blocked) return { blocked: true, why: st.screen };
          await clock.sleep(POLL_MS);
        }
      },
    );
  } catch (e) {
    if (stopped()) return { stopped: true, text };
    const msg = e instanceof Error ? e.message : String(e);
    return msg === "timeout" ? { timeout: true, text } : { error: msg };
  } finally {
    o.signal?.removeEventListener("abort", onAbort);
  }
}
