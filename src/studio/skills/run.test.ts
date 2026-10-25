import { describe, expect, it } from "vitest";
import { NEED_AGENT, claudeConsoles, runText } from "./run";

describe("S-2084 실행 문자열", () => {
  it("/이름 인자, 플러그인은 /플러그인:이름", () => {
    expect(runText(null, "commit", "fix typo")).toBe("/commit fix typo");
    expect(runText("ecc", "plan", "x")).toBe("/ecc:plan x");
    expect(runText(undefined, "commit", "")).toBe("/commit");
  });
  it("인자의 줄바꿈은 공백으로", () => {
    expect(runText(null, "c", "a\nb\r\nc")).toBe("/c a b c");
    expect(runText(null, "c", "  \n ")).toBe("/c");
  });
  it("문구", () => expect(NEED_AGENT).toBe("Start an agent first."));
});

describe("S-2084 대상 고르기", () => {
  const nodes = {
    a: { kind: "console", agentId: "claude", name: "Alpha" },
    b: { kind: "console", agentId: "codex", name: "Beta" },
    c: { kind: "console", agentId: "claude", name: "Gamma" },
    d: { kind: "note" },
    e: { kind: "console", agentId: "claude", name: "Shell now" },
  };
  it("실행 중인 Claude 콘솔만, 노드 순서대로", () => {
    expect(claudeConsoles(nodes, (id) => id !== "e")).toEqual([{ id: "a", name: "Alpha" }, { id: "c", name: "Gamma" }]);
  });
  it("하나면 하나, 없으면 빈 목록", () => {
    expect(claudeConsoles(nodes, (id) => id === "c")).toEqual([{ id: "c", name: "Gamma" }]);
    expect(claudeConsoles(nodes, () => false)).toEqual([]);
    expect(claudeConsoles({ b: nodes.b }, () => true)).toEqual([]);
  });
});
