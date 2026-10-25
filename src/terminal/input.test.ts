import { describe, expect, it } from "vitest";
import { altPlain, isStrayPaste, joinOneLine, mapKey, pasteLineCount, sanitizePaste, type KeyCtx } from "./input";

const k = (key: string, m: { c?: boolean; s?: boolean; a?: boolean } = {}) => ({ key, ctrlKey: !!m.c, shiftKey: !!m.s, altKey: !!m.a, metaKey: false });
const ctx = (o: Partial<KeyCtx> = {}): KeyCtx => ({ hasSelection: false, altScreen: false, ...o });

describe("S-131 키 표", () => {
  it("Ctrl+Shift+C 는 선택 없어도 복사", () => {
    expect(mapKey(k("C", { c: true, s: true }), ctx())).toEqual({ action: "copy" });
    expect(mapKey(k("c", { c: true, s: true }), ctx({ hasSelection: true }))).toEqual({ action: "copy" });
  });
  it("Ctrl+C: 선택 있으면 복사, 없으면 프로그램으로(null)", () => {
    expect(mapKey(k("c", { c: true }), ctx({ hasSelection: true }))).toEqual({ action: "copy" });
    expect(mapKey(k("c", { c: true }), ctx({ hasSelection: false }))).toBeNull();
  });
  it("Ctrl+V · Ctrl+Shift+V 는 붙여넣기", () => {
    expect(mapKey(k("v", { c: true }), ctx())).toEqual({ action: "paste" });
    expect(mapKey(k("V", { c: true, s: true }), ctx())).toEqual({ action: "paste" });
  });
  it("Ctrl+Shift+A 전체 선택", () => {
    expect(mapKey(k("A", { c: true, s: true }), ctx())).toEqual({ action: "selectAll" });
  });
  it("Ctrl+Shift+K 지우기(대체 화면 여부는 호출자가 보고 data 로 알림)", () => {
    expect(mapKey(k("K", { c: true, s: true }), ctx())).toEqual({ action: "clear", data: "all" });
    expect(mapKey(k("K", { c: true, s: true }), ctx({ altScreen: true }))).toEqual({ action: "clear", data: "scrollback" });
  });
  it("Ctrl+Shift+Backspace 는 \x15", () => {
    expect(mapKey(k("Backspace", { c: true, s: true }), ctx())).toEqual({ action: "send", data: "\x15" });
  });
  it("xterm 기본에 맡기는 키와 그 밖 키는 null", () => {
    for (const ev of [
      k("Home"), k("End"), k("ArrowLeft", { c: true }), k("ArrowRight", { c: true }), k("Backspace", { c: true }),
      k("Tab", { s: true }), k("b", { a: true }), k("a", { c: true }), k("k", { c: true }), k("z", { c: true }), k("Escape"), k("a"),
    ])
      expect(mapKey(ev, ctx({ hasSelection: true })), ev.key).toBeNull();
  });
});

describe("S-133 붙여넣기", () => {
  it("탭·줄바꿈 말고 제어문자는 지운다", () => {
    expect(sanitizePaste("a\x1bb\x07c\td\ne\rf\x00g\x7fh")).toBe("abc\td\ne\rfgh");
  });
  it("줄 수: 끝의 빈 줄은 뺀다", () => {
    expect(pasteLineCount("")).toBe(0);
    expect(pasteLineCount("a")).toBe(1);
    expect(pasteLineCount("a\n")).toBe(1);
    expect(pasteLineCount("a\n\n\n")).toBe(1);
    expect(pasteLineCount("a\nb")).toBe(2);
    expect(pasteLineCount("a\r\nb\r\n")).toBe(2);
    expect(pasteLineCount("a\n\nb\n\n")).toBe(3);
  });
  it("One Line: 줄바꿈을 공백 하나로", () => {
    expect(joinOneLine("ls\ncd x\r\npwd\n")).toBe("ls cd x pwd");
    expect(joinOneLine("one")).toBe("one");
  });
});

describe("S-374 Alt as Meta", () => {
  const alt = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) =>
    ({ key, ctrlKey: false, shiftKey: false, altKey: true, metaKey: false, ...o });
  it("켜짐(기본)이면 손대지 않는다 → xterm 이 Esc+키로 보낸다", () => expect(altPlain(alt("b"), true)).toBeNull());
  it("꺼짐이면 Alt+글자는 평소 글자 그대로", () => {
    expect(altPlain(alt("b"), false)).toBe("b");
    expect(altPlain(alt("B", { shiftKey: true }), false)).toBe("B");
  });
  it("꺼짐이어도 Alt 가 없거나 Ctrl+Alt(AltGr)·Meta·이름 있는 키는 그대로 둔다", () => {
    expect(altPlain({ ...alt("b"), altKey: false }, false)).toBeNull();
    expect(altPlain(alt("b", { ctrlKey: true }), false)).toBeNull();
    expect(altPlain(alt("b", { metaKey: true }), false)).toBeNull();
    expect(altPlain(alt("Enter"), false)).toBeNull();
  });
});

describe("isStrayPaste (1-3 우클릭 붙여넣기 막기)", () => {
  it("우클릭 직후 진짜 paste = 막는다", () => expect(isStrayPaste(true, 1000, 500)).toBe(true));
  it("메뉴 Paste(합성)·시간이 지난 Ctrl+V·우클릭 없음 = 통과", () => {
    expect(isStrayPaste(false, 1000, 500)).toBe(false);
    expect(isStrayPaste(true, 5000, 500)).toBe(false);
    expect(isStrayPaste(true, 1000, 0)).toBe(false);
  });
});

import { imeKeyBlocked } from "./input";

describe("한글 조합 중 공백·순서", () => {
  // xterm 모형: 막히지 않은 keydown 의 Space 는 " " 를 바로 보내고, compositionend 는 확정 글자를 보낸다
  type Ev = { t: "keydown"; key: string; isComposing?: boolean; keyCode?: number } | { t: "compositionend"; data: string };
  const run = (evs: Ev[]) => evs.flatMap((e) => (e.t === "compositionend" ? [e.data] : imeKeyBlocked(e) ? [] : e.key === " " ? [" "] : []));
  it("조합 중 keydown(isComposing 또는 229)은 막는다, 평소 키는 통과", () => {
    expect(imeKeyBlocked({ isComposing: true, keyCode: 32 })).toBe(true);
    expect(imeKeyBlocked({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(imeKeyBlocked({ isComposing: false, keyCode: 32 })).toBe(false);
  });
  it("않 → 뜰 → Space → 때: PTY 에는 '않','뜰',' ','때' 가 한 번씩 순서대로", () => {
    const out = run([
      { t: "keydown", key: "Process", isComposing: true, keyCode: 229 },
      { t: "compositionend", data: "않" },
      { t: "keydown", key: "Process", isComposing: true, keyCode: 229 },
      { t: "keydown", key: " ", isComposing: true, keyCode: 229 }, // Space 로 조합 끝
      { t: "compositionend", data: "뜰" },
      { t: "keydown", key: " ", isComposing: false, keyCode: 32 },
      { t: "keydown", key: "Process", isComposing: true, keyCode: 229 },
      { t: "compositionend", data: "때" },
    ]);
    expect(out.join("")).toBe("않뜰 때");
    expect(out.filter((x) => x === " ")).toHaveLength(1);
  });
});
