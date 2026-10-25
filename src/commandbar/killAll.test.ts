import { describe, expect, it } from "vitest";
import { chipLabel, click, CONFIRM_MS, idle, isArmed } from "./killAll";

describe("S-547 Kill all 두 번 클릭", () => {
  it("첫 클릭은 Confirm? 로 바뀌고 확인창은 아직", () => {
    const r = click(idle, 1000);
    expect(r.ask).toBe(false);
    expect(isArmed(r.state, 1000)).toBe(true);
    expect(chipLabel(r.state, 1000)).toBe("Confirm?");
    expect(chipLabel(idle, 1000)).toBe("Kill all");
  });
  it("3초가 지나면 원래대로", () => {
    const { state } = click(idle, 1000);
    expect(isArmed(state, 1000 + CONFIRM_MS - 1)).toBe(true);
    expect(isArmed(state, 1000 + CONFIRM_MS)).toBe(false);
    expect(chipLabel(state, 1000 + CONFIRM_MS)).toBe("Kill all");
  });
  it("3초 안의 둘째 클릭은 확인창을 열고 처음으로 돌아간다", () => {
    const a = click(idle, 1000);
    const b = click(a.state, 3999);
    expect(b.ask).toBe(true);
    expect(isArmed(b.state, 4000)).toBe(false);
  });
  it("3초가 지난 뒤의 클릭은 다시 첫 클릭", () => {
    const a = click(idle, 1000);
    const b = click(a.state, 5000);
    expect(b.ask).toBe(false);
    expect(isArmed(b.state, 5000)).toBe(true);
  });
});
