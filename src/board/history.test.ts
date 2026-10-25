import { beforeEach, describe, expect, it } from "vitest";
import { emptyHistory, MAX_HISTORY, record, redo, undo } from "./history";
import { useBoard } from "./store";

describe("S-028 되돌리기 스택(순수)", () => {
  it("record → undo → redo 가 값을 되돌린다", () => {
    const h = record(emptyHistory<number>(), 1); // 1 에서 2 로 바꿈
    const u = undo(h, 2)!;
    expect(u.state).toBe(1);
    const r = redo(u.h, u.state)!;
    expect(r.state).toBe(2);
    expect(undo(r.h, 2)!.state).toBe(1);
  });
  it("기록이 없으면 undo·redo 는 null", () => {
    expect(undo(emptyHistory<number>(), 0)).toBeNull();
    expect(redo(emptyHistory<number>(), 0)).toBeNull();
  });
  it("80단계를 넘으면 오래된 것부터 버린다", () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 85; i++) h = record(h, i);
    expect(h.past.length).toBe(MAX_HISTORY);
    expect(MAX_HISTORY).toBe(80);
    expect(h.past[0]).toBe(5);
    let cur = 85, steps = 0;
    for (let u = undo(h, cur); u; u = undo(u.h, cur)) { cur = u.state; steps++; }
    expect(steps).toBe(80);
    expect(cur).toBe(5);
  });
  it("새로 기록하면 다시 하기 칸이 끊긴다", () => {
    let h = record(emptyHistory<number>(), 1);
    h = undo(h, 2)!.h;
    expect(h.future.length).toBe(1);
    h = record(h, 1);
    expect(h.future.length).toBe(0);
    expect(redo(h, 3)).toBeNull();
  });
});

const box = (id: string, x = 0, y = 0) => ({ id, kind: "box", x, y, w: 100, h: 100, z: 0 });
const nodes = () => useBoard.getState().nodes;

describe("S-028 보드 되돌리기(store)", () => {
  beforeEach(() => useBoard.setState({ nodes: {}, selection: [], viewport: { x: 0, y: 0, zoom: 1 } }));

  it("끌기 1번 = 1단계: commit 한 번 뒤 updateNode 30번이어도 undo 한 번에 원위치", () => {
    useBoard.getState().addNode(box("a", 10, 20));
    useBoard.getState().commit();
    for (let i = 1; i <= 30; i++) useBoard.getState().updateNode("a", { x: 10 + i });
    expect(nodes().a!.x).toBe(40);
    expect(useBoard.getState().undo()).toBe(true);
    expect(nodes().a).toMatchObject({ x: 10, y: 20 });
    expect(useBoard.getState().undo()).toBe(false); // 더 없음
  });
  it("redo 는 되돌린 것을 다시 적용하고, 새 변경 뒤에는 끊긴다", () => {
    const s = useBoard.getState();
    s.addNode(box("a"));
    s.commit();
    s.updateNode("a", { x: 50 });
    useBoard.getState().undo();
    expect(nodes().a!.x).toBe(0);
    expect(useBoard.getState().redo()).toBe(true);
    expect(nodes().a!.x).toBe(50);
    useBoard.getState().undo();
    useBoard.getState().commit();
    useBoard.getState().updateNode("a", { x: 7 });
    expect(useBoard.getState().redo()).toBe(false);
  });
  it("85번 바꿔도 되돌리기는 80번까지", () => {
    useBoard.getState().addNode(box("a"));
    for (let i = 1; i <= 85; i++) {
      useBoard.getState().commit();
      useBoard.getState().updateNode("a", { x: i });
    }
    let n = 0;
    while (useBoard.getState().undo()) n++;
    expect(n).toBe(80);
    expect(nodes().a!.x).toBe(5);
  });
  it("삭제를 되돌리면 같은 노드(자리·이름)가 돌아오고, 삭제하면 선택에서 빠진다", () => {
    const s = useBoard.getState();
    s.addNode({ ...box("a", 30, 40), name: "Otto" });
    s.select(["a"]);
    useBoard.getState().removeNodes(["a"]);
    expect(nodes().a).toBeUndefined();
    expect(useBoard.getState().selection).toEqual([]);
    useBoard.getState().undo();
    expect(nodes().a).toMatchObject({ x: 30, y: 40, name: "Otto" });
  });
  it("여러 개 삭제도 1단계", () => {
    const s = useBoard.getState();
    s.addNode(box("a"));
    s.addNode(box("b", 200));
    useBoard.getState().removeNodes(["a", "b"]);
    useBoard.getState().undo();
    expect(Object.keys(nodes()).sort()).toEqual(["a", "b"]);
  });
  it("놓기(spawnConsole)도 되돌린다", () => {
    const id = useBoard.getState().spawnConsole("shell");
    expect(nodes()[id]).toBeDefined();
    useBoard.getState().undo();
    expect(Object.keys(nodes())).toEqual([]);
  });
  it("되돌리기는 화면(팬·줌)을 건드리지 않는다", () => {
    useBoard.getState().addNode(box("a"));
    useBoard.getState().commit();
    useBoard.getState().updateNode("a", { x: 9 });
    useBoard.getState().setViewport({ x: 100, y: 50, zoom: 2 });
    useBoard.getState().undo();
    expect(useBoard.getState().viewport).toEqual({ x: 100, y: 50, zoom: 2 });
  });
});
