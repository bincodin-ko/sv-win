// S-2290·S-2291: Settings › Voice. Cached audio·Intelligence 줄은 없다. 창을 열 때 마이크 권한을 묻지 않는다(이름이 안 보이면 Allow microphone)
import { useEffect, useState } from "react";
import { getLang, useT } from "../../i18n";
import { fsReveal, voiceFolder } from "../../lib/ipc";
import { DICT_KEYS, DICT_NAME, dictKey } from "../../voice/dictate";
import { LANGUAGES, languageLabel } from "../../voice/languages";
import { listInputs, micState, requestMic, type MicInput } from "../../voice/mic";
import { cancelPiper, piperLine, refreshPiper, startPiper, usePiper, type PiperLang } from "../../voice/piper";
import { hasLocalVoice, pickVoice, speak } from "../../voice/speak";
import { refreshVoice, retry, startAndWait, useVoice } from "../../voice/status";
import { useSettings } from "../useSettings";
import { recogButton, recogLabel } from "./voiceLabels";

const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 };

/** Q1 S-3101·S-3108: 화면 언어(ko/en) 하나의 Piper 상태·단추·모델 라이선스·마지막 실패 */
function PiperRows({ lang }: { lang: PiperLang }) {
  const t = useT();
  const status = usePiper((x) => x.status);
  const busy = usePiper((x) => x.busy);
  const fail = usePiper((x) => x.lastPiperFail);
  useEffect(() => void refreshPiper().catch(() => {}), []);
  const line = status ? piperLine(status, lang) : { kind: "none" as const, pct: undefined, why: undefined };
  const kind = busy && line.kind === "none" ? "downloading" : line.kind; // 파일 사이 틈
  useEffect(() => {
    if (kind !== "downloading" || busy) return; // 순서가 도는 중이면 그쪽이 읽는다. 창을 다시 열었을 때만 직접 읽음
    const i = setInterval(() => void refreshPiper().catch(() => {}), 500);
    return () => clearInterval(i);
  }, [kind, busy]);
  const label = kind === "ready" ? t("Ready") : kind === "downloading" ? t("Downloading… {pct}%", { pct: line.pct ?? 0 }) : kind === "failed" ? t("Failed: {why}", { why: line.why ?? t("unknown") }) : t("Not downloaded");
  const small: React.CSSProperties = { color: "var(--mute)", fontSize: 12 };
  return (
    <div style={{ display: "grid", gap: 6, paddingLeft: 24 }}>
      <div style={row}>
        <span data-testid="voice-piper-state" style={{ color: "var(--text-dim)" }}>{label}</span>
        <span style={{ display: "flex", gap: 8 }}>
          {kind === "none" && <button data-testid="voice-piper-dl" onClick={() => void startPiper(lang)}>{t("Download Piper voice (~85 MB)")}</button>}
          {kind === "downloading" && <button data-testid="voice-piper-cancel" onClick={() => void cancelPiper(lang)}>{t("Cancel")}</button>}
          {kind === "failed" && <button data-testid="voice-piper-retry" onClick={() => void startPiper(lang)}>{t("Retry")}</button>}
          {kind === "ready" && <button data-testid="voice-piper-test" onClick={() => speak(t("This is the voice I'll use."))}>{t("Test")}</button>}
        </span>
      </div>
      <span data-testid="voice-piper-license" style={small}>{lang === "ko" ? t("Korean voice: KSS dataset, CC BY-NC-SA 4.0 (non-commercial)") : t("English voice: LJ Speech, public domain")}</span>
      {fail && <span data-testid="voice-piper-fail" style={small}>{t("Last Piper try failed: {reason} — used the Windows voice", { reason: fail })}</span>}
    </div>
  );
}

