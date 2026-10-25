import { describe, expect, it } from "vitest";
import type { AgentInfo } from "../../agents/api";
import { spawnRows } from "./spawnRows";

const a = (id: string, name: string, installed: boolean): AgentInfo => ({ id, name, installed, builtin: true, section: "popular" } as AgentInfo);

describe("링 메뉴 에이전트 생성 줄(고르기 화면과 같은 규칙)", () => {
  it("미설치는 회색 + 이유, 설치된 읽는 CLI 와 Shell 은 이유 없음", () => {
    const rows = spawnRows([a("claude", "Claude Code", true), a("gemini", "Gemini CLI", false), a("opencode", "OpenCode", false), a("shell", "Shell", true)]);
    expect(rows.find((r) => r.id === "claude")?.why).toBeUndefined();
    expect(rows.find((r) => r.id === "shell")?.why).toBeUndefined();
    expect(rows.find((r) => r.id === "gemini")?.why).toBe("Not installed yet");
    expect(rows.find((r) => r.id === "opencode")?.why).toBe("Not installed yet");
  });
  it("설치된 CLI 는 기록을 못 읽어도 생성 가능(이유 없음)", () => {
    const r = spawnRows([a("grok", "Grok", true)])[0]!;
    expect(r.why).toBeUndefined();
  });
});
