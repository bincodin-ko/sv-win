import { describe, expect, it } from "vitest";
import { PRESETS } from "./defs";
import { cardSummary, fillEvery, laneAgents, skippedKinds, summaryOf } from "./ui";

const by = (n: string) => PRESETS.find((p) => p.name === n)!;

describe("카드 요약 (S-653, S-649)", () => {
  it("에이전트 수 · 팀 수 (콘솔 2개 이상 레인이 팀)", () => {
    expect(cardSummary(by("Dev HQ"))).toBe("12 agents · 3 teams");
    expect(cardSummary(by("Pair"))).toBe("2 agents · 1 team");
    expect(cardSummary(by("Four Squads"))).toBe("16 agents · 4 teams");
  });
  it("summaryOf 는 1 이면 단수", () => {
    expect(summaryOf(1, 0)).toBe("1 agent · 0 teams");
    expect(summaryOf(5, 2)).toBe("5 agents · 2 teams");
  });
});

describe("건너뛰는 타일 표시 (S-641)", () => {
  it("아는 종류가 없으면 타일 종류가 모두 건너뛴 것, 중복 없이", () => {
    expect(skippedKinds(by("Dev HQ"), [])).toEqual(["kanban", "web", "orchestrator"]);
    expect(skippedKinds(by("Dev HQ"), ["kanban"])).toEqual(["web", "orchestrator"]);
    expect(skippedKinds(by("Pair"), [])).toEqual([]);
  });
  it("S-1164 registry 에 kanban·web 이 있으면 orchestrator 만 남는다", () => {
    expect(skippedKinds(by("Dev HQ"), ["kanban", "web"])).toEqual(["orchestrator"]);
    expect(skippedKinds(by("Squad and Board"), ["kanban", "web"])).toEqual([]);
  });
  it("S-1794 orchestrator 까지 등록되면 아무것도 건너뛰지 않는다(18개 전부)", () => {
    for (const d of PRESETS) expect([d.name, skippedKinds(d, ["kanban", "web", "orchestrator"])]).toEqual([d.name, []]);
    expect(skippedKinds(by("Briefed Squad"), ["kanban", "web", "orchestrator"])).toEqual([]);
    expect(skippedKinds(by("Squad and Board"), ["kanban", "web"])).toEqual([]);
  });
});

describe("레인 에이전트 (S-646, S-645)", () => {
  it("손대지 않은 레인은 기본 에이전트, 손댄 레인은 그 에이전트", () => {
    expect(laneAgents(by("Sprint Room"), {}, "claude")).toEqual(["claude", "claude"]);
    expect(laneAgents(by("Sprint Room"), { 1: "codex" }, "claude")).toEqual(["claude", "codex"]);
  });
  it("Fill every lane: 모든 레인 번호가 한 에이전트로", () => {
    expect(fillEvery(by("Ship It"), "gemini")).toEqual({ 0: "gemini", 1: "gemini", 2: "gemini", 3: "gemini" });
    expect(laneAgents(by("Ship It"), fillEvery(by("Ship It"), "gemini"), "claude")).toEqual(Array(4).fill("gemini"));
  });
});
