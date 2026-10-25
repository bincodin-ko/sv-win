import { describe, expect, it } from "vitest";
import { canStart, failMessage } from "./runner";

describe("S-2023 canStart", () => {
  it("repo 가 있고 안 돌고 주제가 비지 않아야 시작", () => {
    expect(canStart({ repo: "C:/r", running: false, subject: "architecture" })).toBe(true);
    expect(canStart({ repo: "C:/r", running: false, subject: "   " })).toBe(false);
    expect(canStart({ repo: null, running: false, subject: "architecture" })).toBe(false);
    expect(canStart({ repo: "C:/r", running: true, subject: "architecture" })).toBe(false);
  });
});
describe("S-2028·S-2030 failMessage", () => {
  it("글이 있으면 null(착지 시도)", () => {
    expect(failMessage({ ok: true, text: "x" }, "Claude Code")).toBeNull();
    expect(failMessage({ stopped: true, text: "x" }, "Claude Code")).toBeNull();
    expect(failMessage({ timeout: true, text: "x" }, "Claude Code")).toBeNull();
  });
  it("한도인데 글이 없으면 Documents 와 같은 안내", () => {
    expect(failMessage({ timeout: true, text: "" }, "Claude Code")).toBe("Nothing came back. Try Quick, or a narrower ask.");
  });
  it("막힘은 대신 답하지 않는다는 안내", () => {
    expect(failMessage({ blocked: true, why: "trust?" }, "Codex")).toBe("Codex is asking a question Symvibe will not answer for you. Open a console in this repo, answer it there, and try again.");
  });
  it("권한 질문 막힘은 질문 줄과 설정 안내(콘솔 안내 아님)", () => {
    const m = failMessage({ blocked: true, why: "Bash command\n git push\nDo you want to proceed?\n 1. Yes" }, "Claude Code");
    expect(m).toContain("Claude Code asked for permission to use a tool:");
    expect(m).toContain("git push");
    expect(m).not.toContain("Open a console");
  });
  it("오류는 그 문구", () => {
    expect(failMessage({ error: "spawn failed" }, "Codex")).toBe("spawn failed");
  });
  it("Stop 인데 글이 없으면 안내 없이 닫힘(빈 문자열)", () => {
    expect(failMessage({ stopped: true, text: "" }, "Codex")).toBe("");
  });
});
