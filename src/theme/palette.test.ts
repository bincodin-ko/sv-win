import { describe, expect, it } from "vitest";
import { TERM_KEYS, termTheme } from "./palette";

describe("S-411 터미널 팔레트 OG/Light", () => {
  for (const m of ["og", "light"] as const) {
    it(`${m}: 기본 글자/배경/커서/선택 + ANSI 16색이 모두 색 값`, () => {
      const t = termTheme(m);
      for (const k of TERM_KEYS) expect(t[k], `${m}.${k}`).toMatch(/^#[0-9a-f]{6}$|^rgba\(/i);
      expect(new Set(TERM_KEYS.slice(4).map((k) => t[k])).size).toBeGreaterThan(8);
    });
  }
  it("Light 는 밝은 바탕, OG 는 어두운 바탕", () => {
    expect(termTheme("light").background).not.toBe(termTheme("og").background);
    expect(termTheme("light").background.toLowerCase()).toMatch(/^#[c-f]/);
    expect(termTheme("og").background.toLowerCase()).toMatch(/^#[0-3]/);
  });
});
