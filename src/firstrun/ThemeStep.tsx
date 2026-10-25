// S-392: ① How should Symvibe look? — OG / Light / Match system. 고르면 즉시 적용(설정 patch → main.tsx 가 applyTheme)
import { useSettings } from "../settings/useSettings";
import { tm, useT } from "../i18n";

const THEMES = [["og", "OG"], ["light", "Light"], ["system", tm("Match system")]] as const;

export default function ThemeStep() {
  const t = useT();
  const theme = useSettings((s) => s.s.theme);
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
      <legend style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{t("How should Symvibe look?")}</legend>
      {THEMES.map(([v, label]) => (
        <label key={v} style={{ display: "flex", gap: 8 }}>
          <input type="radio" name="fr-theme" checked={theme === v} onChange={() => useSettings.getState().patch({ theme: v })} />
          {t(label)}
        </label>
      ))}
    </fieldset>
  );
}
