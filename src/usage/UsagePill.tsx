// D10 S-1510: 상단 바의 usage pill. 확인 전 "usage", 뒤에는 CLI 배지 + 가장 빠른 다음 리셋
import type { CSSProperties } from "react";
import { useT } from "../i18n";
import { chipStyle } from "../shell/Menu";
import { useUi } from "../ui/useUi";
import type { UsageResult } from "./probe";
import { leftText, levelOf, parseReset, type Level } from "./reset";
import { LEVEL_COLOR } from "./parts";
import { useUsage } from "./useUsage";

/** 지금 이후 가장 빠른 리셋과 모든 창 중 가장 높은 단계. 순수 함수 */
export function summarize(results: Record<string, UsageResult>, now: number): { next: { agent: string; text: string; at: number } | null; level: Level } {
  let next: { at: number; agent: string; text: string } | null = null;
  let max = 0;
  for (const r of Object.values(results)) {
    if (r.state !== "ok") continue;
    for (const w of r.parsed?.windows ?? []) {
      max = Math.max(max, w.pct);
      const t = w.resetText ? parseReset(w.resetText, new Date(r.at))?.getTime() : undefined;
      if (t && t > now && (!next || t < next.at)) next = { at: t, agent: r.agent, text: w.resetText! };
    }
  }
  return { next: next && { agent: next.agent, text: next.text, at: next.at }, level: levelOf(max) };
}

const inner: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6 };
export default function UsagePill() {
  const t = useT();
  const results = useUsage((s) => s.results);
  const open = useUi((s) => s.usage.open);
  const { next, level } = summarize(results, Date.now());
  return (
    <button data-testid="usage-pill" title={next ? leftText(next.at - Date.now()) : undefined} aria-expanded={open} onClick={() => (open ? useUi.getState().closeUsage() : useUi.getState().openUsage())} style={chipStyle}>
      <span style={inner}>
        {next ? <span data-testid="usage-pill-badge" style={{ width: 16, height: 16, borderRadius: 4, background: "var(--accent)", color: "var(--accent-text)", font: "600 10px/16px system-ui", textAlign: "center" }}>{next.agent[0]!.toUpperCase()}</span> : <span aria-hidden>◔</span>}
        <span data-testid="usage-pill-text">{next ? t("resets {text}", { text: next.text }) : t("usage")}</span>
        {level !== "ok" && <span data-testid="usage-pill-dot" data-level={level} style={{ width: 7, height: 7, borderRadius: "50%", background: LEVEL_COLOR[level] }} />}
      </span>
    </button>
  );
}
