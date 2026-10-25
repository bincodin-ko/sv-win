import { describe, expect, it } from "vitest";
import { closeRepoAsk, keyAction, type KeyLike } from "./appKeys";

// 기대값 출처: spec S-342(Ctrl+O 는 홈이거나 콘솔이 키보드를 갖지 않을 때만), S-333(Ctrl+Shift+W 는 실행 중일 때만 묻는다)
const k = (key: string, o: Partial<KeyLike> = {}): KeyLike => ({ key, ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, ...o });
const board = { view: "board", consoleFocus: false } as const;
const inConsole = { view: "board", consoleFocus: true } as const;
const home = { view: "home", consoleFocus: true } as const;

describe("keyAction S-342", () => {
  it("Ctrl+Shift+L 은 콘솔이 키보드를 가져도 홈", () => {
    expect(keyAction(k("L", { shiftKey: true }), inConsole)).toBe("home");
    expect(keyAction(k("l", { shiftKey: true }), board)).toBe("home");
  });
  it("Ctrl+Shift+W 는 repo 닫기", () => expect(keyAction(k("W", { shiftKey: true }), inConsole)).toBe("closeRepo"));
  it("Ctrl+O 는 콘솔이 키보드를 가지면 무시", () => expect(keyAction(k("o"), inConsole)).toBeNull());
  it("Ctrl+O 는 홈에서는 받는다", () => expect(keyAction(k("o"), home)).toBe("openFolder"));
  it("Ctrl+O 는 콘솔이 키보드를 안 가지면 받는다", () => expect(keyAction(k("o"), board)).toBe("openFolder"));
  it("다른 조합은 무시", () => {
    expect(keyAction(k("o", { shiftKey: true }), board)).toBeNull();
    expect(keyAction(k("l"), board)).toBeNull();
    expect(keyAction(k("w", { altKey: true, shiftKey: true }), board)).toBeNull();
    expect(keyAction(k("x"), board)).toBeNull();
  });
});

// U2 기대값 출처: spec S-2620~S-2625
const f = (key: string, o: Partial<KeyLike> = {}): KeyLike => ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...o });
describe("keyAction U2", () => {
  it("F6 / Shift+F6 = 영역 앞/뒤 (콘솔 안 포함)", () => {
    expect(keyAction(f("F6"), board)).toBe("regionNext");
    expect(keyAction(f("F6"), inConsole)).toBe("regionNext");
    expect(keyAction(f("F6", { shiftKey: true }), inConsole)).toBe("regionPrev");
  });
  it("홈에서는 F6 계열·Ctrl+Shift+P·탭 키 안 함", () => {
    expect(keyAction(f("F6"), home)).toBeNull();
    expect(keyAction(k("F6"), home)).toBeNull();
    expect(keyAction(k("P", { shiftKey: true }), home)).toBeNull();
    expect(keyAction(k("PageUp"), home)).toBeNull();
  });
  it("Ctrl+F6 / Ctrl+Shift+F6 = 다음/이전 콘솔", () => {
    expect(keyAction(k("F6"), inConsole)).toBe("consoleNext");
    expect(keyAction(k("F6", { shiftKey: true }), inConsole)).toBe("consolePrev");
  });
  it("Ctrl+Shift+P = 명령줄", () => {
    expect(keyAction(k("P", { shiftKey: true }), inConsole)).toBe("commandBar");
    expect(keyAction(k("p", { shiftKey: true }), board)).toBe("commandBar");
  });
  it("Ctrl+PageUp/PageDown = 이전/다음 탭", () => {
    expect(keyAction(k("PageUp"), inConsole)).toBe("tabPrev");
    expect(keyAction(k("PageDown"), inConsole)).toBe("tabNext");
  });
  it("Alt/Meta 섞이면 무시, 그냥 PageDown/Ctrl+P 도 무시", () => {
    expect(keyAction(f("F6", { altKey: true }), board)).toBeNull();
    expect(keyAction(f("PageDown"), board)).toBeNull();
    expect(keyAction(k("p"), board)).toBeNull();
    expect(keyAction(k("PageDown", { altKey: true }), board)).toBeNull();
  });
});

describe("closeRepoAsk S-333", () => {
  it("Close 버튼은 항상 묻는다", () => {
    expect(closeRepoAsk("button", 0)).toBe(true);
    expect(closeRepoAsk("button", 3)).toBe(true);
  });
  it("단축키는 실행 중이 있을 때만", () => {
    expect(closeRepoAsk("key", 0)).toBe(false);
    expect(closeRepoAsk("key", 1)).toBe(true);
  });
});
