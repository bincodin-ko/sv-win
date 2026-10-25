// D5 S-1407 전달 규칙: 에이전트가 돌고 있는 콘솔만(Shell·폴백 제외), NEEDS YOU·일시 중지는 건너뜀
import type { Writable } from "../console/submit";

export interface LConsole extends Writable { key: string; name: string; isAgent(): boolean; status(): string; isPaused(): boolean; tail(n: number): string[] }
export type Skip = { c: LConsole; why: "needs you" | "paused" };

export function sortTargets(cs: LConsole[]): { send: LConsole[]; skipped: Skip[] } {
  const send: LConsole[] = [];
  const skipped: Skip[] = [];
  for (const c of cs) {
    if (!c.isAgent()) continue;
    if (c.isPaused() || c.status() === "PAUSED") skipped.push({ c, why: "paused" });
    else if (c.status() === "NEEDS YOU") skipped.push({ c, why: "needs you" });
    else send.push(c);
  }
  return { send, skipped };
}
