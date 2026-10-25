import { beforeEach, describe, expect, it } from "vitest";
import { TIDY_GAP, TIDY_KEY, tidyBoard, tidyLayout } from "./tidy";
import { emptyHistory } from "./history";
import { useBoard } from "./store";

// S-2645: 열 수 ceil(sqrt n), 칸 = 가장 큰 너비·높이 + 24, 격자 왼쪽 위 = 경계 상자 왼쪽 위, 읽기 순서(위→아래, 같은 줄이면 왼→오)
const it4 = [
  { id: "a", x: 300, y: 300, w: 720, h: 440 },
  { id: "b", x: -800, y: -300, w: 720, h: 440 },
  { id: "c", x: -500, y: 250, w: 720, h: 440 },
  { id: "d", x: 100, y: -250, w: 720, h: 440 },
];

describe("S-2645 tidyLayout(순수)", () => {
  it("간격 기본값 24, 키는 Ctrl+Shift+T", () => {
    expect(TIDY_GAP).toBe(24);
    expect(TIDY_KEY).toEqual({ ctrl: true, shift: true, key: "t" });
  });
  it("흩어진 4개 → 2×2, 읽기 순서 b d / c a, 왼쪽 위 = 경계 상자 왼쪽 위(-800,-300), 칸 744×464", () => {
    expect(tidyLayout(it4, 24)).toEqual({
      b: { x: -800, y: -300 }, d: { x: -56, y: -300 },
      c: { x: -800, y: 164 }, a: { x: -56, y: 164 },
    });
  });
  it("칸 크기는 가장 큰 너비·높이: 작은 카드와 큰 카드가 섞여도 칸은 하나", () => {
    const r = tidyLayout([{ id: "s", x: 0, y: 0, w: 100, h: 50 }, { id: "l", x: 500, y: 0, w: 300, h: 200 }], 24);
    // 2개 → 열 2. 칸 = 324×224
    expect(r).toEqual({ s: { x: 0, y: 0 }, l: { x: 324, y: 0 } });
  });
  it("n=5 → 열 3, 두 번째 줄 2개 / n=1 → 제자리", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, x: i * 10, y: 0, w: 10, h: 10 }));
    const r = tidyLayout(five, 0);
    expect(r.n3).toEqual({ x: 0, y: 10 });
    expect(r.n2).toEqual({ x: 20, y: 0 });
    expect(tidyLayout([{ id: "z", x: 5, y: 7, w: 10, h: 10 }], 24)).toEqual({ z: { x: 5, y: 7 } });
  });
  it("빈 목록은 빈 결과", () => expect(tidyLayout([], 24)).toEqual({}));
});

const con = (id: string, x: number, y: number) => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name: id, agentId: "shell", textSize: null, yolo: false });
const box = (id: string, x: number, y: number) => ({ id, kind: "box", x, y, w: 100, h: 100, z: 1 });
const ink = (id: string, x: number, y: number) => ({ id, kind: "ink", x, y, w: 6, h: 6, z: 1 });
const shape = (id: string, x: number, y: number) => ({ id, kind: "shape", x, y, w: 80, h: 80, z: 1 });
const pos = () => Object.fromEntries(Object.entries(useBoard.getState().nodes).map(([k, n]) => [k, [n.x, n.y]]));
const reset = (list: { id: string }[], selection: string[] = []) =>
  useBoard.setState({ nodes: Object.fromEntries(list.map((n) => [n.id, n as any])), selection, groups: [], history: emptyHistory(), viewport: { x: 0, y: 0, zoom: 1 } } as any);
const seed = () => it4.map((i) => con(i.id, i.x, i.y));

describe("S-2646 tidyBoard / arrange", () => {
  beforeEach(() => reset([]));
  it("선택이 없으면 보드 전체(콘솔·카드)를 2×2 로, Ctrl+Z 한 번에 원위치", () => {
    reset([...seed(), ink("i1", 5, 5), shape("s1", 9, 9)]);
    const before = pos();
    tidyBoard(useBoard);
    const after = pos();
    expect(after.b).toEqual([-800, -300]);
    expect(after.a).toEqual([-56, 164]);
    expect(after.i1).toEqual([5, 5]); // 그림·도형은 안 움직인다
    expect(after.s1).toEqual([9, 9]);
    expect(useBoard.getState().undo()).toBe(true);
    expect(pos()).toEqual(before);
    expect(useBoard.getState().undo()).toBe(false); // 한 단계였다
  });
  it("노드 2개 이상 선택이면 선택만 정리한다", () => {
    reset([...seed(), con("e", 5000, 5000)], ["a", "b"]);
    tidyBoard(useBoard);
    const p = pos();
    expect(p.e).toEqual([5000, 5000]);
    expect(p.c).toEqual([-500, 250]);
    expect(p.d).toEqual([100, -250]);
    expect(p.b).toEqual([-800, -300]); // 경계 상자 왼쪽 위(a 와 b 중 최소)
    expect(p.a).toEqual([-56, -300]);
  });
  it("선택이 1개면 보드 전체를 정리한다", () => {
    reset(seed(), ["a"]);
    tidyBoard(useBoard);
    expect(pos().b).toEqual([-800, -300]);
    expect(pos().a).toEqual([-56, 164]);
  });
  it("대상이 2개 미만이면 아무 일 없음(되돌리기 기록도 없다)", () => {
    reset([con("a", 10, 10), ink("i", 0, 0)]);
    tidyBoard(useBoard);
    expect(pos()).toEqual({ a: [10, 10], i: [0, 0] });
    expect(useBoard.getState().undo()).toBe(false);
  });
  it("카드(box 같은 종류)도 대상", () => {
    reset([box("p", 300, 0), box("q", 0, 0)]);
    tidyBoard(useBoard);
    expect(pos()).toEqual({ q: [0, 0], p: [124, 0] });
  });
  it("arrange: 한 번의 commit — 2개를 옮기고 undo 한 번에 둘 다 돌아온다", () => {
    reset([box("p", 0, 0), box("q", 50, 50)]);
    useBoard.getState().arrange({ p: { x: 1, y: 2 }, q: { x: 3, y: 4 } });
    expect(pos()).toEqual({ p: [1, 2], q: [3, 4] });
    expect(useBoard.getState().undo()).toBe(true);
    expect(pos()).toEqual({ p: [0, 0], q: [50, 50] });
  });
});
