// S-2275·S-2276 받아쓰기 대상
import { t } from "../i18n";
export interface ConsoleState { running: boolean; needsYou: boolean }
export interface TargetIn { field: boolean; consoleFocus: string | null; selected: string[]; consoles: Record<string, ConsoleState> }
export type DTarget = { kind: "field" } | { kind: "console"; id: string } | { kind: "bar" };
const BAR: DTarget = { kind: "bar" };
const usable = (c?: ConsoleState) => !!c && c.running && !c.needsYou; // 끝났거나 권한·질문 프롬프트(NEEDS YOU)면 명령 바

/** ① 입력란 ② 키보드를 가진 콘솔 ③ 선택된 실행 중 콘솔 하나 ④ 명령 바 */
export function dictationTarget(i: TargetIn): DTarget {
  if (i.field) return { kind: "field" };
  const id = i.consoleFocus ?? (i.selected.length === 1 ? i.selected[0]! : null);
  return id && usable(i.consoles[id]) ? { kind: "console", id } : BAR;
}
/** 받아쓰는 사이 바뀐 것을 다시 본다: 콘솔이 끝났거나 NEEDS YOU 거나 다시 시작(epoch 달라짐)이면 명령 바 */
export const recheck = (t: DTarget, now: (ConsoleState & { epoch: number }) | null, epoch: number): DTarget =>
  t.kind !== "console" ? t : now && usable(now) && now.epoch === epoch ? t : BAR;
export const pillText = (d: DTarget, name?: string): string =>
  t("Dictating → {name}", { name: d.kind === "console" ? name ?? t("console") : d.kind === "bar" ? t("command bar") : t("text field") });
