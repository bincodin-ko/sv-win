import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n";
import { back, header, next, shouldShow } from "./steps";

describe("S-390 shouldShow", () => {
  it("repo 없음 + firstRunDone false → 카드", () => {
    expect(shouldShow({ firstRunDone: false }, 0)).toBe("show");
    expect(shouldShow({}, 0)).toBe("show"); // 값이 없으면 아직 안 한 것
  });
  it("repo 있음 + 값이 없거나 false → 카드 없이 조용히 true 로(기존 사용자 보호)", () => {
    expect(shouldShow({ firstRunDone: false }, 2)).toBe("mark-done");
    expect(shouldShow({}, 1)).toBe("mark-done");
  });
  it("끝냈거나 닫았으면 repo 가 없어도 다시 안 뜬다", () => {
    expect(shouldShow({ firstRunDone: true }, 0)).toBe("hide");
    expect(shouldShow({ firstRunDone: true }, 3)).toBe("hide");
  });
});

describe("S-391·S-400 단계", () => {
  it("머리 문구", () => {
    expect(header(1)).toBe("Step 1 of 3"); // S-2232
    expect(header(3)).toBe("Step 3 of 3");
  });
  it("다음/뒤로는 1~3 안에서 멈춘다", () => {
    expect(next(1)).toBe(2);
    expect(next(2)).toBe(3);
    expect(next(3)).toBe(3);
    expect(back(3)).toBe(2);
    expect(back(2)).toBe(1);
    expect(back(1)).toBe(1);
  });
});

describe("header 한국어 (S-2422)", () => {
  afterEach(() => setLang("en"));
  it("영어는 Step N of 3, 한국어는 3단계 중 N단계", () => {
    expect(header(1)).toBe("Step 1 of 3");
    setLang("ko");
    expect(header(1)).toBe("3단계 중 1단계");
    expect(header(3)).toBe("3단계 중 3단계");
  });
});
