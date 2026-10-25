// S-390·S-391·S-400·S-2232: 첫 실행 카드의 단계 상태기계와 "카드를 띄울까" 판정 (순수).
import { t } from "../i18n";
export type Step = 1 | 2 | 3;
export type Gate = "show" | "mark-done" | "hide";

export const header = (s: Step): string => t("Step {s} of 3", { s });
export const next = (s: Step): Step => (s < 3 ? ((s + 1) as Step) : 3);
export const back = (s: Step): Step => (s > 1 ? ((s - 1) as Step) : 1);
/** repo 없음 + 아직 안 함 → 카드. repo 있음 + 아직 안 함 → 조용히 true(기존 사용자). 끝냈으면 안 뜸 */
export function shouldShow(settings: { firstRunDone?: unknown }, repoCount: number): Gate {
  if (settings.firstRunDone === true) return "hide";
  return repoCount === 0 ? "show" : "mark-done";
}
