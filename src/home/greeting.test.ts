// S-311: 인사 문구(시간대 경계 5/12/18시, 이름 없을 때)
import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n";
import { greeting } from "./greeting";

const at = (h: number, m = 0) => new Date(2026, 9, 24, h, m);

describe("greeting (S-311)", () => {
  it("5시부터 11시 59분까지 morning", () => {
    expect(greeting(at(5), "Ann")).toBe("Good morning, Ann");
    expect(greeting(at(11, 59), "Ann")).toBe("Good morning, Ann");
  });
  it("12시부터 17시 59분까지 afternoon", () => {
    expect(greeting(at(12), "Ann")).toBe("Good afternoon, Ann");
    expect(greeting(at(17, 59), "Ann")).toBe("Good afternoon, Ann");
  });
  it("18시부터 다음날 4시 59분까지 evening", () => {
    expect(greeting(at(18), "Ann")).toBe("Good evening, Ann");
    expect(greeting(at(23, 59), "Ann")).toBe("Good evening, Ann");
    expect(greeting(at(0), "Ann")).toBe("Good evening, Ann");
    expect(greeting(at(4, 59), "Ann")).toBe("Good evening, Ann");
  });
  it("이름이 없거나 공백이면 이름 없이", () => {
    expect(greeting(at(9))).toBe("Good morning");
    expect(greeting(at(9), "")).toBe("Good morning");
    expect(greeting(at(9), "   ")).toBe("Good morning");
  });
  it("이름 앞뒤 공백은 지운다", () => {
    expect(greeting(at(13), "  Bo ")).toBe("Good afternoon, Bo");
  });
});

describe("greeting 한국어 (S-2421)", () => {
  afterEach(() => setLang("en"));
  it("시간대별 문구, 이름이 있으면 앞에 '이름,'", () => {
    setLang("ko");
    expect(greeting(at(9), "Ann")).toBe("Ann, 좋은 아침이에요");
    expect(greeting(at(13), "Ann")).toBe("Ann, 좋은 오후예요");
    expect(greeting(at(20), "Ann")).toBe("Ann, 좋은 저녁이에요");
    expect(greeting(at(2))).toBe("좋은 저녁이에요");
    expect(greeting(at(9), "  ")).toBe("좋은 아침이에요");
  });
  it("영어로 돌아오면 영어", () => {
    setLang("ko");
    setLang("en");
    expect(greeting(at(9), "Ann")).toBe("Good morning, Ann");
  });
});
