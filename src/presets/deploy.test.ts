import { beforeEach, describe, expect, it } from "vitest";
import { isConsole, useBoard, CONSOLE_H, CONSOLE_W } from "../board/store";
import "../board/kinds/kanban";
import "../board/kinds/web";
import "../board/kinds/orchestrator";
import "../board/kinds/memory";
import { deployPreset, registryOpts, stampSaved } from "./deploy";
import { PRESETS } from "./defs";
import { useArmedPreset } from "./armed";

const st = () => useBoard.getState();
const by = (n: string) => PRESETS.find((p) => p.name === n)!;
const o = { center: { x: 0, y: 0 }, defaultAgent: "claude", installed: ["claude", "shell"], knownKinds: ["console"] };
const box = (id: string, x: number, y: number) => ({ id, kind: "box", x, y, w: 100, h: 100, z: 1 });
const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

beforeEach(() => useBoard.setState({ nodes: {}, groups: [], selection: [], tool: "select", viewport: { x: 0, y: 0, zoom: 1 }, history: { past: [], future: [] } }));

describe("S-642 deployPreset", () => {
  it("콘솔·그룹이 생기고 한 번의 되돌리기로 전부 사라진다", () => {
    st().addNode(box("a", 5000, 5000));
    const r = deployPreset(useBoard, by("Dev HQ"), o);
    expect(r.ids).toHaveLength(12);
    expect(r.skipped).toEqual(["kanban", "web", "orchestrator"]); // o.knownKinds = ["console"] 만 아는 상태
    expect(Object.values(st().nodes).filter(isConsole)).toHaveLength(12);
    expect(st().groups.map((g) => g.name)).toEqual(["Frontend", "Backend", "Reviewers"]);
    expect(st().groups.map((g) => g.role)).toEqual(["frontend", "backend", "reviewers"]);
    expect(Object.values(st().nodes).filter((n) => n.groupId === st().groups[1]!.id)).toHaveLength(4);
    expect(st().history.past).toHaveLength(1);
    expect(st().undo()).toBe(true);
    expect(Object.keys(st().nodes)).toEqual(["a"]);
    expect(st().groups).toEqual([]);
  });
  it("기존 노드와 겹치지 않는다", () => {
    st().addNode({ ...box("big", -300, -200), w: 600, h: 400 });
    deployPreset(useBoard, by("Pair"), o);
    const old = st().nodes.big!;
    const made = Object.values(st().nodes).filter(isConsole);
    expect(made).toHaveLength(2);
    expect(made.some((c) => hit(c, old))).toBe(false);
  });
  it("콘솔 이름은 서로 다르고 크기는 기본, 에이전트 반영", () => {
    deployPreset(useBoard, by("Trio"), { ...o, defaultAgent: "shell" });
    const cs = Object.values(st().nodes).filter(isConsole);
    expect(new Set(cs.map((c) => c.name)).size).toBe(3);
    expect(cs.every((c) => c.w === CONSOLE_W && c.h === CONSOLE_H && c.agentId === "shell")).toBe(true);
  });
});

