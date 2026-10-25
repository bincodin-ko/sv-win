// F1 S-2201·S-2202·S-2205·S-2207·S-2210 흐름 시험: 가짜 ipc(window.__fakeVoice)와 가짜 확인창만 쓴다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeVoice } from "../lib/ipc";
import { floatToPcm16 } from "./wav";

const ask = vi.fn(async (_o: unknown) => true);
vi.mock("../ui/ConfirmDialog", () => ({ confirmDialog: (o: unknown) => ask(o) }));

const { combine, useVoice, refreshVoice, retry } = await import("./status");
const { ensureReady, resetEnsureSession } = await import("./ensure");
const { transcribe, VoiceError } = await import("./recognize");
const { Recorder } = await import("./capture");

const fv = () => (window as unknown as { __fakeVoice: FakeVoice }).__fakeVoice;
const speech = (ms = 1000) => {
  const n = (16000 * ms) / 1000;
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = 0.3 * Math.sin(i / 5);
  return floatToPcm16(f);
};

beforeEach(() => {
  (window as unknown as { __fakeVoice: FakeVoice }).__fakeVoice = { parts: { engine: { kind: "none" }, small: { kind: "none" }, base: { kind: "none" } }, calls: [], downloads: [] };
  useVoice.setState({ recog: { kind: "none" }, phase: "idle", speaking: false });
  resetEnsureSession();
  ask.mockClear();
  ask.mockImplementation(async () => true);
});

describe("S-2201 상태 합치기(엔진 + 모델)", () => {
  it("둘 다 ready → ready, 하나라도 없으면 none", () => {
    expect(combine({ kind: "ready" }, { kind: "ready" }, "small")).toEqual({ kind: "ready" });
    expect(combine({ kind: "ready" }, { kind: "none" }, "small")).toEqual({ kind: "none" });
  });
  it("failed 가 먼저, 이유를 넘김", () => {
    expect(combine({ kind: "downloading", pct: 10 }, { kind: "failed", why: "checksum" }, "small")).toEqual({ kind: "failed", why: "checksum" });
  });
  it("downloading 이면 두 파일 바이트 대비 진행률", () => {
    const r = combine({ kind: "ready" }, { kind: "downloading", pct: 50 }, "small");
    expect(r.kind).toBe("downloading");
    expect(r.pct).toBeGreaterThan(50); // 엔진 몫(작음)이 이미 끝남
    expect(r.pct).toBeLessThan(53);
  });
  it("refreshVoice 가 가짜 ipc 상태를 읽음", async () => {
    fv().parts = { engine: { kind: "ready" }, small: { kind: "ready" }, base: { kind: "none" } };
    await refreshVoice("small");
    expect(useVoice.getState().recog).toEqual({ kind: "ready" });
    await refreshVoice("base"); // S-2205 모델을 바꾸면 그 모델 기준
    expect(useVoice.getState().recog).toEqual({ kind: "none" });
  });
});

