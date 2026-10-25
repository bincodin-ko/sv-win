import { beforeEach, describe, expect, it } from "vitest";
import { copyToClip } from "./clipboard";
import { emptyHistory } from "./history";
import { useBoard } from "./store";
import { useSettings } from "../settings/useSettings";
import { registerKind, resetKindsForTest } from "./kinds/registry";

const box = (id: string, x: number, y: number, z = 0) => ({ id, kind: "box", x, y, w: 100, h: 100, z });
const st = () => useBoard.getState();

beforeEach(() => useBoard.setState({ nodes: {}, selection: [], tool: "select", viewport: { x: 0, y: 0, zoom: 1 } }));

describe("S-029 맨 앞으로", () => {
  it("선택한 노드가 z 최대가 되고, 선택(select)만으로는 z 가 안 바뀐다", () => {
    st().addNode(box("a", 0, 0, 1));
    st().addNode(box("b", 200, 0, 2));
    st().select(["a"]);
    expect(st().nodes.a!.z).toBe(1);
    st().bringToFront(["a"]);
    expect(st().nodes.a!.z).toBeGreaterThan(st().nodes.b!.z);
  });
  it("맨 앞으로도 되돌리기 1단계", () => {
    st().addNode(box("a", 0, 0, 1));
    st().addNode(box("b", 200, 0, 2));
    st().bringToFront(["a"]);
    st().undo();
    expect(st().nodes.a!.z).toBe(1);
  });
  it("여러 개를 올려도 서로의 앞뒤 순서는 유지", () => {
    st().addNode(box("a", 0, 0, 1));
    st().addNode(box("b", 200, 0, 2));
    st().addNode(box("c", 400, 0, 3));
    st().bringToFront(["a", "b"]);
    const n = st().nodes;
    expect(n.a!.z).toBeGreaterThan(n.c!.z);
    expect(n.b!.z).toBeGreaterThan(n.a!.z);
  });
});

describe("S-024 moveBy", () => {
  it("선택 전체를 같은 만큼", () => {
    st().addNode(box("a", 0, 0));
    st().addNode(box("b", 50, 60));
    st().moveBy(["a", "b"], 10, -5);
    expect([st().nodes.a!.x, st().nodes.a!.y, st().nodes.b!.x, st().nodes.b!.y]).toEqual([10, -5, 60, 55]);
  });
  it("기록은 1단계(키 한 번)", () => {
    st().addNode(box("a", 0, 0));
    st().moveBy(["a"], 1, 0);
    st().undo();
    expect(st().nodes.a!.x).toBe(0);
  });
});

describe("S-026 복사·붙여넣기·복제", () => {
  it("붙여넣기: 새 id, 원본 +24,+24, 붙인 것이 선택되고 1단계로 되돌려진다", () => {
    st().addNode(box("a", 0, 0));
    st().addNode(box("b", 500, 0));
    st().copy(["a", "b"]);
    const made = st().paste();
    expect(made.length).toBe(2);
    expect(made.includes("a") || made.includes("b")).toBe(false);
    expect([st().nodes[made[0]!]!.x, st().nodes[made[0]!]!.y]).toEqual([24, 24]);
    expect(st().selection).toEqual(made);
    st().undo();
    expect(Object.keys(st().nodes).sort()).toEqual(["a", "b"]);
  });
  it("붙여넣기 at: 묶음 왼쪽 위가 그 지점", () => {
    st().addNode(box("a", 100, 100));
    st().copy(["a"]);
    const [id] = st().paste({ x: 700, y: 800 });
    expect([st().nodes[id!]!.x, st().nodes[id!]!.y]).toEqual([700, 800]);
  });
  it("클립보드가 비어 있으면 붙일 것 없음", () => {
    copyToClip([]); // 앞 시험이 남긴 클립보드를 비운다
    expect(st().paste()).toEqual([]);
  });
  it("콘솔 복제: 같은 에이전트·글자 크기·크기, 새 이름, 원본 +24,+24", () => {
    const id = st().spawnConsole("claude", { x: 0, y: 0 }, { textSize: 115 });
    const [dup] = st().duplicate([id]);
    const a = st().nodes[id] as any, b = st().nodes[dup!] as any;
    expect(b).toMatchObject({ kind: "console", agentId: "claude", textSize: 115, w: a.w, h: a.h, x: a.x + 24, y: a.y + 24 });
    expect(b.name).not.toBe(a.name);
    expect(b.z).toBeGreaterThan(a.z);
    expect(st().selection).toEqual([dup]);
  });
  it("복제 자리에 이미 다른 노드가 있으면 안 겹치는 자리(S-030)", () => {
    const id = st().spawnConsole("shell", { x: 0, y: 0 });
    st().addNode(box("blocker", 24, 24));
    const [dup] = st().duplicate([id]);
    const a = st().nodes[dup!]!, k = st().nodes.blocker!;
    expect(a.x < k.x + k.w && k.x < a.x + a.w && a.y < k.y + k.h && k.y < a.y + a.h).toBe(false);
  });
});