// S-1160~S-1164 (C18): registry 에 kanban·web 이 등록된 상태(위 import)
const reg = (d: string) => ({ ...o, ...registryOpts(by(d)) });
describe("S-1160·S-1162·S-1164 타일 배치", () => {
  it("registryOpts: 등록된 종류만 knownKinds 와 기본 크기로", () => {
    const r = registryOpts(by("Dev HQ"));
    expect(r.knownKinds.sort()).toEqual(["kanban", "orchestrator", "web"]);
    expect(r.sizes).toEqual({ kanban: { w: 960, h: 460 }, web: { w: 640, h: 420 }, orchestrator: { w: 380, h: 520 } });
  });
  it("Dev HQ: 칸반 1·웹 1·orchestrator 1·콘솔 12, skipped 없음, 되돌리기 1번에 전부 사라진다", () => {
    st().addNode(box("a", 5000, 5000));
    const r = deployPreset(useBoard, by("Dev HQ"), reg("Dev HQ"));
    expect(r.skipped).toEqual([]);
    const ns = Object.values(st().nodes);
    expect(ns.filter((n) => n.kind === "orchestrator")).toHaveLength(1);
    expect(ns.filter(isConsole)).toHaveLength(12);
    expect(ns.filter((n) => n.kind === "kanban")).toHaveLength(1);
    expect(ns.filter((n) => n.kind === "web")).toHaveLength(1);
    expect(st().groups.map((g) => g.name)).toEqual(["Frontend", "Backend", "Reviewers"]);
    expect(ns.filter((n) => n.kind === "kanban" || n.kind === "web").every((n) => !n.groupId)).toBe(true);
    expect(st().history.past).toHaveLength(1);
    expect(st().undo()).toBe(true);
    expect(Object.keys(st().nodes)).toEqual(["a"]);
  });
  it("웹 타일은 localhost:3000 을 연 탭 하나(일반 타일), 칸반은 빈 4열 'Board'", () => {
    deployPreset(useBoard, by("Dev HQ"), reg("Dev HQ"));
    const web = Object.values(st().nodes).find((n) => n.kind === "web")!;
    expect(web.tabs).toMatchObject([{ url: "http://localhost:3000" }]);
    expect(web.auto).toBeFalsy();
    expect(web).toMatchObject({ w: 640, h: 420 });
    const kb = Object.values(st().nodes).find((n) => n.kind === "kanban")!;
    expect(kb).toMatchObject({ title: "Board", w: 960, h: 460 });
    expect(kb.columns).toHaveLength(4);
  });
  it("Bug Hunt 의 칸반 제목은 Triage", () => {
    deployPreset(useBoard, by("Bug Hunt"), reg("Bug Hunt"));
    expect(Object.values(st().nodes).find((n) => n.kind === "kanban")).toMatchObject({ title: "Triage" });
  });
  it("타일끼리·콘솔과 겹치지 않는다", () => {
    deployPreset(useBoard, by("Dev HQ"), reg("Dev HQ"));
    const ns = Object.values(st().nodes);
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) expect([ns[i]!.id, ns[j]!.id, hit(ns[i]!, ns[j]!)]).toEqual([ns[i]!.id, ns[j]!.id, false]);
  });
  it("Briefed Squad: 콘솔 4 + orchestrator 1, skipped 없음", () => {
    const r = deployPreset(useBoard, by("Briefed Squad"), reg("Briefed Squad"));
    expect(r.skipped).toEqual([]);
    expect(Object.keys(st().nodes)).toHaveLength(5);
  });
});

// S-1790 (D16): 놓은 orchestrator 는 그 preset 이 만든 그룹 전부 + 그룹 없는 콘솔에 연결돼 있다
const orch = () => Object.values(st().nodes).filter((n) => n.kind === "orchestrator");
const lane = (group: string, count: number, x: number) => ({ group, role: "general" as const, count, agent: "default", x, y: 0, cols: 1 });
describe("S-1790 orchestrator wired", () => {
  it("Dev HQ: wired = 그룹 3개 id, 되돌리기 1번에 전부 사라진다", () => {
    st().addNode(box("a", 5000, 5000));
    deployPreset(useBoard, by("Dev HQ"), reg("Dev HQ"));
    expect(orch()).toHaveLength(1);
    expect(orch()[0]!.wired).toEqual(st().groups.map((g) => g.id));
    expect(st().groups).toHaveLength(3);
    expect(st().history.past).toHaveLength(1);
    expect(st().undo()).toBe(true);
    expect(Object.keys(st().nodes)).toEqual(["a"]);
    expect(st().groups).toEqual([]);
  });
  it("Briefed Squad: wired = 그룹 1개", () => {
    deployPreset(useBoard, by("Briefed Squad"), reg("Briefed Squad"));
    expect(orch()[0]!.wired).toEqual(st().groups.map((g) => g.id));
    expect(st().groups).toHaveLength(1);
  });
  it("Sprint Room·Web Studio·Ship It 도 각자 그룹 전부", () => {
    for (const [n, g] of [["Sprint Room", 2], ["Web Studio", 2], ["Ship It", 4]] as const) {
      useBoard.setState({ nodes: {}, groups: [] });
      deployPreset(useBoard, by(n), reg(n));
      expect([n, orch()[0]!.wired]).toEqual([n, st().groups.map((x) => x.id)]);
      expect(st().groups).toHaveLength(g);
    }
  });
  it("그룹 없는 콘솔(레인 콘솔 1개)은 콘솔 id 로 연결, 그룹 id 와 함께", () => {
    const def = { id: "x", name: "X", lanes: [lane("Solo", 1, 0), lane("Duo", 2, 900)], tiles: [{ kind: "orchestrator", gx: 3 }] };
    deployPreset(useBoard, def, { ...o, ...registryOpts(def) });
    const solo = Object.values(st().nodes).filter(isConsole).find((c) => !c.groupId)!;
    expect(orch()[0]!.wired).toEqual([st().groups[0]!.id, solo.id]);
    deployPreset(useBoard, { ...def, lanes: [lane("Solo", 1, 0)] }, { ...o, ...registryOpts(def) });
    expect(orch()[1]!.wired).toHaveLength(1);
    expect(Object.keys(st().nodes).includes(String(orch()[1]!.wired[0]))).toBe(true);
  });
  it("preset 이 아닌 기존 노드·그룹은 wired 에 들어가지 않는다", () => {
    deployPreset(useBoard, by("Pair"), { ...o, ...registryOpts(by("Pair")) });
    deployPreset(useBoard, by("Briefed Squad"), reg("Briefed Squad"));
    expect(orch()[0]!.wired).toEqual([st().groups[1]!.id]);
  });
});

