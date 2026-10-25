import { describe, expect, it } from "vitest";
import { splitCommand, validateAgent, type CustomAgent } from "./custom";

const mine: CustomAgent = { id: "custom:1", name: "Mine", command: "mytool" };
const reserved = ["Claude", "Shell"];

describe("splitCommand (S-376 공백으로 나누고 따옴표는 해석하지 않음)", () => {
  it("공백 여럿·앞뒤 공백을 하나로", () => expect(splitCommand("  mytool  --a   b ")).toEqual(["mytool", "--a", "b"]));
  it("따옴표는 그대로", () => expect(splitCommand('t "a b"')).toEqual(["t", '"a', 'b"']));
  it("빈 문자열은 빈 목록", () => expect(splitCommand("   ")).toEqual([]));
});

describe("validateAgent (S-376)", () => {
  it("정상이면 custom: id 를 붙여 돌려준다 (이름·명령은 다듬는다)", () => {
    const r = validateAgent([mine], reserved, "  Other ", " tool --x ");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.agent.name).toBe("Other");
      expect(r.agent.command).toBe("tool --x");
      expect(r.agent.id).toMatch(/^custom:./);
      expect(r.agent.id).not.toBe(mine.id);
    }
  });
  it("이름이 비면 거절", () => {
    expect(validateAgent([], reserved, "", "tool").ok).toBe(false);
    expect(validateAgent([], reserved, "   ", "tool").ok).toBe(false);
  });
  it("이름이 겹치면 거절 (대소문자 무시, 내 목록과 내장 이름)", () => {
    expect(validateAgent([mine], reserved, "mine", "tool").ok).toBe(false);
    expect(validateAgent([mine], reserved, "claude", "tool").ok).toBe(false);
  });
  it("명령이 비면 거절", () => expect(validateAgent([], reserved, "X", "  ").ok).toBe(false));
  it("거절은 사유 문구를 준다", () => {
    const r = validateAgent([], reserved, "", "tool");
    expect(!r.ok && r.error.length > 0).toBe(true);
  });
});