describe("S-031 도구 값", () => {
  it("setTool 로 바뀌고 기본은 select", () => {
    expect(st().tool).toBe("select");
    st().setTool("spawn");
    expect(st().tool).toBe("spawn");
  });
});

// ---- B7 그룹 (S-500, S-501, S-504~S-506, S-509, S-510, S-512) ----
describe("B7 그룹 store", () => {
  const sp = (x: number) => st().spawnConsole("shell", { x, y: 0 });
  const grp = (id: string) => st().groups.find((g) => g.id === id);
  const gid = (id: string) => (st().nodes[id] as any)?.groupId as string | undefined;
  /** 콘솔 n개를 가로로 놓고 id 들을 돌려준다 */
  const cons = (n: number) => Array.from({ length: n }, (_, i) => sp(i * 800));
  beforeEach(() => useBoard.setState({ groups: [], history: emptyHistory() }));

  it("S-500 콘솔 둘을 묶으면 Group 1·General, 둘 다 그 그룹 소속", () => {
    const [a, b] = cons(2);
    const id = st().createGroup([a!, b!]);
    expect(id).toBeTruthy();
    expect(st().groups).toEqual([{ id, name: "Group 1", role: "general" }]);
    expect([gid(a!), gid(b!)]).toEqual([id, id]);
  });
  it("S-500 두 번째는 Group 2, 이름·역할을 줄 수 있다(S-512)", () => {
    const [a, b, c, d] = cons(4);
    st().createGroup([a!, b!]);
    const g2 = st().createGroup([c!, d!], { name: "Alpha", role: "backend" });
    expect(grp(g2!)).toEqual({ id: g2, name: "Alpha", role: "backend" });
    const [e, f] = cons(2);
    const g3 = st().createGroup([e!, f!]);
    expect(grp(g3!)!.name).toBe("Group 2");
  });
  it("S-500 콘솔이 둘 미만이면 아무 일도 없다(null, 그룹·기록 그대로)", () => {
    const [a] = cons(1);
    st().addNode(box("n", 5000, 0));
    expect(st().createGroup([a!])).toBeNull();
    expect(st().createGroup([a!, "n"])).toBeNull(); // 콘솔은 하나뿐
    expect(st().createGroup([])).toBeNull();
    expect(st().groups).toEqual([]);
    expect(gid(a!)).toBeUndefined();
  });
  it("S-500 콘솔이 아닌 노드는 묶지 않는다", () => {
    const [a, b] = cons(2);
    st().addNode(box("n", 5000, 0));
    const id = st().createGroup([a!, b!, "n"]);
    expect(gid("n")).toBeUndefined();
    expect(gid(a!)).toBe(id);
  });
  it("S-500 이미 다른 그룹에 있던 콘솔은 새 그룹으로 옮겨지고, 남은 1개는 그룹을 유지한다(S-505)", () => {
    const [a, b, c] = cons(3);
    const g1 = st().createGroup([a!, b!])!;
    const g2 = st().createGroup([b!, c!])!;
    expect([gid(a!), gid(b!), gid(c!)]).toEqual([g1, g2, g2]);
    expect(st().groups.map((g) => g.id)).toEqual([g1, g2]);
  });
  it("S-500 묶기는 되돌리기 1단계", () => {
    const [a, b] = cons(2);
    st().createGroup([a!, b!]);
    st().undo();
    expect(st().groups).toEqual([]);
    expect(gid(a!)).toBeUndefined();
    st().redo();
    expect(st().groups).toHaveLength(1);
    expect(gid(a!)).toBe(st().groups[0]!.id);
  });
  it("S-508 groups 상태가 없어도(setState 로 지워도) 동작한다", () => {
    const [a, b] = cons(2);
    useBoard.setState({ groups: undefined as any });
    expect(st().createGroup([a!, b!])).toBeTruthy();
    expect(st().groups).toHaveLength(1);
  });

  it("S-501 해체: 그룹이 사라지고 콘솔은 그대로, 되돌리기 1단계", () => {
    const [a, b] = cons(2);
    const id = st().createGroup([a!, b!])!;
    st().dissolveGroup(id);
    expect(st().groups).toEqual([]);
    expect(st().nodes[a!]).toBeDefined();
    expect(st().nodes[b!]).toBeDefined();
    expect([gid(a!), gid(b!)]).toEqual([undefined, undefined]);
    st().undo();
    expect(st().groups).toHaveLength(1);
    expect([gid(a!), gid(b!)]).toEqual([id, id]);
  });

  it("S-506 이름 바꾸기: 앞뒤 공백 제거, 24자까지", () => {
    const [a, b] = cons(2);
    const id = st().createGroup([a!, b!])!;
    st().renameGroup(id, "  Reviewers  ");
    expect(grp(id)!.name).toBe("Reviewers");
    st().renameGroup(id, "x".repeat(40));
    expect(grp(id)!.name).toBe("x".repeat(24));
    st().renameGroup(id, "");
    expect(grp(id)!.name).toBe(""); // 표시는 역할 이름(groupTitle)
    st().renameGroup("없는 그룹", "z"); // 없는 그룹은 무시
    expect(st().groups).toHaveLength(1);
  });

  it("S-504 setGroupOf: 들어가고 빠진다. 멤버 0개가 된 그룹은 사라진다(S-505)", () => {
    const [a, b, c] = cons(3);
    const id = st().createGroup([a!, b!])!;
    st().setGroupOf(c!, id);
    expect(gid(c!)).toBe(id);
    st().setGroupOf(c!, null);
    expect(gid(c!)).toBeUndefined();
    st().setGroupOf(a!, null);
    expect(grp(id)).toBeDefined(); // 1개 남아도 유지
    st().setGroupOf(b!, null);
    expect(st().groups).toEqual([]);
  });
  it("S-504 setGroupOf 는 콘솔이 아닌 노드·없는 그룹은 무시한다", () => {
    const [a, b] = cons(2);
    st().addNode(box("n", 5000, 0));
    const id = st().createGroup([a!, b!])!;
    st().setGroupOf("n", id);
    expect(gid("n")).toBeUndefined();
    st().setGroupOf(a!, "없는 그룹");
    expect(gid(a!)).toBe(id);
  });
  it("S-504 setGroupOf 는 자기 기록 단계를 만들지 않는다(끌기 시작의 commit 1단계에 포함)", () => {
    const [a, b, c] = cons(3);
    st().createGroup([a!, b!]); // 단계 1
    st().setGroupOf(c!, st().groups[0]!.id);
    st().undo(); // setGroupOf 가 단계를 만들었다면 c 만 빠지고 그룹은 남는다
    expect(st().groups).toEqual([]);
  });
  it("S-504 끌기 1번 = 1단계: commit → 이동 → setGroupOf 후 Ctrl+Z 한 번이면 위치와 소속이 같이 돌아온다", () => {
    const [a, b, c] = cons(3);
    const id = st().createGroup([a!, b!])!;
    const x0 = st().nodes[c!]!.x;
    st().commit();
    st().updateNode(c!, { x: x0 + 10 });
    st().setGroupOf(c!, id);
    st().undo();
    expect(st().nodes[c!]!.x).toBe(x0);
    expect(gid(c!)).toBeUndefined();
    expect(grp(id)).toBeDefined();
  });

  it("S-505·S-510 콘솔을 지우면 멤버에서 빠진다: 1개 남아도 그룹 유지, 0개면 그룹 삭제", () => {
    const [a, b] = cons(2);
    const id = st().createGroup([a!, b!])!;
    st().removeNodes([a!]);
    expect(grp(id)).toBeDefined();
    st().removeNodes([b!]);
    expect(st().groups).toEqual([]);
  });
  it("S-510 한꺼번에 둘 다 지워도 그룹이 남지 않는다", () => {
    const [a, b] = cons(2);
    st().createGroup([a!, b!]);
    st().removeNodes([a!, b!]);
    expect(st().groups).toEqual([]);
  });
  it("S-510 지우기를 되돌리면 콘솔과 소속이 돌아오고, 그룹이 사라졌었다면 그룹도 돌아온다", () => {
    const [a, b] = cons(2);
    const id = st().createGroup([a!, b!])!;
    st().removeNodes([a!]);
    st().undo();
    expect(gid(a!)).toBe(id);
    st().removeNodes([a!, b!]);
    expect(st().groups).toEqual([]);
    st().undo();
    expect(st().groups).toEqual([{ id, name: "Group 1", role: "general" }]);
    expect([gid(a!), gid(b!)]).toEqual([id, id]);
    st().redo();
    expect(st().groups).toEqual([]);
  });

  it("S-509 복제한 콘솔은 그룹 없이 놓인다", () => {
    const [a, b] = cons(2);
    st().createGroup([a!, b!]);
    const [dup] = st().duplicate([a!]);
    expect(st().nodes[dup!]).toBeDefined();
    expect(gid(dup!)).toBeUndefined();
    expect(st().groups).toHaveLength(1);
    expect(gid(a!)).toBeDefined(); // 원본은 그대로
  });
  it("S-509 복사·붙여넣기로 생긴 콘솔도 그룹 없이", () => {
    const [a, b] = cons(2);
    st().createGroup([a!, b!]);
    st().copy([a!, b!]);
    const made = st().paste();
    expect(made).toHaveLength(2);
    expect(made.map(gid)).toEqual([undefined, undefined]);
    expect(st().groups).toHaveLength(1);
  });
});

