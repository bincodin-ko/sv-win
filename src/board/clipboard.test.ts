import { describe, expect, it } from "vitest";
import { copyToClip, PASTE_OFFSET, pasteShift, readClip } from "./clipboard";
import type { Rect } from "./selection";

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const r = (x: number, y: number, w = 100, h = 100) => ({ x, y, w, h });

describe("S-026 앱 안 클립보드", () => {
  it("비어 있으면 null", () => {
    expect(readClip()).toBeNull();
  });
  it("복사본을 보관한다(원본을 나중에 바꿔도 안 변함), id 는 sourceIds 로", () => {
    const n = { id: "a", kind: "console", x: 1, y: 2, w: 3, h: 4, agentId: "claude" };
    copyToClip([n]);
    n.x = 999;
    const c = readClip()!;
    expect(c.sourceIds).toEqual(["a"]);
    expect(c.nodes[0]).toMatchObject({ kind: "console", x: 1, y: 2, w: 3, h: 4, agentId: "claude" });
    expect(c.nodes[0]).not.toHaveProperty("id");
  });
  it("다시 복사하면 덮어쓴다", () => {
    copyToClip([{ id: "a", kind: "box", x: 0, y: 0, w: 1, h: 1 }]);
    copyToClip([{ id: "b", kind: "box", x: 5, y: 5, w: 1, h: 1 }]);
    expect(readClip()!.sourceIds).toEqual(["b"]);
  });
});

describe("S-026 붙여넣기 자리 +24,+24 (겹치면 S-030)", () => {
  it("오프셋은 24", () => {
    expect(PASTE_OFFSET).toBe(24);
  });
  it("다른 노드가 없으면 원본 +24,+24 (원본과 겹쳐도 됨)", () => {
    const src = { id: "a", ...r(0, 0) };
    expect(pasteShift([src], [src], ["a"])).toEqual({ dx: 24, dy: 24 });
  });
  it("그 자리에 다른 노드가 있으면 안 겹치는 빈 자리로", () => {
    const src = { id: "a", ...r(0, 0) };
    const taken = { id: "b", ...r(24, 24) };
    const { dx, dy } = pasteShift([src], [src, taken], ["a"]);
    const placed = { x: dx, y: dy, w: 100, h: 100 };
    expect(overlap(placed, taken)).toBe(false);
    expect(overlap(placed, src)).toBe(false);
  });
  it("여러 개는 묶음이 같이 움직인다(같은 dx,dy)", () => {
    const a = { id: "a", ...r(0, 0) }, b = { id: "b", ...r(300, 0) };
    expect(pasteShift([a, b], [a, b], ["a", "b"])).toEqual({ dx: 24, dy: 24 });
    const blocker = { id: "c", ...r(320, 30) };
    const s = pasteShift([a, b], [a, b, blocker], ["a", "b"]);
    for (const g of [a, b]) expect(overlap({ ...g, x: g.x + s.dx, y: g.y + s.dy }, blocker)).toBe(false);
  });
});
