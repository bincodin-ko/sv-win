// S-2201 useVoice: 인식 상태(recog)·말하기 단계(phase)·읽는 중(speaking). F2·F3 이 이 모양에 의지한다
import { create } from "zustand";
import { voiceDownload, voiceStatus, type VoiceKind, type VoicePart } from "../lib/ipc";
import { useSettings } from "../settings/useSettings";
import { ENGINE_BYTES, MODEL_BYTES } from "./pins";

export type Recog = VoicePart;
export type Model = "small" | "base";
export interface VoiceState { recog: Recog; phase: "idle" | "listening" | "thinking"; speaking: boolean }
export const useVoice = create<VoiceState>(() => ({ recog: { kind: "none" }, phase: "idle", speaking: false }));

/** 설정 speechModel(F2 가 키를 선언, 기본 small) */
export const currentModel = (): Model => (useSettings.getState().s.speechModel === "base" ? "base" : "small");

/** 엔진 + 모델 → 하나의 상태. failed 가 먼저, 그다음 downloading(두 파일 바이트 대비 %), 둘 다 ready 면 ready */
export function combine(e: Recog, m: Recog, model: Model): Recog {
  const bad = [e, m].find((p) => p.kind === "failed");
  if (bad) return { kind: "failed", why: bad.why ?? "failed" };
  if (e.kind === "downloading" || m.kind === "downloading") {
    const done = (p: Recog, b: number) => (p.kind === "ready" ? b : p.kind === "downloading" ? ((p.pct ?? 0) / 100) * b : 0);
    const total = ENGINE_BYTES + MODEL_BYTES[model];
    return { kind: "downloading", pct: Math.round(((done(e, ENGINE_BYTES) + done(m, MODEL_BYTES[model])) * 100) / total) };
  }
  return e.kind === "ready" && m.kind === "ready" ? { kind: "ready" } : { kind: "none" };
}

export async function refreshVoice(model: Model = currentModel()): Promise<Recog> {
  const st = await voiceStatus(model);
  const recog = combine(st.engine, st.model, model);
  useVoice.setState({ recog });
  return recog;
}

/** 내려받는 중이면 0.5초마다 다시 읽어 끝날 때까지 기다린다. ready 면 true */
export async function waitReady(model: Model): Promise<boolean> {
  for (;;) {
    const r = await refreshVoice(model);
    if (r.kind !== "downloading") return r.kind === "ready";
    await new Promise((res) => setTimeout(res, 500));
  }
}

/** 준비 안 된 것(없음·실패)만 받기 시작하고 끝날 때까지 기다린다 */
export async function startAndWait(model: Model): Promise<boolean> {
  const st = await voiceStatus(model);
  const need: [VoiceKind, Recog][] = [["engine", st.engine], [model, st.model]];
  for (const [k, p] of need) if (p.kind === "none" || p.kind === "failed") await voiceDownload(k);
  return waitReady(model);
}

/** 설정 창 Retry(S-2201): 실패한 것을 다시 받는다 */
export const retry = (model: Model = currentModel()) => startAndWait(model);
