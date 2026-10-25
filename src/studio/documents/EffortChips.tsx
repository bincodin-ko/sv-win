// E6 S-1973: 노력 칩 3개 — 이름 + 선택한 에이전트로 끝낸 최근 5번의 중앙값("~2m 10s", 없으면 "not timed")
import { tm, useT } from "../../i18n";
import type { DocMeta } from "../../lib/ipc";
import type { Effort } from "../run";
import { fmtMedian, medianMs } from "./median";

const CHIPS: { id: Effort; label: string; tip: string }[] = [
  { id: "quick", label: tm("Quick"), tip: tm("Fast and short") },
  { id: "balanced", label: tm("Balanced"), tip: tm("The default") },
  { id: "thorough", label: tm("Thorough"), tip: tm("Slowest, longest and most careful") },
];

export default function EffortChips({ agent, effort, versions, onPick }: { agent: string; effort: Effort; versions: DocMeta[]; onPick: (e: Effort) => void }) {
  const t = useT();
  return (
    <div data-testid="doc-efforts" style={{ display: "flex", gap: 6, padding: "0 12px 12px" }}>
      {CHIPS.map((c) => {
        const on = c.id === effort;
        return (
          <button key={c.id} data-testid={`doc-effort-${c.id}`} aria-pressed={on} title={t(c.tip)} onClick={() => onPick(c.id)}
            style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: `1px solid ${on ? "var(--accent)" : "var(--studio-line)"}`, background: on ? "var(--studio-sel)" : "transparent", color: "var(--text)", font: "12px system-ui", cursor: "pointer", display: "grid", gap: 2 }}>
            <span style={{ fontWeight: 600 }}>{t(c.label)}</span>
            <span data-testid={`doc-effort-time-${c.id}`} style={{ fontSize: 11, color: "var(--text-dim)" }}>{fmtMedian(medianMs(versions, agent, c.id))}</span>
          </button>
        );
      })}
    </div>
  );
}
