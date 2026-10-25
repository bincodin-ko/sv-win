import { describe, expect, it } from "vitest";
import type { Intent, ParseCtx } from "./intent";
import { parse } from "./parser";

const ctx: ParseCtx = {
  consoles: [
    { id: "c1", name: "Otto", agentId: "claude", groupId: "g1" },
    { id: "c2", name: "Mia", agentId: "codex", groupId: "g2" },
  ],
  groups: [
    { id: "g1", name: "Reviewers", role: "reviewers" },
    { id: "g2", name: "Backend", role: "backend" },
  ],
  workspaces: [
    { id: "w1", name: "Main" },
    { id: "w2", name: "QA" },
  ],
  agents: [
    { id: "claude", name: "Claude", aliases: ["claude code"] },
    { id: "codex", name: "Codex", aliases: [] },
    { id: "gemini", name: "Gemini", aliases: [] },
  ],
};
const g = (id: string) => ({ kind: "group", id }) as const;
const c = (id: string) => ({ kind: "console", id }) as const;
const cli = (agentId: string) => ({ kind: "cli", agentId }) as const;
const ALL = { kind: "all" } as const;

// S-592: docs_voice-commands 예문 전부 (입력 -> 의도)
const table: [string, Intent][] = [
  // S-571 시작
  ["spawn two reviewers", { t: "spawn", n: 2, agentId: "claude", role: "reviewers" }],
  ["spin up 3 codex", { t: "spawn", n: 3, agentId: "codex" }],
  ["start 4 claude", { t: "spawn", n: 4, agentId: "claude" }],
  ["spawn two agents", { t: "spawn", n: 2 }],
  ["spawn 3 shell", { t: "spawn", n: 3, agentId: "shell" }],
  ["spawn 1 shell", { t: "spawn", n: 1, agentId: "shell" }],
  ["start two terminals", { t: "spawn", n: 2, agentId: "shell" }],
  ["spawn a codex", { t: "spawn", n: 1, agentId: "codex" }],
  ["spawn codex", { t: "spawn", n: 1, agentId: "codex" }],
  ["spawn 20 codex", { t: "spawn", n: 12, agentId: "codex" }],
  ["spawn two testers", { t: "spawn", n: 2, agentId: "gemini", role: "testers" }],
  ["spawn two backend", { t: "spawn", n: 2, agentId: "codex", role: "backend" }],
  ["spawn one general", { t: "spawn", n: 1, role: "general" }],
  ["  SPAWN Two Reviewers!  ", { t: "spawn", n: 2, agentId: "claude", role: "reviewers" }],
  // S-572 그룹 만들기
  ["make a group of three Claude Code agents", { t: "makeGroup", n: 3, agentId: "claude" }],
  ["make a group", { t: "makeGroup", n: 3 }],
  ["make a group of 5 codex", { t: "makeGroup", n: 5, agentId: "codex" }],
  // S-573 그룹에 더하기
  ["add two testers to group 2", { t: "addToGroup", n: 2, groupId: "g2" }],
  ["add 2 claude to Backend", { t: "addToGroup", n: 2, groupId: "g2", agentId: "claude" }],
  // S-574 멈춤/재개
  ["pause", { t: "pause", target: ALL }],
  ["pause Otto", { t: "pause", target: c("c1") }],
  ["wait", { t: "pause", target: ALL }],
  ["pause group 1", { t: "pause", target: g("g1") }],
  ["resume", { t: "resume", target: ALL }],
  ["continue", { t: "resume", target: ALL }],
  ["keep going", { t: "resume", target: ALL }],
  ["resume Otto", { t: "resume", target: c("c1") }],
  // S-575 다시 시작
  ["restart group 1", { t: "restart", target: g("g1") }],
  ["reset the codex", { t: "restart", target: cli("codex") }],
  // S-576 닫기
  ["kill Otto", { t: "close", target: c("c1") }],
  ["kill the claude consoles", { t: "close", target: cli("claude") }],
  ["delete the backend group", { t: "close", target: g("g2") }],
  // S-578 한 콘솔에 일
  ["@Otto run the tests", { t: "tell", targets: [c("c1")], text: "run the tests" }],
  ["tell Otto to run the tests", { t: "tell", targets: [c("c1")], text: "run the tests" }],
  ["Otto, run the tests", { t: "tell", targets: [c("c1")], text: "run the tests" }],
  ["@Otto", { t: "tell", targets: [c("c1")], text: "" }],
  ["run the tests @Otto", { t: "tell", targets: [c("c1")], text: "run the tests" }],
  // S-579 그룹에 일
  ["@Reviewers write tests", { t: "tell", targets: [g("g1")], text: "write tests" }],
  ["tell group 2 to write tests for the cart", { t: "tell", targets: [g("g2")], text: "write tests for the cart" }],
  ["the backend group, run the migrations", { t: "tell", targets: [g("g2")], text: "run the migrations" }],
  // S-580 이름 없는 일
  ["run the tests and report", { t: "orderUnrouted", text: "run the tests and report" }],
  ["tell the board to review the auth flow", { t: "orderUnrouted", text: "review the auth flow" }],
  // S-581
  ["give everyone the same prompt: review the auth flow", { t: "broadcast", text: "review the auth flow" }],
  ["identical prompts: review the auth flow", { t: "broadcast", text: "review the auth flow" }],
  // S-2687
  ["broadcast review the auth flow", { t: "broadcast", text: "review the auth flow" }],
  ["Broadcast: run the tests", { t: "broadcast", text: "run the tests" }],
  ["everyone: run the tests", { t: "broadcast", text: "run the tests" }],
  ["ALL: run the tests", { t: "broadcast", text: "run the tests" }],
  // S-582
  ["cancel that", { t: "cancel" }],
  ["never mind", { t: "cancel" }],
  ["scratch that", { t: "cancel" }],
  // S-583
  ["status", { t: "status" }],
  ["how's it going", { t: "status" }],
  ["who finished", { t: "whoFinished" }],
  ["what happened", { t: "whoFinished" }],
  ["give me a summary", { t: "whoFinished" }],
  ["what can you do?", { t: "help" }],
  ["help", { t: "help" }],
  // S-584 카메라
  ["show me everything", { t: "camera", op: "fitAll" }],
  ["zoom in", { t: "camera", op: "zoomIn" }],
  ["zoom out", { t: "camera", op: "zoomOut" }],
  ["reset zoom", { t: "camera", op: "reset" }],
  ["go to Otto", { t: "camera", op: "goto", target: c("c1") }],
  ["focus on group 2", { t: "camera", op: "focusGroup", target: g("g2") }],
  ["show me the codex lanes", { t: "camera", op: "cliLanes", target: cli("codex") }],
  // S-585 화면 열기
  ["open settings", { t: "open", what: "settings" }],
  ["open presets", { t: "open", what: "presets" }],
  ["open loops", { t: "open", what: "loops" }],
  ["open mission map", { t: "open", what: "mission" }],
  ["open memory", { t: "open", what: "memory" }],
  ["open usage", { t: "open", what: "usage" }],
  ["close that", { t: "closePanel" }],
  // S-586 테마
  ["light mode", { t: "theme", value: "light" }],
  ["dark mode", { t: "theme", value: "og" }],
  ["match system", { t: "theme", value: "system" }],
  ["match macOS", { t: "theme", value: "system" }],
  // S-587
  ["undo", { t: "undo" }],
  ["redo", { t: "redo" }],
  // S-2724 Tidy up
  ["tidy up", { t: "tidy" }],
  ["tidy", { t: "tidy" }],
  ["Tidy up", { t: "tidy" }],
  ["arrange the board", { t: "tidy" }],
  // S-588 워크스페이스
  ["go to workspace 2", { t: "workspace", op: "go", ref: "w2" }],
  ["new workspace called QA", { t: "workspace", op: "new", name: "QA" }],
  ["rename this workspace to Backend", { t: "workspace", op: "rename", name: "Backend" }],
  ["close workspace 2", { t: "workspace", op: "close", ref: "w2" }],
  // S-589 뒤 묶음 기능
  ["every 10 minutes run the tests", { t: "loop", minutes: 10, text: "run the tests" }],
  ["commit and push", { t: "git", op: "commitPush" }],
  ["push", { t: "git", op: "push" }],
  ["pull", { t: "git", op: "pull" }],
  ["commit with the message fix login", { t: "git", op: "commit", message: "fix login" }],
  ["add a note that says ship Friday", { t: "add", what: "note", text: "ship Friday" }],
  ["add a kanban", { t: "add", what: "kanban" }],
  ["add a calendar", { t: "add", what: "calendar" }],
  ["open localhost 3000", { t: "openWeb", url: "http://localhost:3000" }],
  ["add an orchestrator", { t: "addOrchestrator" }],
  ["I want to draw", { t: "tool", tool: "pen" }],
  ["eraser", { t: "tool", tool: "eraser" }],
  ["pass this task to codex", { t: "handoff", agentId: "codex" }],
  ["hand off to gemini", { t: "handoff", agentId: "gemini" }],
  ["pass it to Codex", { t: "handoff", agentId: "codex" }],
  // D15 S-1730 ~ S-1738 (4묶음 명령줄)
  ["hand this off to Claude", { t: "handoff", agentId: "claude" }],
  ["hand off to Bard", { t: "handoff", agentId: "bard" }],
  ["hand off @Otto to codex", { t: "handoff", agentId: "codex", from: "c1" }],
  ["add an orchestrator for group 1", { t: "addOrchestrator", groupId: "g1" }],
  ["add an orchestrator called Review", { t: "addOrchestrator", name: "Review" }],
  ["add an orchestrator for group 2 called Review", { t: "addOrchestrator", groupId: "g2", name: "Review" }],
  ["add an orchestrator for group 9", { t: "notFound", name: "group 9" }],
  ["connect group 1 to the orchestrator", { t: "connect", target: g("g1") }],
  ["connect Otto to the orchestrator", { t: "connect", target: c("c1") }],
  ["wire group 1 to orchestrator 2", { t: "connect", target: g("g1"), card: "2" }],
  ["connect group 2 to the Review orchestrator", { t: "connect", target: g("g2"), card: "Review" }],
  ["every hour check the build", { t: "loop", minutes: 60, text: "check the build" }],
  ["every 30 min commit", { t: "loop", minutes: 30, text: "commit" }],
  ["every 2 hours run lint", { t: "loop", minutes: 120, text: "run lint" }],
  ["every 1440 minutes run lint", { t: "loop", minutes: 1440, text: "run lint" }],
  ["every 30 seconds ping", { t: "loop", bad: "range" }],
  ["every day run the tests", { t: "loop", bad: "range" }],
  ["every 2 weeks run the tests", { t: "loop", bad: "range" }],
  ["every 25 hours run the tests", { t: "loop", bad: "range" }],
  ["every 0 minutes run the tests", { t: "loop", bad: "range" }],
  ["every 10 minutes", { t: "loop", bad: "empty" }],
  ["when they finish, pass it to Codex", { t: "forward", sources: [], they: true, dests: [cli("codex")] }],
  ["when group 1 finishes pass everything to group 2", { t: "forward", sources: [g("g1")], dests: [g("g2")] }],
  ["when Otto and Mia finish send it to the reviewers", { t: "forward", sources: [c("c1"), c("c2")], dests: [g("g1")] }],
  ["when group 1 finishes pass everything to group 2 to everyone", { t: "forward", sources: [g("g1")], dests: [g("g2")], everyone: true }],
  // S-590 그 밖
  ["thanks", { t: "smallTalk" }],
  ["group the testers", { t: "needsPlanner" }],
  ["clean up the board", { t: "needsPlanner" }],
  ["", { t: "needsPlanner" }],
  ["   ", { t: "needsPlanner" }],
  ["the weather is nice today", { t: "needsPlanner" }],
];

