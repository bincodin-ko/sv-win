// S-1310 상태를 바꾼 시각 저장소(메모리만): 세션 키 → { 상태, 그 상태가 된 시각 }
import { t } from "../i18n";
const m = new Map<string, { status: string; at: number }>();

/** 상태가 바뀌었을 때만 기록한다(같은 상태를 또 알려도 시각은 그대로) */
export function markSince(key: string, status: string, now: number = Date.now()): void {
  if (m.get(key)?.status !== status) m.set(key, { status, at: now });
}
export const sinceOf = (key: string): number | undefined => m.get(key)?.at;
/** 이 상태로 지낸 ms. 기록이 없거나 상태가 다르면 지금부터 센다(그 자리에서 기록) */
export function elapsedMs(key: string, status: string, now: number = Date.now()): number {
  markSince(key, status, now);
  return now - m.get(key)!.at;
}
export const clearSince = (): void => m.clear();

/** 이 상태로 지낸 시간 글자 (S-2481): 2m 10s / 45s / 1h 2m → 2분 10초 / 45초 / 1시간 2분 */
export function fmtElapsed(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  if (s >= 3600) return t("{h}h {m}m", { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) });
  return s >= 60 ? t("{m}m {s}s", { m: Math.floor(s / 60), s: s % 60 }) : t("{s}s", { s });
}
