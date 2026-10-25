// S-2207: 소리(PCM16) → 게이트 → WAV → 엔진 → 환각 필터 → 이름 맞추기. 한 번에 하나, 대기 1개(더 오면 오래된 대기를 버림)
import { voiceTranscribe } from "../lib/ipc";
import { filterHallucination, passesGate } from "./filters";
import { langArg } from "./languages";
import { promptHint, snapNames } from "./names";
import type { Model } from "./status";
import { pcmStats, pcmToWav } from "./wav";

/** kind: not-ready / timeout / engine / write / dropped(새 말에 밀려 버려짐) */
export class VoiceError extends Error {
  constructor(public kind: string) {
    super(kind);
    this.name = "VoiceError";
  }
}

let busy = false;
let waiting: { go: () => void; drop: () => void } | null = null;
function slot(): Promise<void> {
  if (!busy) {
    busy = true;
    return Promise.resolve();
  }
  return new Promise((go, no) => {
    waiting?.drop();
    waiting = { go: () => go(), drop: () => no(new VoiceError("dropped")) };
  });
}
function release() {
  const w = waiting;
  waiting = null;
  if (w) w.go();
  else busy = false;
}

export async function transcribe(pcm: Uint8Array, o: { language: string; names: string[]; model: Model }): Promise<string> {
  if (!passesGate(pcmStats(pcm))) return ""; // S-2208 엔진을 부르지 않음
  await slot();
  try {
    const raw = await voiceTranscribe(pcmToWav(pcm), langArg(o.language), promptHint(o.names, undefined, o.language), o.model).catch((e: unknown) => {
      throw new VoiceError(typeof e === "string" ? e : "engine");
    });
    return snapNames(filterHallucination(raw).trim(), o.names);
  } finally {
    release();
  }
}
