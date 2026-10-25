import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings: Record<string, unknown> = { speakReplies: true, voiceName: "auto" };
vi.mock("../settings/useSettings", () => ({ useSettings: { getState: () => ({ get: () => settings, s: settings }) } }));

import { mk, useThread } from "../commandbar/thread";
import { hasLocalVoice, onSpeaking, pickVoice, speak, stopSpeaking, watchReplies } from "./speak";

const v = (name: string, lang: string, localService: boolean, def = false) => ({ name, lang, localService, default: def, voiceURI: name }) as SpeechSynthesisVoice;
type Utt = { text: string; voice: SpeechSynthesisVoice | null; onend?: () => void; onerror?: () => void };
let voices: SpeechSynthesisVoice[] = [];
let spoken: Utt[] = [];
const cancel = vi.fn();

beforeEach(() => {
  voices = [v("Online En", "en-US", false, true), v("Local De", "de-DE", true), v("Local En", "en-GB", true), v("Local En2", "en-US", true)];
  spoken = [];
  cancel.mockClear();
  settings.speakReplies = true;
  settings.voiceName = "auto";
  vi.stubGlobal("SpeechSynthesisUtterance", class { voice: SpeechSynthesisVoice | null = null; constructor(public text: string) {} });
  vi.stubGlobal("speechSynthesis", { getVoices: () => voices, speak: (u: Utt) => spoken.push(u), cancel });
});
afterEach(() => vi.unstubAllGlobals());

describe("S-2234 음성 고르기", () => {
  it("auto: 기본 음성이 온라인이면 영어 로컬 음성 중 첫째", () => {
    expect(pickVoice(voices, "auto")?.name).toBe("Local En");
  });
  it("auto: 기본 음성이 영어 로컬이면 그것", () => {
    voices = [v("Local En", "en-GB", true), v("Def", "en-US", true, true)];
    expect(pickVoice(voices, "auto")?.name).toBe("Def");
  });
  it("이름을 지정하면 로컬 음성 중 그 이름, 온라인 이름은 무시", () => {
    expect(pickVoice(voices, "Local En2")?.name).toBe("Local En2");
    expect(pickVoice(voices, "Online En")?.name).toBe("Local En");
  });
  it("로컬 음성이 없으면 null", () => {
    voices = [v("Online", "en-US", false, true)];
    expect(pickVoice(voices, "auto")).toBeNull();
    expect(hasLocalVoice()).toBe(false);
  });
});

describe("S-2234·S-2236 말하기", () => {
  it("로컬 음성으로 읽는다", () => {
    speak("Hello");
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe("Hello");
    expect(spoken[0].voice?.name).toBe("Local En");
  });
  it("새 말이 앞 말을 끊는다(cancel 뒤 speak)", () => {
    speak("one");
    speak("two");
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(spoken.map((s) => s.text)).toEqual(["one", "two"]);
  });
  it("speakReplies 가 꺼지면 무음", () => {
    settings.speakReplies = false;
    speak("Hello");
    expect(spoken).toHaveLength(0);
  });
  it("로컬 음성이 없으면 조용히 아무것도 안 한다", () => {
    voices = [v("Online", "en-US", false, true)];
    expect(() => speak("Hello")).not.toThrow();
    expect(spoken).toHaveLength(0);
  });
  it("speechSynthesis 가 없어도 던지지 않는다", () => {
    vi.stubGlobal("speechSynthesis", undefined);
    expect(() => speak("Hello")).not.toThrow();
    expect(() => stopSpeaking()).not.toThrow();
  });
  it("stopSpeaking 은 cancel 하고 speaking=false 를 알린다", () => {
    const log: boolean[] = [];
    const off = onSpeaking((s) => log.push(s));
    speak("Hello");
    stopSpeaking();
    expect(cancel).toHaveBeenCalled();
    expect(log).toEqual([true, false]);
    off();
  });
  it("끝나면 speaking=false, 앞 말의 끝 신호는 새 말을 끄지 않는다", () => {
    const log: boolean[] = [];
    const off = onSpeaking((s) => log.push(s));
    speak("one");
    speak("two");
    spoken[0].onend?.(); // 끊긴 앞 말
    expect(log.at(-1)).toBe(true);
    spoken[1].onend?.();
    expect(log.at(-1)).toBe(false);
    off();
  });
});

describe("S-2235 Thread 구독", () => {
  it("켠 뒤 새 메시지만 읽고, 이전·불러온 것·보고 내용은 안 읽는다", () => {
    const t0 = Date.now();
    useThread.setState({ byRepo: { r: [{ ...mk("bot", "old one"), at: t0 - 5000 }] } });
    const off = watchReplies(t0);
    useThread.getState().add("r", mk("bot", "Closed Otto."));
    useThread.getState().add("r", mk("user", "kill"));
    useThread.getState().add("r", mk("report", "Otto finished · 3s", { report: { console: "Otto", secs: 3, result: "finished · 3s", reply: "details" } }));
    useThread.setState((s) => ({ byRepo: { ...s.byRepo, r2: [{ ...mk("bot", "loaded"), at: t0 - 1000 }] } })); // 지난 Thread 불러오기
    expect(spoken.map((s) => s.text)).toEqual(["Closed Otto.", "Otto finished."]);
    off();
    useThread.getState().add("r", mk("bot", "after off"));
    expect(spoken).toHaveLength(2);
  });
});
