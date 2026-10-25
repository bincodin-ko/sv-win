import { describe, expect, it } from "vitest";
import { canReadTranscript, pickerRows } from "./transcriptSupport";

describe("S-3140 canReadTranscript", () => {
  it("claude·codex·gemini·opencode 는 읽는다", () => {
    for (const id of ["claude", "codex", "gemini", "opencode"]) expect(canReadTranscript(id)).toEqual({ ok: true });
  });
  it("그 밖은 못 읽음 + 카탈로그 이름이 든 이유", () => {
    for (const id of ["grok", "kimi", "amp", "copilot", "qwen", "cursor", "aider", "mine"])
      expect(canReadTranscript(id, "Name X")).toEqual({ ok: false, why: "Symvibe can't read Name X's chat history yet" });
    expect(canReadTranscript("grok", "Grok")).toEqual({ ok: false, why: "Symvibe can't read Grok's chat history yet" });
  });
});

const list = [
  { id: "claude", name: "Claude", installed: true },
  { id: "codex", name: "Codex", installed: false },
  { id: "gemini", name: "Gemini", installed: true },
  { id: "grok", name: "Grok", installed: true },
  { id: "opencode", name: "OpenCode", installed: false },
  { id: "shell", name: "Shell", installed: true },
  { id: "aider", name: "Aider", installed: false },
];
describe("S-3149~S-3151 pickerRows", () => {
  it("alwaysShow 가 비면: 설치된 읽는 것(claude·codex·gemini·opencode 순) 뒤에 설치된 못 읽는 것(회색+이유). Shell·미설치는 없음", () => {
    expect(pickerRows(list, [])).toEqual([
      { id: "claude", name: "Claude Code", enabled: true },
      { id: "gemini", name: "Gemini CLI", enabled: true },
      { id: "grok", name: "Grok", enabled: false, why: "Symvibe can't read Grok's chat history yet" },
    ]);
  });
  it("Documents·Diagrams: claude·codex 는 늘 보임(미설치는 enabled false, 이유 없음), gemini·opencode 는 설치됐을 때만, 못 읽는 것은 맨 뒤", () => {
    const r = pickerRows(list, ["claude", "codex"]);
    expect(r.map((x) => x.id)).toEqual(["claude", "codex", "gemini", "grok"]);
    expect(r[1]).toEqual({ id: "codex", name: "Codex", enabled: false });
    expect(r[3]!.enabled).toBe(false);
  });
  it("Loop: 4개 모두 늘 보임(미설치 disabled)", () => {
    const r = pickerRows(list, ["claude", "codex", "gemini", "opencode"]);
    expect(r.map((x) => [x.id, x.enabled])).toEqual([["claude", true], ["codex", false], ["gemini", true], ["opencode", false], ["grok", false]]);
  });
  it("목록에 없는 always 항목도 미설치로 보인다", () => {
    expect(pickerRows([], ["claude"])).toEqual([{ id: "claude", name: "Claude Code", enabled: false }]);
  });
  it("사용자 에이전트(설치됨)도 못 읽음으로 회색", () => {
    const r = pickerRows([{ id: "mine", name: "My Agent", installed: true }], []);
    expect(r).toEqual([{ id: "mine", name: "My Agent", enabled: false, why: "Symvibe can't read My Agent's chat history yet" }]);
  });
});
