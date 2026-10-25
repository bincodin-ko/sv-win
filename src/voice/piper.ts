// Q1 S-3101·S-3102·S-3108: Piper 상태·내려받기 계획·마지막 실패. 소리 내기는 speak.ts, 화면은 settings/panes/Voice.tsx
import { create } from "zustand";
import { t } from "../i18n";
import { piperStatus, voiceCancel, voiceDownload, type VoicePart } from "../lib/ipc";
import { confirmDialog } from "../ui/ConfirmDialog";

export type PiperKind = "piper-engine" | "piper-ko" | "piper-ko-json" | "piper-en" | "piper-en-json";
export type PiperLang = "ko" | "en";
export interface PiperStatus { engine: VoicePart; ko: VoicePart; en: VoicePart }
interface PiperState {
  status: PiperStatus | null;
  lastPiperFail: string | null; // S-3108: 마지막으로 내장으로 대체한 이유
  busy: boolean; // 내려받기 순서가 도는 중(파일 사이 틈에 단추가 되살아나지 않게)
  ready: (lang: PiperLang) => boolean;
}

export const usePiper = create<PiperState>((_set, get) => ({
  status: null,
  lastPiperFail: null,
  busy: false,
  ready: (lang) => {
    const s = get().status;
    return !!s && s.engine.kind === "ready" && s[lang].kind === "ready";
  },
}));

// 값은 src-tauri/src/voice/pins.rs 와 같게(모델 = onnx + json)
const BYTES = { engine: 22_477_236, ko: 63_221_984 + 5_232, en: 63_531_379 + 4_972 };
const need = (p: VoicePart) => p.kind === "none" || p.kind === "failed";

/** S-3102: 받을 것만 차례로(엔진이 없으면 engine → 음성 → 음성 json). 받는 중인 것은 건너뜀 */
export function piperPlan(st: PiperStatus, lang: PiperLang): PiperKind[] {
  return [...(need(st.engine) ? (["piper-engine"] as const) : []), ...(need(st[lang]) ? ([`piper-${lang}`, `piper-${lang}-json`] as const) : [])];
}

/** 엔진 + 화면 언어 음성 → 한 상태. 실패가 먼저, 받는 중이면 두 몫 바이트 대비 % */
export function piperLine(st: PiperStatus, lang: PiperLang): VoicePart {
  const [e, v] = [st.engine, st[lang]];
  const bad = [e, v].find((p) => p.kind === "failed");
  if (bad) return { kind: "failed", why: bad.why ?? "failed" };
  if (e.kind === "downloading" || v.kind === "downloading") {
    const done = (p: VoicePart, b: number) => (p.kind === "ready" ? b : p.kind === "downloading" ? ((p.pct ?? 0) / 100) * b : 0);
    return { kind: "downloading", pct: Math.round(((done(e, BYTES.engine) + done(v, BYTES[lang])) * 100) / (BYTES.engine + BYTES[lang])) };
  }
  return e.kind === "ready" && v.kind === "ready" ? { kind: "ready" } : { kind: "none" };
}

export async function refreshPiper(): Promise<PiperStatus> {
  const status = await piperStatus();
  usePiper.setState({ status });
  return status;
}

let cancelled = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 확인창 → 필요한 파일을 차례로 받고 끝날 때까지 기다린다. Ready 면 true, 아니오·취소·실패면 false */
export async function startPiper(lang: PiperLang): Promise<boolean> {
  const plan = piperPlan(await refreshPiper(), lang);
  if (!plan.length) return true;
  const ok = await confirmDialog({
    title: t("Download Piper voice?"),
    message: t("Download Piper (~22 MB) and the {lang} voice (~63 MB) from GitHub and Hugging Face? Speech stays on this PC.", { lang: t(lang === "ko" ? "Korean" : "English") }),
    confirmLabel: t("Download"),
    cancelLabel: t("Not now"),
  });
  if (!ok) return false;
  cancelled = false;
  usePiper.setState({ busy: true });
  try {
    for (const k of plan) {
      await voiceDownload(k);
      let part: VoicePart;
      for (;;) {
        const s = await refreshPiper();
        part = k === "piper-engine" ? s.engine : s[lang];
        if (part.kind !== "downloading") break;
        await sleep(500);
      }
      if (cancelled || part.kind === "failed") return false;
    }
    return piperLine(await refreshPiper(), lang).kind === "ready";
  } finally {
    usePiper.setState({ busy: false });
  }
}

/** 받는 중인 것을 멈춘다(순서도 거기서 끝) */
export async function cancelPiper(lang: PiperLang): Promise<void> {
  cancelled = true;
  for (const k of ["piper-engine", `piper-${lang}`, `piper-${lang}-json`] as const) await voiceCancel(k);
  await refreshPiper().catch(() => {});
}
