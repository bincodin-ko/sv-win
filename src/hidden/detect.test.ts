import { describe, expect, it } from "vitest";
import { classifyBlock, detectBlocked, detectTrust } from "./detect";

const normal = ['╭───╮\n│ > Try "refactor foo.ts" │\n╰───╯\n  ? for shortcuts', "OpenAI Codex\n› Ask Codex to do anything\n  100% context left"];
describe("S-1204 신뢰 질문", () => {
  it("Claude·Codex 문구 2종을 알아본다", () => {
    expect(detectTrust("Do you trust the files in this folder?\n 1. Yes, proceed")).toBe(true);
    expect(detectTrust("> You are in C:\\x\n  Do you trust the contents of this directory? Working with untrusted contents")).toBe(true);
  });
  it("일반 화면은 아니다", () => {
    for (const n of normal) expect(detectTrust(n)).toBe(false);
  });
});
describe("perf-real 3번 Claude Code 2.1.310 신뢰 문구", () => {
  it("새 문구를 알아본다", () => {
    expect(detectTrust("Quick safety check: Is this a project you created or one you trust? (Like your own code)")).toBe(true);
    expect(detectTrust("❯ No, exit\n  Yes, I trust this folder")).toBe(true);
  });
});
describe("S-1205 막힘", () => {
  it("로그인·업데이트·권한 질문", () => {
    for (const t of ["Select login method:\n 1. Claude account", "Paste code here if prompted >", "Update available! Run npm i -g x", "Do you want to proceed?\n 1. Yes"])
      expect(detectBlocked(t), t).not.toBeNull();
  });
  it("일반 화면·신뢰 질문(따로 처리)은 막힘이 아니다", () => {
    for (const n of normal) expect(detectBlocked(n)).toBeNull();
    expect(detectBlocked("Do you trust the files in this folder?")).toBeNull();
  });
});

describe("Q3 S-3148·S-3152 Gemini·OpenCode 문구 [추측]", () => {
  it("Gemini 신뢰 질문", () => {
    expect(detectTrust("Do you trust this folder?\n 1. Trust folder")).toBe(true);
  });
  it("Gemini 로그인·OpenCode 제공자 없음은 막힘", () => {
    for (const t of ["Waiting for auth... (Press ESC or CTRL+C to cancel)", "How would you like to authenticate?\n Login with Google", "No providers configured. Run opencode auth login"])
      expect(detectBlocked(t), t).not.toBeNull();
  });
  it("Gemini 신뢰 질문은 막힘이 아니다(따로 처리)", () => {
    expect(detectBlocked("Do you trust this folder?")).toBeNull();
  });
});

describe("막힘 종류 (y6)", () => {
  const perm = [
    " Bash command",
    "",
    "   git push origin main",
    "",
    " Do you want to proceed?",
    " ❯ 1. Yes",
    "   2. Yes, and don't ask again for git push commands",
    "   3. No, and tell Claude what to do differently (esc)",
  ].join("\n");
  it("권한 질문은 permission + 질문 줄", () => {
    const r = classifyBlock(perm);
    expect(r.kind).toBe("permission");
    expect(r.line).toContain("git push origin main");
    expect(r.line).toContain("Do you want to proceed?");
    expect(r.line).not.toContain("\n");
  });
  it("질문 줄은 길이 제한", () => {
    expect(classifyBlock("x".repeat(500) + "\nDo you want to proceed?").line.length).toBeLessThanOrEqual(160);
  });
  it("신뢰 질문은 trust, 로그인은 other", () => {
    expect(classifyBlock("Do you trust the files in this folder?").kind).toBe("trust");
    expect(classifyBlock("Select login method:").kind).toBe("other");
    expect(classifyBlock("Update available! Run npm i").kind).toBe("other");
  });
});