// ---- C1 (S-810~S-813) ----
beforeEach(() => useBoard.setState({ history: emptyHistory() })); // 이 아래 시험은 되돌리기 단계 수를 센다
const wbox = (id: string, x: number, wireTo?: string, kind = "box", z = 0) => ({ id, kind, x, y: 0, w: 100, h: 100, z, ...(wireTo ? { wireTo } : {}) });

describe("S-810 sendToBack", () => {
  it("선택한 노드가 z 최소가 된다", () => {
    st().addNode(box("a", 0, 0, 1));
    st().addNode(box("b", 200, 0, 2));
    st().addNode(box("c", 400, 0, 3));
    st().sendToBack(["c"]);
    const n = st().nodes;
    expect(n.c!.z).toBeLessThan(n.a!.z);
    expect(n.c!.z).toBeLessThan(n.b!.z);
  });
  it("여러 개를 보내도 서로의 앞뒤 순서는 유지", () => {
    st().addNode(box("a", 0, 0, 1));
    st().addNode(box("b", 200, 0, 2));
    st().addNode(box("c", 400, 0, 3));
    st().sendToBack(["b", "c"]);
    const n = st().nodes;
    expect(n.b!.z).toBeLessThan(n.c!.z);
    expect(n.c!.z).toBeLessThan(n.a!.z);
  });
  it("되돌리기 1단계", () => {
    st().addNode(box("a", 0, 0, 1));
    st().addNode(box("b", 200, 0, 2));
    st().sendToBack(["b"]);
    st().undo();
    expect(st().nodes.b!.z).toBe(2);
  });
});

