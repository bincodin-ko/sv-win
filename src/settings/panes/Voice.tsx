// S-2290·S-2291: Settings › Voice. Cached audio·Intelligence 줄은 없다. 창을 열 때 마이크 권한을 묻지 않는다(이름이 안 보이면 Allow microphone)
import { useEffect, useState } from "react";
import { getLang, useT } from "../../i18n";
import { fsReveal, voiceFolder } from "../../lib/ipc";
import { DICT_KEYS, DICT_NAME, dictKey } from "../../voice/dictate";
import { LANGUAGES, languageLabel } from "../../voice/languages";
import { listInputs, micState, requestMic, type MicInput } from "../../voice/mic";
import { hasLocalVoice, pickVoice, speak } from "../../voice/speak";
import { refreshVoice, retry, startAndWait, useVoice } from "../../voice/status";
import { useSettings } from "../useSettings";
import { recogButton, recogLabel } from "./voiceLabels";

const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 };

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
      {s.speakReplies !== false && (hasLocalVoice(lang) ? (
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
