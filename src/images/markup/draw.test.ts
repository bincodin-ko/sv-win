import { describe, expect, it } from "vitest";
import { allCommands, clearAll, elementCommands, HIGHLIGHT_ALPHA, popLast, textSize, type Cmd, type MarkEl } from "./draw";

// S-886·S-887: 요소 목록 → 그리기 명령
const el = (tool: MarkEl["tool"], pts: [number, number][], extra: Partial<MarkEl> = {}): MarkEl => ({ tool, color: "#f00", width: 4, pts: pts.map(([x, y]) => ({ x, y })), ...extra });
type PathCmd = Extract<Cmd, { t: "path" }>;

describe("elementCommands", () => {
  it("Line: 점 둘을 잇는 선 하나, 굵기·색 그대로, 불투명", () => {
    expect(elementCommands(el("line", [[0, 0], [100, 0]]))).toEqual([{ t: "path", pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: "#f00", width: 4, alpha: 1 }]);
  });
  it("Arrow: 몸통 + 끝에 머리(꼭짓점이 끝점, 양쪽 날개는 축 대칭, 시작 쪽으로 물러남)", () => {
    const c = elementCommands(el("arrow", [[0, 0], [100, 0]]));
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ t: "path" });
    const head = c[1] as PathCmd;
    expect(head.t).toBe("path");
    expect(head.pts).toHaveLength(3);
    expect(head.pts[1]).toEqual({ x: 100, y: 0 }); // 꼭짓점 = 화살 끝
    expect(head.pts[0]!.x).toBeLessThan(100);
    expect(head.pts[0]!.x).toBeCloseTo(head.pts[2]!.x, 6);
    expect(head.pts[0]!.y).toBeCloseTo(-head.pts[2]!.y, 6);
    expect(Math.abs(head.pts[0]!.y)).toBeGreaterThan(0);
  });
  it("Arrow 머리는 방향을 따른다 (아래로 그으면 날개가 위쪽에 있고 좌우 대칭)", () => {
    const head = elementCommands(el("arrow", [[50, 0], [50, 100]]))[1] as PathCmd;
    expect(head.pts[1]).toEqual({ x: 50, y: 100 });
    expect(head.pts[0]!.y).toBeLessThan(100);
    expect(head.pts[0]!.x + head.pts[2]!.x).toBeCloseTo(100, 6);
  });
  it("Rectangle: 반대 방향으로 끌어도 정규화", () => {
    expect(elementCommands(el("rectangle", [[110, 70], [10, 20]]))[0]).toMatchObject({ t: "rect", x: 10, y: 20, w: 100, h: 50, alpha: 1 });
  });
  it("Ellipse: 끌기 사각형에 내접 (중심·반지름)", () => {
    expect(elementCommands(el("ellipse", [[10, 20], [110, 80]]))[0]).toMatchObject({ t: "ellipse", cx: 60, cy: 50, rx: 50, ry: 30 });
  });
  it("Pen: 모든 점을 그대로 한 경로로", () => {
    const c = elementCommands(el("pen", [[0, 0], [5, 9], [12, 3], [20, 20]]));
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ t: "path", alpha: 1 });
    expect((c[0] as PathCmd).pts).toHaveLength(4);
  });
  it("Highlight: 알파 0.35, 굵은 선(3배)", () => {
    expect(HIGHLIGHT_ALPHA).toBe(0.35);
    const c = elementCommands(el("highlight", [[0, 0], [30, 0], [60, 5]], { width: 4 }));
    expect(c[0]).toMatchObject({ t: "path", alpha: 0.35, width: 12 });
  });
  it("Text: 누른 자리에 글자, 크기는 굵기에 비례", () => {
    expect(textSize(2)).toBeGreaterThan(0);
    expect(textSize(12) / textSize(2)).toBeCloseTo(6, 6);
    expect(textSize(4)).toBe(2 * textSize(2));
    const c = elementCommands(el("text", [[40, 60]], { text: "6", width: 7 }));
    expect(c).toEqual([{ t: "text", text: "6", x: 40, y: 60, size: textSize(7), color: "#f00", alpha: 1 }]);
  });
  it("빈 글자의 Text 는 그리지 않는다", () => expect(elementCommands(el("text", [[40, 60]], { text: "" }))).toEqual([]));
  it("그냥 눌렀다 뗀(길이 0) 도형은 그리지 않는다", () => {
    expect(elementCommands(el("arrow", [[5, 5], [5, 5]]))).toEqual([]);
    expect(elementCommands(el("rectangle", [[5, 5], [5, 5]]))).toEqual([]);
  });
  it("scale: 굵기와 글자 크기에 곱한다 (좌표는 그대로)", () => {
    expect(elementCommands(el("line", [[0, 0], [10, 0]]), 2.5)[0]).toMatchObject({ width: 10 });
    expect(elementCommands(el("text", [[1, 2]], { text: "a", width: 4 }), 2)[0]).toMatchObject({ size: 2 * textSize(4), x: 1, y: 2 });
  });
});

describe("목록", () => {
  const list = [el("line", [[0, 0], [9, 9]]), el("pen", [[1, 1], [2, 2]]), el("rectangle", [[0, 0], [9, 9]])];
  it("allCommands 는 순서대로 이어 붙인다", () => expect(allCommands(list).map((c) => c.t)).toEqual(["path", "path", "rect"]));
  it("popLast: 마지막 하나만 빼고 원래 목록은 그대로", () => {
    const r = popLast(list);
    expect(r).toHaveLength(2); expect(r[1]).toBe(list[1]); expect(list).toHaveLength(3);
    expect(popLast([])).toEqual([]);
  });
  it("clearAll: 전부 지움 (이미지는 별개)", () => { expect(clearAll(list)).toEqual([]); expect(list).toHaveLength(3); });
});
