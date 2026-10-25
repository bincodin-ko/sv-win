import { describe, expect, it } from "vitest";
import { applySpokenPunctuation as P } from "./punct";

// F3 S-2277: comma → , period → . question mark → ? (앞 낱말에 붙이고 뒤에 공백)
describe("applySpokenPunctuation", () => {
  it("comma", () => expect(P("hello comma world")).toBe("hello, world"));
  it("period", () => expect(P("we are done period")).toBe("we are done."));
  it("question mark", () => expect(P("is it ready question mark")).toBe("is it ready?"));
  it("대소문자 무시, 엔진이 붙인 구두점은 흡수", () => expect(P("Hello Comma, world Period.")).toBe("Hello, world."));
  it("문장 속에서 여럿", () => expect(P("first period second comma third question mark")).toBe("first. second, third?"));
  it("낱말 일부는 건드리지 않는다", () => expect(P("periodic commas")).toBe("periodic commas"));
  it("구두점 말이 없으면 그대로", () => expect(P("run the tests")).toBe("run the tests"));
  it("빈 글", () => expect(P("")).toBe(""));
});
