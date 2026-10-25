import { describe, expect, it } from "vitest";
import type { Group } from "../board/groups";
import type { BoardNode } from "../board/store";
import type { Status } from "../console/status";
import { badgeOf, buildSections, counterText, headerText, isWorking } from "./rows";

const con = (id: string, g?: string): BoardNode => ({ id, kind: "console", x: 0, y: 0, w: 720, h: 440, z: 1, name: `Con ${id}`, agentId: "codex", ...(g ? { groupId: g } : {}) });
const nodes = (...ns: BoardNode[]) => Object.fromEntries(ns.map((n) => [n.id, n]));
const G = (id: string, name: string): Group => ({ id, name, role: "general" });
const card = (wired: string[], collapsed: string[] = []): BoardNode => ({ id: "o1", kind: "orchestrator", x: 0, y: 0, w: 380, h: 520, z: 2, name: "Orchestrator", wired, collapsed });
const info = (m: Record<string, Status> = {}) => (id: string) => ({ status: m[id] ?? ("IDLE" as Status), agentName: "Codex" });

describe("S-1253 머리 보조줄", () => {
  it("N agents · M groups", () => expect(headerText(21, ["A", "B"])).toBe("21 agents · 2 groups"));
  it("그룹이 정확히 하나면 그 이름", () => expect(headerText(8, ["Team"])).toBe("8 agents · Team"));
  it("그룹 0이면 N agents", () => expect(headerText(3, [])).toBe("3 agents"));
  it("1 agent / 1 agent · 그룹", () => { expect(headerText(1, [])).toBe("1 agent"); expect(headerText(1, ["Team"])).toBe("1 agent · Team"); });
  it("연결이 0이어도 문구가 깨지지 않는다", () => expect(headerText(0, [])).toBe("0 agents"));
});

describe("S-1253 카운터 working/total", () => {
  it("일하는 콘솔 수 / 전체", () => expect(counterText(["WORKING", "RUNNING", "IDLE", "DONE"])).toBe("2/4"));
  it("빈 목록 0/0", () => expect(counterText([])).toBe("0/0"));
});

describe("S-1255 뱃지 문구", () => {
  it.each<[Status, string]>([["STARTING", "running"], ["WORKING", "running"], ["RUNNING", "running"], ["NEEDS YOU", "needs you"], ["READY", "ready"], ["PAUSED", "paused"], ["ERROR", "error"], ["DONE", "done"], ["IDLE", "idle"]])("%s -> %s", (s, b) => expect(badgeOf(s)).toBe(b));
  it("isWorking 은 뱃지 running 과 같다", () => { expect(isWorking("WORKING")).toBe(true); expect(isWorking("READY")).toBe(false); });
});

describe("S-1254 구역 묶기", () => {
  const ns = nodes(con("c1", "g1"), con("c2", "g1"), con("c3"), con("c4"));
  const gs = [G("g1", "Team")];
  it("그룹 밖 연결 콘솔은 맨 위 헤더 없는 구역, 그 아래 그룹 구역", () => {
    const s = buildSections(ns, gs, card(["c3", "g1"]), info({ c1: "WORKING" }));
    expect(s.map((x) => x.groupId)).toEqual([null, "g1"]);
    expect(s[0]!.title).toBe("");
    expect(s[0]!.rows.map((r) => r.id)).toEqual(["c3"]);
    expect(s[1]!.title).toBe("TEAM 1/2");
    expect([s[1]!.working, s[1]!.total]).toEqual([1, 2]);
  });
  it("같은 콘솔이 그룹과 개별로 둘 다 연결돼도 행은 한 번(그룹 구역에)", () => {
    const s = buildSections(ns, gs, card(["c1", "g1"]), info());
    expect(s.flatMap((x) => x.rows).map((r) => r.id)).toEqual(["c1", "c2"]);
    expect(s).toHaveLength(1);
  });
  it("접은 그룹은 collapsed true, 행 정보(이름·에이전트·뱃지)", () => {
    const s = buildSections(ns, gs, card(["g1"], ["g1"]), info({ c2: "NEEDS YOU" }));
    expect(s[0]!.collapsed).toBe(true);
    expect(s[0]!.rows[1]).toEqual({ id: "c2", name: "Con c2", agentName: "Codex", status: "NEEDS YOU", badge: "needs you" });
  });
  it("사라진 id 는 건너뛴다", () => {
    expect(buildSections(ns, gs, card(["zz"]), info())).toEqual([]);
  });
});
