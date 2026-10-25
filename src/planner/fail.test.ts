import { beforeEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n";
import { apiReasonText, failText } from "./fail";

beforeEach(() => setLang("en"));
const P = (r: string) => `I couldn't read that: ${r}. Start with who it is for, like @Otto run the tests`;

describe("S-2983 failText", () => {
  it("reason 표", () => {
    expect(failText({ reason: "no agent" })).toBe(P("no planner is available — install a CLI agent or add an API key (Settings > Planner)")); // S-3356
    expect(failText({ reason: "timeout" })).toBe(P("the planner took longer than 20 seconds"));
    expect(failText({ reason: "start" })).toBe(P("the planner couldn't start"));
    expect(failText({ reason: "login" })).toBe(P("the planner needs you to sign in (run claude once in a console)"));
    expect(failText({ reason: "blocked" })).toBe(P("the planner is waiting for an answer in its own window"));
    expect(failText({ reason: "bad", detail: "unknown action" })).toBe(P("the planner's answer wasn't usable (unknown action)"));
    expect(failText({ reason: "none", detail: "not a board command" })).toBe(P("the planner said: not a board command"));
    expect(failText({ reason: "long" })).toBe(P("that sentence is too long for the planner (500 characters)"));
  });
  it("off는 null(기존 문구를 쓰라는 뜻)", () => expect(failText({ reason: "off" })).toBeNull());
  it("detail 속 {x}는 그대로", () => expect(failText({ reason: "none", detail: "{reason} {detail}" })).toBe(P("the planner said: {reason} {detail}")));
});

// S-3316
describe("login 문구는 CLI 이름을 넣는다", () => {
  it("cli 없으면 claude", () => {
    expect(failText({ reason: "login" })).toBe(P("the planner needs you to sign in (run claude once in a console)"));
    for (const cli of ["claude", "codex", "gemini", "opencode"]) expect(failText({ reason: "login", cli })).toBe(P(`the planner needs you to sign in (run ${cli} once in a console)`));
  });
});

// S-3352·S-3353
describe("API 실패 종류 문구", () => {
  it("failText 는 기존 틀 안에", () => {
    expect(failText({ reason: "no key", provider: "api:openai" })).toBe(P("the OpenAI API key isn't set (Settings > Planner)"));
    expect(failText({ reason: "no key", provider: "api:anthropic" })).toBe(P("the Anthropic API key isn't set (Settings > Planner)"));
    expect(failText({ reason: "no key", provider: "api:gemini" })).toBe(P("the Google Gemini API key isn't set (Settings > Planner)"));
    expect(failText({ reason: "no model", provider: "api:compat" })).toBe(P("pick a model for OpenAI-compatible (Ollama…) in Settings > Planner"));
    expect(failText({ reason: "no model", provider: "api:openai" })).toBe(P("pick a model for OpenAI API in Settings > Planner"));
    expect(failText({ reason: "url" })).toBe(P("the server address isn't allowed (http only for this PC or your local network)"));
    expect(failText({ reason: "net", detail: "localhost" })).toBe(P("couldn't reach localhost"));
    expect(failText({ reason: "auth" })).toBe(P("the API key was rejected"));
    expect(failText({ reason: "quota" })).toBe(P("the API is rate-limited or out of credit"));
    expect(failText({ reason: "model", detail: "gpt-x" })).toBe(P('the model "gpt-x" wasn\'t found'));
    expect(failText({ reason: "http", detail: "500: oops" })).toBe(P("the API answered 500: oops"));
  });
  it("한국어 화면에서도 한국어(예)", () => {
    setLang("ko");
    expect(failText({ reason: "auth" })).toContain("API 키가 거부됐어요");
    expect(failText({ reason: "quota" })).toContain("요청이 너무 많거나 크레딧이 없어요");
    expect(failText({ reason: "net", detail: "h.example" })).toContain("h.example에 연결하지 못했어요");
  });
});

// S-3354
describe("apiReasonText", () => {
  it("ApiErr 종류마다 틀 없는 이유 글", () => {
    const f = (e: Parameters<typeof apiReasonText>[0], p: Parameters<typeof apiReasonText>[1] = "api:openai", m?: string) => apiReasonText(e, p, m);
    expect(f({ kind: "no key" })).toBe("the OpenAI API key isn't set (Settings > Planner)");
    expect(f({ kind: "no model" }, "api:compat")).toBe("pick a model for OpenAI-compatible (Ollama…) in Settings > Planner");
    expect(f({ kind: "url" })).toBe("the server address isn't allowed (http only for this PC or your local network)");
    expect(f({ kind: "net", detail: "127.0.0.1" })).toBe("couldn't reach 127.0.0.1");
    expect(f({ kind: "timeout" })).toBe("the planner took longer than 20 seconds");
    expect(f({ kind: "auth", status: 401 })).toBe("the API key was rejected");
    expect(f({ kind: "quota", status: 429 })).toBe("the API is rate-limited or out of credit");
    expect(f({ kind: "model", status: 404, detail: "server text" }, "api:openai", "gpt-x")).toBe('the model "gpt-x" wasn\'t found');
    expect(f({ kind: "http", status: 500, detail: "oops" })).toBe("the API answered 500: oops");
    expect(f({ kind: "http", status: 302 })).toBe("the API answered 302");
    expect(f({ kind: "bad", detail: "answer too large" })).toBe("the planner's answer wasn't usable (answer too large)");
  });
});
