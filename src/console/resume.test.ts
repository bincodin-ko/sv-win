import { describe, expect, it } from "vitest";
import { cliResumeArgs, exitedQuickly, needsResumeAll, pickingMemo, pickOffers, restoredMemo, type ConsoleLike } from "./resume";

const ex = (ids: string[]) => ({ enabled: true, transcriptExists: (s: string) => ids.includes(s) });
const c = (id: string, agentId: string, resume?: ConsoleLike["resume"]): ConsoleLike => ({ id, agentId, resume });

describe("S-236 제안 대상 고르기", () => {
  it("Claude: 자기 id + transcript 가 있을 때만", () => {
    const n = [c("a", "claude", { claudeSessionId: "s1" }), c("b", "claude", { claudeSessionId: "s2" }), c("c", "claude")];
    expect(pickOffers(n, ex(["s1"]))).toEqual([{ nodeId: "a", agentId: "claude", sessionId: "s1" }]);
    expect(pickOffers(n, ex([]))).toEqual([]);
  });
  it("Codex: 자기 세션 id 가 있으면(존재 확인 없음)", () => {
    expect(pickOffers([c("a", "codex", { codexSessionId: "x" }), c("b", "codex")], ex([]))).toEqual([{ nodeId: "a", agentId: "codex", sessionId: "x" }]);
  });
  it("Gemini·OpenCode: 에이전트별로 lastChatAt 이 가장 늦은 콘솔 1개", () => {
    const n = [
      c("g1", "gemini", { lastChatAt: 100 }),
      c("g2", "gemini", { lastChatAt: 300 }),
      c("g3", "gemini"),
      c("o1", "opencode", { lastChatAt: 50 }),
    ];
    expect(pickOffers(n, ex([]))).toEqual([
      { nodeId: "g2", agentId: "gemini" },
      { nodeId: "o1", agentId: "opencode" },
    ]);
  });
  it("Gemini 인데 아무도 대화한 적 없으면 제안 없음", () => {
    expect(pickOffers([c("g", "gemini")], ex([]))).toEqual([]);
  });
  it("Grok·Shell·그 밖은 제안 없음", () => {
    const n = [c("a", "grok", { lastChatAt: 1 }), c("b", "shell", { lastChatAt: 1 }), c("c", "mine", { lastChatAt: 1 })];
    expect(pickOffers(n, ex([]))).toEqual([]);
  });
  it("resumeAgentChats 가 꺼져 있으면 없음", () => {
    expect(pickOffers([c("a", "claude", { claudeSessionId: "s1" })], { enabled: false, transcriptExists: () => true })).toEqual([]);
  });
});

describe("S-235 Resume all", () => {
  it("제안 2개 이상일 때만", () => {
    expect(needsResumeAll([])).toBe(false);
    expect(needsResumeAll([{ nodeId: "a", agentId: "claude" }])).toBe(false);
    expect(needsResumeAll([{ nodeId: "a", agentId: "claude" }, { nodeId: "b", agentId: "claude" }])).toBe(true);
  });
});

describe("S-240 8초 규칙", () => {
  it("Claude·Codex 가 8초 안에 끝나면 다시 제안", () => {
    expect(exitedQuickly("claude", 1000, 1000 + 7999)).toBe(true);
    expect(exitedQuickly("codex", 1000, 1000 + 8000)).toBe(true);
    expect(exitedQuickly("claude", 1000, 1000 + 8001)).toBe(false);
  });
  it("Gemini·OpenCode·Shell 은 따로 하지 않음", () => {
    expect(exitedQuickly("gemini", 0, 100)).toBe(false);
    expect(exitedQuickly("opencode", 0, 100)).toBe(false);
    expect(exitedQuickly("shell", 0, 100)).toBe(false);
  });
});

describe("S-236·S-237 명령 인자", () => {
  it("이어가기", () => {
    expect(cliResumeArgs("claude", "resume", "u1")).toEqual(["--resume", "u1"]);
    expect(cliResumeArgs("codex", "resume", "u2")).toEqual(["resume", "u2"]);
    expect(cliResumeArgs("gemini", "resume")).toEqual(["--resume", "latest"]);
    expect(cliResumeArgs("opencode", "resume")).toEqual(["--continue"]);
    expect(cliResumeArgs("grok", "resume")).toEqual([]);
    expect(cliResumeArgs("shell", "resume")).toEqual([]);
  });
  it("Claude 새 시작은 --session-id, 다른 에이전트는 없음", () => {
    expect(cliResumeArgs("claude", "new", "u3")).toEqual(["--session-id", "u3"]);
    expect(cliResumeArgs("codex", "new", "u3")).toEqual([]);
    expect(cliResumeArgs("gemini", "new")).toEqual([]);
  });
});

describe("메모 문구", () => {
  it("S-233·S-234", () => {
    expect(restoredMemo("Claude")).toBe("Claude lane restored — relaunching");
    expect(restoredMemo("Shell")).toBe("Shell lane restored — relaunching");
    expect(pickingMemo("Claude")).toBe("Claude lane — picking your last chat…");
  });
});
