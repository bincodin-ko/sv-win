import { beforeEach, describe, expect, it } from "vitest";
import { registerKind, resetKindsForTest } from "../board/kinds/registry";
import { deserialize, serialize } from "../board/persist";
import { makeBoardStore } from "../board/store";
import { orchestratorAddedText } from "../commandbar/answers";
import { addOrchestrator, connectTo, makeOrchestrator, nextOrchestratorName } from "./add";

const mk = () => {
  const s = makeBoardStore();
  s.getState().spawnMany(["shell", "shell", "shell", "shell", "shell"]);
  const ids = Object.keys(s.getState().nodes);
  const g = s.getState().createGroup(ids, { name: "Group 1" })!;
  return { s, ids, g };
};
beforeEach(() => {
  resetKindsForTest();
  registerKind({ id: "orchestrator", label: "orchestrator", Component: () => null, defaultSize: { w: 380, h: 520 }, minSize: { w: 300, h: 260 }, resizable: true, bodyDrag: false, eraserTarget: false, wireColor: "orange", create: makeOrchestrator });
});

describe("S-1251 이름 규칙", () => {
  it("비어 있으면 Orchestrator, 그다음 2, 3…", () => {
    expect(nextOrchestratorName([])).toBe("Orchestrator");
    expect(nextOrchestratorName(["Orchestrator"])).toBe("Orchestrator 2");
    expect(nextOrchestratorName(["Orchestrator", "Orchestrator 2"])).toBe("Orchestrator 3");
  });
  it("이미 쓰는 번호는 건너뛴다", () => {
    expect(nextOrchestratorName(["Orchestrator", "Orchestrator 3"])).toBe("Orchestrator 2");
    expect(nextOrchestratorName(["Orchestrator 2"])).toBe("Orchestrator");
  });
  it("레일 기본(create 에 이름 없음)은 항상 Orchestrator", () => {
    expect(makeOrchestrator().name).toBe("Orchestrator");
    expect(makeOrchestrator({ name: "Boss" }).name).toBe("Boss");
  });
  it("기본 필드: wired [] · collapsed []", () => {
    const o = makeOrchestrator();
    expect(o.wired).toEqual([]);
    expect(o.collapsed).toEqual([]);
  });
});

describe("S-1263 addOrchestrator", () => {
  it("겹치지 않는 자리에 놓고 선택, groupId 면 wired=[groupId]", () => {
    const { s, g } = mk();
    const r = addOrchestrator(s, { groupId: g });
    const n = s.getState().nodes[r.id]!;
    expect(n.kind).toBe("orchestrator");
    expect(n.wired).toEqual([g]);
    expect(r).toEqual({ id: n.id, name: "Orchestrator", consoles: 5 });
    expect(s.getState().selection).toEqual([r.id]);
    for (const o of Object.values(s.getState().nodes)) if (o.id !== n.id) expect(n.x < o.x + o.w && o.x < n.x + n.w && n.y < o.y + o.h && o.y < n.y + n.h).toBe(false);
  });
  it("그룹 없으면 wired 빈 배열, 두 번째 카드는 Orchestrator 2, 이름을 주면 그 이름", () => {
    const { s } = mk();
    const a = addOrchestrator(s, {});
    expect(s.getState().nodes[a.id]!.wired).toEqual([]);
    expect(a.consoles).toBe(0);
    expect(addOrchestrator(s, {}).name).toBe("Orchestrator 2");
    expect(addOrchestrator(s, { name: "Boss" }).name).toBe("Boss");
  });
  it("되돌리기 1단계", () => {
    const { s, g } = mk();
    const before = Object.keys(s.getState().nodes).length;
    addOrchestrator(s, { groupId: g });
    expect(Object.keys(s.getState().nodes)).toHaveLength(before + 1);
    s.getState().undo();
    expect(Object.keys(s.getState().nodes)).toHaveLength(before);
  });
  it("답 문구", () => {
    expect(orchestratorAddedText("Group 1", 5)).toBe("Orchestrator added for Group 1. Wire to 5 consoles.");
    expect(orchestratorAddedText("Group 1", 1)).toBe("Orchestrator added for Group 1. Wire to 1 console.");
    expect(orchestratorAddedText(null, 0)).toBe("Orchestrator added.");
  });
});

describe("S-1264 connectTo", () => {
  it("콘솔·그룹을 wired 에 더하고, 이미 있으면 그대로 + Already wired.", () => {
    const { s, ids, g } = mk();
    const { id } = addOrchestrator(s, {});
    expect(connectTo(s, id, { kind: "console", id: ids[0]! })).not.toBe("Already wired.");
    expect(connectTo(s, id, { kind: "group", id: g })).not.toBe("Already wired.");
    expect(s.getState().nodes[id]!.wired).toEqual([ids[0], g]);
    expect(connectTo(s, id, { kind: "console", id: ids[0]! })).toBe("Already wired.");
    expect(s.getState().nodes[id]!.wired).toEqual([ids[0], g]);
  });
  it("되돌리기 1단계(더한 것만 취소)", () => {
    const { s, ids } = mk();
    const { id } = addOrchestrator(s, {});
    connectTo(s, id, { kind: "console", id: ids[0]! });
    s.getState().undo();
    expect(s.getState().nodes[id]!.wired).toEqual([]);
  });
});

describe("저장·복원 왕복", () => {
  it("name·wired·collapsed·lastOrder 가 그대로 돌아온다", () => {
    const { s, g } = mk();
    const { id } = addOrchestrator(s, { groupId: g });
    s.getState().updateNode(id, { collapsed: [g], lastOrder: { text: "ship it", at: 123 } });
    const ws = { id: "w", name: "W", repoPath: "C:/r" };
    const back = deserialize(serialize({ viewport: s.getState().viewport, nodes: s.getState().nodes, groups: s.getState().groups }, ws));
    const n = back.nodes[id]!;
    expect([n.name, n.wired, n.collapsed, n.lastOrder]).toEqual(["Orchestrator", [g], [g], { text: "ship it", at: 123 }]);
  });
});
