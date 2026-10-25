// S-546·S-620·S-621: 콘솔 멈춤·재개 호출 묶음. B9 칩과 B12 실행기가 부른다.
import type { Session } from "./session";

export type Pausable = Pick<Session, "isRunning" | "isPaused" | "pause" | "resume">;

/** 돌고 있고 아직 안 멈춘 콘솔만 멈춘다. 멈춘 경우 true */
export function pauseSession(s: Pausable): boolean {
  if (!s.isRunning() || s.isPaused()) return false;
  s.pause();
  return true;
}
/** 멈춰 있는 콘솔만 재개한다. 재개한 경우 true */
export function resumeSession(s: Pausable): boolean {
  if (!s.isPaused()) return false;
  s.resume();
  return true;
}
/** 멈춘 개수를 돌려준다. 이미 PAUSED 인 것은 건너뛴다 */
export const pauseAll = (sessions: Pausable[]): number => sessions.filter(pauseSession).length;
export const resumeAll = (sessions: Pausable[]): number => sessions.filter(resumeSession).length;