describe("S-2202 ensureReady 확인창", () => {
  it("ready 면 묻지 않고 true", async () => {
    fv().parts.engine = { kind: "ready" };
    fv().parts.small = { kind: "ready" };
    expect(await ensureReady("small")).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
  it("none → 문구 확인창, Download 면 없는 파일만 내려받고 끝나면 true", async () => {
    fv().parts.engine = { kind: "ready" };
    expect(await ensureReady("small")).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
    const o = ask.mock.calls[0][0] as { title: string; message: string; confirmLabel: string; cancelLabel: string };
    expect(o.title).toBe("Download speech recognition?");
    expect(o.message).toBe("About 470 MB, once. Your voice is transcribed on this PC and never sent anywhere.");
    expect(o.confirmLabel).toBe("Download");
    expect(o.cancelLabel).toBe("Not now");
    expect(fv().downloads).toEqual(["small"]);
    expect(useVoice.getState().recog.kind).toBe("ready");
  });
  it("Not now → false, 같은 세션에 다시 묻지 않음", async () => {
    ask.mockImplementation(async () => false);
    expect(await ensureReady("small")).toBe(false);
    expect(await ensureReady("small")).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(fv().downloads).toEqual([]);
  });
  it("내려받기 실패 → false, recog failed, retry() 가 다시 내려받음", async () => {
    fv().failNext = "checksum";
    expect(await ensureReady("small")).toBe(false);
    expect(useVoice.getState().recog).toEqual({ kind: "failed", why: "checksum" });
    await retry("small");
    expect(fv().downloads).toEqual(["engine", "small", "engine"]); // 실패한 엔진만 다시(모델은 이미 ready)
    expect(useVoice.getState().recog.kind).toBe("ready");
  });
});

describe("S-2207 transcribe", () => {
  beforeEach(() => {
    fv().parts = { engine: { kind: "ready" }, small: { kind: "ready" }, base: { kind: "ready" } };
  });
  it("WAV·언어·힌트·모델을 넘기고 필터·이름 맞추기를 거친 글", async () => {
    fv().reply = "Pause becks.";
    const t = await transcribe(speech(), { language: "en", names: ["Bex", "Otto"], model: "small" });
    expect(t).toBe("Pause Bex.");
    const c = fv().calls[0];
    expect(c.lang).toBe("en");
    expect(c.model).toBe("small");
    expect(c.prompt).toContain("Bex");
    expect(c.prompt).toContain("spawn");
    expect(String.fromCharCode(...c.wav.slice(0, 4))).toBe("RIFF");
  });
  it("auto 언어는 auto, 환각 글은 빈 글", async () => {
    fv().reply = "Thank you.";
    expect(await transcribe(speech(), { language: "auto", names: [], model: "small" })).toBe("");
    expect(fv().calls[0].lang).toBe("auto");
  });
  it("S-2208 게이트: 짧은 소리는 엔진을 부르지 않음", async () => {
    expect(await transcribe(speech(200), { language: "en", names: [], model: "small" })).toBe("");
    expect(fv().calls.length).toBe(0);
  });
  it("엔진 오류는 VoiceError{kind}", async () => {
    fv().error = "timeout";
    const e = await transcribe(speech(), { language: "en", names: [], model: "small" }).catch((x) => x);
    expect(e).toBeInstanceOf(VoiceError);
    expect(e.kind).toBe("timeout");
  });
  it("엔진이 준비 안 됐으면 VoiceError{not-ready}", async () => {
    fv().parts.small = { kind: "none" };
    const e = await transcribe(speech(), { language: "en", names: [], model: "small" }).catch((x) => x);
    expect(e.kind).toBe("not-ready");
  });
  it("한 번에 하나, 대기 1개, 더 오면 오래된 대기를 버림", async () => {
    let release: () => void = () => {};
    fv().hold = new Promise<void>((r) => (release = r));
    fv().reply = "spawn";
    const o = { language: "en", names: [], model: "small" as const };
    const a = transcribe(speech(), o);
    await new Promise((r) => setTimeout(r, 0));
    const b = transcribe(speech(), o);
    const c = transcribe(speech(), o);
    const eb = await b.catch((x) => x);
    expect(eb).toBeInstanceOf(VoiceError);
    expect(eb.kind).toBe("dropped");
    expect(fv().calls.length).toBe(1); // a 만 엔진에
    release();
    expect(await a).toBe("spawn");
    expect(await c).toBe("spawn");
    expect(fv().calls.length).toBe(2);
  });
});

describe("S-2206 Recorder(캡처 누적)", () => {
  it("48kHz 조각을 모아 16kHz PCM16 과 길이, maxMs 에서 onLimit", () => {
    let limited = 0;
    const levels: number[] = [];
    const r = new Recorder(48000, { maxMs: 1000, onLimit: () => limited++, onLevel: (v) => levels.push(v) });
    const chunk = new Float32Array(2400).fill(0.5); // 50ms
    for (let i = 0; i < 25; i++) r.push(chunk); // 1250ms
    const out = r.finish();
    expect(limited).toBe(1);
    expect(out.ms).toBe(1000); // maxMs 뒤 조각은 버림
    expect(out.pcm.length).toBe(32000);
    expect(levels.length).toBeGreaterThanOrEqual(19);
    expect(levels[0]).toBeCloseTo(0.5, 2);
  });
});
