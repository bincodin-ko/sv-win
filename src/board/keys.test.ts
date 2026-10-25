import { describe, expect, it } from "vitest";
import { boardKey, routeKey, type KeyIn } from "./keys";

// S-047 라우팅 판정: 포커스 상태 × 선택 수 × 키. 기대값은 명세 문장에서만 가져옴
const base: KeyIn = { boardFocused: true, key: "v", ctrl: false, alt: false, meta: false, shift: false, selected: 0, selectedRunningConsole: false };
const r = (o: Partial<KeyIn>) => routeKey({ ...base, ...o });

describe("S-047 키 라우팅", () => {
  it("보드가 키보드를 가지면 V = Select, T = Spawn", () => {
    expect(r({ key: "v" })).toBe("select");
    expect(r({ key: "T" })).toBe("spawn");
  });
  it("콘솔·입력란이 키보드를 가지면 보드 키 없음", () => {
    expect(r({ boardFocused: false, key: "v" })).toBe("none");
    expect(r({ boardFocused: false, key: "t", selected: 1, selectedRunningConsole: true })).toBe("none");
  });
  it("실행 중 콘솔이 정확히 1개 선택이면 글자 키는 콘솔로", () => {
    expect(r({ key: "v", selected: 1, selectedRunningConsole: true })).toBe("toConsole");
    expect(r({ key: "a", selected: 1, selectedRunningConsole: true })).toBe("toConsole");
    expect(r({ key: "T", shift: true, selected: 1, selectedRunningConsole: true })).toBe("toConsole");
  });
  it("2개 이상 선택이거나 실행 중 콘솔이 아니면 콘솔로 안 간다", () => {
    expect(r({ key: "v", selected: 2, selectedRunningConsole: true })).toBe("select");
    expect(r({ key: "v", selected: 1, selectedRunningConsole: false })).toBe("select");
  });
  it("글자가 아니거나 Ctrl/Alt/Meta 가 눌렸으면 건드리지 않는다", () => {
    expect(r({ key: "Delete", selected: 1, selectedRunningConsole: true })).toBe("none");
    expect(r({ key: "v", ctrl: true, selected: 1, selectedRunningConsole: true })).toBe("none");
    expect(r({ key: "t", alt: true })).toBe("none");
    expect(r({ key: "t", meta: true })).toBe("none");
  });
  it("S-1806 s = skills, d = markdown 라우트, x 는 그대로 none", () => {
    expect(r({ key: "s" })).toBe("skills");
    expect(r({ key: "d" })).toBe("markdown");
    expect(r({ key: "S", shift: true })).toBe("none");
  });
  it("X 와 Shift+V 는 도구를 안 바꾼다", () => {
    for (const k of ["x"]) expect(r({ key: k })).toBe("none");
    expect(r({ key: "V", shift: true })).toBe("none");
  });
});

describe("S-366 바뀐 키 라우팅", () => {
  const km = { spawn: "b" };
  it("바뀐 키가 도구를 고르고 옛 키는 더 이상 아니다", () => {
    expect(routeKey({ ...base, key: "b" }, km)).toBe("spawn");
    expect(routeKey({ ...base, key: "B" }, km)).toBe("spawn");
    expect(routeKey({ ...base, key: "t" }, km)).toBe("none");
    expect(routeKey({ ...base, key: "v" }, km)).toBe("select");
  });
  it("실행 중 콘솔 하나가 선택돼 있으면 바뀐 키도 콘솔로 간다", () => {
    expect(routeKey({ ...base, key: "b", selected: 1, selectedRunningConsole: true }, km)).toBe("toConsole");
  });
  it("keymap 을 안 주거나 비어 있으면 기본과 같다", () => {
    expect(routeKey({ ...base, key: "t" })).toBe("spawn");
    expect(routeKey({ ...base, key: "t" }, {})).toBe("spawn");
  });
});


describe("B16 N 키 라우팅", () => {
  it("보드가 키보드를 가지면 N = needsYou", () => {
    expect(r({ key: "n" })).toBe("needsYou");
    expect(r({ key: "N" })).toBe("needsYou");
  });
  it("실행 중 콘솔 1개 선택이면 N 도 콘솔로(S-047 그대로)", () => {
    expect(r({ key: "n", selected: 1, selectedRunningConsole: true })).toBe("toConsole");
  });
  it("콘솔·입력란이 키보드를 가지면 없음", () => {
    expect(r({ boardFocused: false, key: "n" })).toBe("none");
  });
});

