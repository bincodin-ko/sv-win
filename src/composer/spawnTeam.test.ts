import { beforeEach, describe, expect, it } from "vitest";
import { isConsole, useBoard, type ConsoleNode } from "../board/store";
import { spawnTeam } from "./spawnTeam";

const st = () => useBoard.getState();
const cons = () => Object.values(st().nodes).filter(isConsole) as ConsoleNode[];
beforeEach(() => useBoard.setState({ nodes: {}, groups: [], selection: [], viewport: { x: 0, y: 0, zoom: 1 }, history: { past: [], future: [] } }));

describe("S-526·S-530 spawnTeam", () => {
  it("N개 콘솔 + 그룹 하나: 에이전트 순서대로, 이름 서로 다름, 같은 groupId", () => {
    const r = spawnTeam({ name: "Crew", role: "backend", agents: ["codex", "claude", "shell", "claude"] });
    expect(r.ids).toHaveLength(4);
    expect(r.ids.map((id) => (st().nodes[id] as ConsoleNode).agentId)).toEqual(["codex", "claude", "shell", "claude"]);
    expect(new Set(cons().map((c) => c.name)).size).toBe(4);
    expect(st().groups).toHaveLength(1);
    expect(st().groups[0]).toMatchObject({ name: "Crew", role: "backend" });
    expect(r.groupId).toBe(st().groups[0]!.id);
    expect(cons().every((c) => c.groupId === r.groupId)).toBe(true);
  });
  it("이름이 비면 그룹 이름은 역할 이름으로 채워 저장(S-506, FX5 D12)", () => {
    spawnTeam({ name: "  ", role: "testers", agents: ["gemini", "gemini"] });
    expect(st().groups[0]!.name).toBe("Testers");
    expect(st().groups[0]!.role).toBe("testers");
  });
  it("N=1 이면 그룹 없이 콘솔만", () => {
    const r = spawnTeam({ name: "x", role: "general", agents: ["claude"] });
    expect(cons()).toHaveLength(1);
    expect(st().groups).toHaveLength(0);
    expect(r.groupId).toBeNull();
    expect(cons()[0]!.groupId).toBeUndefined();
  });
  it("12 를 넘으면 12 로 줄이고 알린다(S-533)", () => {
    const r = spawnTeam({ name: "", role: "general", agents: Array(15).fill("shell") });
    expect(cons()).toHaveLength(12);
    expect(r.clamped).toBe(true);
    expect(spawnTeam({ name: "", role: "general", agents: ["shell", "shell"] }).clamped).toBe(false);
  });
  it("에이전트가 0개면 아무것도 안 한다", () => {
    expect(spawnTeam({ name: "", role: "general", agents: [] }).ids).toEqual([]);
    expect(cons()).toHaveLength(0);
  });
  it("S-527 되돌리기 1번에 콘솔도 그룹도 전부 사라지고, 다시 하기로 돌아온다", () => {
    spawnTeam({ name: "Crew", role: "general", agents: ["shell", "shell", "shell"] });
    expect(cons()).toHaveLength(3);
    expect(st().undo()).toBe(true);
    expect(cons()).toHaveLength(0);
    expect(st().groups).toHaveLength(0);
    expect(st().undo()).toBe(false); // 한 단계뿐
    st().redo();
    expect(cons()).toHaveLength(3);
    expect(st().groups).toHaveLength(1);
  });
  it("S-526 배치: 열 수 ceil(sqrt N), 간격 24, 덩어리 가운데가 화면 가운데", () => {
    spawnTeam({ name: "", role: "general", agents: ["shell", "shell", "shell", "shell", "shell"] });
    const c = cons();
    const xs = [...new Set(c.map((n) => n.x))].sort((a, b) => a - b);
    const ys = [...new Set(c.map((n) => n.y))].sort((a, b) => a - b);
    expect(xs).toHaveLength(3); // 5개 → 3열 2행
    expect(ys).toHaveLength(2);
    expect(xs[1]! - xs[0]!).toBe(720 + 24);
    expect(ys[1]! - ys[0]!).toBe(440 + 24);
    const x0 = Math.min(...c.map((n) => n.x)), x1 = Math.max(...c.map((n) => n.x + n.w));
    expect(Math.abs((x0 + x1) / 2)).toBeLessThan(1);
  });
  it("기존 콘솔과도 겹치지 않는다(S-030)", () => {
    st().spawnConsole("shell");
    spawnTeam({ name: "", role: "general", agents: ["shell", "shell"] });
    const c = cons();
    expect(c).toHaveLength(3);
    for (const a of c) for (const b of c) if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
  });
  it("at 를 주면 덩어리 왼쪽 위가 그 자리", () => {
    spawnTeam({ name: "", role: "general", agents: ["shell", "shell"] }, useBoard, { x: 1000, y: 2000 });
    expect(Math.min(...cons().map((n) => n.x))).toBe(1000);
    expect(Math.min(...cons().map((n) => n.y))).toBe(2000);
  });
});
