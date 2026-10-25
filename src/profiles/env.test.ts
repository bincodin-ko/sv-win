import { beforeEach, describe, expect, it } from "vitest";
import { useSettings } from "../settings/useSettings";
import { consoleProfile, profileEnvFor } from "./env";

// S-1612: 프로필 없음 → [], claude/codex 별 한 쌍
describe("profileEnvFor", () => {
  beforeEach(() => {
    (window as unknown as { __fakeProfiles?: unknown }).__fakeProfiles = undefined;
    useSettings.setState({ s: {} });
  });

  it("프로필을 안 골랐으면 빈 목록", async () => {
    expect(await profileEnvFor("claude")).toEqual([]);
    useSettings.setState({ s: { profileUse: {} } });
    expect(await profileEnvFor("codex")).toEqual([]);
  });

  it("claude 는 CLAUDE_CONFIG_DIR, codex 는 CODEX_HOME 한 쌍", async () => {
    (window as unknown as { __fakeProfiles: unknown }).__fakeProfiles = {
      list: [
        { id: "work", agent: "claude", name: "Work", createdAt: "t" },
        { id: "main", agent: "codex", name: "Main", createdAt: "t" },
      ],
    };
    useSettings.setState({ s: { profileUse: { claude: "work", codex: "main" } } });
    const c = await profileEnvFor("claude");
    const x = await profileEnvFor("codex");
    expect(c).toHaveLength(1);
    expect(c[0][0]).toBe("CLAUDE_CONFIG_DIR");
    expect(c[0][1]).toContain("work");
    expect(x).toHaveLength(1);
    expect(x[0][0]).toBe("CODEX_HOME");
    expect(x[0][1]).toContain("main");
  });

  it("다른 agent 는 []", async () => {
    useSettings.setState({ s: { profileUse: { claude: "work" } } });
    expect(await profileEnvFor("gemini")).toEqual([]);
  });
});

// D12 S-1626·S-1628: 콘솔 노드의 profile → 환경 한 쌍 + 설정 폴더
describe("consoleProfile", () => {
  const fake = (list: unknown[]) => ((window as unknown as { __fakeProfiles?: unknown }).__fakeProfiles = { list });
  beforeEach(() => fake([]));

  it("profile 이 없으면 환경 없음", async () => {
    expect(await consoleProfile("claude")).toEqual({ env: [], missing: false });
  });
  it("있으면 CLAUDE_CONFIG_DIR / CODEX_HOME 한 쌍과 그 폴더", async () => {
    fake([{ id: "work", agent: "claude", name: "Work", createdAt: "t" }, { id: "main", agent: "codex", name: "Main", createdAt: "t" }]);
    const c = await consoleProfile("claude", "work");
    expect(c.env.map((e) => e[0])).toEqual(["CLAUDE_CONFIG_DIR"]);
    expect(c.dir).toBe(c.env[0]![1]);
    expect(c.dir).toContain("work");
    expect(c.missing).toBe(false);
    expect((await consoleProfile("codex", "main")).env[0]![0]).toBe("CODEX_HOME");
  });
  it("프로필이 지워졌으면(폴더 없음) 환경 없음 + missing", async () => {
    expect(await consoleProfile("claude", "gone")).toEqual({ env: [], missing: true });
  });
  it("프로필이 없는 에이전트(shell·gemini)는 profile 이 있어도 환경 없음", async () => {
    expect(await consoleProfile("shell", "work")).toEqual({ env: [], missing: false });
  });
});
