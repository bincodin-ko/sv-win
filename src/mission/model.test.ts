import { describe, expect, it } from "vitest";
import type { Group } from "../board/groups";
import type { BoardNode } from "../board/store";
import type { Status } from "../console/status";
import { missionModel, missionState, plural, type Filter, type SessInfo } from "./model";

const con = (id: string, name: string, agentId = "claude", groupId?: string): BoardNode => ({ id, kind: "console", x: 0, y: 0, w: 1, h: 1, z: 1, name, agentId, ...(groupId ? { groupId } : {}) });
const card = (id: string, wired: string[], name = "Orch"): BoardNode => ({ id, kind: "orchestrator", x: 0, y: 0, w: 1, h: 1, z: 1, name, wired });
const nodes = (...l: BoardNode[]) => Object.fromEntries(l.map((n) => [n.id, n]));
const G = (id: string, name = id, role = "general"): Group => ({ id, name, role: role as Group["role"] });
const S = (status: Status, hooked = false, lastOut?: number): SessInfo => ({ status, hooked, lastOut });
const sess = (m: Record<string, SessInfo>) => (id: string) => m[id];

describe("S-1304 missionState 접기 표", () => {
  const rows: [Status, boolean, string][] = [
    ["READY", true, "idle"], ["READY", false, "working"], ["IDLE", false, "working"], ["IDLE", true, "working"],
    ["PAUSED", false, "idle"], ["PAUSED", true, "idle"], ["ERROR", false, "needs"], ["NEEDS YOU", true, "needs"],
    ["DONE", false, "done"], ["DONE", true, "done"], ["STARTING", false, "working"], ["WORKING", true, "working"], ["RUNNING", false, "working"],
  ];
  for (const [st, hook, want] of rows) it(`${st} hook=${hook} → ${want}`, () => expect(missionState(st, hook)).toBe(want));
});

describe("S-1301 요약 문구·단수 복수", () => {
  it("plural", () => {
    expect(plural(1, "console")).toBe("1 console");
    expect(plural(0, "console")).toBe("0 consoles");
    expect(plural(28, "team")).toBe("28 teams");
  });
  it("1 orchestrator · 1 team · 2 consoles · 1 working", () => {
    const n = nodes(card("o", ["g"]), con("a", "A", "claude", "g"), con("b", "B", "claude", "g"));
    const m = missionModel(n, [G("g")], sess({ a: S("WORKING"), b: S("DONE") }), 0);
    expect(m.summary).toBe("Mission Map · 1 orchestrator · 1 team · 2 consoles · 1 working");
  });
  it("복수 orchestrators·teams, 단수 console", () => {
    const n = nodes(card("o1", []), card("o2", []), con("a", "A", "claude", "g1"), con("b", "B", "claude", "g2"));
    const m = missionModel(n, [G("g1"), G("g2")], sess({ a: S("DONE"), b: S("DONE") }), 0);
    expect(m.summary).toBe("Mission Map · 2 orchestrators · 2 teams · 2 consoles · 0 working");
  });
  it("콘솔 0개면 empty", () => {
    expect(missionModel(nodes(card("o", [])), [], sess({}), 0).empty).toBe(true);
    expect(missionModel(nodes(con("a", "A")), [], sess({ a: S("RUNNING") }), 0).empty).toBe(false);
  });
});

describe("S-1307 집계", () => {
  const n = nodes(card("o", ["g"]), con("a", "A", "claude", "g"), con("b", "B"), con("c", "C"), con("d", "D"), con("e", "E"));
  const m = missionModel(n, [G("g")], sess({ a: S("WORKING"), b: S("NEEDS YOU", true), c: S("ERROR"), d: S("READY", true), e: S("DONE") }), 3);
  it("상태별 개수", () => expect(m.counts).toEqual({ working: 1, needs: 2, idle: 1, done: 1 }));
  it("STRUCTURE", () => expect(m.structure).toEqual({ orchestrators: 1, teams: 1, consoles: 5, loops: 3 }));
  it("세션이 없는 콘솔은 Done", () => expect(missionModel(nodes(con("x", "X")), [], sess({}), 0).consoles[0]!.state).toBe("done"));
});

describe("S-1303 노드 모양 정보", () => {
  const n = nodes(card("o", ["g", "z"]), con("a", "Alpha", "codex", "g"), con("b", "Beta", "claude", "g"), con("z", "Zed"));
  const m = missionModel(n, [G("g", "Backend team", "backend")], sess({ a: S("WORKING", false, 9_500), b: S("PAUSED", false, 1_000), z: S("DONE") }), 0, { now: 10_000, agentName: (i) => (i === "codex" ? "Codex" : i) });
  it("콘솔 보조줄 = 에이전트 · 역할(그룹 역할)", () => {
    expect(m.consoles.find((c) => c.id === "a")!.sub).toBe("Codex · Backend");
    expect(m.consoles.find((c) => c.id === "z")!.sub).toBe("claude");
  });
  it("그룹 w/n, 카드 n agents(그룹 멤버 + 직접 연결, 한 번씩)", () => {
    const g = m.groups[0]!;
    expect([g.working, g.total]).toEqual([1, 2]);
    expect(m.cards[0]!.agents).toBe(3);
  });
  it("출력이 새로 온 Working 콘솔만 glow", () => {
    expect(m.consoles.find((c) => c.id === "a")!.glow).toBe(true);
    expect(m.consoles.find((c) => c.id === "b")!.glow).toBe(false);
    expect(m.consoles.find((c) => c.id === "z")!.glow).toBe(false);
  });
});

