// S-2400~S-2404. 사전은 가짜(./ko)로 바꿔 사전 내용과 상관없이 틀만 시험한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ko", () => ({
  default: {
    "Cancel": "취소",
    "Delete {n} notes?": "메모 {n}개를 삭제할까요?",
    "Hi {name}": "{name}님 안녕",
    "{n} console": "(안 쓰임)",
    "{n} consoles": "콘솔 {n}개",
  },
}));

type M = typeof import("./index");
let m: M;
beforeEach(async () => {
  vi.resetModules();
  m = await import("./index");
});
afterEach(() => vi.unstubAllGlobals());

describe("t / tp / tm", () => {
  it("S-2400 영어는 그대로, 사전에 없는 키도 영어 그대로", () => {
    expect(m.t("Cancel")).toBe("Cancel");
    m.setLang("ko");
    expect(m.t("Not in dictionary")).toBe("Not in dictionary");
  });
  it("S-2400 setLang(ko) 뒤 t 가 한국어, 다시 en 이면 영어", () => {
    m.setLang("ko");
    expect(m.getLang()).toBe("ko");
    expect(m.t("Cancel")).toBe("취소");
    m.setLang("en");
    expect(m.t("Cancel")).toBe("Cancel");
  });
  it("S-2401 {name} 보간, 빠진 변수는 그대로, 값 안의 {x} 는 재귀 안 함", () => {
    expect(m.t("Hi {name}", { name: "Ann" })).toBe("Hi Ann");
    expect(m.t("Hi {name}")).toBe("Hi {name}");
    expect(m.t("Hi {name}", { name: "{n}", n: 5 })).toBe("Hi {n}");
    m.setLang("ko");
    expect(m.t("Delete {n} notes?", { n: 3 })).toBe("메모 3개를 삭제할까요?");
  });
  it("S-2402 tp 영어 단/복수 ({n} 은 n 으로 채움)", () => {
    expect(m.tp("{n} console", "{n} consoles", 1)).toBe("1 console");
    expect(m.tp("{n} console", "{n} consoles", 0)).toBe("0 consoles");
    expect(m.tp("{n} console", "{n} consoles", 2)).toBe("2 consoles");
    expect(m.tp("{n} {w}", "{n} {w}s", 2, { w: "item" })).toBe("2 items");
  });
  it("S-2402 tp 한국어는 뒤 문장 키의 값, 없으면 영어 규칙", () => {
    m.setLang("ko");
    expect(m.tp("{n} console", "{n} consoles", 1)).toBe("콘솔 1개");
    expect(m.tp("{n} console", "{n} consoles", 7)).toBe("콘솔 7개");
    expect(m.tp("{n} file", "{n} files", 1)).toBe("1 file");
    expect(m.tp("{n} file", "{n} files", 3)).toBe("3 files");
  });
  it("S-2400 tm 은 어느 언어에서도 영어 그대로(항등), 그린 뒤 t 가 번역", () => {
    expect(m.tm("Cancel")).toBe("Cancel");
    m.setLang("ko");
    expect(m.tm("Cancel")).toBe("Cancel");
    expect(m.t(m.tm("Cancel"))).toBe("취소");
  });
});

describe("언어 저장소 (S-2403)", () => {
  it("setLang 하면 구독자가 새 언어를 받고, 같은 값이면 부르지 않고, 해제하면 끊긴다", () => {
    const seen: string[] = [];
    const off = m.subscribeLang((l) => seen.push(l));
    m.setLang("ko");
    m.setLang("ko");
    m.setLang("en");
    off();
    m.setLang("ko");
    expect(seen).toEqual(["ko", "en"]);
  });
  it("useT / useLang 은 함수", () => {
    expect(typeof m.useT).toBe("function");
    expect(typeof m.useLang).toBe("function");
  });
  it("S-2406 setLang 이 <html lang> 을 갱신한다", () => {
    m.setLang("ko");
    expect(document.documentElement.lang).toBe("ko");
    m.setLang("en");
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("시작 언어 (S-2404)", () => {
  it("langFromNavigator", () => {
    expect(m.langFromNavigator("ko-KR")).toBe("ko");
    expect(m.langFromNavigator("ko")).toBe("ko");
    expect(m.langFromNavigator("en-US")).toBe("en");
    expect(m.langFromNavigator("ja")).toBe("en");
    expect(m.langFromNavigator(undefined)).toBe("en");
  });
  it("initLang: 저장값이 navigator 를 이김", () => {
    vi.stubGlobal("navigator", { language: "en-US" });
    m.initLang({ language: "ko" });
    expect(m.getLang()).toBe("ko");
    vi.stubGlobal("navigator", { language: "ko-KR" });
    m.initLang({ language: "en" });
    expect(m.getLang()).toBe("en");
  });
  it("initLang: 저장값이 없거나 모르는 값이면 navigator.language 를 따름", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    m.initLang({});
    expect(m.getLang()).toBe("ko");
    m.setLang("en");
    m.initLang({ language: "fr" });
    expect(m.getLang()).toBe("ko");
    vi.stubGlobal("navigator", { language: "en-US" });
    m.initLang({});
    expect(m.getLang()).toBe("en");
  });
  it("모듈을 불러온 것만으로는 en (navigator.language 가 ko-KR 이어도)", async () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    vi.resetModules();
    const fresh = await import("./index");
    expect(fresh.getLang()).toBe("en");
  });
});
