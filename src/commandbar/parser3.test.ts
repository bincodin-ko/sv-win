import { describe, expect, it } from "vitest";
import type { Intent, ParseCtx } from "./intent";
import { parse } from "./parser";

// S-1063~S-1067: C17 새 intent (git · add · openWeb · tool)
const ctx: ParseCtx = { consoles: [{ id: "c1", name: "Otto", agentId: "claude" }], groups: [], workspaces: [{ id: "w1", name: "Workspace 1" }], agents: [] };

const table: [string, Intent][] = [
  // S-1063 git
  ["commit and push", { t: "git", op: "commitPush" }],
  ["Commit and push.", { t: "git", op: "commitPush" }],
  ["commit and push with the message fix login", { t: "git", op: "commitPush", message: "fix login" }],
  ["push", { t: "git", op: "push" }],
  ["pull", { t: "git", op: "pull" }],
  ["commit", { t: "git", op: "commit" }],
  ["commit with the message fix login", { t: "git", op: "commit", message: "fix login" }],
  ["commit with message Fix Login", { t: "git", op: "commit", message: "Fix Login" }],
  ["commit: fix login", { t: "git", op: "commit", message: "fix login" }],
  // 그 밖의 git … 은 later
  ["git status", { t: "later", kind: "git" }],
  ["git push origin main", { t: "later", kind: "git" }],
  // S-1064·S-1065 add
  ["add a note that says ship the beta on Friday", { t: "add", what: "note", text: "ship the beta on Friday" }],
  ["add a sticky that says Hello There", { t: "add", what: "note", text: "Hello There" }],
  ["add a note: buy milk", { t: "add", what: "note", text: "buy milk" }],
  ["add a note", { t: "add", what: "note" }],
  ["add a kanban", { t: "add", what: "kanban" }],
  ["add a calendar", { t: "add", what: "calendar" }],
  ["add a checklist", { t: "add", what: "checklist" }],
  ["add a todo", { t: "add", what: "checklist" }],
  ["add a browser", { t: "add", what: "browser" }],
  ["add an orchestrator", { t: "addOrchestrator" }],
  ["add a timer", { t: "later", kind: "add" }],
  // S-1066 openWeb
  ["open localhost 3000", { t: "openWeb", url: "http://localhost:3000" }],
  ["open localhost:3000/app", { t: "openWeb", url: "http://localhost:3000/app" }],
  ["open 127.0.0.1:5173", { t: "openWeb", url: "http://127.0.0.1:5173" }],
  ["open https://example.com/a", { t: "openWeb", url: "https://example.com/a" }],
  ["open ftp://x", { t: "openWeb", url: "ftp://x", bad: true }],
  ["open file:///c:/x", { t: "openWeb", url: "file:///c:/x", bad: true }],
  // S-1067 tool
  ["eraser", { t: "tool", tool: "eraser" }],
  ["I want to draw", { t: "tool", tool: "pen" }],
  // 건드리면 안 되는 기존 동작
  ["open settings", { t: "open", what: "settings" }],
  ["open loops", { t: "open", what: "loops" }],
  ["add a workspace", { t: "workspace", op: "new" }],
  ["every 10 minutes run the tests", { t: "loop", minutes: 10, text: "run the tests" }],
];

describe("parse: C17 명령 (S-1063~S-1067)", () => {
  it.each(table)("%j", (input, want) => {
    expect(parse(input, ctx)).toEqual(want);
  });
});
