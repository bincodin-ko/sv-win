import { describe, expect, it } from "vitest";
import { baseUrlFor, isApi, modelFor, PROVIDERS } from "./index";

// 기대값: spec/13묶음.md S-3300·S-3301
describe("S-3300 PROVIDERS", () => {
  it("8줄, 순서·종류·이름·기본 모델·키 필요", () => {
    expect(PROVIDERS.map((p) => [p.id, p.kind, p.label, p.model, p.needsKey])).toEqual([
      ["claude", "cli", "Claude Code", "haiku", false],
      ["codex", "cli", "Codex (GPT)", "", false],
      ["gemini", "cli", "Gemini CLI", "", false],
      ["opencode", "cli", "OpenCode", "", false],
      ["api:openai", "api", "OpenAI API", "gpt-5-mini", true],
      ["api:anthropic", "api", "Anthropic API", "claude-haiku-4-5", true],
      ["api:gemini", "api", "Google Gemini API", "gemini-2.5-flash", true],
      ["api:compat", "api", "OpenAI-compatible (Ollama…)", "", false],
    ]);
  });
  it("모델 제안", () => {
    const m = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.models]));
    expect(m).toEqual({
      claude: ["haiku", "sonnet", "opus"],
      codex: [],
      gemini: ["gemini-2.5-flash", "gemini-2.5-pro"],
      opencode: [],
      "api:openai": ["gpt-5-mini", "gpt-5"],
      "api:anthropic": ["claude-haiku-4-5", "claude-sonnet-4-5"],
      "api:gemini": ["gemini-2.5-flash", "gemini-2.5-pro"],
      "api:compat": [],
    });
  });
  it("isApi", () => {
    for (const id of ["api:openai", "api:anthropic", "api:gemini", "api:compat"]) expect(isApi(id)).toBe(true);
    for (const id of ["claude", "codex", "gemini", "opencode", "off", "api:x", "", undefined, 3]) expect(isApi(id)).toBe(false);
  });
});

describe("S-3301 modelFor", () => {
  it("설정값(앞뒤 공백 자름)이 있으면 그것, 아니면 표의 기본", () => {
    expect(modelFor({}, "claude")).toBe("haiku");
    expect(modelFor({ plannerModel: { claude: "  opus  " } }, "claude")).toBe("opus");
    expect(modelFor({ plannerModel: { "api:openai": "gpt-5" } }, "api:openai")).toBe("gpt-5");
    expect(modelFor({ plannerModel: { "api:openai": "gpt-5" } }, "api:gemini")).toBe("gemini-2.5-flash");
    expect(modelFor({ plannerModel: { codex: "gpt-x" } }, "codex")).toBe("gpt-x");
    expect(modelFor({}, "api:compat")).toBe("");
  });
  it("빈 글·공백·문자열 아님·표 아님은 기본값(던지지 않음)", () => {
    for (const v of ["", "   ", 5, null, undefined, {}, []]) expect(modelFor({ plannerModel: { claude: v } }, "claude")).toBe("haiku");
    for (const pm of ["x", 5, null, [], true]) expect(modelFor({ plannerModel: pm }, "api:anthropic")).toBe("claude-haiku-4-5");
  });
});

describe("S-3301 baseUrlFor", () => {
  it("설정값(자름) 또는 Ollama 기본", () => {
    expect(baseUrlFor({})).toBe("http://localhost:11434/v1");
    expect(baseUrlFor({ plannerBaseUrl: " http://127.0.0.1:1234/v1 " })).toBe("http://127.0.0.1:1234/v1");
    for (const v of ["", "  ", 7, null, {}, false]) expect(baseUrlFor({ plannerBaseUrl: v })).toBe("http://localhost:11434/v1");
  });
});
