// D10 S-1531~S-1533: 리셋 chime 스케줄러 + Web Audio 합성음
import type { Clock } from "../hidden/screen";
import type { UsageResult } from "./probe";
import { parseReset } from "./reset";

export interface Sound { wave: "sine" | "triangle" | "square"; gain: number; notes: { f: number; at: number; dur: number }[] }
/** S-1532: 이름마다 주파수(Hz)·시작(초)·길이(초)·파형이 다른 짧은 소리. 값은 추측 — 여기 한 곳만 고친다 */
export const SOUNDS: Record<string, Sound> = {
  Glass: { wave: "sine", gain: 0.25, notes: [{ f: 1318.5, at: 0, dur: 0.35 }, { f: 1760, at: 0.12, dur: 0.5 }] },
  Ping: { wave: "sine", gain: 0.3, notes: [{ f: 1046.5, at: 0, dur: 0.6 }] },
  Tink: { wave: "triangle", gain: 0.25, notes: [{ f: 2637, at: 0, dur: 0.08 }] },
  Pop: { wave: "sine", gain: 0.4, notes: [{ f: 220, at: 0, dur: 0.1 }] },
  Purr: { wave: "triangle", gain: 0.3, notes: [{ f: 110, at: 0, dur: 0.9 }] },
  Submarine: { wave: "sine", gain: 0.35, notes: [{ f: 174.6, at: 0, dur: 1.4 }] },
};
export const SOUND_NAMES = Object.keys(SOUNDS);
export type ChimePlay = "only100" | "always";
export interface ChimeCfg { enabled: boolean; play: ChimePlay; sound: string }
export const CHIME_DELAY_MS = 5000; // 리셋 직후 확인 지연을 흡수(S-1533)
const MAX_DELAY = 2 ** 31 - 1; // setTimeout 한계 ponytail: 24일 넘게 남은 창은 다음 확인 때 건다

export interface Chimes { sync(results: Record<string, UsageResult>): void; pending(): number; dispose(): void }
export function createChimes(d: { clock: Clock; now(): number; play(sound: string): void; cfg(): ChimeCfg }): Chimes {
  const timers = new Map<string, { at: number; cancel: () => void }>();
  return {
    sync(results) {
      const want = new Map<string, { at: number; pct: number }>();
      const cfg = d.cfg();
      if (cfg.enabled)
        for (const [rk, r] of Object.entries(results))
          for (const w of r.state === "ok" ? (r.parsed?.windows ?? []) : []) {
            if (cfg.play === "only100" && w.pct < 100) continue;
            const t = w.resetText ? parseReset(w.resetText, new Date(r.at)) : null; // 시각을 못 읽으면 안 운다
            if (!t) continue;
            const at = t.getTime() + CHIME_DELAY_MS;
            if (at > d.now() && at - d.now() <= MAX_DELAY) want.set(`${rk}|${w.label}`, { at, pct: w.pct });
          }
      for (const [k, t] of timers) if (want.get(k)?.at !== t.at) (t.cancel(), timers.delete(k));
      for (const [k, w] of want) {
        if (timers.has(k)) continue;
        const cancel = d.clock.after(w.at - d.now(), () => {
          timers.delete(k);
          const c = d.cfg(); // 울릴 때의 설정으로
          if (c.enabled && (c.play === "always" || w.pct >= 100)) d.play(c.sound);
        });
        timers.set(k, { at: w.at, cancel });
      }
    },
    pending: () => timers.size,
    dispose() {
      for (const t of timers.values()) t.cancel();
      timers.clear();
    },
  };
}

let ctx: AudioContext | null = null;
/** 소리 하나를 합성해 낸다. 시험은 window.__chimeLog 에 이름이 쌓인다 */
export function playSound(name: string): void {
  (window as unknown as { __chimeLog?: string[] }).__chimeLog?.push(name);
  const s = SOUNDS[name];
  if (!s) return;
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const t0 = ctx.currentTime;
    for (const n of s.notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = s.wave;
      o.frequency.value = n.f;
      g.gain.setValueAtTime(s.gain, t0 + n.at);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + n.at);
      o.stop(t0 + n.at + n.dur + 0.02);
    }
  } catch {
    /* 오디오 막힘 */
  }
}