describe("S-811 wireTo 정리", () => {
  it("대상이 지워지면 그 노드의 wireTo 만 사라지고 노드는 남는다. 되돌리면 선도 돌아온다", () => {
    st().addNode(wbox("a", 0));
    st().addNode(wbox("l", 300, "a"));
    st().removeNodes(["a"]);
    expect(st().nodes.l).toBeDefined();
    expect("wireTo" in st().nodes.l!).toBe(false);
    st().undo();
    expect(st().nodes.l!.wireTo).toBe("a");
    expect(st().nodes.a).toBeDefined();
  });
  it("다른 노드를 지우면 wireTo 는 그대로", () => {
    st().addNode(wbox("a", 0));
    st().addNode(wbox("b", 150));
    st().addNode(wbox("l", 300, "a"));
    st().removeNodes(["b"]);
    expect(st().nodes.l!.wireTo).toBe("a");
  });
});

describe("S-812 deleteWithTarget 연쇄 삭제", () => {
  beforeEach(() => {
    resetKindsForTest();
    const k = { label: "k", Component: () => null, defaultSize: { w: 100, h: 100 }, minSize: { w: 10, h: 10 }, resizable: false, bodyDrag: true, eraserTarget: false };
    registerKind({ ...k, id: "insp", deleteWithTarget: true });
    registerKind({ ...k, id: "link" });
  });
  it("대상을 지우면 인스펙터도 같이, Ctrl+Z 한 번에 둘 다 돌아온다", () => {
    st().addNode(wbox("web", 0));
    st().addNode(wbox("ins", 300, "web", "insp"));
    st().removeNodes(["web"]);
    expect(Object.keys(st().nodes)).toEqual([]);
    expect(st().undo()).toBe(true);
    expect(Object.keys(st().nodes).sort()).toEqual(["ins", "web"]);
    expect(st().nodes.ins!.wireTo).toBe("web");
  });
  it("연쇄는 한 단계: 되돌린 뒤 되돌리기가 더 남지 않는다", () => {
    st().addNode(wbox("web", 0));
    st().addNode(wbox("ins", 300, "web", "insp"));
    st().removeNodes(["web"]);
    st().undo();
    expect(st().undo()).toBe(false);
  });
  it("deleteWithTarget 이 아닌 종류는 남는다", () => {
    st().addNode(wbox("web", 0));
    st().addNode(wbox("l", 300, "web", "link"));
    st().removeNodes(["web"]);
    expect(Object.keys(st().nodes)).toEqual(["l"]);
  });
  it("인스펙터만 지우면 대상은 남는다", () => {
    st().addNode(wbox("web", 0));
    st().addNode(wbox("ins", 300, "web", "insp"));
    st().removeNodes(["ins"]);
    expect(Object.keys(st().nodes)).toEqual(["web"]);
  });
});

