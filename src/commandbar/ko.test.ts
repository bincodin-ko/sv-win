import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n";
import { hintExample } from "./examples";
import { isImeEvent } from "./ime";

afterEach(() => setLang("en"));

describe("S-2442 한글 입력기 조합 중 판정", () => {
  it("isComposing 이거나 keyCode 229 면 입력기 몫", () => {
    expect(isImeEvent({ isComposing: true, keyCode: 13 })).toBe(true);
    expect(isImeEvent({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(isImeEvent({ isComposing: false, keyCode: 13 })).toBe(false);
  });
  it("React 이벤트(nativeEvent 안)도 본다", () => {
    expect(isImeEvent({ nativeEvent: { isComposing: true, keyCode: 13 }, keyCode: 13 })).toBe(true);
    expect(isImeEvent({ nativeEvent: { isComposing: false, keyCode: 13 }, keyCode: 13 })).toBe(false);
  });
});

describe("S-2441 칩 예문은 화면 언어를 따른다", () => {
  it("영어", () => expect(hintExample()).toBe("pass this task to codex"));
  it("한국어", () => {
    setLang("ko");
    expect(hintExample()).toBe("클로드 두 개 띄워");
  });
});
