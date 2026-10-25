// S-2206: 마이크 → 16kHz 모노 PCM16. Recorder(순수 누적)는 시험하고, startCapture 는 브라우저 API 를 잇기만 한다
import { floatToPcm16, RATE, resample } from "./wav";

export interface RecOpts { maxMs?: number; onLimit?: () => void; onLevel?: (v: number) => void }

/** 원래 표본율의 Float32 조각을 받아 16kHz 로 모으고, 50ms 마다 RMS(0..1)를 알린다 */
export class Recorder {
  private chunks: Float32Array[] = [];
  private n = 0; // 16kHz 표본 수
  private winSum = 0;
  private winN = 0;
  private done = false;
  constructor(private rate: number, private o: RecOpts = {}) {}
  push(f: Float32Array) {
    if (this.done) return;
    const win = this.rate / 20;
    for (let i = 0; i < f.length; i++) {
      this.winSum += f[i]! * f[i]!;
      if (++this.winN >= win) {
        this.o.onLevel?.(Math.min(1, Math.sqrt(this.winSum / this.winN)));
        this.winSum = this.winN = 0;
      }
    }
    let r = resample(f, this.rate, RATE);
    const max = this.o.maxMs ? Math.round((this.o.maxMs * RATE) / 1000) : Infinity;
    if (this.n + r.length >= max) {
      r = r.subarray(0, max - this.n);
      this.done = true;
    }
    this.chunks.push(r);
    this.n += r.length;
    if (this.done) this.o.onLimit?.();
  }
  /** 멈추지 않고 지금까지의 소리(S-2262 회색 부분 받아쓰기) */
  snapshot(): Uint8Array {
    const all = new Float32Array(this.n);
    let at = 0;
    for (const c of this.chunks) {
      all.set(c, at);
      at += c.length;
    }
    return floatToPcm16(all);
  }
  finish(): { pcm: Uint8Array; ms: number } {
    this.done = true;
    return { pcm: this.snapshot(), ms: Math.round((this.n * 1000) / RATE) };
  }
}

const WORKLET = `registerProcessor("symvibe-rec", class extends AudioWorkletProcessor {
  process(inputs) { const c = inputs[0] && inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; }
});`;

export interface Capture { snapshot(): Uint8Array; stop(): Promise<{ pcm: Uint8Array; ms: number }>; cancel(): Promise<void> }

/** 오류는 getUserMedia 의 것을 그대로 던진다(micError 로 분류). 고른 장치가 없어졌으면 기본 장치로 다시 시도(S-2212) */
export async function startCapture(o: RecOpts & { deviceId?: string } = {}): Promise<Capture> {
  const audio = (id?: string): MediaTrackConstraints => ({
    ...(id ? { deviceId: { exact: id } } : {}), channelCount: 1, echoCancellation: false, autoGainControl: true, noiseSuppression: false,
  });
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: audio(o.deviceId) });
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (!o.deviceId || (name !== "OverconstrainedError" && name !== "NotFoundError")) throw e;
    stream = await navigator.mediaDevices.getUserMedia({ audio: audio() });
  }
  const ctx = new AudioContext({ sampleRate: RATE });
  const src = ctx.createMediaStreamSource(stream);
  let node: AudioNode | null = null;
  let ended = false;
  const end = async () => {
    if (ended) return;
    ended = true;
    src.disconnect();
    node?.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close().catch(() => {});
  };
  const rec = new Recorder(ctx.sampleRate, { ...o, onLimit: () => { o.onLimit?.(); void end(); } });
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const w = new AudioWorkletNode(ctx, "symvibe-rec");
    w.port.onmessage = (e: MessageEvent<Float32Array>) => rec.push(e.data);
    node = w;
  } catch {
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    sp.onaudioprocess = (e) => rec.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    node = sp;
  }
  src.connect(node);
  node.connect(ctx.destination); // ScriptProcessor 는 출력에 이어야 돈다(출력은 무음)
  return { snapshot: () => rec.snapshot(), stop: async () => { await end(); return rec.finish(); }, cancel: end };
}