describe("S-813 복제·붙여넣기의 wireTo", () => {
  it("대상과 같이 복제하면 새 대상 id 로 잇는다", () => {
    st().addNode(wbox("a", 0));
    st().addNode(wbox("l", 300, "a"));
    const copies = st().duplicate(["a", "l"]).map((id) => st().nodes[id]!);
    const link = copies.find((n) => n.wireTo)!;
    const target = copies.find((n) => !n.wireTo)!;
    expect(link.wireTo).toBe(target.id);
    expect(link.wireTo).not.toBe("a");
  });
  it("대상 없이 복제하면 선을 끊는다(원본은 그대로)", () => {
    st().addNode(wbox("a", 0));
    st().addNode(wbox("l", 300, "a"));
    const [id] = st().duplicate(["l"]);
    expect("wireTo" in st().nodes[id!]!).toBe(false);
    expect(st().nodes.l!.wireTo).toBe("a");
  });
  it("복사·붙여넣기도 같다: 같이 복사하면 새 id 로, 따로면 끊김", () => {
    st().addNode(wbox("a", 0));
    st().addNode(wbox("l", 300, "a"));
    st().copy(["a", "l"]);
    const both = st().paste().map((id) => st().nodes[id]!);
    expect(both.find((n) => n.wireTo)!.wireTo).toBe(both.find((n) => !n.wireTo)!.id);
    st().copy(["l"]);
    const [alone] = st().paste();
    expect("wireTo" in st().nodes[alone!]!).toBe(false);
  });
  it("붙이기 전에 대상이 사라졌어도 끊긴 채 붙는다", () => {
    st().addNode(wbox("a", 0));
    st().addNode(wbox("l", 300, "a"));
    st().copy(["l"]);
    st().removeNodes(["a"]);
    const [id] = st().paste();
    expect("wireTo" in st().nodes[id!]!).toBe(false);
  });
});

