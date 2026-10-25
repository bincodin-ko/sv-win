import { describe, expect, it } from "vitest";
import { buildPrompt, DOCS, EFFORT_WORDS } from "./prompts";

// 기대값 출처: spec S-1974(문서 9종 이름)·S-1973(노력 3단계)·briefs/E6 시험 항목(영어·도구 금지·한 개 # 제목·단어 수)
const NAMES = ["Project overview", "Onboarding guide", "Architecture", "README", "API reference", "Data model", "Security overview", "Testing guide", "Release notes"];

describe("S-1974 문서 목록", () => {
  it("9개, 이름과 순서가 명세 그대로, 설명은 모두 있다", () => {
    expect(DOCS.map((d) => d.name)).toEqual(NAMES);
    expect(new Set(DOCS.map((d) => d.id)).size).toBe(9);
    expect(DOCS.find((d) => d.id === "overview")?.blurb).toBe("What this repo is, at a glance");
    for (const d of DOCS) expect(d.blurb.length).toBeGreaterThan(5);
  });
  it("레일 메뉴가 넘기는 id(overview·onboarding·architecture)가 있다", () => {
    for (const id of ["overview", "onboarding", "architecture"]) expect(DOCS.some((d) => d.id === id)).toBe(true);
  });
});

describe("buildPrompt", () => {
  it("문서 9종 모두: 그 문서 이름이 들어가고 서로 다른 프롬프트", () => {
    const ps = DOCS.map((d) => buildPrompt({ docId: d.id }, "balanced"));
    DOCS.forEach((d, i) => expect(ps[i]).toContain(d.name));
    expect(new Set(ps).size).toBe(9);
  });
  it("노력별 단어 수 문구가 서로 다르고 프롬프트에 들어간다", () => {
    const w = (["quick", "balanced", "thorough"] as const).map((e) => EFFORT_WORDS[e]);
    expect(new Set(w).size).toBe(3);
    for (const e of ["quick", "balanced", "thorough"] as const) expect(buildPrompt({ docId: "readme" }, e)).toContain(EFFORT_WORDS[e]);
    expect(EFFORT_WORDS.quick).toMatch(/words/);
  });
  it("영어로 쓰기·도구 쓰지 않기·한 개의 # 제목을 요구한다", () => {
    const p = buildPrompt({ docId: "architecture" }, "balanced");
    expect(p).toMatch(/in English/i);
    expect(p).toMatch(/do not (use|call|run) any tools/i);
    expect(p).toMatch(/starting with a single # title/i);
    expect(p).toMatch(/Do not run any tools or open any files/);
  });
  it("자유 요청은 요청 문장을 그대로 담는다(문서 이름 없이)", () => {
    const p = buildPrompt({ docId: "ask", ask: "a migration plan from REST to GraphQL" }, "quick");
    expect(p).toContain("a migration plan from REST to GraphQL");
    expect(p).toContain(EFFORT_WORDS.quick);
    expect(p).toMatch(/starting with a single # title/i);
    for (const n of NAMES) expect(p).not.toContain(n);
  });
  it("S-1979 단어 수: Quick 400–700 · Balanced 700–1,100 · Thorough 900–1,500", () => {
    expect(EFFORT_WORDS.quick).toContain("400–700 words");
    expect(EFFORT_WORDS.balanced).toContain("700–1,100 words");
    expect(EFFORT_WORDS.thorough).toContain("900–1,500 words");
  });
});
