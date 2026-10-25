// Q1 S-3101·S-3102·S-3107·S-3108: piperPlan·piperLine·speak 의 Piper 갈래. 가짜 ipc·가짜 Audio·가짜 speechSynthesis 만 쓴다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings: Record<string, unknown> = { speakReplies: true, voiceName: "auto" };
vi.mock("../settings/useSettings", () => ({ useSettings: { getState: () => ({ get: () => settings, s: settings }) } }));
const ipc = vi.hoisted(() => ({ piperStatus: vi.fn(), piperSpeak: vi.fn() }));
vi.mock("../lib/ipc", async (orig) => ({ ...(await orig<object>()), ...ipc }));

import type { VoicePart } from "../lib/ipc";
import { piperLine, piperPlan, usePiper, type PiperStatus } from "./piper";
import { onSpeaking, speak, stopSpeaking } from "./speak";

const P = (kind: VoicePart["kind"], pct?: number, why?: string): VoicePart => ({ kind, pct, why });
const st = (engine: VoicePart, ko: VoicePart, en: VoicePart = P("none")): PiperStatus => ({ engine, ko, en });

describe("S-3102 piperPlan: 받을 것만 차례로", () => {
  it("엔진도 음성도 없으면 engine → 음성 → 음성 json", () => {
    expect(piperPlan(st(P("none"), P("none")), "ko")).toEqual(["piper-engine", "piper-ko", "piper-ko-json"]);
    expect(piperPlan(st(P("none"), P("none")), "en")).toEqual(["piper-engine", "piper-en", "piper-en-json"]);
  });
  it("엔진이 있으면 음성 둘만", () => {
    expect(piperPlan(st(P("ready"), P("none"), P("none")), "en")).toEqual(["piper-en", "piper-en-json"]);
  });
  it("음성이 있고 엔진이 없으면 엔진만, 다 있으면 빈 목록", () => {
    expect(piperPlan(st(P("none"), P("ready")), "ko")).toEqual(["piper-engine"]);
    expect(piperPlan(st(P("ready"), P("ready")), "ko")).toEqual([]);
  });
  it("실패는 없음처럼 다시 받고, 받는 중인 것은 건너뛴다", () => {
    expect(piperPlan(st(P("failed", 0, "net"), P("ready")), "ko")).toEqual(["piper-engine"]);
    expect(piperPlan(st(P("downloading", 40), P("none")), "ko")).toEqual(["piper-ko", "piper-ko-json"]);
  });
});

describe("S-3101 piperLine: 엔진 + 화면 언어 음성을 한 상태로", () => {
  it("둘 다 준비돼야 ready", () => {
    expect(piperLine(st(P("ready"), P("ready")), "ko").kind).toBe("ready");
    expect(piperLine(st(P("ready"), P("none")), "ko").kind).toBe("none");
    expect(piperLine(st(P("none"), P("none")), "ko").kind).toBe("none");
  });
  it("다른 언어 음성 상태는 보지 않는다", () => {
    expect(piperLine(st(P("ready"), P("failed", 0, "x"), P("ready")), "en").kind).toBe("ready");
  });
  it("실패가 먼저, 받는 중이면 세 파일 바이트 합 기준 퍼센트(엔진 22MB + 음성 63MB)", () => {
    expect(piperLine(st(P("ready"), P("failed", 0, "net")), "ko")).toMatchObject({ kind: "failed", why: "net" });
    const l = piperLine(st(P("ready"), P("downloading", 50)), "ko");
    expect(l.kind).toBe("downloading");
    expect(l.pct).toBeGreaterThan(60);
    expect(l.pct).toBeLessThan(66);
    expect(piperLine(st(P("downloading", 100), P("none")), "ko").pct).toBeLessThan(30);
  });
});

// ---- speak() 의 Piper 갈래 ----
type Utt = { text: string };
let spoken: Utt[] = [];
let audios: FakeAudio[] = [];
class FakeAudio {
  paused = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) { audios.push(this); }
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn(() => void (this.paused = true));
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const ready = () => usePiper.setState({ status: st(P("ready"), P("ready"), P("ready")), lastPiperFail: null });

