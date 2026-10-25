import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings: Record<string, unknown> = { speakReplies: true, voiceName: "auto" };
vi.mock("../settings/useSettings", () => ({ useSettings: { getState: () => ({ get: () => settings, s: settings }) } }));

import { setLang } from "../i18n";
import { filterHallucination } from "./filters";
import { LANGUAGES, languageLabel } from "./languages";
import { pickVoice, speak } from "./speak";

const v = (name: string, lang: string, localService: boolean, def = false) => ({ name, lang, localService, default: def, voiceURI: name }) as SpeechSynthesisVoice;
afterEach(() => (setLang("en"), vi.unstubAllGlobals()));

describe("S-2451 언어 이름은 화면 언어를 따른다", () => {
  const KO = "불가리아어 크로아티아어 체코어 덴마크어 네덜란드어 영어 에스토니아어 핀란드어 프랑스어 독일어 그리스어 헝가리어 이탈리아어 한국어 라트비아어 리투아니아어 몰타어 폴란드어 포르투갈어 루마니아어 러시아어 슬로바키아어 슬로베니아어 스페인어 스웨덴어 우크라이나어".split(" ");
  it("영어 화면: 영어 이름·Automatic", () => {
    expect(languageLabel("ko")).toBe("Korean");
    expect(languageLabel("auto")).toBe("Automatic");
  });
  it("한국어 화면: 26개 모두 한국어, auto=자동", () => {
    setLang("ko");
    expect(LANGUAGES).toHaveLength(26);
    expect(LANGUAGES.map((l) => languageLabel(l.code))).toEqual(KO);
    expect(languageLabel("auto")).toBe("자동");
  });
});

describe("S-2454 한국어 환각 필터", () => {
  it.each(["시청해 주셔서 감사합니다", "시청해주셔서 감사합니다.", "구독과 좋아요 부탁드립니다", "감사합니다", "자막 제공 배달의민족", "한글자막 by 한효정", "MBC 뉴스 이덕영입니다", "시청해 주셔서  감사합니다!"])("%j 는 빈 글", (t) => expect(filterHallucination(t)).toBe(""));
  it("문장 속·영어 규칙은 그대로", () => {
    expect(filterHallucination("시청해주셔서 감사합니다 오늘은 날씨가 좋아요")).toBe("시청해주셔서 감사합니다 오늘은 날씨가 좋아요");
    expect(filterHallucination("클로드 두 개 띄워")).toBe("클로드 두 개 띄워");
    expect(filterHallucination("thank you")).toBe("");
  });
});

describe("S-2452 한국어 화면의 음성 고르기", () => {
  const set = [v("Online Ko", "ko-KR", false, true), v("Local En", "en-US", true), v("Microsoft Sun-Hi", "ko-KR", true), v("Microsoft Heami", "ko-KR", true)];
  it("auto: ko 로컬 중 기본이 아니면 Heami", () => expect(pickVoice(set, "auto", "ko")?.name).toBe("Microsoft Heami"));
  it("auto: 기본 음성이 ko 로컬이면 그것 우선", () => expect(pickVoice([...set, v("Def Ko", "ko-KR", true, true)], "auto", "ko")?.name).toBe("Def Ko"));
  it("Heami 도 기본도 없으면 첫 ko 로컬", () => expect(pickVoice([v("A", "ko-KR", true), v("B", "ko-KR", true)], "auto", "ko")?.name).toBe("A"));
  it("ko 로컬이 없으면 null(영어로 대체하지 않음, 온라인 ko 도 안 고름)", () => expect(pickVoice([v("Online Ko", "ko-KR", false, true), v("Local En", "en-US", true)], "auto", "ko")).toBeNull());
  it("이름을 지정하면 그 로컬 음성", () => expect(pickVoice(set, "Local En", "ko")?.name).toBe("Local En"));
  it("영어 화면은 지금 규칙 그대로", () => {
    expect(pickVoice(set, "auto")?.name).toBe("Local En");
    expect(pickVoice(set, "auto", "en")?.name).toBe("Local En");
  });
  it("speak() 는 화면 언어로 고른다", () => {
    const spoken: { voice: SpeechSynthesisVoice | null }[] = [];
    vi.stubGlobal("SpeechSynthesisUtterance", class { voice: SpeechSynthesisVoice | null = null; constructor(public text: string) {} });
    vi.stubGlobal("speechSynthesis", { getVoices: () => set, speak: (u: { voice: SpeechSynthesisVoice | null }) => spoken.push(u), cancel: () => {} });
    setLang("ko");
    speak("안녕");
    expect(spoken[0]?.voice?.name).toBe("Microsoft Heami");
    setLang("en");
    speak("hi");
    expect(spoken[1]?.voice?.name).toBe("Local En");
  });
});
