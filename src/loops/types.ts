// D5 S-1400·S-1403: loop 정의와 범위 보정
export type Trigger = { kind: "schedule"; everyMin: number } | { kind: "idle" } | { kind: "output"; text: string };
export type Target = { kind: "all" } | { kind: "card"; id: string } | { kind: "pick"; ids: string[] };
export type Goal = { mode: "command" | "agent"; text: string; agent?: string };
/** 없는 칸은 안 켠 것 */
export type StopRule = { runs?: number; minutes?: number; goal?: Goal };
/** wsId = 만든 워크스페이스, repo = 저장 단위(S-1401) */
export type Loop = { id: string; name: string; instruction: string; trigger: Trigger; target: Target; stop: StopRule; keepBehind: boolean; enabled: boolean; wsId: string; repo: string };

export const PRESETS_MIN = [5, 10, 15, 30, 60, 120];
export const DEFAULT_EVERY = 15;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));

/** 범위 밖 값은 가까운 값으로 */
export function normalize(l: Loop): Loop {
  const trigger = l.trigger.kind === "schedule" ? { kind: "schedule" as const, everyMin: clamp(l.trigger.everyMin, 1, 1440) } : l.trigger;
  const stop: StopRule = { ...l.stop };
  if (stop.runs != null) stop.runs = clamp(stop.runs, 1, 200);
  if (stop.minutes != null) stop.minutes = clamp(stop.minutes, 15, 1440);
  return { ...l, trigger, stop };
}

/** output 글은 2자 이상이어야 만들 수 있다 */
export const outputTextOk = (t: string): boolean => t.trim().length >= 2;
