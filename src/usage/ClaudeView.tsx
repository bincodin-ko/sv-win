// D10 S-1513·S-1514: Claude 해석 뷰
import { useT } from "../i18n";
import type { Parsed } from "./parse";
import { Bar, Gauge, Heat, Stat, compact, useStats } from "./parts";

export default function ClaudeView({ parsed, at }: { parsed: Parsed; at: number }) {
  const t = useT();
  const st = useStats("claude", at);
  const [first, ...rest] = parsed.windows;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {first && <Gauge w={first} />}
      {rest.map((w) => <Bar key={w.label} w={w} />)}
      {st && st.heat.length > 0 && <Heat cells={st.heat} tone="claude" />}
      {st && (
        <div style={{ display: "grid", gap: 4 }}>
          <Stat k={t("Favorite model")} v={st.favoriteModel ?? "—"} />
          <Stat k={t("Total tokens")} v={compact(st.totalTokens)} />
          <Stat k={t("Sessions")} v={String(st.sessions)} />
          <Stat k={t("Active days")} v={`${st.activeDays}/${st.spanDays}`} />
          <Stat k={t("Most active day")} v={st.mostActiveDay ?? "—"} />
          <Stat k={t("Longest streak")} v={t("{n}d", { n: st.longestStreak })} />
        </div>
      )}
    </div>
  );
}
