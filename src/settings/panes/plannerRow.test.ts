import { describe, expect, it } from "vitest";
import { plannerRowView } from "./plannerRow";

// 기대값: 설명서 방법 메모 / S-2900·S-2904 (선택지는 설치된 것 + off, 저장값이 미설치면 plannerAgent가 고른 값)
// S-3302: 선택지에 API 4개가 붙음 (cli/api 두 묶음, off는 렌더가 맨 끝에 붙임 — S-3360)
const API = ["api:openai", "api:anthropic", "api:gemini", "api:compat"];
describe("plannerRowView", () => {
  it("둘 다 설치, 저장 없음 -> 기본 claude", () => {
    expect(plannerRowView(undefined, ["claude", "codex"])).toEqual({ value: "claude", cli: ["claude", "codex"], api: API });
  });
  it("claude 미설치, codex 설치 -> codex로 보임", () => {
    expect(plannerRowView("claude", ["codex"])).toEqual({ value: "codex", cli: ["codex"], api: API });
  });
  it("아무것도 미설치 -> off만", () => {
    expect(plannerRowView("claude", [])).toEqual({ value: "off", cli: [], api: API });
  });
  it("저장값 off는 설치돼도 off", () => {
    expect(plannerRowView("off", ["claude"])).toEqual({ value: "off", cli: ["claude"], api: API });
  });
  it("저장값 api:*는 설치와 무관하게 그대로 (S-3302)", () => {
    expect(plannerRowView("api:openai", [])).toEqual({ value: "api:openai", cli: [], api: API });
  });
});
