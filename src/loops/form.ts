// D9 S-1453·S-1454 폼 순수 함수: 입력 보정·검증·템플릿 채우기·오류 문구
import { t, tm } from "../i18n";
import { TEMPLATES, type Template } from "./templates";
import { DEFAULT_EVERY, outputTextOk, type Loop, type StopRule, type Target, type Trigger } from "./types";

export type Draft = {
  name: string; template: string | null; instruction: string;
  kind: Trigger["kind"]; everyMin: number; outputText: string;
  target: Target;
  runsOn: boolean; runs: number; minutesOn: boolean; minutes: number;
  goalOn: boolean; goalMode: "command" | "agent"; goalText: string; goalAgent: string;
  keepBehind: boolean;
};
export const OUTPUT_ERROR = tm("At least two characters"); // outputError 가 화면 언어로 돌려준다

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));

export const emptyDraft = (): Draft => ({
  name: "", template: null, instruction: "", kind: "schedule", everyMin: DEFAULT_EVERY, outputText: "", target: { kind: "all" },
  runsOn: false, runs: 10, minutesOn: false, minutes: 60, goalOn: false, goalMode: "command", goalText: "", goalAgent: "claude", keepBehind: true,
});
export const fromTemplate = (tpl: Template): Draft => ({
  ...emptyDraft(), name: t(tpl.name), template: tpl.name, instruction: t(tpl.instruction), kind: tpl.trigger.kind, // template 은 영어 이름(칩 켜짐 비교용), 이름·지시는 화면 언어
  ...(tpl.trigger.kind === "schedule" ? { everyMin: tpl.trigger.everyMin } : {}),
  ...(tpl.trigger.kind === "output" ? { outputText: tpl.trigger.text } : {}),
});
export const fromLoop = (l: Loop): Draft => {
  const g = l.stop.goal;
  return {
    ...emptyDraft(), name: l.name, instruction: l.instruction, kind: l.trigger.kind, target: l.target, keepBehind: l.keepBehind,
    ...(l.trigger.kind === "schedule" ? { everyMin: l.trigger.everyMin } : {}),
    ...(l.trigger.kind === "output" ? { outputText: l.trigger.text } : {}),
    ...(l.stop.runs != null ? { runsOn: true, runs: l.stop.runs } : {}),
    ...(l.stop.minutes != null ? { minutesOn: true, minutes: l.stop.minutes } : {}),
    ...(g ? { goalOn: true, goalMode: g.mode, goalText: g.text, goalAgent: g.agent ?? "claude" } : {}),
  };
};
export const outputError = (d: Draft): string | null => (d.kind === "output" && !outputTextOk(d.outputText) ? t(OUTPUT_ERROR) : null);
export const canCreate = (d: Draft): boolean => d.instruction.trim() !== "" && !outputError(d) && !(d.goalOn && d.goalText.trim() === "");
/** 범위 밖 값은 가까운 값으로 고치고 알림 문구를 돌려준다. 켜지 않은 칸은 건드리지 않는다 */
export function fixRanges(d: Draft): { draft: Draft; notes: string[] } {
  const draft = { ...d };
  const notes: string[] = [];
  const fix = (on: boolean, key: "everyMin" | "runs" | "minutes", lo: number, hi: number, msg: string) => {
    if (!on) return;
    const v = clamp(draft[key], lo, hi);
    if (v !== draft[key]) notes.push(t(msg, { v, lo, hi }));
    draft[key] = v;
  };
  fix(d.kind === "schedule", "everyMin", 1, 1440, tm("Interval set to {v} min (allowed {lo}–{hi} min)"));
  fix(d.runsOn, "runs", 1, 200, tm("Runs set to {v} (allowed {lo}–{hi})"));
  fix(d.minutesOn, "minutes", 15, 1440, tm("Time limit set to {v} min (allowed {lo}–{hi} min)"));
  return { draft, notes };
}
export const loopName = (d: Draft, n: number): string => d.name.trim() || d.template || t("Loop {n}", { n });
export function toLoop(d0: Draft, ctx: { wsId: string; repo: string; n: number }): Omit<Loop, "id" | "enabled"> {
  const d = fixRanges(d0).draft;
  const trigger: Trigger = d.kind === "schedule" ? { kind: "schedule", everyMin: d.everyMin } : d.kind === "idle" ? { kind: "idle" } : { kind: "output", text: d.outputText.trim() };
  const stop: StopRule = {};
  if (d.runsOn) stop.runs = d.runs;
  if (d.minutesOn) stop.minutes = d.minutes;
  if (d.goalOn) stop.goal = d.goalMode === "agent" ? { mode: "agent", text: d.goalText.trim(), agent: d.goalAgent } : { mode: "command", text: d.goalText.trim() };
  return { name: loopName(d, ctx.n), instruction: d.instruction.trim(), trigger, target: d.target, stop, keepBehind: d.keepBehind, wsId: ctx.wsId, repo: ctx.repo };
}
export { TEMPLATES };
