import { beforeEach, describe, expect, it } from "vitest";
import { createBoardStore, getStore, registry } from "./boards";
import { useBoard } from "./store";

const box = (id: string, x = 0, z = 0) => ({ id, kind: "box", x, y: 0, w: 100, h: 100, z });
const RESET = { nodes: {}, selection: [], tool: "select", viewport: { x: 0, y: 0, zoom: 1 } };

beforeEach(() => {
  useBoard.setState(RESET);
  registry.clear();
});

describe("S-300 createBoardStore: 저장소 둘은 서로 독립", () => {
  it("한쪽에 노드를 더해도 다른 쪽 nodes 는 그대로", () => {
    const a = createBoardStore(), b = createBoardStore();
    a.getState().addNode(box("n1"));
    expect(Object.keys(a.getState().nodes)).toEqual(["n1"]);
    expect(Object.keys(b.getState().nodes)).toEqual([]);
  });
  it("같은 노드 id c1 을 양쪽에 따로 둘 수 있고 서로 값이 안 섞인다", () => {
    const a = createBoardStore(), b = createBoardStore();
    a.getState().addNode(box("c1", 10));
    b.getState().addNode(box("c1", 500));
    expect(a.getState().nodes.c1!.x).toBe(10);
    expect(b.getState().nodes.c1!.x).toBe(500);
  });
  it("선택·도구·뷰포트가 섞이지 않는다", () => {
    const a = createBoardStore(), b = createBoardStore();
    a.getState().addNode(box("n1"));
    a.getState().select(["n1"]);
    a.getState().setTool("hand");
    a.getState().setViewport({ x: 40, y: 50, zoom: 2 });
    expect(b.getState().selection).toEqual([]);
    expect(b.getState().tool).toBe("select");
    expect(b.getState().viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(a.getState().viewport).toEqual({ x: 40, y: 50, zoom: 2 });
  });
  it("한 저장소의 Ctrl+Z(undo)가 다른 저장소에 영향을 주지 않는다", () => {
    const a = createBoardStore(), b = createBoardStore();
    b.getState().addNode(box("keep"));
    a.getState().addNode(box("n1"));
    a.getState().moveBy(["n1"], 30, 0);
    expect(a.getState().nodes.n1!.x).toBe(30);
    expect(a.getState().undo()).toBe(true);
    expect(a.getState().nodes.n1!.x).toBe(0);
    expect(Object.keys(b.getState().nodes)).toEqual(["keep"]);
    expect(b.getState().undo()).toBe(false); // b 에는 되돌릴 기록이 없다(a 의 기록이 안 섞임)
    expect(Object.keys(b.getState().nodes)).toEqual(["keep"]);
  });
  it("새 저장소는 비어 있고 기본 저장소(useBoard)와도 따로다", () => {
    useBoard.getState().addNode(box("d1"));
    const a = createBoardStore();
    expect(Object.keys(a.getState().nodes)).toEqual([]);
    a.getState().addNode(box("a1"));
    expect(Object.keys(useBoard.getState().nodes)).toEqual(["d1"]);
  });
  it("콘솔을 놓아도 노드는 자기 저장소에만 생긴다", () => {
    const a = createBoardStore(), b = createBoardStore();
    const id = a.getState().spawnConsole("shell");
    expect(a.getState().nodes[id]).toBeDefined();
    expect(Object.keys(b.getState().nodes)).toEqual([]);
  });
});

describe("S-300 getStore(wsId)", () => {
  it("같은 wsId 는 같은 저장소, 다른 wsId 는 다른 저장소", () => {
    const a1 = getStore("ws-a"), a2 = getStore("ws-a"), b = getStore("ws-b");
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });
  it("registry 에 wsId 로 들어간다", () => {
    const a = getStore("ws-a");
    expect(registry.get("ws-a")).toBe(a);
    expect([...registry.keys()]).toEqual(["ws-a"]);
  });
  it("워크스페이스 둘의 같은 노드 id c1 이 섞이지 않는다(S-303)", () => {
    getStore("ws-a").getState().addNode(box("c1", 1));
    getStore("ws-b").getState().addNode(box("c1", 2));
    expect(getStore("ws-a").getState().nodes.c1!.x).toBe(1);
    expect(getStore("ws-b").getState().nodes.c1!.x).toBe(2);
  });
  it("워크스페이스 저장소는 기본 저장소(useBoard)가 아니다", () => {
    expect(getStore("ws-a")).not.toBe(useBoard);
  });
});

describe("기본 저장소 useBoard 는 기존처럼 동작(1묶음 시험 호환)", () => {
  it("getState/setState/subscribe 가 그대로", () => {
    let hits = 0;
    const off = useBoard.subscribe(() => hits++);
    useBoard.getState().addNode(box("n1"));
    useBoard.setState({ tool: "hand" });
    off();
    expect(hits).toBe(2);
    expect(useBoard.getState().tool).toBe("hand");
    expect(Object.keys(useBoard.getState().nodes)).toEqual(["n1"]);
  });
});
