// S-612~S-614·S-617: 답 문구. 전부 추측 문구라 한 곳에 모아 둔다.
import { t, tm, tp } from "../i18n";
import { fmtDuration, type Order } from "./report";

export type Row = { name: string; status: string; needsYou: boolean };
const LABELS = ["working", "needs you", "paused", "starting", "ready", "stopped"] as const;
const labelOf = (r: Row): (typeof LABELS)[number] =>
  r.needsYou ? "needs you" : r.status === "WORKING" ? "working" : r.status === "PAUSED" ? "paused" : r.status === "STARTING" ? "starting" : r.status === "DONE" || r.status === "ERROR" ? "stopped" : "ready";

const labelText = (label: (typeof LABELS)[number], n: number): string =>
  label === "working" ? t("{n} working", { n }) : label === "paused" ? t("{n} paused", { n }) : label === "starting" ? t("{n} starting", { n })
    : label === "ready" ? t("{n} ready", { n }) : t("{n} stopped", { n });

/** "5 consoles: 2 working, 1 needs you (Otto), 2 ready" */
export function statusText(rows: Row[]): string {
  if (!rows.length) return t("No consoles yet.");
  const parts = LABELS.flatMap((label) => {
    const hit = rows.filter((r) => labelOf(r) === label);
    if (!hit.length) return [];
    return [label === "needs you" ? t("{n} needs you ({names})", { n: hit.length, names: hit.map((r) => r.name).join(", ") }) : labelText(label, hit.length)];
  });
  return `${tp("{n} console", "{n} consoles", rows.length)}: ${parts.join(", ")}`;
}

/** 가장 최근 주문 기준 목록(최신이 위). needsYou = 지금 도움이 필요한 콘솔 이름 */
export function whoFinishedText(orders: Order[], needsYou: string[], now: number): string {
  const lines = orders.slice(0, 8).map((o) => {
    const v = o.verdict;
    return v.state === "finished" ? t("{name} finished · {d}", { name: o.name, d: fmtDuration(v.secs) })
      : v.state === "failed" ? t("{name} failed: {reason}", { name: o.name, reason: t(v.reason) })
      : v.state === "expired" ? t("{name} didn't answer in 30 minutes", { name: o.name })
      : t("{name} is still working · {d}", { name: o.name, d: fmtDuration((now - o.sentAt) / 1000) });
  });
  needsYou.forEach((n) => lines.push(t("{name} needs you", { name: n })));
  return lines.length ? lines.join("\n") : t("No orders yet.");
}

const HELP_LINES = [
  tm("Here is what I can do:"),
  tm("• spawn 3 claude · make a group of two codex"),
  tm("• @Otto run the tests · broadcast <text>"),
  tm("• pause / resume · close Otto · restart Otto"),
  tm("• status · who finished"),
  tm("• zoom in / zoom out / show me everything · go to Otto"),
  tm("• new workspace called QA · go to workspace 2"),
  tm("• light mode / dark mode · undo / redo"),
  tm("• tidy up · arrange the board"),
  tm("• commit and push · push · pull · commit with the message fix login"),
  tm("• add a note that says ship it · add a kanban · add a calendar · add a checklist"),
  tm("• open localhost 3000 · eraser · I want to draw"),
  tm("• add an orchestrator for group 1 · connect group 1 to the orchestrator"),
  tm("• open memory · open loops · open mission map · open usage · close that"),
  tm("• open documents · open code · open markdown · open skills"),
  tm("• every 10 minutes run the tests · every hour check the build"),
  tm("• pass this task to codex · when group 1 finishes pass everything to group 2"),
  tm("• anything else — the planner reads it (Settings > Planner)"),
];
/** 영어 기본 문구(시험이 읽는다). 화면에는 helpText() */
export const HELP_TEXT = HELP_LINES.join("\n");

export const LATER_TEXT = "That isn't available in this version yet.";
export const NEEDS_PLANNER_TEXT = "I couldn't read that without the planner. Start with who it is for, like @Otto run the tests";
export const smallTalkText = (): string => t("Anytime. Tell me what to do next.");

// K8 S-2520: 화면 언어를 따르는 호출 시점 버전. 위 상수는 영어 그대로(기존 시험).
export const helpText = (): string => HELP_LINES.map((l) => t(l)).join("\n");
export const laterText = (): string => t("That isn't available in this version yet.");
export const needsPlannerText = (): string => t("I couldn't read that without the planner. Start with who it is for, like @Otto run the tests");

/** S-1263: addOrchestrator 의 명령 답. 그룹 없으면 "Orchestrator added." */
export function orchestratorAddedText(groupName: string | null, consoles: number): string {
  return groupName === null ? t("Orchestrator added.") : `${t("Orchestrator added for {group}.", { group: groupName })} ${tp("Wire to {n} console.", "Wire to {n} consoles.", consoles)}`;
}
