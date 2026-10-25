import { describe, expect, it } from "vitest";
import { FIXED_KEYS } from "./fixedKeys";

// spec S-2723 목록(키 이름은 번역하지 않는다)
const WANT = ["Ctrl+K", "Ctrl+Shift+P", "F6 / Shift+F6", "Ctrl+F6 / Ctrl+Shift+F6", "Ctrl+PageUp / Ctrl+PageDown", "F2", "Ctrl+S", "Ctrl+Z / Ctrl+Y",
  "Ctrl+A / Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+D", "Ctrl+G / Ctrl+Shift+G", "Ctrl+Shift+T", "Ctrl+0 / Ctrl++ / Ctrl+-", "Shift+1", "X", "Ctrl+O", "Ctrl+Shift+L", "Ctrl+Shift+W", "Ctrl+,", "Ctrl+Q", "Ctrl+Space"];
describe("S-2723 고정 키 표", () => {
  it("spec 의 키가 모두 있다", () => expect(FIXED_KEYS.map((k) => k.keys)).toEqual(WANT));
  it("키 중복 없음, 설명은 비지 않음", () => {
    expect(new Set(FIXED_KEYS.map((k) => k.keys)).size).toBe(FIXED_KEYS.length);
    for (const k of FIXED_KEYS) expect(k.what.length).toBeGreaterThan(0);
  });
  it("Tidy up·받아쓰기 줄", () => {
    expect(FIXED_KEYS.find((k) => k.keys === "Ctrl+Shift+T")?.what).toBe("Tidy up");
    expect(FIXED_KEYS.find((k) => k.keys === "Ctrl+Space")?.what).toMatch(/[Dd]ictate/);
  });
});
