import { describe, expect, it } from "vitest";
import { fakeClock } from "../hidden/fakeclock";
import { SOUNDS, SOUND_NAMES, createChimes, type ChimeCfg } from "./chime";
import type { UsageResult } from "./probe";

const T0 = new Date(2026, 9, 24, 15, 0, 0).getTime(); // 15:00 현지 — "4:09pm" 은 16:09
const MIN = 60_000;
const res = (wins: { label?: string; pct: number; resetText: string | null }[], agent = "claude", at = T0): UsageResult => ({
  at, agent, raw: "", state: "ok",
  parsed: { windows: wins.map((w, i) => ({ label: w.label ?? `win${i}`, pct: w.pct, resetText: w.resetText })) },
});
function mk(cfg: Partial<ChimeCfg> = {}) {
  const clock = fakeClock(T0);
  const played: string[] = [];
  const c = createChimes({ clock, now: () => clock.now(), play: (s) => played.push(s), cfg: () => ({ enabled: true, play: "only100", sound: "Glass", ...cfg }) });
  return { clock, played, c };
}

describe("S-1531·S-1533 리셋 시각 + 5초에 울린다", () => {
  it("Only after 100%: 100% 였던 창만, 리셋 5초 뒤", async () => {
    const { clock, played, c } = mk();
    c.sync({ claude: res([{ pct: 100, resetText: "4:09pm" }]) });
    expect(c.pending()).toBe(1);
    await clock.advance(69 * MIN + 4_000); // 16:09:04
    expect(played).toEqual([]);
    await clock.advance(1_000); // 16:09:05
    expect(played).toEqual(["Glass"]);
    expect(c.pending()).toBe(0);
  });
  it("Only after 100%: 99% 였던 창은 안 울린다(타이머도 없음)", async () => {
    const { clock, played, c } = mk();
    c.sync({ claude: res([{ pct: 99, resetText: "4:09pm" }]) });
    await clock.advance(2 * 60 * MIN);
    expect(played).toEqual([]);
  });
  it("Always: 몇 %든 운다, 고른 소리로", async () => {
    const { clock, played, c } = mk({ play: "always", sound: "Pop" });
    c.sync({ claude: res([{ pct: 3, resetText: "4:09pm" }]) });
    await clock.advance(70 * MIN);
    expect(played).toEqual(["Pop"]);
  });
  it("창마다 하나: 세션·주 두 창이 각자 시각에 운다", async () => {
    const { clock, played, c } = mk({ play: "always" });
    c.sync({ claude: res([{ pct: 100, resetText: "4:09pm" }, { pct: 100, resetText: "6pm" }]) });
    expect(c.pending()).toBe(2);
    await clock.advance(70 * MIN);
    expect(played.length).toBe(1);
    await clock.advance(2 * 60 * MIN);
    expect(played.length).toBe(2);
  });
  it("시각을 못 읽으면 안 운다", async () => {
    const { clock, played, c } = mk({ play: "always" });
    c.sync({ claude: res([{ pct: 100, resetText: null }, { pct: 100, resetText: "soon" }]) });
    expect(c.pending()).toBe(0);
    await clock.advance(48 * 60 * MIN);
    expect(played).toEqual([]);
  });
  it("체크를 끄면 안 운다(타이머도 없음), 울릴 때 꺼져 있어도 안 운다", async () => {
    const off = mk({ enabled: false });
    off.c.sync({ claude: res([{ pct: 100, resetText: "4:09pm" }]) });
    expect(off.c.pending()).toBe(0);
    let enabled = true;
    const clock = fakeClock(T0);
    const played: string[] = [];
    const c = createChimes({ clock, now: () => clock.now(), play: (s) => played.push(s), cfg: () => ({ enabled, play: "always", sound: "Ping" }) });
    c.sync({ claude: res([{ pct: 100, resetText: "4:09pm" }]) });
    enabled = false;
    await clock.advance(70 * MIN);
    expect(played).toEqual([]);
  });
});

describe("S-1531 다시 확인하면 타이머를 다시 건다", () => {
  it("같은 창의 시각이 바뀌면 옛 타이머는 버리고 새 시각에", async () => {
    const { clock, played, c } = mk({ play: "always" });
    c.sync({ claude: res([{ label: "Current session", pct: 100, resetText: "4:09pm" }]) });
    c.sync({ claude: res([{ label: "Current session", pct: 100, resetText: "5pm" }]) });
    expect(c.pending()).toBe(1);
    await clock.advance(70 * MIN);
    expect(played).toEqual([]);
    await clock.advance(51 * MIN);
    expect(played).toEqual(["Glass"]);
  });
  it("같은 결과를 두 번 sync 해도 한 번만 운다", async () => {
    const { clock, played, c } = mk({ play: "always" });
    const r = { claude: res([{ pct: 100, resetText: "4:09pm" }]) };
    c.sync(r);
    c.sync(r);
    await clock.advance(70 * MIN);
    expect(played.length).toBe(1);
  });
  it("에이전트(계정)마다 따로", async () => {
    const { clock, played, c } = mk({ play: "always" });
    c.sync({ claude: res([{ pct: 100, resetText: "4:09pm" }]), "claude:work": res([{ pct: 100, resetText: "4:09pm" }]), codex: res([{ pct: 100, resetText: "4:09pm" }], "codex") });
    expect(c.pending()).toBe(3);
    await clock.advance(70 * MIN);
    expect(played.length).toBe(3);
  });
  it("결과가 사라지면(키가 빠지면) 그 타이머도 버린다, dispose 는 모두", async () => {
    const { clock, played, c } = mk({ play: "always" });
    c.sync({ claude: res([{ pct: 100, resetText: "4:09pm" }]) });
    c.sync({});
    expect(c.pending()).toBe(0);
    c.sync({ claude: res([{ pct: 100, resetText: "4:09pm" }]) });
    c.dispose();
    await clock.advance(70 * MIN);
    expect(played).toEqual([]);
  });
  it("이미 지난 시각(5초 포함)은 걸지 않는다", () => {
    const { c } = mk({ play: "always" });
    c.sync({ claude: res([{ pct: 100, resetText: "11am" }], "claude", T0 - 5 * 60 * MIN) }); // 5시간 전(10시)에 읽은 결과의 11시 → 지금(15시)은 이미 지났다
    expect(c.pending()).toBe(0);
  });
});

describe("S-1532 소리 6개 표", () => {
  it("이름 6개, 서로 다른 합성음 값", () => {
    expect(SOUND_NAMES).toEqual(["Glass", "Ping", "Tink", "Pop", "Purr", "Submarine"]);
    expect(Object.keys(SOUNDS)).toEqual(SOUND_NAMES);
    const sig = SOUND_NAMES.map((n) => JSON.stringify(SOUNDS[n]));
    expect(new Set(sig).size).toBe(6);
    expect(SOUNDS.Glass!.notes.length).toBe(2); // 높은 사인 2음
    expect(SOUNDS.Glass!.wave).toBe("sine");
    expect(SOUNDS.Ping!.notes.length).toBe(1);
    for (const n of SOUND_NAMES) for (const note of SOUNDS[n]!.notes) expect(note.f > 0 && note.dur > 0 && note.at >= 0).toBe(true);
    expect(Math.max(...SOUNDS.Purr!.notes.map((x) => x.dur))).toBeGreaterThan(Math.max(...SOUNDS.Tink!.notes.map((x) => x.dur))); // Purr 는 지속음, Tink 는 짧다
  });
});
