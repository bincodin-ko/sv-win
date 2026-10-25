import { describe, expect, it } from "vitest";
import { hoverText, liveStatusOf } from "./events";

// S-685 표: 턴·도구 시작 → WORKING, 권한 요청 → NEEDS YOU, 질문(Claude만) → NEEDS YOU, 시작·턴 끝 → READY, 턴 실패(Claude만) → ERROR
describe("S-685 이벤트→상태", () => {
  it("턴·도구 시작은 WORKING (Claude·Codex 모두)", () => {
    for (const a of ["claude", "codex"] as const) for (const e of ["UserPromptSubmit", "PreToolUse", "PostToolUse"]) expect(liveStatusOf(a, e), `${a} ${e}`).toBe("WORKING");
  });
  it("권한 요청은 NEEDS YOU (Claude·Codex 모두)", () => {
    expect(liveStatusOf("claude", "PermissionRequest")).toBe("NEEDS YOU");
    expect(liveStatusOf("codex", "PermissionRequest")).toBe("NEEDS YOU");
  });
  it("질문(Claude만): 알림 이벤트와 AskUserQuestion 도구가 NEEDS YOU, Codex 는 무시", () => {
    expect(liveStatusOf("claude", "Notification", { message: "Claude is waiting for your input" })).toBe("NEEDS YOU");
    expect(liveStatusOf("claude", "PreToolUse", { tool_name: "AskUserQuestion" })).toBe("NEEDS YOU");
    expect(liveStatusOf("codex", "Notification")).toBeNull();
    expect(liveStatusOf("codex", "PreToolUse", { tool_name: "AskUserQuestion" })).toBe("WORKING");
  });
  it("시작·턴 끝은 READY", () => {
    for (const a of ["claude", "codex"] as const) for (const e of ["SessionStart", "Stop"]) expect(liveStatusOf(a, e), `${a} ${e}`).toBe("READY");
  });
  it("턴 실패(Claude만)는 ERROR, Codex 는 무시", () => {
    expect(liveStatusOf("claude", "StopFailure")).toBe("ERROR");
    expect(liveStatusOf("codex", "StopFailure")).toBeNull();
  });
  it("모르는 이벤트는 무시", () => {
    expect(liveStatusOf("claude", "SomethingNew")).toBeNull();
  });
});

describe("S-687 호버 문구", () => {
  it("실행 중 명령, 요청한 권한, 기다리는 질문을 보인다", () => {
    expect(hoverText("claude", "PreToolUse", { tool_name: "Bash", tool_input: { command: "npm test" } })).toContain("npm test");
    expect(hoverText("claude", "PermissionRequest", { tool_name: "Edit" })).toContain("Edit");
    expect(hoverText("claude", "PreToolUse", { tool_name: "AskUserQuestion", tool_input: { questions: [{ question: "Which DB?" }] } })).toContain("Which DB?");
  });
  it("글이 없는 이벤트는 null", () => {
    expect(hoverText("claude", "SomethingNew")).toBeNull();
  });
});