// D1 S-1222·S-1226·S-1227·S-1236: 카드의 wired[]
describe("D1 wired 정리·토글", () => {
  const con = (id: string, x: number, groupId?: string) => ({ id, kind: "console", x, y: 0, w: 100, h: 100, z: 1, name: id, agentId: "shell", textSize: null, yolo: false, ...(groupId ? { groupId } : {}) });
  const card = (wired?: string[]) => ({ id: "o1", kind: "box", x: 0, y: 400, w: 100, h: 100, z: 5, ...(wired ? { wired } : {}) });
  const wiredOf = (id: string) => (st().nodes[id]?.wired as string[] | undefined) ?? [];
  const seed = (wired: string[], groupMembers = false) => {
    useBoard.setState({
      nodes: Object.fromEntries([con("c1", 0, groupMembers ? "g1" : undefined), con("c2", 200, groupMembers ? "g1" : undefined), card(wired)].map((n) => [n.id, n])),
      groups: groupMembers ? [{ id: "g1", name: "Group 1", role: "general" }] : [], history: emptyHistory(),
    });
  };

  it("S-1222 콘솔이 지워지면 모든 카드의 wired 에서 빠지고, 되돌리면 같은 단계에서 같이 돌아온다", () => {
    seed(["c1", "c2"]);
    st().removeNodes(["c1"]);
    expect(wiredOf("o1")).toEqual(["c2"]);
    expect(st().undo()).toBe(true);
    expect(st().nodes.c1).toBeDefined();
    expect(wiredOf("o1")).toEqual(["c1", "c2"]);
    expect(st().undo()).toBe(false); // 단계는 하나뿐이었다
  });
  it("S-1222 그룹이 풀리면 그 id 가 wired 에서 빠지고 되돌리면 돌아온다", () => {
    seed(["g1", "c1"], true);
    st().dissolveGroup("g1");
    expect(wiredOf("o1")).toEqual(["c1"]);
    st().undo();
    expect(wiredOf("o1")).toEqual(["g1", "c1"]);
  });
  it("S-1222 멤버가 모두 지워져 그룹이 사라져도 그 id 가 wired 에서 빠진다", () => {
    seed(["g1"], true);
    st().removeNodes(["c1", "c2"]);
    expect(st().groups).toEqual([]);
    expect(wiredOf("o1")).toEqual([]);
    st().undo();
    expect(wiredOf("o1")).toEqual(["g1"]);
  });
  it("S-1222 카드와 대상을 같이 복사해 붙이면 새 카드의 wired 는 새 콘솔 id 로 이어진다", () => {
    seed(["c1", "c2"]);
    st().copy(["o1", "c1"]);
    const made = st().paste({ x: 1000, y: 1000 });
    const [newCard, newCon] = [made.find((id) => st().nodes[id]!.kind === "box")!, made.find((id) => st().nodes[id]!.kind === "console")!];
    expect(wiredOf(newCard)).toEqual([newCon]); // c2 는 같이 복사되지 않아 끊긴다
    expect(wiredOf("o1")).toEqual(["c1", "c2"]); // 원본은 그대로
  });
  it("S-1222 카드만 복사하면(복제 포함) 새 카드의 wired 에는 남는 대상이 없다. 그룹은 복사되지 않는다", () => {
    seed(["g1", "c1"], true);
    st().copy(["o1"]);
    const [p] = st().paste({ x: 1000, y: 1000 });
    expect(wiredOf(p!)).toEqual([]);
    const [d] = st().duplicate(["o1"]);
    expect(wiredOf(d!)).toEqual([]);
    expect(wiredOf("o1")).toEqual(["g1", "c1"]);
  });

  it("S-1226 toggleWired 는 대상을 넣고(끝에) 다시 부르면 뺀다. 그룹 id 도 같다", () => {
    seed([]);
    st().toggleWired("o1", "c1");
    st().toggleWired("o1", "c2");
    expect(wiredOf("o1")).toEqual(["c1", "c2"]);
    st().toggleWired("o1", "c1");
    expect(wiredOf("o1")).toEqual(["c2"]);
  });
  it("S-1227 toggleWired 한 번은 되돌리기 1단계", () => {
    seed(["c1"]);
    st().toggleWired("o1", "c2");
    st().undo();
    expect(wiredOf("o1")).toEqual(["c1"]);
    expect(st().undo()).toBe(false);
  });
  it("S-1227 noCommit 은 단계를 더 만들지 않는다: 첫 토글(단계)+나머지 noCommit 은 되돌리기 1번에 전부 사라진다", () => {
    seed([]);
    st().toggleWired("o1", "c1");
    st().toggleWired("o1", "c2", true);
    st().toggleWired("o1", "g1", true);
    expect(wiredOf("o1")).toEqual(["c1", "c2", "g1"]);
    st().undo();
    expect(wiredOf("o1")).toEqual([]);
    expect(st().undo()).toBe(false);
  });
  it("S-1227 noCommit 만 부르면 단계가 생기지 않는다", () => {
    seed([]);
    st().toggleWired("o1", "c1", true);
    expect(st().undo()).toBe(false);
  });

  it("S-1236 카드를 지워도 연결돼 있던 콘솔은 그대로. 되돌리면 카드와 wired 가 같이 돌아온다", () => {
    seed(["c1", "c2"]);
    st().removeNodes(["o1"]);
    expect(st().nodes.o1).toBeUndefined();
    expect(st().nodes.c1).toBeDefined();
    expect(st().nodes.c2).toBeDefined();
    st().undo();
    expect(wiredOf("o1")).toEqual(["c1", "c2"]);
  });
});

