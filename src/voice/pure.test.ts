// F1 S-2216: 순수 함수 시험. 기대값은 spec/6묶음.md §1 의 문장에서만.
import { describe, expect, it } from "vitest";
import { floatToPcm16, pcmStats, pcmToWav, resample } from "./wav";
import { GATE_MS, GATE_RMS, passesGate, filterHallucination } from "./filters";
import { snapNames, promptHint, VOCAB } from "./names";
import { LANGUAGES, langArg } from "./languages";
import { micError } from "./micError";

const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint32(o, true);
const u16 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint16(o, true);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
/** 16kHz PCM16 바이트: ms 길이, 진폭 amp(0..1) 사인파 */
const tone = (ms: number, amp: number) => {
  const n = Math.round((16000 * ms) / 1000);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = amp * Math.sin((2 * Math.PI * 440 * i) / 16000);
  return floatToPcm16(f);
};

describe("S-2207 pcmToWav", () => {
  it("16kHz 모노 PCM16 WAV 머리 44바이트", () => {
    const pcm = new Uint8Array(3200); // 100ms
    const w = pcmToWav(pcm);
    expect(w.length).toBe(44 + 3200);
    expect(ascii(w, 0, 4)).toBe("RIFF");
    expect(u32(w, 4)).toBe(36 + 3200);
    expect(ascii(w, 8, 8)).toBe("WAVEfmt ");
    expect(u32(w, 16)).toBe(16);
    expect(u16(w, 20)).toBe(1); // PCM
    expect(u16(w, 22)).toBe(1); // 모노
    expect(u32(w, 24)).toBe(16000);
    expect(u32(w, 28)).toBe(32000); // 바이트/초
    expect(u16(w, 32)).toBe(2);
    expect(u16(w, 34)).toBe(16);
    expect(ascii(w, 36, 4)).toBe("data");
    expect(u32(w, 40)).toBe(3200);
  });
});

describe("S-2206 리샘플·PCM 변환", () => {
  it("Float32 → PCM16LE, 범위 밖은 자름", () => {
    const b = floatToPcm16(new Float32Array([0, 1, -1, 2, -2, 0.5]));
    const v = new Int16Array(b.buffer, b.byteOffset, b.length / 2);
    expect(b.length).toBe(12);
    expect([...v]).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
  });
  it("48kHz → 16kHz 는 길이 1/3, 같은 비율이면 그대로", () => {
    const f = new Float32Array(4800).fill(0.25);
    const r = resample(f, 48000, 16000);
    expect(r.length).toBe(1600);
    expect(r[800]).toBeCloseTo(0.25);
    expect(resample(f, 16000, 16000)).toBe(f);
  });
  it("44.1kHz → 16kHz 길이 반올림", () => {
    expect(resample(new Float32Array(44100), 44100, 16000).length).toBe(16000);
  });
});

describe("S-2208 게이트 300ms·RMS 0.01", () => {
  it("문턱 상수", () => {
    expect(GATE_MS).toBe(300);
    expect(GATE_RMS).toBe(0.01);
  });
  it("pcmStats 길이와 50ms 창 최대 RMS", () => {
    const s = pcmStats(tone(1000, 0.5));
    expect(s.ms).toBe(1000);
    expect(s.peakRms).toBeCloseTo(0.5 / Math.SQRT2, 2);
  });
  it("짧으면·조용하면 안 보냄, 아니면 보냄", () => {
    expect(passesGate(pcmStats(tone(250, 0.5)))).toBe(false);
    expect(passesGate(pcmStats(tone(1000, 0.005)))).toBe(false);
    expect(passesGate(pcmStats(tone(1000, 0.2)))).toBe(true);
    expect(passesGate(pcmStats(new Uint8Array(32000)))).toBe(false); // 1초 무음
  });
});

describe("S-2209 filterHallucination", () => {
  const empty = ["thank you", "Thank you.", "  Thanks for watching!  ", "thanks for listening", "you", "Bye.", "okay", "OK?".replace("OK", "Okay"),
    "[BLANK_AUDIO]", "(silence)", "[Music]", "♪", "♪ ♪", "Subtitles by the Amara.org community", "...", "…", "go go go go go go", "the the the the the the the"];
  it.each(empty)("전체가 %j 이면 빈 글", (t) => expect(filterHallucination(t)).toBe(""));
  const keep = ["Thank you, spawn two Claude agents", "Can you spawn 5 Claude Code Agents?", "you know what, pause Otto", "go go go go go", "okay kill Bex"];
  it.each(keep)("문장 속이면 그대로 %j", (t) => expect(filterHallucination(t)).toBe(t));
});

describe("S-2210 snapNames", () => {
  const names = ["Otto", "Bex", "DAX", "Maya2", "Nova"];
  it.each([
    ["pause otto", "pause Otto"],
    ["kill becks", "kill Bex"],
    ["status of dax", "status of DAX"],
    ["restart maya 2", "restart Maya2"],
    ["restart Maya two", "restart Maya2"],
    ["open nove", "open Nova"], // 한 글자 오탈자
    ["Otta, resume.", "Otto, resume."],
  ])("%j → %j", (a, b) => expect(snapNames(a, names, VOCAB)).toBe(b));
  it("명령 낱말·일반 영어는 안 바꿈", () => {
    expect(snapNames("spawn two agents", ["Spawny"], VOCAB)).toBe("spawn two agents");
    expect(snapNames("group them and pause", ["Groop", "Pauze"], VOCAB)).toBe("group them and pause");
    expect(snapNames("open the code", ["Node"], VOCAB)).toBe("open the code");
  });
  it("3글자 이하 낱말은 소리로 안 바꿈", () => {
    expect(snapNames("add box", ["Bex"], VOCAB)).toBe("add box");
  });
  it("VOCAB 에 명령 낱말이 있음", () => {
    for (const w of ["spawn", "group", "pause", "resume", "kill", "restart", "status", "open", "add"]) expect(VOCAB).toContain(w);
  });
  it("promptHint = 콘솔 이름 + 명령 낱말", () => {
    const h = promptHint(["Otto", "Bex"], ["spawn", "kill"]);
    expect(h).toContain("Otto");
    expect(h).toContain("Bex");
    expect(h).toContain("spawn");
  });
});

describe("S-2211 언어", () => {
  it("26개 코드, 이름과 함께", () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual("bg hr cs da nl en et fi fr de el hu it ko lv lt mt pl pt ro ru sk sl es sv uk".split(" "));
    expect(LANGUAGES.every((l) => l.name.length > 1)).toBe(true);
    expect(LANGUAGES.find((l) => l.code === "en")!.name).toBe("English");
  });
  it("auto·빈 값·모르는 코드는 -l auto", () => {
    expect(langArg("auto")).toBe("auto");
    expect(langArg("")).toBe("auto");
    expect(langArg("xx")).toBe("auto");
    expect(langArg("de")).toBe("de");
  });
});

describe("S-2212 micError", () => {
  const e = (name: string) => Object.assign(new Error(name), { name });
  it("분류와 문구", () => {
    expect(micError(e("NotAllowedError"))).toEqual({ kind: "denied", message: "Microphone blocked. Allow Symvibe in Windows Settings › Privacy & security › Microphone." });
    expect(micError(e("NotFoundError"))).toEqual({ kind: "none", message: "No microphone found." });
    expect(micError(e("NotReadableError"))).toEqual({ kind: "busy", message: "The microphone is in use by another app." });
    expect(micError(e("AbortError")).kind).toBe("other");
    expect(micError("weird").kind).toBe("other");
  });
});
