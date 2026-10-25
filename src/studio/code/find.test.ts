import { describe, expect, it } from "vitest";
import { findMatches, firstFrom, step } from "./find";

describe("S-1878 찾기", () => {
  it("대소문자를 무시하고 시작 위치를 센다", () => {
    expect(findMatches("Hello hello HELLO", "hello")).toEqual([0, 6, 12]);
    expect(findMatches("abc", "")).toEqual([]);
    expect(findMatches("abc", "z")).toEqual([]);
  });
  it("겹치지 않게 센다(aa 안의 a 는 2개, aaa 안의 aa 는 1개)", () => {
    expect(findMatches("aa", "a")).toEqual([0, 1]);
    expect(findMatches("aaa", "aa")).toEqual([0]);
  });
  it("다음·이전은 끝에서 감긴다", () => {
    expect(step(0, 3, 1)).toBe(1);
    expect(step(2, 3, 1)).toBe(0);
    expect(step(0, 3, -1)).toBe(2);
    expect(step(1, 3, -1)).toBe(0);
    expect(step(-1, 3, 1)).toBe(0);
    expect(step(-1, 3, -1)).toBe(2);
    expect(step(0, 0, 1)).toBe(-1);
  });
  it("커서 이후 첫 일치부터 시작하고 없으면 처음", () => {
    expect(firstFrom([0, 6, 12], 0)).toBe(0);
    expect(firstFrom([0, 6, 12], 7)).toBe(2);
    expect(firstFrom([0, 6, 12], 13)).toBe(0);
    expect(firstFrom([], 3)).toBe(-1);
  });
});
