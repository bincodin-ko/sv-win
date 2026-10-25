import { describe, expect, it } from "vitest";
import type { ParseCtx } from "../commandbar/intent";
import { parse } from "../commandbar/parser";

// F3 S-2293: docs_voice-commands 예문이 지금 파서에서 "못 읽음(needsPlanner)"이 아닌 의도로 읽히는지 표로 확인한다.
// 음성으로 말한 글도 타자로 친 것과 같은 파서로 읽는다(S-2263). planner 없음 → 못 읽음 답은 두 번째 표에 명시(실패가 아니라 문서화).
const ctx: ParseCtx = {
  consoles: [{ id: "c1", name: "Otto", agentId: "claude", groupId: "g1" }, { id: "c2", name: "Mia", agentId: "codex" }],
  groups: [{ id: "g1", name: "Reviewers", role: "reviewers" }],
  workspaces: [{ id: "w1", name: "Main" }],
  agents: [
    { id: "claude", name: "Claude", aliases: ["claude code"] },
    { id: "codex", name: "Codex", aliases: [] },
    { id: "gemini", name: "Gemini", aliases: [] },
  ],
};
const t = (s: string) => parse(s, ctx).t;

// 읽혀야 하는 말 → 의도 종류
const READ: [string, string][] = [
  ["spawn two reviewers", "spawn"], ["spin up 3 codex", "spawn"], ["make a group of three Claude Code agents", "makeGroup"],
  ["pause Otto", "pause"], ["wait", "pause"], ["resume", "resume"], ["continue", "resume"], ["keep going", "resume"],
  ["kill Otto", "close"], ["@Otto run the tests", "tell"], ["tell Otto to run the tests", "tell"], ["Otto, run the tests", "tell"], ["cancel that", "cancel"], ["never mind", "cancel"],
  ["status", "status"], ["who finished", "whoFinished"], ["help", "help"],
  ["show me everything", "camera"], ["zoom in", "camera"], ["go to Otto", "camera"],
  ["open loops", "open"], ["open memory", "open"], ["open mission map", "open"], ["open settings", "open"], ["open usage", "open"],
  ["open documents", "open"], ["open code", "open"], ["open markdown", "open"], ["open skills", "open"],
  ["close that", "closePanel"],
  ["add a note that says ship Friday", "add"], ["add a kanban", "add"], ["add a calendar", "add"],
  ["open localhost 3000", "openWeb"], ["add an orchestrator", "addOrchestrator"],
  ["I want to draw", "tool"], ["eraser", "tool"],
  ["light mode", "theme"], ["dark mode", "theme"], ["undo", "undo"], ["redo", "redo"],
  ["every 10 minutes run the tests", "loop"],
  ["commit and push", "git"], ["push", "git"], ["pull", "git"], ["commit with the message fix login", "git"],
  ["pass this task to codex", "handoff"], ["hand off to gemini", "handoff"], ["when they finish pass it to Codex", "forward"],
];
// 이 시점 파서 밖 → "planner 없음 → 못 읽음 답"(needsPlanner). 읽히면 이 표를 고친다(표는 이 시점 파서 기준)
const PLANNER_ONLY = ["group the testers", "clean up the board", "rename Otto to Builder", "make a checklist for the release", "use preset 2"];

describe("S-2293 음성 명령 점검", () => {
  for (const [s, kind] of READ) it(`"${s}" → ${kind}`, () => expect(t(s)).toBe(kind));
  for (const s of PLANNER_ONLY) it(`planner 없음 → 못 읽음: "${s}"`, () => expect(t(s)).toBe("needsPlanner"));
  it("영어가 아닌 말은 못 읽음 답(S-2272)", () => expect(t("bonjour tout le monde, lance les tests")).toBe("needsPlanner"));
});
