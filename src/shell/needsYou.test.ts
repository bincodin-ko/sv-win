import { describe, expect, it } from "vitest";
import { pickNext } from "./needsYou";

describe("S-689 N 키 순서", () => {
  it("비면 null", () => expect(pickNext([], null)).toBeNull());
  it("처음 누르면 첫 번째, 다시 누르면 다음, 끝에서는 처음으로 돈다", () => {
    const l = ["a", "b", "c"];
    expect(pickNext(l, null)).toBe("a");
    expect(pickNext(l, "a")).toBe("b");
    expect(pickNext(l, "c")).toBe("a");
  });
  it("마지막으로 간 콘솔이 목록에서 빠졌으면 처음부터", () => {
    expect(pickNext(["b", "c"], "a")).toBe("b");
  });
  it("하나뿐이면 계속 그것", () => {
    expect(pickNext(["a"], "a")).toBe("a");
  });
});
