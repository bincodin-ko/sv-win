import { expect, it } from "vitest";
import { didSleep } from "./status";

it("S-072 벽시계 간격이 90초 초과일 때만 슬립으로 본다", () => {
  expect(didSleep(0, 10_000)).toBe(false);
  expect(didSleep(0, 90_000)).toBe(false);
  expect(didSleep(0, 90_001)).toBe(true);
});