describe("S-1305 필터·검색", () => {
  const n = nodes(
    card("o1", ["g1"], "Lead"), card("o2", ["g2"], "Other"),
    con("a", "Alpha", "claude", "g1"), con("b", "Beta", "codex", "g1"), con("c", "Gamma", "claude", "g2"), con("d", "Delta", "gemini"),
  );
  const groups = [G("g1", "Frontend", "frontend"), G("g2", "Ops", "backend")];
  const ss = sess({ a: S("WORKING"), b: S("DONE"), c: S("NEEDS YOU", true), d: S("PAUSED") });
  const run = (filter: Filter, query = "") => missionModel(n, groups, ss, 0, { filter, query });
  const ids = (m: ReturnType<typeof run>) => m.consoles.map((c) => c.id).sort();
  it("All = 전부", () => {
    const m = run("all");
    expect(ids(m)).toEqual(["a", "b", "c", "d"]);
    expect(m.cards).toHaveLength(2);
    expect(m.groups).toHaveLength(2);
  });
  it("Working: 그 콘솔과 그 콘솔을 가진 그룹·카드만", () => {
    const m = run("working");
    expect(ids(m)).toEqual(["a"]);
    expect(m.groups.map((g) => g.id)).toEqual(["g1"]);
    expect(m.cards.map((c) => c.id)).toEqual(["o1"]);
  });
  it("Needs you / Idle / Done", () => {
    expect(ids(run("needs"))).toEqual(["c"]);
    expect(run("needs").cards.map((c) => c.id)).toEqual(["o2"]);
    expect(ids(run("idle"))).toEqual(["d"]);
    expect(run("idle").groups).toHaveLength(0);
    expect(ids(run("done"))).toEqual(["b"]);
  });
  it("필터를 걸어도 요약 수는 전체 기준", () => expect(run("working").summary).toContain("4 consoles"));
  it("검색: 콘솔 이름 부분 일치, 대소문자 무시", () => expect(ids(run("all", "ALP"))).toEqual(["a"]));
  it("검색: 에이전트 이름·역할", () => {
    expect(ids(run("all", "codex"))).toEqual(["b"]);
    expect(ids(run("all", "backend"))).toEqual(["c"]);
  });
  it("검색: 그룹 이름이 맞으면 그 멤버가 남는다", () => expect(ids(run("all", "frontend"))).toEqual(["a", "b"]));
  it("필터와 검색은 둘 다 맞아야(AND)", () => {
    expect(ids(run("working", "alpha"))).toEqual(["a"]);
    expect(ids(run("done", "alpha"))).toEqual([]);
  });
  it("맞는 게 없으면 카드·그룹도 빈다", () => {
    const m = run("all", "zzz");
    expect([m.consoles.length, m.groups.length]).toEqual([0, 0]);
  });
});

describe("S-1302 선·점선(Command bar only)", () => {
  const n = nodes(
    card("o1", ["g1", "c3"]), card("o2", ["g1"]),
    con("c1", "C1", "claude", "g1"), con("c2", "C2", "claude", "g2"), con("c3", "C3"), con("c4", "C4"),
  );
  const m = missionModel(n, [G("g1"), G("g2")], sess({ c1: S("RUNNING"), c2: S("RUNNING"), c3: S("RUNNING"), c4: S("RUNNING") }), 0);
  const has = (from: string, to: string) => m.lines.filter((l) => l.from === from && l.to === to);
  it("카드 → 연결한 그룹·콘솔, 그룹 → 멤버(실선)", () => {
    expect(has("card:o1", "group:g1")[0]!.dashed).toBe(false);
    expect(has("card:o1", "con:c3")[0]!.dashed).toBe(false);
    expect(has("group:g1", "con:c1")[0]!.dashed).toBe(false);
  });
  it("한 그룹이 카드 둘에 연결되면 선이 둘", () => {
    expect(has("card:o1", "group:g1")).toHaveLength(1);
    expect(has("card:o2", "group:g1")).toHaveLength(1);
  });
  it("어떤 카드에도 연결 안 된 그룹은 Command bar 점선", () => {
    expect(has("cmd", "group:g2")[0]!.dashed).toBe(true);
    expect(has("cmd", "group:g1")).toHaveLength(0);
  });
  it("연결 안 된 낱개 콘솔은 Command bar 점선, 카드에 연결된 낱개는 아님", () => {
    expect(has("cmd", "con:c4")[0]!.dashed).toBe(true);
    expect(has("cmd", "con:c3")).toHaveLength(0);
  });
  it("그룹 안 콘솔에는 Command bar 선이 직접 가지 않는다", () => expect(has("cmd", "con:c1")).toHaveLength(0));
  it("점선은 정확히 2개(g2, c4)", () => expect(m.lines.filter((l) => l.dashed).map((l) => l.to).sort()).toEqual(["con:c4", "group:g2"]));
  it("카드는 Command bar 에서 실선으로 이어진다", () => expect(has("cmd", "card:o1")[0]!.dashed).toBe(false));
  it("필터로 숨겨진 노드로 가는 선은 없다", () => {
    const f = missionModel(n, [G("g1"), G("g2")], sess({ c1: S("WORKING"), c2: S("DONE"), c3: S("DONE"), c4: S("DONE") }), 0, { filter: "working" });
    const shown = new Set(["cmd", ...f.cards.map((c) => `card:${c.id}`), ...f.groups.map((g) => `group:${g.id}`), ...f.consoles.map((c) => `con:${c.id}`)]);
    expect(f.lines.length).toBeGreaterThan(0);
    for (const l of f.lines) expect([shown.has(l.from), shown.has(l.to)]).toEqual([true, true]);
  });
});
