import { t, tp } from "../i18n";

// S-609: 보낼 곳 정하기(planner 없음 규칙). 순수 함수.
export type Cand = { id: string; name: string; status: string; agent: boolean };
export type Stop = "noAgent" | "shellOnly" | "ambiguous";
export type Picked = { to: Cand[]; rest: number; stop?: Stop };

const IDLE = ["READY", "RUNNING", "IDLE"];
/** "한가한" = READY·RUNNING·IDLE */
export const isIdle = (status: string): boolean => IDLE.includes(status);

/** named = 이름·멘션·그룹이 가리킨 콘솔들(없으면 []), all = 이 repo 의 모든 콘솔 */
export function pickTargets({ named, all, broadcast }: { named: Cand[]; all: Cand[]; broadcast?: boolean }): Picked {
  const pool = named.length && !broadcast ? named : all;
  const agents = pool.filter((c) => c.agent);
  if (!agents.length) return { to: [], rest: 0, stop: pool.length ? "shellOnly" : "noAgent" }; // S-604
  if (broadcast) return { to: agents, rest: 0 }; // ⑤
  if (named.length) return agents.length === 1 ? { to: agents, rest: 0 } : { to: [agents.find((c) => isIdle(c.status)) ?? agents[0]!], rest: agents.length - 1 }; // ①②
  return agents.length === 1 ? { to: agents, rest: 0 } : { to: [], rest: 0, stop: "ambiguous" }; // ④③
}

export const restNote = (n: number): string => tp("{n} other left to rest", "{n} others left to rest", n);
export const stopText = (s: Stop): string =>
  s === "ambiguous" ? t("Say who it is for first, like @Otto …") : s === "shellOnly" ? t("That is a shell, not an agent, so I didn't send anything.") : t("There is no agent console to send that to.");
