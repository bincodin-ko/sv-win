import { describe, expect, it } from "vitest";
import { DICT_KEYS, dictKey, dictText, insertConsole, isDictKey } from "./dictate";

// F3 S-2274·S-2277 (키 조합 취소·350ms·5분·동시 금지는 ptt.test.ts)
describe("받아쓰기 키 설정", () => {
  // S-2720: 기본 = Ctrl+Space, 옛 저장값은 그대로 유효
  it("Ctrl+Space(기본)·Right Ctrl·Right Alt·Right Shift", () => expect([...DICT_KEYS]).toEqual(["CtrlSpace", "ControlRight", "AltRight", "ShiftRight"]));
  it("모르는 값·없는 값은 CtrlSpace, 저장된 옛 값은 그대로", () => {
    expect(dictKey("AltRight")).toBe("AltRight");
    expect(dictKey("ControlRight")).toBe("ControlRight");
    expect(dictKey("Fn")).toBe("CtrlSpace");
    expect(dictKey(undefined)).toBe("CtrlSpace");
  });
  const ev = (o: Partial<KeyboardEvent>) => ({ code: "", ctrlKey: false, altKey: false, metaKey: false, ...o }) as KeyboardEvent;
  it("S-2721 CtrlSpace 는 Ctrl+Space 만(Alt·Meta 가 끼면 아님, Space 단독 아님)", () => {
    expect(isDictKey(ev({ code: "Space", ctrlKey: true }), "CtrlSpace")).toBe(true);
    expect(isDictKey(ev({ code: "Space", ctrlKey: true }), undefined)).toBe(true);
    expect(isDictKey(ev({ code: "Space" }), "CtrlSpace")).toBe(false);
    expect(isDictKey(ev({ code: "Space", ctrlKey: true, altKey: true }), "CtrlSpace")).toBe(false);
    expect(isDictKey(ev({ code: "Space", ctrlKey: true, metaKey: true }), "CtrlSpace")).toBe(false);
    expect(isDictKey(ev({ code: "ControlRight", ctrlKey: true }), "CtrlSpace")).toBe(false);
  });
  it("옛 값은 e.code 비교", () => {
    expect(isDictKey(ev({ code: "ControlRight" }), "ControlRight")).toBe(true);
    expect(isDictKey(ev({ code: "Space", ctrlKey: true }), "ControlRight")).toBe(false);
    expect(isDictKey(ev({ code: "AltRight" }), "AltRight")).toBe(true);
  });
});
describe("dictText", () => {
  it("구두점 말 + 줄바꿈은 공백으로 + 앞뒤 공백 제거", () => expect(dictText("  hello comma\nworld period \r\n")).toBe("hello, world."));
});
describe("insertConsole: 붙여넣기만, Enter 는 치지 않는다", () => {
  it("bracketed paste 면 감싼다", () => {
    const w: string[] = [];
    insertConsole({ write: (d) => w.push(d), bracketedPaste: () => true }, "run the tests");
    expect(w).toEqual(["\x1b[200~run the tests\x1b[201~"]);
  });
  it("아니면 글자만", () => {
    const w: string[] = [];
    insertConsole({ write: (d) => w.push(d), bracketedPaste: () => false }, "run the tests");
    expect(w).toEqual(["run the tests"]);
    expect(w.join("")).not.toContain("\r");
  });
});
