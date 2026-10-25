// S-360·S-363
import { useSettings } from "../useSettings";
import { useT } from "../../i18n";

export const TEXT_SIZES = [85, 100, 115, 130, 150, 175, 200];
const THEMES = [["og", "OG"], ["light", "Light"], ["system", "Match system"]] as const;

export default function Appearance() {
  const t = useT();
  const theme = useSettings((s) => s.s.theme);
  const size = Number(useSettings((s) => s.s.textSize));
  const lowSpec = useSettings((s) => s.s.lowSpec === true);
  const patch = useSettings.getState().patch;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <fieldset style={{ border: 0, padding: 0, display: "grid", gap: 8 }}>
        <legend style={{ marginBottom: 8 }}>{t("Theme")}</legend>
        {THEMES.map(([v, label]) => (
          <label key={v} style={{ display: "flex", gap: 8 }}>
            <input type="radio" name="theme" checked={theme === v} onChange={() => patch({ theme: v })} />
            {v === "system" ? t(label) : label}
          </label>
        ))}
      </fieldset>
      <label style={{ display: "grid", gap: 4, maxWidth: 200 }}>{t("Terminal text size")}
        <select value={size} onChange={(e) => patch({ textSize: Number(e.target.value) })}>
          {TEXT_SIZES.map((p) => <option key={p} value={p}>{p}%</option>)}
        </select>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" role="switch" data-testid="set-lowspec" checked={lowSpec} onChange={(e) => patch({ lowSpec: e.target.checked })} />
        <span>{t("Low-spec mode")}<br /><small>{t("Turns off animations, shadows and the dot grid, batches terminal output and keeps less scrollback. Everything still works.")}</small></span>
      </label>
    </div>
  );
}