describe("parse: 문서 예문 표 (S-592)", () => {
  it.each(table)("%j", (input, want) => {
    expect(parse(input, ctx)).toEqual(want);
  });
});

describe("parse: 대상 해석 (S-577)", () => {
  const dup: ParseCtx = {
    ...ctx,
    consoles: [...ctx.consoles, { id: "c9", name: "otto", agentId: "gemini" }],
  };
  it("같은 이름 둘 -> ambiguous", () => {
    expect(parse("pause Otto", dup)).toEqual({ t: "ambiguous", name: "Otto", candidates: ["c1", "c9"] });
  });
  it("없는 이름 -> notFound", () => {
    expect(parse("pause Zed", ctx)).toEqual({ t: "notFound", name: "Zed" });
    expect(parse("@Zed run it", ctx)).toEqual({ t: "notFound", name: "Zed" });
    expect(parse("kill group 9", ctx)).toEqual({ t: "notFound", name: "group 9" });
  });
});

describe("parse: 던지지 않는다 (S-570)", () => {
  it.each(["@", "tell", "tell to", "add to", "spawn", "restart", "go to", "every", ",,,", "@@ @", "close", "make a group of"])(
    "%j",
    (s) => {
      expect(() => parse(s, ctx)).not.toThrow();
    },
  );
  it("빈 ctx에서도", () => {
    const empty: ParseCtx = { consoles: [], groups: [], workspaces: [], agents: [] };
    expect(parse("pause Otto", empty)).toEqual({ t: "notFound", name: "Otto" });
    expect(parse("spawn two codex", empty)).toEqual({ t: "spawn", n: 2, agentId: "codex" });
  });
});

