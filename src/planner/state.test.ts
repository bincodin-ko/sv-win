import { afterEach, describe, expect, it } from "vitest";
import { plannerAgent, plannerChoices, plannerOn, usePlanner } from "./state";

type W = { __plannerTest?: boolean; __usePlanner?: unknown };
afterEach(() => { delete (window as unknown as W).__plannerTest; });

describe("S-2901 plannerAgent", () => {
  it("설치된 쪽을 쓴다", () => {
    expect(plannerAgent("claude", ["claude", "codex"])).toBe("claude");
    expect(plannerAgent("codex", ["claude", "codex"])).toBe("codex");
  });
  it("claude 미설치 → codex → gemini(S-3302) → off", () => {
    expect(plannerAgent("claude", ["codex"])).toBe("codex");
    expect(plannerAgent("claude", ["gemini"])).toBe("gemini"); // S-3302: gemini·opencode 도 CLI
    expect(plannerAgent("claude", [])).toBe("off");
    expect(plannerAgent("claude", ["zzz"])).toBe("off");
    expect(plannerAgent("codex", ["claude"])).toBe("claude");
  });
  it("S-3302 CLI 대체 순서 claude·codex·gemini·opencode", () => {
    expect(plannerAgent("opencode", ["claude", "opencode"])).toBe("opencode");
    expect(plannerAgent("gemini", ["opencode", "codex"])).toBe("codex");
    expect(plannerAgent("codex", ["opencode", "gemini"])).toBe("gemini");
    expect(plannerAgent("claude", ["opencode"])).toBe("opencode");
    expect(plannerAgent("opencode", [])).toBe("off");
  });
  it("S-3302 api:* 는 설치와 무관하게 그대로, 모르는 api:는 off", () => {
    for (const id of ["api:openai", "api:anthropic", "api:gemini", "api:compat"]) {
      expect(plannerAgent(id, [])).toBe(id);
      expect(plannerAgent(id, ["claude"])).toBe(id);
    }
    expect(plannerAgent("api:other", ["claude"])).toBe("off");
  });
  it("off와 모르는 값은 off", () => {
    expect(plannerAgent("off", ["claude", "codex"])).toBe("off");
    expect(plannerAgent("zzz", ["claude"])).toBe("off");
  });
});

describe("S-2900 plannerChoices", () => {
  const API = ["api:openai", "api:anthropic", "api:gemini", "api:compat"];
  it("설치된 CLI(claude·codex·gemini·opencode 순서) + API 4개 + off (S-3302)", () => {
    expect(plannerChoices(["claude", "codex", "gemini"])).toEqual(["claude", "codex", "gemini", ...API, "off"]);
    expect(plannerChoices(["opencode", "codex"])).toEqual(["codex", "opencode", ...API, "off"]);
    expect(plannerChoices(["zzz"])).toEqual([...API, "off"]);
    expect(plannerChoices([])).toEqual([...API, "off"]);
  });
});

describe("usePlanner·plannerOn (S-2901a·S-2902·S-2980)", () => {
  it("처음 상태", () => {
    expect(usePlanner.getState().busy).toBeNull();
    expect(usePlanner.getState().status).toBe("none");
  });
  it("busy·status를 바꾼다", () => {
    usePlanner.setState({ busy: { repo: "r", phase: "starting", since: 1 }, status: "failed", lastFail: "x" });
    expect(usePlanner.getState().busy?.phase).toBe("starting");
    usePlanner.setState({ busy: null, status: "none", lastFail: undefined });
  });
  it("비Tauri는 __plannerTest가 있어야 켜진다", () => {
    expect(plannerOn()).toBe(false);
    (window as unknown as W).__plannerTest = true;
    expect(plannerOn()).toBe(true);
  });
  it("비Tauri 시험 후크", () => expect((window as unknown as W).__usePlanner).toBe(usePlanner));
});
