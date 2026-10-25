// D5 S-1415 요약문 (K7: 한국어는 문장 틀째 번역)
import { t, tm, tp } from "../i18n";
import type { Loop } from "./types";

const span = (min: number) => (min % 60 === 0 ? t("{n} h", { n: min / 60 }) : t("{n} min", { n: min }));
/** 간격 표시 S-2483: Every 10 min / Every 1 h / Every 2 h → 10분마다 / 매시간 / 2시간마다 */
export const everyText = (min: number): string => (min === 60 ? t("Every 1 h") : min % 60 === 0 ? t("Every {n} h", { n: min / 60 }) : t("Every {n} min", { n: min }));
const TARGET = { all: tm("every console on the board"), card: tm("the consoles of one orchestrator card"), pick: tm("the picked consoles") };

export function summary(l: Loop, consoleCount: number, agentName: string): string {
  const tr = l.trigger;
  const when = tr.kind === "schedule" ? everyText(tr.everyMin) : tr.kind === "idle" ? t("When an agent goes idle") : t('When "{text}" appears', { text: tr.text });
  const stops: string[] = [];
  if (l.stop.runs != null) stops.push(t("for {n} runs", { n: l.stop.runs }));
  if (l.stop.minutes != null) stops.push(t("for {span}", { span: span(l.stop.minutes) }));
  if (l.stop.goal) stops.push(l.stop.goal.mode === "command" ? t("until the command passes") : t("until {agent} judges the goal met", { agent: agentName }));
  let s = t("{when}, the instruction is sent to {target}{stops}.", { when, target: t(TARGET[l.target.kind]), stops: stops.length ? t(", {stops}", { stops: stops.join(t(" or ")) }) : "" });
  if (tr.kind === "schedule") {
    const n = (60 / tr.everyMin) * consoleCount;
    const rate = tr.everyMin > 60 ? String(Math.round(n * 10) / 10) : String(Math.round(n));
    s += " " + tp("≈ {rate} prompts/hour across {n} console", "≈ {rate} prompts/hour across {n} consoles", consoleCount, { rate });
  }
  return s;
}
