import { describe, expect, it } from "vitest";
import { checkup, NO_FINDINGS } from "./checkup";
import { composeSkill, parseSkill } from "./parse";
import { STARTERS } from "./starters";

const WANT: [string, string][] = [["commit", "Commit"], ["pr-description", "PR description"], ["changelog", "Changelog"], ["test-first", "Test first"], ["bug-hunt", "Bug hunt"], ["refactor-plan", "Refactor plan"], ["api-docs", "API docs"], ["standup", "Standup"], ["explain", "Explain"], ["perf-pass", "Perf pass"], ["deps-audit", "Deps audit"], ["readme-refresh", "README refresh"]];

describe("S-2082·S-2083 starters", () => {
  it("12개, 이름(명령)·제목이 정해진 대로, 순서도", () => {
    expect(STARTERS.map((s) => [s.name, s.title])).toEqual(WANT);
  });
  it("모두 점검에서 No findings", () => {
    expect(NO_FINDINGS).toMatch(/^No findings/);
    for (const s of STARTERS) {
      const raw = composeSkill(s);
      expect(checkup(parseSkill(raw, s.name), s.name), s.name).toEqual([]);
    }
  });
  it("본문 60줄 이하·설명 한 줄(비지 않음)", () => {
    for (const s of STARTERS) {
      expect(s.body.trim().split("\n").length, s.name).toBeLessThanOrEqual(60);
      expect(s.body.trim().length, s.name).toBeGreaterThan(40);
      expect(s.description.trim().length, s.name).toBeGreaterThan(10);
      expect(s.description, s.name).not.toContain("\n");
    }
  });
  it("위험한 일을 시키지 않는다", () => {
    for (const s of STARTERS) for (const bad of ["--force", "--no-verify", "rm -rf", "git push -f", "reset --hard"]) expect(s.body + s.description, `${s.name} ${bad}`).not.toContain(bad);
  });
});
