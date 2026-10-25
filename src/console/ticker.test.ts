import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { addTick } from "./ticker";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("보이면 250ms, 숨겨지면 멈추지 않고 1초 간격 — 숨은 채로도 1초 안에 상태 전환을 본다", () => {
  let hidden = false;
  let n = 0;
  const off = addTick(() => n++, () => hidden);
  vi.advanceTimersByTime(1000);
  expect(n).toBe(4);
  hidden = true;
  n = 0;
  vi.advanceTimersByTime(1000);
  expect(n).toBe(1);
  vi.advanceTimersByTime(3000);
  expect(n).toBe(4);
  hidden = false;
  vi.advanceTimersByTime(1000);
  expect(n).toBe(8);
  off();
  vi.advanceTimersByTime(2000);
  expect(n).toBe(8);
});
