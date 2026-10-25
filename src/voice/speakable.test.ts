import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n";
import { mk, type Msg } from "../commandbar/thread";
import { speakable } from "./speakable";

const bot = (t: string): Msg => mk("bot", t);
const rep = (name: string, result: string, reply?: string): Msg => mk("report", `${name} ${result}`, { report: { console: name, secs: 5, result, reply } });

describe("S-2235 읽는 것", () => {
  it("명령 답·되묻기·확인 요청은 그대로", () => {
    expect(speakable(bot("Closed Otto."))).toBe("Closed Otto.");
    expect(speakable(bot("Say what Otto should do"))).toBe("Say what Otto should do");
    const k = "DAX, Maya2, Rafa2, Nova2, about to close 4 consoles, say confirm.";
    expect(speakable(bot(k))).toBe(k);
  });
  it("에이전트 보고는 이름과 상태만, 내용은 절대 안 읽는다", () => {
    expect(speakable(rep("Otto", "finished · 12s", "I refactored the parser and deleted foo.ts"))).toBe("Otto finished.");
    expect(speakable(rep("Bex", "failed: exit 1 permission denied"))).toBe("Bex failed.");
    expect(speakable(rep("Otto", "finished · 3s", "secret"))).not.toContain("secret");
  });
  it("계획 노트·내 메시지는 안 읽는다", () => {
    expect(speakable(mk("plan", "1. do x"))).toBeNull();
    expect(speakable(mk("user", "kill all"))).toBeNull();
  });
  it("오류 상세는 안 읽는다", () => {
    expect(speakable(bot("Something went wrong: ENOENT C:/x"))).toBeNull();
  });
  it("빈 말은 null", () => {
    expect(speakable(bot("  "))).toBeNull();
    expect(speakable(bot("@ ** "))).toBeNull();
  });
});

describe("S-2234 다듬기", () => {
  it("200자로 자른다", () => {
    expect(speakable(bot("a".repeat(500)))!.length).toBe(200);
  });
  it("@ 와 마크다운 기호·이모지를 지운다", () => {
    expect(speakable(bot("**Sent** to @Otto `now` 🚀 #1"))).toBe("Sent to Otto now 1");
  });
});

describe("K8 S-2523 한국어 화면", () => {
  afterEach(() => setLang("en"));
  it("보고는 이름과 상태만 한국어로 읽는다", () => {
    setLang("ko");
    expect(speakable(rep("Otto", "끝남 · 12초", "비밀 내용"))).toBe("Otto 작업 끝.");
    expect(speakable(rep("Bex", "실패: 에이전트가 끝났어요"))).toBe("Bex 실패.");
    expect(speakable(rep("Otto", "끝남 · 3초", "secret"))).not.toContain("secret");
  });
  it("영어로 저장된 보고도 한국어 화면에서 읽고, 오류 답은 두 언어 모두 거른다", () => {
    setLang("ko");
    expect(speakable(rep("Otto", "finished · 12s"))).toBe("Otto 작업 끝.");
    expect(speakable(bot("Something went wrong: ENOENT"))).toBeNull();
    expect(speakable(bot("문제가 생겼어요: ENOENT C:/x"))).toBeNull();
    expect(speakable(bot("Otto를 닫았어요."))).toBe("Otto를 닫았어요.");
  });
  it("영어 화면은 그대로", () => {
    expect(speakable(rep("Otto", "finished · 12s"))).toBe("Otto finished.");
    expect(speakable(bot("문제가 생겼어요: x"))).toBeNull();
  });
});
