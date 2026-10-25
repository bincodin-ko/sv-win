// S-547: Kill all 두 번 클릭 상태기계. 첫 클릭은 "Confirm?"(3초), 3초 안의 둘째 클릭이 확인창을 연다.
export const CONFIRM_MS = 3000;
export type KillState = { armedAt: number | null };
export const idle: KillState = { armedAt: null };

export function click(s: KillState, now: number): { state: KillState; ask: boolean } {
  return isArmed(s, now) ? { state: idle, ask: true } : { state: { armedAt: now }, ask: false };
}
export function isArmed(s: KillState, now: number): boolean {
  return s.armedAt !== null && now - s.armedAt < CONFIRM_MS;
}
export const chipLabel = (s: KillState, now: number): string => (isArmed(s, now) ? "Confirm?" : "Kill all");
