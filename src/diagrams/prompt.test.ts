import { describe, expect, it } from "vitest";
import { buildDiagramPrompt, DIAGRAM_TOPICS } from "./prompt";

describe("S-2027 buildDiagramPrompt", () => {
  it("주제 6개(Architecture·User flow·Data flow·Components·Request lifecycle·State flow)", () => {
    expect(DIAGRAM_TOPICS.map((t) => t.label)).toEqual(["Architecture", "User flow", "Data flow", "Components", "Request lifecycle", "State flow"]);
  });
  it("노력별 컴포넌트 수", () => {
    expect(buildDiagramPrompt("architecture", "quick", "ink")).toContain("6-10 ");
    expect(buildDiagramPrompt("architecture", "balanced", "ink")).toContain("8-14 ");
    expect(buildDiagramPrompt("architecture", "thorough", "ink")).toContain("10-16 ");
  });
  it("고정 문구와 스키마", () => {
    const p = buildDiagramPrompt("architecture", "balanced", "ink");
    for (const s of [
      "Do not run any tools or open any files. Use only what you can already see in this repo.",
      "Reply with one JSON object and nothing else.",
      '"title"',
      '"nodes"',
      '"edges"',
      '"box"|"ellipse"|"diamond"|"pill"',
      "Label a few edges with a short verb. Label every edge leaving a decision with its answer. Steps use shape pill. Use groups only for real layers.",
    ])
      expect(p).toContain(s);
  });
  it("주제 id 는 풀어 쓰고 자유 설명은 그대로 넣는다", () => {
    expect(buildDiagramPrompt("user-flow", "quick", "ink")).toContain(DIAGRAM_TOPICS[1].ask);
    expect(buildDiagramPrompt("how login works", "quick", "ink")).toContain("how login works");
  });
  it("순수: 같은 입력 같은 글", () => {
    expect(buildDiagramPrompt("x", "quick", "colorful")).toBe(buildDiagramPrompt("x", "quick", "colorful"));
  });
});
