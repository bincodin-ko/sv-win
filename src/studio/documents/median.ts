// E6 S-1973: 노력 칩의 시간 중앙값 = 선택한 에이전트·노력으로 끝낸(complete) 최근 5번
import { t } from "../../i18n";
import type { DocMeta } from "../../lib/ipc";

export function medianMs(versions: DocMeta[], agent: string, effort: string): number | null {
  const d = versions
    .filter((v) => v.status === "complete" && v.agent === agent && v.effort === effort && v.durationMs > 0)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 5)
    .map((v) => v.durationMs)
    .sort((a, b) => a - b);
  if (!d.length) return null;
  const m = d.length >> 1;
  return d.length % 2 ? d[m]! : (d[m - 1]! + d[m]!) / 2;
}
export function fmtMedian(ms: number | null): string {
  if (ms === null) return t("not timed");
  const s = Math.round(ms / 1000);
  if (s < 60) return `~${s}s`;
  return s % 60 ? `~${Math.floor(s / 60)}m ${s % 60}s` : `~${s / 60}m`;
}
