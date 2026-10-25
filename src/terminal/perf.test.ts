import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBatchWriter, createGlGate, scrollbackFor } from "./perf";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const u = (...n: number[]) => new Uint8Array(n);

function rig(o: { low?: boolean; gesturing?: () => boolean; hidden?: boolean } = {}) {
  const frames: (() => void)[] = [];
  const writes: Uint8Array[] = [];
  const w = createBatchWriter((b) => writes.push(b), {
    lowSpec: () => !!o.low,
    gesturing: o.gesturing ?? (() => false),
    hidden: () => !!o.hidden,
    raf: (cb) => frames.push(cb),
    caf: () => {},
  });
  const frame = () => frames.splice(0).forEach((f) => f());
  return { w, writes, frame, frames };
}

describe("P2 #1 출력 묶음 write", () => {
  it("기본: 같은 프레임 조각 N개 → write 1회, 내용·순서 그대로", () => {
    const { w, writes, frame } = rig();
    w.push(u(1, 2));
    w.push(u(3));
    w.push(u(4, 5));
    expect(writes).toHaveLength(0);
    frame();
    expect(writes).toHaveLength(1);
    expect([...writes[0]!]).toEqual([1, 2, 3, 4, 5]);
  });
  it("기본: 다음 프레임 조각은 다음 write, 조각이 없으면 write 없음", () => {
    const { w, writes, frame } = rig();
    w.push(u(1));
    frame();
    frame();
    w.push(u(2));
    frame();
    expect(writes.map((x) => [...x])).toEqual([[1], [2]]);
  });
  it("flush()는 기다리지 않고 쌓인 것을 순서대로 바로 쓴다(그 뒤 프레임은 중복 write 없음)", () => {
    const { w, writes, frame } = rig();
    w.push(u(1));
    w.push(u(2));
    w.flush();
    expect(writes.map((x) => [...x])).toEqual([[1, 2]]);
    frame();
    expect(writes).toHaveLength(1);
  });
  it("저사양: 66ms 묶음(프레임이 아니라 타이머)", () => {
    const { w, writes, frames } = rig({ low: true });
    w.push(u(1));
    w.push(u(2));
    expect(frames).toHaveLength(0);
    vi.advanceTimersByTime(65);
    expect(writes).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(writes.map((x) => [...x])).toEqual([[1, 2]]);
  });
  it("저사양: 보드 팬·줌 중에는 미루고 끝난 뒤 한 번에, 순서 그대로", () => {
    let g = true;
    const { w, writes } = rig({ low: true, gesturing: () => g });
    w.push(u(1));
    vi.advanceTimersByTime(66);
    w.push(u(2));
    vi.advanceTimersByTime(500);
    expect(writes).toHaveLength(0);
    g = false;
    vi.advanceTimersByTime(150);
    expect(writes.map((x) => [...x])).toEqual([[1, 2]]);
  });
  it("창이 숨겨져 프레임이 안 오는 중에도 100ms 안에 쓴다(손실·정지 없음)", () => {
    const { w, writes, frames } = rig({ hidden: true });
    w.push(u(9));
    expect(frames).toHaveLength(0);
    vi.advanceTimersByTime(100);
    expect(writes.map((x) => [...x])).toEqual([[9]]);
  });
  it("dispose 뒤에는 쓰지 않는다", () => {
    const { w, writes, frame } = rig();
    w.push(u(1));
    w.dispose();
    frame();
    vi.advanceTimersByTime(1000);
    expect(writes).toHaveLength(0);
  });
});

describe("P2 #4 스크롤백", () => {
  it("기본 1만(S-106), 저사양 3000", () => {
    expect(scrollbackFor(false)).toBe(10000);
    expect(scrollbackFor(true)).toBe(3000);
  });
});

describe("P2 #2 WebGL 지연 떼기", () => {
  function gate(slot: () => boolean = () => true) {
    const log = { attach: 0, detach: 0 };
    const g = createGlGate(() => {
      if (!slot()) return null;
      log.attach++;
      return () => void log.detach++;
    });
    return { g, log };
  }
  it("보이면 바로 붙이고, 안 보여도 10초가 지나야 뗀다", () => {
    const { g, log } = gate();
    g.set(true);
    expect(log.attach).toBe(1);
    g.set(false);
    vi.advanceTimersByTime(9999);
    expect(log.detach).toBe(0);
    vi.advanceTimersByTime(1);
    expect(log.detach).toBe(1);
  });
  it("10초 안에 다시 보이면 안 떼고 다시 붙이지도 않는다", () => {
    const { g, log } = gate();
    g.set(true);
    g.set(false);
    vi.advanceTimersByTime(5000);
    g.set(true);
    vi.advanceTimersByTime(20000);
    expect(log).toEqual({ attach: 1, detach: 0 });
  });
  it("뗀 뒤 다시 보이면 붙인다. 자리가 없으면(null) 다시 시도할 때 붙인다", () => {
    let free = false;
    const { g, log } = gate(() => free);
    g.set(true);
    expect(log.attach).toBe(0);
    free = true;
    g.set(true);
    expect(log.attach).toBe(1);
    g.set(false);
    vi.advanceTimersByTime(10000);
    g.set(true);
    expect(log).toEqual({ attach: 2, detach: 1 });
  });
  it("숨은 워크스페이스(now)는 기다리지 않고 바로 뗀다", () => {
    const { g, log } = gate();
    g.set(true);
    g.set(false, true);
    expect(log.detach).toBe(1);
  });
  it("dispose는 붙은 것을 바로 떼고 타이머를 정리한다", () => {
    const { g, log } = gate();
    g.set(true);
    g.dispose();
    expect(log.detach).toBe(1);
    g.set(false);
    vi.advanceTimersByTime(20000);
    expect(log.detach).toBe(1);
  });
});