beforeEach(() => {
  spoken = [];
  audios = [];
  settings.speakReplies = true;
  delete settings.ttsEngine;
  ipc.piperStatus.mockReset();
  ipc.piperSpeak.mockReset().mockResolvedValue(new Uint8Array(44));
  usePiper.setState({ status: null, lastPiperFail: null });
  vi.stubGlobal("SpeechSynthesisUtterance", class { voice: unknown = null; constructor(public text: string) {} });
  vi.stubGlobal("speechSynthesis", { getVoices: () => [{ name: "Local En", lang: "en-US", localService: true, default: true, voiceURI: "x" }], speak: (u: Utt) => spoken.push(u), cancel: vi.fn() });
  vi.stubGlobal("Audio", FakeAudio);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  stopSpeaking(); // 앞 시험이 남긴 재생 상태(speak.ts 모듈 변수)를 비움
  vi.mocked(URL.revokeObjectURL).mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("S-3107 Piper 가 Ready 면 piperSpeak → Audio", () => {
  it("엔진 설정이 없거나 windows 면 piperSpeak 를 부르지 않고 내장으로", async () => {
    ready();
    speak("Hello");
    await flush();
    expect(ipc.piperSpeak).not.toHaveBeenCalled();
    expect(spoken.map((u) => u.text)).toEqual(["Hello"]);
  });
  it("piper + Ready: 200자로 잘라 화면 언어로 부르고 Audio 를 재생, 내장은 안 읽음", async () => {
    settings.ttsEngine = "piper";
    ready();
    speak("x".repeat(300));
    await vi.waitFor(() => expect(audios).toHaveLength(1));
    expect(ipc.piperSpeak).toHaveBeenCalledWith("x".repeat(200), "en");
    expect(audios[0].play).toHaveBeenCalled();
    expect(spoken).toHaveLength(0);
    expect(usePiper.getState().lastPiperFail).toBeNull();
  });
  it("상태를 아직 모르면(null) 한 번 읽어 보고 Ready 면 재생", async () => {
    settings.ttsEngine = "piper";
    ipc.piperStatus.mockResolvedValue(st(P("ready"), P("ready"), P("ready")));
    speak("Hi");
    await vi.waitFor(() => expect(audios).toHaveLength(1));
    expect(ipc.piperStatus).toHaveBeenCalledTimes(1);
  });
  it("onSpeaking: 재생 시작 true, 끝나면 false", async () => {
    settings.ttsEngine = "piper";
    ready();
    const seen: boolean[] = [];
    const off = onSpeaking((s) => seen.push(s));
    speak("Hi");
    await vi.waitFor(() => expect(audios).toHaveLength(1));
    expect(seen).toEqual([true]);
    audios[0].onended?.();
    expect(seen).toEqual([true, false]);
    off();
  });
  it("새 말이 앞 Audio 를 끊고 URL 을 해제하며, stopSpeaking 도 같다", async () => {
    settings.ttsEngine = "piper";
    ready();
    speak("one");
    await vi.waitFor(() => expect(audios).toHaveLength(1));
    speak("two");
    await vi.waitFor(() => expect(audios).toHaveLength(2));
    expect(audios[0].pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    stopSpeaking();
    expect(audios[1].pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});

describe("S-3108 실패하면 같은 글을 Windows 내장으로", () => {
  it("piperSpeak 가 거부하면 내장으로 읽고 이유를 lastPiperFail 에", async () => {
    settings.ttsEngine = "piper";
    ready();
    ipc.piperSpeak.mockRejectedValue("timeout");
    speak("Hello");
    await vi.waitFor(() => expect(spoken.map((u) => u.text)).toEqual(["Hello"]));
    expect(usePiper.getState().lastPiperFail).toBe("timeout");
    expect(audios).toHaveLength(0);
  });
  it("Ready 가 아니면 piperSpeak 를 부르지 않고 내장으로", async () => {
    settings.ttsEngine = "piper";
    usePiper.setState({ status: st(P("ready"), P("none")) });
    speak("Hello");
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(ipc.piperSpeak).not.toHaveBeenCalled();
    expect(usePiper.getState().lastPiperFail).toBe("not-ready");
  });
  it("재생이 거부돼도(play reject) 내장으로", async () => {
    settings.ttsEngine = "piper";
    ready();
    vi.stubGlobal("Audio", class extends FakeAudio { play = vi.fn(() => Promise.reject(new Error("NotSupported"))); });
    speak("Hello");
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(usePiper.getState().lastPiperFail).toContain("NotSupported");
  });
  it("성공하면 앞의 실패 표시를 지운다", async () => {
    settings.ttsEngine = "piper";
    ready();
    usePiper.setState({ lastPiperFail: "old" });
    speak("Hi");
    await vi.waitFor(() => expect(audios).toHaveLength(1));
    expect(usePiper.getState().lastPiperFail).toBeNull();
  });
});
