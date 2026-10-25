// D13: 숨은 세션에 한 번 묻고 답을 받는다 (scan·refresh·judge 가 같이 씀). D2 의 runHidden·readReply 위에 얹는다
import { runHidden, type HiddenSession } from "../hidden/probe";
import { readReply, type ReplyTarget } from "../hidden/reply";
import { realClock, type Clock } from "../hidden/screen";
import { isTauri } from "../lib/ipc";
import { profileEnvFor } from "../profiles/env";

export type AskFail = "blocked" | "timeout" | "cancelled" | "error";
export class AskError extends Error {
  constructor(public reason: AskFail, public screen?: string, msg?: string) {
    super(msg ?? reason);
  }
}
export type AskCtl = { cancelled: boolean; cancel(): void };
export function newCtl(): AskCtl {
  const c: AskCtl = { cancelled: false, cancel: () => void (c.cancelled = true) };
  return c;
}
export interface AskOpts {
  agent: string;
  repo: string;
  prompt: string;
  timeoutMs: number;
  ctl?: AskCtl;
  /** read = 질문을 보냄, write = 새 답 글이 나오기 시작함 */
  onPhase?: (p: "read" | "write") => void;
  clock?: Clock;
  /** 새 답이 나온 뒤 화면이 이만큼 조용하면 끝난 것(기본 8초) */
  quietMs?: number;
}
const POLL_MS = 500;
const QUIET_MS = 8000; // D2 waitReply 와 같은 기본값
/** 시험용: 가짜 모드에서만 window.__askQuietMs 로 줄인다 */
const fakeQuiet = (): number | undefined => (!isTauri() && typeof window !== "undefined" ? (window as unknown as { __askQuietMs?: number }).__askQuietMs : undefined);

/** 숨은 세션을 repo 에서 열어 prompt 를 보내고 새 답을 돌려준다. 실패는 AskError(blocked·timeout·cancelled·error) */
export async function ask(o: AskOpts): Promise<string> {
  const clock = o.clock ?? realClock;
  const quietMs = o.quietMs ?? fakeQuiet() ?? QUIET_MS;
  const ctl = o.ctl ?? newCtl();
  let sess: HiddenSession | undefined;
  ctl.cancel = () => {
    ctl.cancelled = true;
    sess?.close();
  };
  const stop = () => {
    if (ctl.cancelled) throw new AskError("cancelled");
  };
  try {
    const env = await profileEnvFor(o.agent);
    stop();
    return await runHidden({ agentId: o.agent, cwd: o.repo, env, timeoutMs: o.timeoutMs, clock }, async (s) => {
      sess = s;
      stop();
      const target: ReplyTarget = { agentId: o.agent, cwd: o.repo, sessionId: s.sessionId, startedAtMs: s.startedAt, configDir: env[0]?.[1] };
      const baseline = await readReply(target);
      const sent = await s.type(o.prompt);
      stop();
      if (sent.blocked) throw new AskError("blocked", sent.screen);
      o.onPhase?.("read");
      let writing = false;
      for (;;) {
        stop();
        const r = await readReply(target);
        if (r && r !== baseline) {
          if (!writing) o.onPhase?.("write");
          writing = true;
          if (clock.now() - s.lastOutputAt() >= quietMs) return r;
        }
        if (clock.now() - s.startedAt >= o.timeoutMs) throw new AskError("timeout");
        const st = await s.waitQuiet(0, POLL_MS).catch(() => null); // 막힘을 알아보는 자리(준비 전이면 POLL_MS 뒤 timeout 을 무시)
        stop();
        if (st?.blocked) throw new AskError("blocked", st.screen);
        await clock.sleep(POLL_MS);
      }
    });
  } catch (e) {
    if (e instanceof AskError) throw e;
    if (ctl.cancelled) throw new AskError("cancelled");
    throw new AskError(e instanceof Error && e.message === "timeout" ? "timeout" : "error", undefined, e instanceof Error ? e.message : String(e));
  }
}
