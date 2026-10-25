import { describe, expect, it } from "vitest";
import { cliArgs } from "./cli";

const CLAUDE = (m: string) => ["--model", m, "--effort", "low", "--tools", "", "--disable-slash-commands", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "project"];

describe("S-3310 cliArgs 표", () => {
  it("모델 없음", () => {
    expect(cliArgs("claude", "")).toEqual(CLAUDE("haiku"));
    expect(cliArgs("codex", "")).toEqual(["-s", "read-only", "-a", "never"]);
    expect(cliArgs("gemini", "")).toEqual([]);
    expect(cliArgs("opencode", "")).toEqual(["--agent", "plan"]);
  });
  it("모델 있음", () => {
    expect(cliArgs("claude", "sonnet")).toEqual(CLAUDE("sonnet"));
    expect(cliArgs("codex", "gpt-5")).toEqual(["-m", "gpt-5", "-s", "read-only", "-a", "never"]);
    expect(cliArgs("gemini", "gemini-2.5-pro")).toEqual(["-m", "gemini-2.5-pro"]);
    expect(cliArgs("opencode", "anthropic/claude-x")).toEqual(["--agent", "plan", "-m", "anthropic/claude-x"]);
  });
  it("그 밖 id는 빈 배열", () => {
    expect(cliArgs("api:openai", "gpt-5")).toEqual([]);
  });
});

describe("S-3311 모델 글자 검사", () => {
  it("나쁜 글자는 무시하고 기본값 인자", () => {
    expect(cliArgs("claude", "haiku --dangerously")).toEqual(CLAUDE("haiku"));
    expect(cliArgs("gemini", "a b")).toEqual([]);
    expect(cliArgs("codex", 'x"y')).toEqual(["-s", "read-only", "-a", "never"]);
    expect(cliArgs("opencode", "m".repeat(101))).toEqual(["--agent", "plan"]);
  });
  it("허용 글자", () => {
    expect(cliArgs("gemini", "a.b_c:d/e@f[g]-1")).toEqual(["-m", "a.b_c:d/e@f[g]-1"]);
  });
});
