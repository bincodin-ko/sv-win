import { describe, expect, it } from "vitest";
import { showsPrompt } from "./prompts";

// S-607 인식 문구는 추측 목록: 화면 샘플 문자열로 true/false 를 본다
describe("S-607 showsPrompt", () => {
  it("Claude 권한 프롬프트(Do you want to proceed? + ❯ 1. Yes 목록)", () => {
    expect(showsPrompt([" Bash command", "   npm test", "", " Do you want to proceed?", " ❯ 1. Yes", "   2. Yes, and don't ask again for npm test commands", "   3. No, and tell Claude what to do differently (esc)"])).toBe(true);
  });
  it("Claude 편집 확인·폴더 신뢰 질문", () => {
    expect(showsPrompt(["Do you want to make this edit to src/a.ts?", "❯ 1. Yes", "  2. No"])).toBe(true);
    expect(showsPrompt(["Do you trust the files in this folder?", "❯ 1. Yes, proceed", "  2. No, exit"])).toBe(true);
  });
  it("Codex 승인 선택 목록", () => {
    expect(showsPrompt(["Would you like to run the following command?", "  $ npm test", "› 1. Yes, proceed (y)", "  2. No, and tell Codex what to do differently (esc)"])).toBe(true);
    expect(showsPrompt(["  Press enter to confirm or esc to cancel"])).toBe(true);
  });
  it("일반 y/n 질문", () => {
    expect(showsPrompt(["Overwrite file? (y/n)"])).toBe(true);
  });
  it("일을 하는 중이거나 입력을 기다리는 평범한 화면은 아니다", () => {
    expect(showsPrompt([])).toBe(false);
    expect(showsPrompt(["● Running tests…", "  ✓ 12 passed", "> ", "? for shortcuts"])).toBe(false);
    expect(showsPrompt(["Yes, I think we should proceed with the plan."])).toBe(false);
  });
});
