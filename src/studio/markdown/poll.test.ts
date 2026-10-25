import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPoll, POLL_EVERY } from "./poll";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const mk = (dirty: boolean) => {
  let m = 1;
  const onSilent = vi.fn(), onConflict = vi.fn();
  const p = createPoll({ read: async () => ({ mtimeMs: m }), isDirty: () => dirty, onSilent, onConflict });
  p.setKnown(1);
  return { p, set: (v: number) => (m = v), onSilent, onConflict };
};

describe("S-1930 디스크 변경 보기", () => {
  it("주기는 3초", () => expect(POLL_EVERY).toBe(3000));
  it("바뀐 게 없으면 아무것도 안 한다", async () => {
    const { p, onSilent, onConflict } = mk(false);
    await p.tick();
    expect(onSilent).not.toHaveBeenCalled();
    expect(onConflict).not.toHaveBeenCalled();
  });
  it("dirty 가 아니면 조용히 다시 읽는다(한 번만)", async () => {
    const { p, set, onSilent, onConflict } = mk(false);
    set(2);
    await p.tick();
    await p.tick();
    expect(onSilent).toHaveBeenCalledTimes(1);
    expect(onSilent).toHaveBeenCalledWith({ mtimeMs: 2 });
    expect(onConflict).not.toHaveBeenCalled();
  });
  it("dirty 면 띠(onConflict)를 한 번만 띄운다", async () => {
    const { p, set, onSilent, onConflict } = mk(true);
    set(5);
    await p.tick();
    await p.tick();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onSilent).not.toHaveBeenCalled();
    set(6);
    await p.tick();
    expect(onConflict).toHaveBeenCalledTimes(2);
  });
  it("start 는 3초마다 tick, stop 하면 멈춘다", async () => {
    const { p, set, onSilent } = mk(false);
    p.start();
    set(2);
    await vi.advanceTimersByTimeAsync(3100);
    expect(onSilent).toHaveBeenCalledTimes(1);
    p.stop();
    set(3);
    await vi.advanceTimersByTimeAsync(6000);
    expect(onSilent).toHaveBeenCalledTimes(1);
  });
  it("읽기 실패(throw)는 조용히 넘어간다", async () => {
    const onSilent = vi.fn();
    const p = createPoll({ read: async () => { throw "x"; }, isDirty: () => false, onSilent, onConflict() {} });
    await expect(p.tick()).resolves.toBeUndefined();
    expect(onSilent).not.toHaveBeenCalled();
  });
});
