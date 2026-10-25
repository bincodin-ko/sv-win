import { describe, expect, it } from "vitest";
import { GLOBE_CHOICES, globeCode } from "./globe";

// F3 S-2271: 지구본 메뉴 = Automatic + 25개 언어, 옆에 현재 코드(Automatic 이면 비움)
describe("지구본", () => {
  it("선택지는 Automatic 먼저 + 26개", () => {
    expect(GLOBE_CHOICES.length).toBe(27);
    expect(GLOBE_CHOICES[0]).toEqual({ code: "auto", name: "Automatic" });
    expect(GLOBE_CHOICES.map((c) => c.code)).toContain("fr");
    expect(GLOBE_CHOICES.map((c) => c.code)).toContain("ko");
  });
  it("코드 글자", () => {
    expect(globeCode("auto")).toBe("");
    expect(globeCode(undefined)).toBe("");
    expect(globeCode("fr")).toBe("FR");
    expect(globeCode("zz")).toBe(""); // 모르는 코드는 auto 와 같다(langArg)
  });
});
