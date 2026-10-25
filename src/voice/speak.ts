// S-2234·S-2236: window.speechSynthesis 로 읽기(로컬 음성만 — 온라인 음성은 소리를 밖으로 보낸다)
import { getLang, type Lang } from "../i18n";
import { useThread } from "../commandbar/thread";
import { useSettings } from "../settings/useSettings";
import { speakable } from "./speakable";

const synth = (): SpeechSynthesis | undefined => (typeof speechSynthesis === "undefined" ? undefined : speechSynthesis);
const isKo = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith("ko");
const isEn = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith("en");

/** "auto" = 기본 음성이 화면 언어(en|ko) 로컬이면 그것, ko 는 Heami, 아니면 그 언어 로컬 첫째. 이름이 맞으면 그 로컬 음성. 해당 로컬이 없으면 null(다른 언어로 대체 안 함, S-2452) */
export function pickVoice(voices: SpeechSynthesisVoice[], name: string, lang: Lang = "en"): SpeechSynthesisVoice | null {
  const local = voices.filter((v) => v.localService);
  const is = lang === "ko" ? isKo : isEn;
  return (name !== "auto" && local.find((v) => v.name === name)) || local.find((v) => v.default && is(v)) || (lang === "ko" && local.find((v) => isKo(v) && /heami/i.test(v.name))) || local.find(is) || null;
}
/** 설정 창의 "No local voice found" 판단용 */
export const hasLocalVoice = (lang: Lang = "en"): boolean => !!synth()?.getVoices().some((v) => v.localService && (lang !== "ko" || isKo(v))); // en: 로컬 음성이면 아무거나(지금 규칙)

const subs = new Set<(s: boolean) => void>();
const emit = (s: boolean) => subs.forEach((f) => f(s));
let cur: SpeechSynthesisUtterance | null = null;

/** 읽는 중 여부가 바뀔 때 알린다(orb 용, F3 이 useVoice.speaking 에 잇는다). 해제 함수를 돌려준다 */
export function onSpeaking(cb: (speaking: boolean) => void): () => void {
  subs.add(cb);
  return () => void subs.delete(cb);
}
export function stopSpeaking(): void {
  synth()?.cancel();
  if (cur) (cur = null, emit(false));
}
/** 새 말은 앞 말을 끊는다. speakReplies 꺼짐·로컬 음성 없음이면 조용히 아무것도 안 한다 */
export function speak(text: string): void {
  const s = synth();
  const set = useSettings.getState().get();
  if (!s || set.speakReplies === false || !text) return;
  const voice = pickVoice(s.getVoices(), typeof set.voiceName === "string" ? set.voiceName : "auto", getLang());
  if (!voice) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 200));
  u.voice = voice;
  const done = () => cur === u && (cur = null, emit(false)); // 끊긴 앞 말의 신호는 무시
  u.onend = done;
  u.onerror = done;
  cur = u;
  emit(true);
  s.speak(u);
}

/** 앱을 켠 뒤(startedAt 이후) Thread 에 새로 생긴 메시지만 읽는다. 불러온 지난 Thread 는 at 이 더 이르다 */
export function watchReplies(startedAt = Date.now()): () => void {
  const seen = new Set<string>();
  return useThread.subscribe((st) => {
    for (const ms of Object.values(st.byRepo))
      for (const m of ms) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        const t = m.at >= startedAt ? speakable(m) : null;
        if (t) speak(t);
      }
  });
}