describe("S-1793 저장 layout 은 wired 를 저장하지 않는다", () => {
  it("orchestrator·memory 를 찍으면 빈 카드(wired [])", () => {
    stampSaved(useBoard, { name: "Set 1", nodes: [{ kind: "orchestrator", x: 0, y: 0, w: 380, h: 520 }, { kind: "memory", x: 500, y: 0, w: 300, h: 200 }] }, { x: 0, y: 0 });
    expect(orch()[0]).toMatchObject({ name: "Orchestrator", wired: [] });
    expect(Object.values(st().nodes).find((n) => n.kind === "memory")).toMatchObject({ wired: [] });
  });
});

describe("S-1163 stampSaved 새 종류", () => {
  it("저장된 칸반은 빈 4열, 웹은 빈 시작 탭으로 채워진다(주소는 저장 안 함)", () => {
    stampSaved(useBoard, { name: "Set 1", nodes: [{ kind: "kanban", x: 0, y: 0, w: 960, h: 460, title: "Board" }, { kind: "web", x: 1100, y: 0, w: 640, h: 420 }] }, { x: 0, y: 0 });
    const kb = Object.values(st().nodes).find((n) => n.kind === "kanban")!;
    expect(kb.columns).toHaveLength(4);
    const web = Object.values(st().nodes).find((n) => n.kind === "web")!;
    expect(web.tabs).toMatchObject([{ url: "" }]);
    expect(st().history.past).toHaveLength(1);
  });
});

describe("S-648 stampSaved", () => {
  it("저장한 layout 이 center 에 한 단계로 찍힌다", () => {
    const ids = stampSaved(useBoard, { name: "Set 1", nodes: [{ kind: "console", x: 5, y: 5, w: 10, h: 10, agentId: "claude" }, { kind: "text", x: 900, y: 5, w: 200, h: 100, text: "hi" }] }, { x: 0, y: 0 });
    expect(ids).toHaveLength(2);
    expect(Object.values(st().nodes).filter(isConsole)[0]).toMatchObject({ w: CONSOLE_W, h: CONSOLE_H, agentId: "claude" });
    expect(st().history.past).toHaveLength(1);
  });
});

describe("armed", () => {
  it("한 번 쓰면 해제", () => {
    useArmedPreset.getState().arm("Dev HQ");
    expect(useArmedPreset.getState().armed).toBe("Dev HQ");
    expect(useArmedPreset.getState().take()).toBe("Dev HQ");
    expect(useArmedPreset.getState().armed).toBeNull();
    expect(useArmedPreset.getState().take()).toBeNull();
  });
});
