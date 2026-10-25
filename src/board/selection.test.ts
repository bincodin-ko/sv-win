import { describe, expect, it } from "vitest";
import { arrowDelta, bounds, boxSelect, clickSelect, intersects, normBox } from "./selection";

const n = (id: string, x: number, y: number, w = 100, h = 100) => ({ id, x, y, w, h });

describe("S-021 상자 선택(걸침 기준)", () => {
  it("normBox: 어느 방향으로 끌어도 왼쪽 위 + 양수 크기", () => {
    expect(normBox({ x: 50, y: 40 }, { x: 10, y: 90 })).toEqual({ x: 10, y: 40, w: 40, h: 50 });
  });
  it("걸치기만 해도 선택, 맞닿기만 하면 아님", () => {
    expect(intersects({ x: 0, y: 0, w: 100, h: 100 }, { x: 99, y: 99, w: 50, h: 50 })).toBe(true);
    expect(intersects({ x: 0, y: 0, w: 100, h: 100 }, { x: 100, y: 0, w: 50, h: 50 })).toBe(false);
    expect(intersects({ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 150, w: 50, h: 50 })).toBe(false);
  });
  it("상자에 걸친 노드만 고른다", () => {
    const nodes = [n("a", 0, 0), n("b", 200, 0), n("c", 0, 200)];
    expect(boxSelect(nodes, { x: 50, y: 50, w: 200, h: 10 }, [], false)).toEqual(["a", "b"]);
  });
  it("Shift 상자는 기존 선택에 더한다(중복 없이), 그냥 상자는 기존 선택을 버린다", () => {
    const nodes = [n("a", 0, 0), n("b", 200, 0), n("c", 0, 200)];
    expect(boxSelect(nodes, { x: 190, y: 10, w: 20, h: 20 }, ["c", "b"], true)).toEqual(["c", "b"]);
    expect(boxSelect(nodes, { x: 10, y: 10, w: 20, h: 20 }, ["c"], true)).toEqual(["c", "a"]);
    expect(boxSelect(nodes, { x: 10, y: 10, w: 20, h: 20 }, ["c"], false)).toEqual(["a"]);
  });
});

describe("S-020/S-021 클릭·Shift+클릭", () => {
  it("그냥 클릭 = 그것만", () => {
    expect(clickSelect(["a", "b"], "c", false)).toEqual(["c"]);
  });
  it("Shift+클릭 = 더하기 / 빼기", () => {
    expect(clickSelect(["a"], "b", true)).toEqual(["a", "b"]);
    expect(clickSelect(["a", "b"], "a", true)).toEqual(["b"]);
  });
});

describe("S-024 화살표 1단위 / Shift 10단위", () => {
  it("방향과 크기", () => {
    expect(arrowDelta("ArrowLeft", false)).toEqual({ dx: -1, dy: 0 });
    expect(arrowDelta("ArrowRight", false)).toEqual({ dx: 1, dy: 0 });
    expect(arrowDelta("ArrowUp", false)).toEqual({ dx: 0, dy: -1 });
    expect(arrowDelta("ArrowDown", true)).toEqual({ dx: 0, dy: 10 });
    expect(arrowDelta("ArrowLeft", true)).toEqual({ dx: -10, dy: 0 });
  });
  it("화살표가 아니면 null", () => {
    expect(arrowDelta("a", false)).toBeNull();
  });
});

describe("bounds", () => {
  it("묶음의 바깥 사각형, 비면 null", () => {
    expect(bounds([n("a", 0, 0), n("b", 150, 50, 50, 200)])).toEqual({ x: 0, y: 0, w: 200, h: 250 });
    expect(bounds([])).toBeNull();
  });
});
