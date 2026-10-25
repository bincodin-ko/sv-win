// F3 듣기 흐름: 상태 기계(ptt.ts)와 마이크(F1 capture)·받아쓰기(F1 recognize)·명령 바(submit)·받아쓰기 대상을 잇는다. 화면은 useListen 만 읽는다
import { create } from "zustand";
import { getStore } from "../board/boards";
import { isConsole } from "../board/store";
import { pushHistory } from "../commandbar/CommandBar";
import { submit, type ExecCtx } from "../commandbar/executor";
import { getSession } from "../console/session";
import { t } from "../i18n";
import { isTauri, voiceTranscribe } from "../lib/ipc";
import { useSettings } from "../settings/useSettings";
import { startCapture, type Capture, type RecOpts } from "./capture";
import { dictText, insertConsole, insertField } from "./dictate";
import { ensureReady } from "./ensure";
import { filterHallucination, passesGate } from "./filters";
import { langArg } from "./languages";
import { micError } from "./micError";
import { promptHint } from "./names";
import { Ptt, type Src } from "./ptt";
import { transcribe, VoiceError } from "./recognize";
import { stopSpeaking } from "./speak";
import { currentModel, useVoice } from "./status";
import { dictationTarget, pillText, recheck, type DTarget } from "./target";
import { pcmStats, pcmToWav } from "./wav";

export interface Notice { text: string; where: "bar" | "pill"; preparing?: boolean; fix?: "mic" }
interface L { src: Src | null; level: number[]; secs: number; notice: Notice | null; target: DTarget | null; label: string; anchor: { x: number; y: number } | null; partial: string }
export const useListen = create<L>(() => ({ src: null, level: [], secs: 0, notice: null, target: null, label: "", anchor: null, partial: "" }));
const set = useListen.setState;

let ctx: ExecCtx | null = null;
let cap: Promise<Capture> | null = null;
let tick: ReturnType<typeof setInterval> | undefined;
let ptick: ReturnType<typeof setInterval> | undefined;
let partialBusy = false;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let job = 0; // Esc 로 취소한 받아쓰기 결과를 버리는 표
let snap: { target: DTarget; el: HTMLElement | null; epoch: number } = { target: { kind: "bar" }, el: null, epoch: 0 };

export function say(text: string, ms: number, where: Notice["where"] = "bar", fix?: Notice["fix"]) {
  clearTimeout(noticeTimer);
  set({ notice: { text, where, fix } });
  noticeTimer = setTimeout(() => set({ notice: null }), ms);
}
const clearNotice = () => (clearTimeout(noticeTimer), set({ notice: null }));

/** 시험 밖(Tauri 가 아닐 때)에서만 가짜 마이크를 쓴다 */
const capture = (o: RecOpts & { deviceId?: string }): Promise<Capture> => {
  const fake = !isTauri() && (window as unknown as { __fakeCapture?: typeof startCapture }).__fakeCapture;
  return (fake || startCapture)(o);
};

const consoleState = (wsId: string, id: string) => {
  const s = getSession(wsId, id);
  return s ? { running: s.isRunning(), needsYou: s.status() === "NEEDS YOU", epoch: s.epoch() } : null;
};

/** S-2275: 지금 키보드가 어디 있는지 보고 받아쓰기 대상을 정한다 */
function snapshot(): void {
  const a = document.activeElement as HTMLElement | null;
  const inTerm = a?.closest(".xterm") ?? null;
  const isBar = a?.dataset.testid === "bar-input";
  const field = !!a && !inTerm && !isBar && a.matches("input, textarea, [contenteditable=''], [contenteditable='true']");
  const store = ctx ? getStore(ctx.wsId).getState() : null;
  const consoles: Record<string, { running: boolean; needsYou: boolean }> = {};
  for (const n of Object.values(store?.nodes ?? {})) if (isConsole(n)) consoles[n.id] = consoleState(ctx!.wsId, n.id) ?? { running: false, needsYou: false };
  const consoleFocus = inTerm ? (a!.closest("[data-node-id]") as HTMLElement | null)?.dataset.nodeId ?? null : null;
  const target = dictationTarget({ field, consoleFocus, selected: store?.selection ?? [], consoles });
  const el = target.kind === "field" ? a : target.kind === "console" ? document.querySelector<HTMLElement>(`[data-node-id="${target.id}"]`) : document.querySelector<HTMLElement>('[data-testid="command-bar"]');
  const r = el?.getBoundingClientRect();
  snap = { target, el: target.kind === "field" ? a : null, epoch: target.kind === "console" ? consoleState(ctx!.wsId, target.id)?.epoch ?? 0 : 0 };
  const node = target.kind === "console" ? store?.nodes[target.id] : null;
  set({ target, label: pillText(target, node && isConsole(node) ? node.name : undefined), anchor: r ? { x: r.left + r.width / 2, y: r.top } : { x: innerWidth / 2, y: innerHeight - 80 } });
}

/** S-2265·S-2279: 인식이 준비 안 됐다 → 확인창/안내. 듣기는 시작하지 않는다 */
function prepare(where: Notice["where"]) {
  const r = useVoice.getState().recog;
  const notDownloaded = () => say(t("Speech recognition isn't downloaded. Settings › Voice."), 2000, where);
  if (r.kind === "failed") return notDownloaded();
  clearTimeout(noticeTimer);
  set({ notice: { text: t("Preparing speech recognition…"), where, preparing: true } });
  void ensureReady().then((ok) => (ok ? clearNotice() : notDownloaded())).catch(notDownloaded);
}

