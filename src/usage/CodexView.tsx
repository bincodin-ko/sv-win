// D10 S-1515: Codex 해석 뷰
import { useT } from "../i18n";
import type { Parsed } from "./parse";
import { Bar, Heat, Stat, compact, duration, useStats } from "./parts";

export default function CodexView({ parsed, at }: { parsed: Parsed; at: number }) {
  const t = useT();
  const st = useStats("codex", at);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {parsed.windows.map((w) => <Bar key={w.label} w={w} showUsed />)}
      {st && st.heat.length > 0 && <Heat cells={st.heat} tone="codex" />}
      {st && (
        <div style={{ display: "grid", gap: 4 }}>
          <Stat k={t("Lifetime")} v={compact(st.lifetime)} />
          <Stat k={t("Peak")} v={compact(st.peak)} />
          <Stat k={t("Streak (best)")} v={`${st.streakCurrent} (${st.streakBest})`} />
          <Stat k={t("Longest task")} v={duration(st.longestTaskSecs)} />
        </div>
      )}
      <div data-testid="usage-cmdlabel" style={{ color: "var(--text-dim)", font: "11px ui-monospace, Consolas, monospace" }}>/status /usage</div>
    </div>
  );
}