// D12 S-1625: 콘솔 노드의 profile 필드
describe("S-1625 콘솔 profile", () => {
  const set = (use: Record<string, string | null>) => useSettings.setState({ s: { profileUse: use } });
  it("새 콘솔은 profileUse[agent] 를 필드로 박고, 이후 Use 를 바꿔도 기존 콘솔은 그대로", () => {
    set({ claude: "work", codex: null });
    const a = st().spawnConsole("claude", { x: 0, y: 0 });
    expect((st().nodes[a] as { profile?: string }).profile).toBe("work");
    set({ claude: "home" });
    expect((st().nodes[a] as { profile?: string }).profile).toBe("work");
    const b = st().spawnConsole("claude", { x: 900, y: 0 });
    expect((st().nodes[b] as { profile?: string }).profile).toBe("home");
  });
  it("안 골랐거나(null) 프로필이 없는 에이전트(shell)는 필드 없음", () => {
    set({ claude: "work", codex: null });
    const c = st().spawnConsole("codex", { x: 0, y: 0 });
    const sh = st().spawnConsole("shell", { x: 900, y: 0 });
    expect("profile" in st().nodes[c]!).toBe(false);
    expect("profile" in st().nodes[sh]!).toBe(false);
  });
  it("opts.profile 이 설정보다 앞선다(Connect·콘솔 열기)", () => {
    set({ claude: "work" });
    const id = st().spawnConsole("claude", { x: 0, y: 0 }, { profile: "other" });
    expect((st().nodes[id] as { profile?: string }).profile).toBe("other");
  });
  it("복제(붙여넣기 경로)와 JSON 저장·복원이 profile 을 따라간다", () => {
    set({ claude: "work" });
    const id = st().spawnConsole("claude", { x: 0, y: 0 });
    const [dup] = st().duplicate([id]);
    expect((st().nodes[dup!] as { profile?: string }).profile).toBe("work");
    const back = JSON.parse(JSON.stringify(st().nodes[id])) as { profile?: string };
    expect(back.profile).toBe("work");
  });
});