describe("C1 S-805 P·E·G 라우팅", () => {
  it("보드가 키보드를 가지면 P = pen, E = eraser, G = git", () => {
    expect(r({ key: "p" })).toBe("pen");
    expect(r({ key: "E" })).toBe("eraser");
    expect(r({ key: "g" })).toBe("git");
  });
  it("실행 중 콘솔 1개 선택이면 글자는 콘솔로(S-047)", () => {
    for (const key of ["p", "e", "g"]) expect(r({ key, selected: 1, selectedRunningConsole: true })).toBe("toConsole");
  });
  it("콘솔·입력란이 키보드를 가지면 없음. Shift 와 같이면 없음", () => {
    expect(r({ boardFocused: false, key: "p" })).toBe("none");
    expect(r({ key: "g", shift: true })).toBe("none");
  });
  it("바꾼 키를 따른다: pen 을 b 로 바꾸면 b = pen, p 는 없음", () => {
    expect(routeKey({ ...base, key: "b" }, { pen: "b" })).toBe("pen");
    expect(routeKey({ ...base, key: "p" }, { pen: "b" })).toBe("none");
  });
});

describe("D1 S-1228 M·L 라우팅", () => {
  it("보드가 키보드를 가지면 M = memory, L = loops", () => {
    expect(r({ key: "m" })).toBe("memory");
    expect(r({ key: "L" })).toBe("loops");
  });
  it("실행 중 콘솔 1개 선택이면 글자는 콘솔로(S-047)", () => {
    for (const key of ["m", "l"]) expect(r({ key, selected: 1, selectedRunningConsole: true })).toBe("toConsole");
  });
  it("콘솔·입력란이 키보드를 가지면 없음. Shift 와 같이면 없음", () => {
    expect(r({ boardFocused: false, key: "m" })).toBe("none");
    expect(r({ key: "l", shift: true })).toBe("none");
  });
  it("바꾼 키를 따른다: memory 를 b 로 바꾸면 b = memory, m 은 없음", () => {
    expect(routeKey({ ...base, key: "b" }, { memory: "b" })).toBe("memory");
    expect(routeKey({ ...base, key: "m" }, { memory: "b" })).toBe("none");
  });
});

describe("S-2435 한글 입력기 한 글자 키", () => {
  it("자모·Process 는 code 의 영문 글자로", () => {
    expect(boardKey({ key: "ㄴ", code: "KeyS" })).toBe("s");
    expect(boardKey({ key: "Process", code: "KeyA" })).toBe("a");
    expect(boardKey({ key: "ㅍ", code: "KeyV" })).toBe("v");
    expect(boardKey({ key: "Unidentified", code: "KeyT" })).toBe("t");
  });
  it("영문 글자·이름 있는 키·숫자·기호는 그대로", () => {
    expect(boardKey({ key: "s", code: "KeyS" })).toBe("s");
    expect(boardKey({ key: "S", code: "KeyS" })).toBe("S");
    expect(boardKey({ key: "Escape", code: "Escape" })).toBe("Escape");
    expect(boardKey({ key: "Delete", code: "Delete" })).toBe("Delete");
    expect(boardKey({ key: "1", code: "Digit1" })).toBe("1");
    expect(boardKey({ key: "!", code: "Digit1" })).toBe("!");
    expect(boardKey({ key: "ㅁ", code: "Digit1" })).toBe("ㅁ");
    expect(boardKey({ key: ",", code: "Comma" })).toBe(",");
  });
  it("고른 글자가 routeKey 로 도구에 닿는다(Ctrl/Alt/Meta 는 그대로 none)", () => {
    expect(r({ key: boardKey({ key: "ㄴ", code: "KeyS" }) })).toBe("skills");
    expect(r({ key: boardKey({ key: "ㅅ", code: "KeyT" }) })).toBe("spawn");
    expect(r({ key: boardKey({ key: "ㅍ", code: "KeyV" }), ctrl: true })).toBe("none");
  });
});
