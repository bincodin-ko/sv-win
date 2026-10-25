import { describe, expect, it } from "vitest";
import { consoleCount, PRESETS } from "./defs";

// 기대값은 spec S-640 표(docs_presets)에서만
const NAMES = ["Dev HQ", "Sprint Room", "Web Studio", "Ship It", "Bug Hunt", "Pair", "Trio", "Squad of Four", "Two Squads", "Three Squads", "Four Squads", "Squad and Board", "Squad and Preview", "Briefed Squad", "Feature Squad", "Review Panel", "Security Sweep", "Docs Sprint"];
const COUNTS: Record<string, number> = { "Dev HQ": 12, "Sprint Room": 4, "Web Studio": 5, "Ship It": 8, "Bug Hunt": 5, Pair: 2, Trio: 3, "Squad of Four": 4, "Two Squads": 8, "Three Squads": 12, "Four Squads": 16, "Squad and Board": 4, "Squad and Preview": 4, "Briefed Squad": 4, "Feature Squad": 4, "Review Panel": 3, "Security Sweep": 4, "Docs Sprint": 3 };
const GROUPS: Record<string, string[]> = {
  "Dev HQ": ["Frontend", "Backend", "Reviewers"], "Sprint Room": ["Frontend", "Backend"], "Web Studio": ["Design", "Frontend"],
  "Ship It": ["Frontend", "Testers", "Backend", "Reviewers"], "Bug Hunt": ["Testers", "Reviewers"], "Feature Squad": ["Frontend", "Backend"],
  "Security Sweep": ["Security", "Reviewers"], "Review Panel": ["Reviewers"], "Docs Sprint": ["Docs"],
};
const TILES: Record<string, string[]> = {
  "Dev HQ": ["kanban", "web", "orchestrator"], "Sprint Room": ["kanban", "orchestrator"], "Web Studio": ["web", "orchestrator"], "Ship It": ["kanban", "orchestrator"],
  "Bug Hunt": ["kanban"], "Squad and Board": ["kanban"], "Squad and Preview": ["web"], "Briefed Squad": ["orchestrator"],
};
const by = (n: string) => PRESETS.find((p) => p.name === n)!;

describe("S-640 내장 preset 18개", () => {
  it("정확히 18개, 이름 순서", () => {
    expect(PRESETS).toHaveLength(18);
    expect(PRESETS.map((p) => p.name)).toEqual(NAMES);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(18);
  });
  it("콘솔 수 합계", () => {
    for (const n of NAMES) expect([n, consoleCount(by(n))]).toEqual([n, COUNTS[n]]);
  });
  it("그룹(레인) 이름과 수", () => {
    for (const n of Object.keys(GROUPS)) expect([n, by(n).lanes.map((l) => l.group)]).toEqual([n, GROUPS[n]]);
    for (const n of ["Two Squads", "Three Squads", "Four Squads"]) expect(by(n).lanes).toHaveLength(COUNTS[n]! / 4);
    expect(by("Dev HQ").lanes.map((l) => l.role)).toEqual(["frontend", "backend", "reviewers"]);
  });
  it("S-641 도우미 타일 종류", () => {
    for (const n of NAMES) expect([n, by(n).tiles.map((t) => t.kind)]).toEqual([n, TILES[n] ?? []]);
  });
  it("S-1161 타일은 종류·칸·옵션만 갖고 크기는 없다, S-1162 옵션", () => {
    for (const p of PRESETS) for (const t of p.tiles) expect(Object.keys(t)).not.toContain("w");
    for (const p of PRESETS) for (const t of p.tiles) expect(Object.keys(t)).not.toContain("h");
    expect(by("Bug Hunt").tiles[0]!.opts).toEqual({ title: "Triage" });
    expect(by("Squad and Preview").tiles[0]!.opts).toEqual({ url: "http://localhost:3000" });
    expect(by("Dev HQ").tiles.find((t) => t.kind === "web")!.opts).toEqual({ url: "http://localhost:3000" });
    expect(by("Squad and Board").tiles[0]!.opts?.title ?? "Board").toBe("Board");
  });
  it("같은 preset 안 그룹 이름은 겹치지 않는다, 기본 에이전트 레인", () => {
    for (const p of PRESETS) {
      expect(new Set(p.lanes.map((l) => l.group)).size).toBe(p.lanes.length);
      expect(p.lanes.every((l) => l.agent === "default" && l.count >= 1)).toBe(true);
    }
  });
});
