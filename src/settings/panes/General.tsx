// S-356·S-357 + D10 S-1530(리셋 chime 세 줄)
import { SOUND_NAMES, playSound } from "../../usage/chime";
import { useSettings } from "../useSettings";
import { useLang, useT } from "../../i18n";

function Check({ k, label }: { k: "reopenLastRepo" | "resumeAgentChats" | "usageChime"; label: string }) {
  const on = useSettings((s) => s.s[k] !== false);
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input type="checkbox" checked={on} onChange={(e) => useSettings.getState().patch({ [k]: e.target.checked })} />
      {label}
    </label>
  );
}
export default function General() {
  const t = useT();
  const lang = useLang();
  const play = useSettings((s) => (s.s.chimePlay === "always" ? "always" : "only100"));
  const sound = useSettings((s) => (typeof s.s.chimeSound === "string" ? s.s.chimeSound : "Glass"));
  const patch = useSettings.getState().patch;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Check k="reopenLastRepo" label={t("Reopen last repo on launch")} />
      <Check k="resumeAgentChats" label={t("Resume agent chats")} />
      <Check k="usageChime" label={t("Chime when usage resets")} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 24 }}>
        {t("Play")}
        <select data-testid="chime-play" value={play} onChange={(e) => patch({ chimePlay: e.target.value })}>
          <option value="only100">{t("Only after 100%")}</option>
          <option value="always">{t("Always")}</option>
        </select>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 24 }}>
        {t("Sound")}
        <select data-testid="chime-sound" value={sound} onChange={(e) => patch({ chimeSound: e.target.value })}>
          {SOUND_NAMES.map((n) => <option key={n}>{n}</option>)}
        </select>
        <button data-testid="chime-preview" onClick={() => playSound(sound)}>{t("Preview")}</button>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {t("Language")}
        <select data-testid="set-language" value={lang} onChange={(e) => patch({ language: e.target.value })}>
          <option value="en">English</option>
          <option value="ko">한국어</option>
        </select>
      </label>
    </div>
  );
}