describe("FX5 D2·D3 group N·공백 든 @이름", () => {
  const swapped: ParseCtx = {
    ...ctx,
    consoles: [
      { id: "c1", name: "Otto", agentId: "claude" },
      { id: "c2", name: "Otto 2", agentId: "codex" },
      { id: "c3", name: "Build Bot", agentId: "gemini" },
    ],
    groups: [
      { id: "g2", name: "Group 2", role: "general" },
      { id: "g1", name: "Group 1", role: "general" },
    ],
  };
  it("S-577 group 1 은 배열 순서가 아니라 이름 Group 1", () => {
    expect(parse("pause group 1", swapped)).toEqual({ t: "pause", target: g("g1") });
    expect(parse("pause group 2", swapped)).toEqual({ t: "pause", target: g("g2") });
    expect(parse("pause group 3", swapped)).toEqual({ t: "notFound", name: "group 3" });
  });
  it("S-577 이름이 Group N 이 아니면 배열 순서(기존)", () => {
    expect(parse("pause group 2", ctx)).toEqual({ t: "pause", target: g("g2") });
  });
  it("S-550 @Group 1 run it", () => {
    expect(parse("@Group 1 run it", swapped)).toEqual({ t: "tell", targets: [g("g1")], text: "run it" });
  });
  it("S-550 @Otto 2 run the tests 는 Otto 2 (긴 이름 먼저)", () => {
    expect(parse("@Otto 2 run the tests", swapped)).toEqual({ t: "tell", targets: [c("c2")], text: "run the tests" });
    expect(parse("@Otto run the tests", swapped)).toEqual({ t: "tell", targets: [c("c1")], text: "run the tests" });
  });
  it("S-550 @Build Bot run the tests", () => {
    expect(parse("@Build Bot run the tests", swapped)).toEqual({ t: "tell", targets: [c("c3")], text: "run the tests" });
  });
  it("공백 든 이름 둘 + 이름 뒤 쉼표", () => {
    expect(parse("@Build Bot, @Group 1 run it", swapped)).toEqual({ t: "tell", targets: [c("c3"), g("g1")], text: "run it" });
  });
  it("S-2687 본문이 비면 broadcast 로 안 읽음", () => {
    for (const q of ["broadcast", "broadcast  ", "everyone:", "all: "]) expect(parse(q, ctx)).not.toMatchObject({ t: "broadcast" });
  });
});
