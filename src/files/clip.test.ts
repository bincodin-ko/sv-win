import { describe, expect, it } from "vitest";
import { clipForStore, clipLines, CUT_NOTICE, MAX_LINES } from "./clip";

const lines = (n: number, tail = "") => Array.from({ length: n }, (_, i) => `l${i + 1}`).join("\n") + tail;

describe("S-957 5,000줄 경계", () => {
  it("상수", () => { expect(MAX_LINES).toBe(5000); expect(CUT_NOTICE).toBe("Showing the first 5,000 lines"); });
  it("4,999줄과 5,000줄은 그대로", () => {
    for (const n of [4999, 5000]) {
      const c = clipLines(lines(n));
      expect(c.cut).toBe(false);
      expect(c.total).toBe(n);
      expect(c.text).toBe(lines(n));
    }
  });
  it("5,001줄은 앞 5,000줄만", () => {
    const c = clipLines(lines(5001));
    expect(c.cut).toBe(true);
    expect(c.total).toBe(5001);
    expect(c.text).toBe(lines(5000));
  });
  it("끝의 줄바꿈 하나는 줄로 세지 않는다 (5,000줄 + 끝 \n = 5,000줄)", () => {
    expect(clipLines(lines(5000, "\n")).cut).toBe(false);
    expect(clipLines(lines(5001, "\n")).cut).toBe(true);
  });
  it("빈 글", () => { expect(clipLines("")).toEqual({ text: "", total: 0, cut: false }); });
  it("max 인자", () => { expect(clipLines("a\nb\nc", 2)).toEqual({ text: "a\nb", total: 3, cut: true }); });
});

describe("S-958 보드에 저장하는 글", () => {
  it("5,000줄 이하는 그대로, truncated=false", () => {
    expect(clipForStore(lines(5000))).toEqual({ text: lines(5000), truncated: false });
  });
  it("5,001줄 이상은 앞 5,000줄만 저장하고 truncated=true", () => {
    const r = clipForStore(lines(7000));
    expect(r.truncated).toBe(true);
    expect(r.text).toBe(lines(5000));
  });
});
