// S-354·S-355: 이름(1~80자, 이 PC 에만 저장) + 이니셜 아바타(8색). 색 값은 추측(4B).
import { useSettings } from "../useSettings";
import { useT } from "../../i18n";

export const AVATAR_COLORS = ["#f97316", "#ef4444", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"]; // theme-fixed
export const initials = (name: string): string => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0]![0]! + w[1]![0]! : (w[0] ?? "").slice(0, 1)).toUpperCase();
};

export default function Account() {
  const t = useT();
  const name = useSettings((s) => String(s.s.profileName ?? ""));
  const color = Number(useSettings((s) => s.s.avatarColor) ?? 0);
  const patch = useSettings.getState().patch;
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 420 }}>
      <label style={{ display: "grid", gap: 4 }}>{t("Name")}
        <input value={name} maxLength={80} onChange={(e) => patch({ profileName: e.target.value })} />
        <small style={{ color: "var(--text-dim)" }}>{t("Saved on this PC only.")}</small>
      </label>
      <div>
        <div style={{ marginBottom: 6 }}>{t("Avatar")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div data-testid="avatar" style={{ width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 600, color: "var(--accent-text)", background: AVATAR_COLORS[color] ?? AVATAR_COLORS[0] }}>
            {initials(name) || "?"}
          </div>
          <div role="radiogroup" aria-label={t("Avatar color")} style={{ display: "flex", gap: 6 }}>
            {AVATAR_COLORS.map((c, i) => (
              <button key={c} role="radio" aria-checked={i === color} aria-label={t("Color {n}", { n: i + 1 })} onClick={() => patch({ avatarColor: i })}
                style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: i === color ? "2px solid var(--text)" : "2px solid transparent", padding: 0 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
