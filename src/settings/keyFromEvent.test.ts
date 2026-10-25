import { describe, expect, it } from "vitest";
import { keyFromEvent } from "./keyFromEvent";

describe("S-2412 keyFromEvent", () => {
  it("한글 자모·Process 는 event.code 의 영문 키로", () => {
    expect(keyFromEvent({ key: "ㅁ", code: "KeyA" })).toBe("a");
    expect(keyFromEvent({ key: "Process", code: "KeyS" })).toBe("s");
    expect(keyFromEvent({ key: "Process", code: "Digit3" })).toBe("3");
  });
  it("보통 키는 key 그대로", () => {
    expect(keyFromEvent({ key: "a", code: "KeyA" })).toBe("a");
    expect(keyFromEvent({ key: "Escape", code: "Escape" })).toBe("Escape");
    expect(keyFromEvent({ key: "Delete", code: "Delete" })).toBe("Delete");
    expect(keyFromEvent({ key: " ", code: "Space" })).toBe(" ");
    expect(keyFromEvent({ key: "ㅁ", code: "Space" })).toBe("ㅁ");
  });
});
