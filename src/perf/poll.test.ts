import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { orbPlay, startPoll } from "./poll";
import { useSettings } from "../settings/useSettings";

const setHidden = (h: boolean) => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
  document.dispatchEvent(new Event("visibilitychange"));
};
const setLow = (v: boolean) => useSettings.setState((st) => ({ s: { ...st.s, lowSpec: v } }));

beforeEach(() => { vi.useFakeTimers(); setHidden(false); setLow(false); });
afterEach(() => { vi.useRealTimers(); setLow(false); });

describe("startPoll", () => {
  it("즉시 한 번, 이후 간격마다", () => {
    const fn = vi.fn(); const stop = startPoll(fn, 1000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(4);
    stop();
  });
  it("창이 숨으면 멈추고, 다시 보이면 즉시 한 번 갱신 후 계속", () => {
    const fn = vi.fn(); const stop = startPoll(fn, 1000);
    fn.mockClear();
    setHidden(true);
    vi.advanceTimersByTime(10_000);
    expect(fn).toHaveBeenCalledTimes(0);
    setHidden(false);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(3);
    stop();
  });
  it("시작할 때 이미 숨어 있으면 부르지 않다가 보이면 부른다", () => {
    setHidden(true);
    const fn = vi.fn(); const stop = startPoll(fn, 1000);
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(0);
    setHidden(false);
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
  });
  it("저사양이면 간격 3배", () => {
    setLow(true);
    const fn = vi.fn(); const stop = startPoll(fn, 1000);
    fn.mockClear();
    vi.advanceTimersByTime(2999);
    expect(fn).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
  });
  it("stop 뒤에는 타이머도 보임 이벤트도 무시", () => {
    const fn = vi.fn(); const stop = startPoll(fn, 1000);
    stop(); fn.mockClear();
    vi.advanceTimersByTime(5000); setHidden(true); setHidden(false);
    expect(fn).toHaveBeenCalledTimes(0);
  });
});

describe("orbPlay", () => {
  it("기본 running, 창 숨김 paused, 저사양 none(숨김보다 우선)", () => {
    expect(orbPlay(false, false)).toBe("running");
    expect(orbPlay(true, false)).toBe("paused");
    expect(orbPlay(false, true)).toBe("none");
    expect(orbPlay(true, true)).toBe("none");
  });
});