function start(src: Src): boolean {
  if (!ctx && src !== "dict") return false;
  const where = src === "dict" ? "pill" : "bar";
  if (src === "dict") {
    snapshot();
    if (!ctx && snap.target.kind === "bar") return false; // 홈에는 명령 바가 없다
  }
  if (useVoice.getState().recog.kind !== "ready") return (prepare(where), false);
  stopSpeaking(); // 새 말은 읽던 것을 끊는다
  clearNotice();
  job++;
  const t0 = Date.now();
  set({ src, level: [], secs: 0, partial: "" });
  useVoice.setState({ phase: "listening" });
  tick = setInterval(() => set({ secs: Math.floor((Date.now() - t0) / 1000) }), 250);
  const s = useSettings.getState().s;
  if (src !== "dict") ptick = setInterval(() => void partial(job), 2000); // S-2262: 앞 받아쓰기가 끝났을 때만(느리면 건너뜀)
  cap = capture({
    deviceId: typeof s.voiceInput === "string" && s.voiceInput !== "auto" ? s.voiceInput : undefined,
    onLevel: (v) => useListen.getState().src && set((st) => ({ level: [...st.level.slice(-23), v] })),
  });
  cap.catch((e) => {
    const m = micError(e);
    ptt.abort(); // 오류는 문구로만(S-2266)
    say(m.message, 4000, where, m.kind === "denied" ? "mic" : undefined);
  });
  return true;
}

/** S-2262: 지금까지의 소리를 받아써 회색 글로 보인다 */
async function partial(me: number) {
  if (partialBusy || !cap) return;
  partialBusy = true;
  try {
    const h = await cap;
    const pcm = h.snapshot();
    if (!passesGate(pcmStats(pcm))) return;
    const st = useSettings.getState().s;
    const text = filterHallucination(await voiceTranscribe(pcmToWav(pcm), langArg(String(st.speechLanguage ?? "auto")), promptHint([], undefined, String(st.speechLanguage ?? "auto")), currentModel())).trim();
    if (me === job && useListen.getState().src) set({ partial: text });
  } catch { /* 부분 글은 있으면 좋은 것 */ } finally { partialBusy = false; }
}

async function end(src: Src, send: boolean, why: string) {
  clearInterval(tick);
  clearInterval(ptick);
  set({ partial: "" });
  const c = cap;
  cap = null;
  const me = ++job;
  set({ src: null });
  useVoice.setState({ phase: "idle" });
  if (why === "abort" || !c) return;
  const h = await c.catch(() => null);
  if (!h) return;
  const where = src === "dict" ? "pill" : "bar";
  if (!send) {
    await h.cancel();
    if (why === "limit") say(t("That was over 60 seconds — not sent."), 3000, where); // S-2264
    return;
  }
  useVoice.setState({ phase: "thinking" });
  try {
    const { pcm } = await h.stop();
    const st = useSettings.getState().s;
    const language = String(st.speechLanguage ?? "auto");
    let text: string;
    if (src === "dict") { // S-2277: 같은 파이프, snapNames 는 적용하지 않는다
      text = passesGate(pcmStats(pcm)) ? filterHallucination(await voiceTranscribe(pcmToWav(pcm), langArg(language), promptHint([], undefined, language), currentModel())).trim() : "";
    } else {
      const names = Object.values(getStore(ctx!.wsId).getState().nodes).filter(isConsole).map((n) => n.name);
      text = await transcribe(pcm, { language, names, model: currentModel() });
    }
    if (me !== job) return; // Esc 로 취소됨
    if (!text) return say(t("Didn't catch that."), 1500, where);
    if (src === "dict") deliver(dictText(text));
    else if (ctx) { pushHistory(text); submit(text, ctx); } // S-2263: 타자로 친 것과 똑같이
  } catch (e) {
    if (me === job) say(e instanceof VoiceError && e.kind === "dropped" ? t("Didn't catch that.") : t("Couldn't transcribe that."), 3000, where);
  } finally {
    if (me === job) useVoice.setState({ phase: "idle" });
  }
}

/** S-2277: 글자만 넣는다(Enter 없음). 받아쓰는 사이 대상이 바뀌었으면 명령 바(S-2275) */
function deliver(text: string) {
  if (!text) return;
  let t = snap.target;
  if (t.kind === "console") t = recheck(t, consoleState(ctx!.wsId, t.id), snap.epoch);
  if (t.kind === "console") return insertConsole(getSession(ctx!.wsId, t.id)!, text);
  const el = t.kind === "field" && snap.el?.isConnected ? snap.el : document.querySelector<HTMLElement>('[data-testid="bar-input"]');
  if (el) insertField(el, text);
}

export const ptt = new Ptt({ start, end: (s, send, why) => void end(s, send, why) });
export const setCtx = (c: ExecCtx | null) => {
  ctx = c;
  if (!c) ptt.abort();
};
export const hasCtx = () => ctx !== null;
export const micDown = () => ptt.down("mic");
export const micUp = () => ptt.up("mic");
/** Esc 가 음성에 쓰였나: 듣는 중·누르는 중·받아쓰기 중(thinking)·읽는 중이면 끊고 true */
export function cancelVoice(): boolean {
  const v = useVoice.getState();
  const was = ptt.esc() || v.phase === "thinking" || v.speaking;
  if (v.phase === "thinking") { job++; useVoice.setState({ phase: "idle" }); }
  if (v.speaking) stopSpeaking();
  return was;
}
export const voiceBusy = () => ptt.busy || useVoice.getState().phase !== "idle" || useVoice.getState().speaking;
