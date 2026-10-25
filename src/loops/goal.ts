// D5 S-1411·S-1412 목표 확인 큐: 같은 loop 는 90초에 한 번, 전체 동시 2개, 판단 못 함(오류·로그아웃·5분 초과) = unknown
import { t, tm } from "../i18n";
import type { Loop } from "./types";

export type Verdict = "met" | "notMet" | "unknown";
export type GoalDeps = {
  now(): number;
  /** D3 ipc.goalRun 을 메인이 합칠 때 연결. timeout = 제한 시간에 그 PID 를 끔 */
  goalRun(cmd: string, cwd: string, secs: number): Promise<{ status: "met" | "notMet" | "timeout"; output?: string }>;
  /** D9 judge.ts 의 judgeGoal(D13 이 채움) */
  judge(l: Loop): Promise<Verdict>;
  log(l: Loop, text: string): void;
};
export const GOAL_GAP_MS = 90_000, GOAL_MAX = 2, GOAL_TIMEOUT_S = 300;
const WORD: Record<Verdict, string> = { met: tm("goal met"), notMet: tm("goal not met"), unknown: tm("goal check could not decide") };

export function createGoalQueue(d: GoalDeps) {
  const last = new Map<string, number>();
  const waiters: (() => void)[] = [];
  let running = 0;

  async function run(l: Loop): Promise<Verdict> {
    const g = l.stop.goal!;
    if (g.mode === "agent") {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<Verdict>((r) => { timer = setTimeout(() => r("unknown"), GOAL_TIMEOUT_S * 1000); });
      const v = await Promise.race([d.judge(l), late]).catch((): Verdict => "unknown").finally(() => clearTimeout(timer));
      d.log(l, t(WORD[v]));
      return v;
    }
    const r = await d.goalRun(g.text, l.repo, GOAL_TIMEOUT_S).catch(() => null);
    const v: Verdict = r?.status === "met" ? "met" : r?.status === "notMet" ? "notMet" : "unknown";
    const out = r?.output?.slice(-200);
    d.log(l, out ? `${t(WORD[v])} — ${out}` : t(WORD[v]));
    return v;
  }

  return {
    /** skipped = 목표가 없거나 90초 안에 이미 확인함 → 실행을 그대로 진행 */
    async check(l: Loop): Promise<Verdict | "skipped"> {
      const prev = last.get(l.id);
      if (!l.stop.goal || (prev !== undefined && d.now() - prev < GOAL_GAP_MS)) return "skipped";
      last.set(l.id, d.now());
      while (running >= GOAL_MAX) await new Promise<void>((r) => waiters.push(r));
      running++;
      try {
        return await run(l);
      } finally {
        running--;
        waiters.shift()?.();
      }
    },
    running: () => running,
  };
}
