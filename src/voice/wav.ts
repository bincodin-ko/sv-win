// S-2206·S-2207: Float32 소리 → 16kHz 모노 PCM16LE 바이트 → WAV (순수)
export const RATE = 16000;

/** -1..1 Float32 → PCM16LE 바이트(범위 밖은 자름) */
export function floatToPcm16(f: Float32Array): Uint8Array {
  const out = new Uint8Array(f.length * 2);
  const v = new DataView(out.buffer);
  for (let i = 0; i < f.length; i++) {
    const x = Math.max(-1, Math.min(1, f[i]!));
    v.setInt16(i * 2, x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), true);
  }
  return out;
}

/** 선형 보간 리샘플. ponytail: 저역 통과 필터 없음 — 말소리(16kHz 로 내림)에는 충분, 음질이 문제면 평균 창을 더한다 */
export function resample(f: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return f;
  const n = Math.round((f.length * to) / from);
  const out = new Float32Array(n);
  const step = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const a = Math.floor(x);
    const b = Math.min(a + 1, f.length - 1);
    out[i] = f[a]! + (f[b]! - f[a]!) * (x - a);
  }
  return out;
}

/** PCM16LE 모노 바이트에 44바이트 WAV 머리를 붙인다 */
export function pcmToWav(pcm: Uint8Array, rate = RATE): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 모노
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/** 길이(ms)와 50ms 창 RMS 의 최댓값(0..1) — 게이트(S-2208)용 */
export function pcmStats(pcm: Uint8Array, rate = RATE): { ms: number; peakRms: number } {
  const n = pcm.length >> 1;
  const v = new DataView(pcm.buffer, pcm.byteOffset, n * 2);
  const win = Math.max(1, Math.round(rate / 20));
  let peak = 0;
  for (let s = 0; s < n; s += win) {
    const e = Math.min(n, s + win);
    let sum = 0;
    for (let i = s; i < e; i++) {
      const x = v.getInt16(i * 2, true) / 32768;
      sum += x * x;
    }
    peak = Math.max(peak, Math.sqrt(sum / (e - s)));
  }
  return { ms: Math.round((n * 1000) / rate), peakRms: peak };
}
