import { describe, expect, it } from "vitest";
import { detectBlocked, detectTrust } from "./detect";

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
