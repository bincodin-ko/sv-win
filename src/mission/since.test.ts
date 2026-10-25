import { beforeEach, describe, expect, it } from "vitest";
import { clearSince, elapsedMs, markSince, sinceOf } from "./since";

beforeEach(clearSince);
describe("S-1310 missionSince", () => {
  it("상태가 바뀔 때 시각을 기록하고 sinceOf 가 읽는다", () => {
    markSince("k", "WORKING", 1000);
    expect(sinceOf("k")).toBe(1000);
  });
  it("같은 상태를 다시 알려도 시각은 그대로, 다른 상태면 새 시각", () => {
    markSince("k", "WORKING", 1000);
    markSince("k", "WORKING", 5000);
    expect(sinceOf("k")).toBe(1000);
    markSince("k", "NEEDS YOU", 7000);
    expect(sinceOf("k")).toBe(7000);
  });
  it("콘솔마다 따로", () => {
    markSince("a", "WORKING", 1);
    markSince("b", "DONE", 2);
    expect([sinceOf("a"), sinceOf("b"), sinceOf("c")]).toEqual([1, 2, undefined]);
  });
  it("elapsedMs = 지금 − 기록 시각", () => {
    markSince("k", "WORKING", 1000);
    expect(elapsedMs("k", "WORKING", 134_000)).toBe(133_000);
  });
  it("기록이 없으면 지금부터 센다(0)", () => {
    expect(elapsedMs("z", "RUNNING", 9000)).toBe(0);
    expect(elapsedMs("z", "RUNNING", 12_000)).toBe(3000);
  });
  it("기록된 상태와 현재 상태가 다르면 새로 센다", () => {
    markSince("k", "WORKING", 1000);
    expect(elapsedMs("k", "DONE", 5000)).toBe(0);
  });
});