export default function Voice() {
  const t = useT();
  const lang = getLang();
  const s = useSettings((x) => x.s);
  const recog = useVoice((x) => x.recog);
  const [inputs, setInputs] = useState<MicInput[]>([]);
  const [allowed, setAllowed] = useState(true);
  const [voices, setVoices] = useState<string[]>([]);
  const patch = useSettings.getState().patch;
  const model = s.speechModel === "base" ? "base" : "small";
  const engine = s.ttsEngine === "piper" ? "piper" : "windows"; // 12묶음 Q1: 키는 읽는 곳에서 기본값(useSettings 기본 목록엔 없음)
  const loadInputs = () => void Promise.all([listInputs(), micState()]).then(([l, st]) => (setInputs(l), setAllowed(st === "granted")));
  useEffect(() => {
    loadInputs();
    const sy = typeof speechSynthesis === "undefined" ? undefined : speechSynthesis;
    const vs = () => setVoices((sy?.getVoices() ?? []).filter((v) => v.localService && v.lang.toLowerCase().startsWith(lang)).map((v) => v.name)); // S-2453: 화면 언어의 로컬 음성만
    vs();
    sy?.addEventListener?.("voiceschanged", vs);
    return () => sy?.removeEventListener?.("voiceschanged", vs);
  }, [lang]);
  useEffect(() => void refreshVoice(model).catch(() => {}), [model]);
  const btn = recogButton(recog);
  const check = (k: string, label: string, id: string) => (
    <label style={row}>{label}
      <input data-testid={id} type="checkbox" checked={s[k] !== false} onChange={(e) => patch({ [k]: e.target.checked })} />
    </label>
  );
  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 460 }}>
      <label style={row}>{t("Input device")}
        <span style={{ display: "flex", gap: 8 }}>
          {!allowed && <button data-testid="voice-allow" onClick={() => void requestMic().then(loadInputs)}>{t("Allow microphone")}</button>}
          <select data-testid="voice-input" value={String(s.voiceInput ?? "auto")} onChange={(e) => patch({ voiceInput: e.target.value })}>
            <option value="auto">{t("Automatic")}</option>
            {inputs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </span>
      </label>
      <label style={row}>{t("Speech language")}
        <select data-testid="voice-lang" value={String(s.speechLanguage ?? "auto")} onChange={(e) => patch({ speechLanguage: e.target.value })}>
          <option value="auto">{languageLabel("auto")}</option>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{languageLabel(l.code)}</option>)}
        </select>
      </label>
      <label style={row}>{t("Speech model")}
        <select data-testid="voice-model" value={model} onChange={(e) => patch({ speechModel: e.target.value })}>
          <option value="small">{t("Small")}</option>
          <option value="base">{t("Base")}</option>
        </select>
      </label>
      <div style={row}>{t("Recognition")}
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span data-testid="voice-recog" style={{ color: "var(--text-dim)" }}>{recogLabel(recog)}</span>
          <button data-testid="voice-folder" onClick={() => void voiceFolder().then(fsReveal).catch(() => {})}>{t("Open folder")}</button>
          {btn && <button data-testid="voice-action" onClick={() => void (btn === "Retry" ? retry(model) : startAndWait(model))}>{t(btn)}</button>}
        </span>
      </div>
      {check("holdSpace", t("Hold Space to talk"), "voice-holdspace")}
      <label style={row}>{t("Hold to dictate")}
        <select data-testid="voice-dictkey" value={dictKey(s.dictateKey)} onChange={(e) => patch({ dictateKey: e.target.value })}>
          {DICT_KEYS.map((k) => <option key={k} value={k}>{k === "CtrlSpace" ? t("Ctrl+Space (default)") : DICT_NAME[k]}</option>)}
        </select>
      </label>
      <span style={{ color: "var(--mute)", fontSize: 12 }}>{t("On some Korean keyboards Right Ctrl and Right Alt are the Hanja/Han-Eng keys and may not work.")}</span>
      {check("speakReplies", t("Confirm commands out loud"), "voice-speak")}
      <label style={row}>{t("Speaking engine")}
        <select data-testid="voice-tts-engine" value={engine} onChange={(e) => patch({ ttsEngine: e.target.value })}>
          <option value="windows">{t("Windows built-in")}</option>
          <option value="piper">{t("Piper (natural, offline)")}</option>
        </select>
      </label>
      {engine === "piper" && s.speakReplies !== false && <PiperRows lang={lang} />}
      {engine === "windows" && s.speakReplies !== false && (hasLocalVoice(lang) ? (
        <div style={{ ...row, paddingLeft: 24 }}>
          <select data-testid="voice-voice" value={String(s.voiceName ?? "auto")} onChange={(e) => patch({ voiceName: e.target.value })}>
            <option value="auto">{t("Automatic voice")}</option>
            {voices.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button data-testid="voice-test" disabled={!pickVoice(speechSynthesis.getVoices(), String(s.voiceName ?? "auto"), lang)} onClick={() => speak(t("This is the voice I'll use."))}>{t("Test")}</button>
        </div>
      ) : <span data-testid="voice-novoice" style={{ paddingLeft: 24, color: "var(--text-dim)", fontSize: 13 }}>{t("No local voice found")}</span>)}
    </div>
  );
}
