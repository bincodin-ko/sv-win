import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TERM_KEYS, termTheme } from "./palette";

// S-362: tokens.css 의 글자/배경 변수 쌍이 OG·Light 모두 4.5:1 이상
const css = readFileSync("src/theme/tokens.css", "utf8");
const block = (sel: string) => {
  const i = css.indexOf(sel + " {");
  const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
  const o: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) o[m[1]] = m[2].trim();
  return o;
};
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.replace(/./g, "$&$&") : h;
  return 0.2126 * lin(parseInt(f.slice(0, 2), 16)) + 0.7152 * lin(parseInt(f.slice(2, 4), 16)) + 0.0722 * lin(parseInt(f.slice(4, 6), 16));
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const PAIRS: [string, string][] = [
  ["--text", "--bg"], ["--text", "--panel"], ["--text", "--panel-2"], ["--text-dim", "--bg"], ["--text-dim", "--panel"],
  ["--accent-text", "--accent"], ["--on-fill", "--danger-btn"], ["--on-fill", "--danger-2"], ["--accent-ink", "--accent"],
  ["--fg", "--surface"], ["--fg-2", "--surface"], ["--fg-3", "--surface"], ["--fg-4", "--surface"], ["--fg", "--surface-2"], ["--fg-2", "--surface-2"],
  ["--on-fill", "--chip"], ["--warn-fg", "--warn-bg"], ["--fg-2", "--well"], ["--mute", "--surface"], ["--mute", "--panel"], ["--err-text", "--surface"],
];
// S-2663: OG 주황(#f97316) 위 글자는 #111 이라 OG 도 4.5 를 지킨다(예전 예외 "흰 글자 = 2.8" 을 없앰). 주황이 아닌 채움(빨강·chip) 위 글자는 --on-fill(흰색)
const OG_EXEMPT = new Set<string>();
describe("S-362 대비 4.5:1", () => {
  for (const [name, sel] of [["OG", ':root, [data-theme="og"]'], ["Light", '[data-theme="light"]']] as const) {
    const v = block(sel);
    for (const [fg, bg] of PAIRS.filter(([a, b]) => name === "Light" || !OG_EXEMPT.has(a + "|" + b))) it(`${name} ${fg} on ${bg}`, () => {
      expect(v[fg], `${fg} 없음`).toBeTruthy();
      expect(v[bg], `${bg} 없음`).toBeTruthy();
      expect(ratio(v[fg], v[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }
  for (const m of ["og", "light"] as const) it(`${m} 터미널 기본 글자/배경`, () => {
    const t = termTheme(m);
    expect(TERM_KEYS.length).toBe(20);
    expect(ratio(t.foreground, t.background)).toBeGreaterThanOrEqual(4.5);
  });
});

// S-2663: 주황 단추 위 글자 토큰
describe("S-2663 --accent-text", () => {
  it("OG 는 #111", () => expect(block(':root, [data-theme="og"]')["--accent-text"]).toBe("#111"));
  it("--on-fill 은 두 테마 모두 흰색", () => {
    for (const sel of [':root, [data-theme="og"]', '[data-theme="light"]']) expect(block(sel)["--on-fill"]).toBe("#fff");
  });
});

// S-2662: 상태 pill 글자색·대비 (배경은 그대로). 표는 명세 값이고 ConsoleNode.tsx 의 PILL·PILL_FG 를 읽어 맞춘다
const src = readFileSync("src/board/ConsoleNode.tsx", "utf8");
const rec = (name: string) => {
  const line = src.split(/\r?\n/).find((l) => l.startsWith(`export const ${name}:`)) ?? "";
  return Object.fromEntries([...line.matchAll(/"?([A-Z][A-Z ]*)"?:\s*"(#[0-9a-fA-F]+)"/g)].map((m) => [m[1], m[2].toLowerCase()]));
};
const PILL_SPEC: Record<string, [string, string, number]> = {
  IDLE: ["#6b7280", "#fff", 4.83], DONE: ["#6b7280", "#fff", 4.83], ERROR: ["#dc2626", "#fff", 4.83],
  STARTING: ["#d4a017", "#111", 7.95], WORKING: ["#3b82f6", "#111", 5.13], RUNNING: ["#22a55b", "#111", 5.94],
  PAUSED: ["#a855f7", "#111", 4.77], "NEEDS YOU": ["#f59e0b", "#111", 8.79], READY: ["#14b8a6", "#111", 7.59],
};
describe("S-2662 상태 pill 글자색", () => {
  const bg = rec("PILL"), fg = rec("PILL_FG");
  for (const [st, [b, f, r]] of Object.entries(PILL_SPEC)) it(`${st}: ${f} on ${b} = ${r}`, () => {
    expect(bg[st]).toBe(b);
    expect(fg[st]).toBe(f);
    expect(Math.abs(ratio(f, b) - r)).toBeLessThan(0.01);
    expect(ratio(f, b)).toBeGreaterThanOrEqual(4.5);
  });
});

// S-2664·S-2665: 전역 포커스 윤곽·강제 색 모드
describe("S-2664 전역 :focus-visible", () => {
  it("2px solid var(--accent), offset 2px, !important", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)\s*!important[^}]*outline-offset:\s*2px\s*!important/);
  });
  it("명령줄 입력란은 윤곽 없음(껍질이 테두리)", () => {
    expect(css).toMatch(/\[data-testid="bar-input"\]:focus-visible\s*\{[^}]*outline:\s*none\s*!important/);
  });
  it("forced-colors 에서 Highlight", () => {
    expect(css).toMatch(/@media \(forced-colors: active\)[\s\S]*Highlight/);
  });
});
