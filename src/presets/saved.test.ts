import { describe, expect, it } from "vitest";
import { CONSOLE_H, CONSOLE_W, type BoardNode } from "../board/store";
import { registerKind } from "../board/kinds/registry";
import { captureLayout, nextSetName, stampLayout } from "./saved";

const n = (o: Record<string, unknown>) => ({ id: "x", z: 3, w: 100, h: 50, x: 10, y: 20, ...o }) as BoardNode;

describe("S-647 captureLayout", () => {
  it("저장하는 것: 종류·위치·크기·제목·글·색, 콘솔이면 에이전트", () => {
    const [a, c] = captureLayout([n({ kind: "text", title: "T", text: "hello", color: "red" }), n({ kind: "console", name: "Otto", agentId: "codex", w: 800, h: 500 })]);
    expect(a).toEqual({ kind: "text", x: 10, y: 20, w: 100, h: 50, title: "T", text: "hello", color: "red" });
    expect(c).toEqual({ kind: "console", x: 10, y: 20, w: 800, h: 500, agentId: "codex" });
  });
  it("저장하지 않는 것: 그룹, 선, 웹 주소, 이미지, 카드 내용, 도형 스타일, 잉크, id, z", () => {
    const [a] = captureLayout([n({ kind: "web", title: "W", groupId: "g1", from: "a", to: "b", url: "http://x", src: "data:", cards: [1], shape: "round", stroke: 3, ink: [[1, 2]] })]);
    expect(Object.keys(a!).sort()).toEqual(["h", "kind", "title", "w", "x", "y"]);
  });
});

describe("S-1793 wired 는 저장하지 않는다", () => {
  it("orchestrator·memory 를 담아도 wired 가 없다", () => {
    const out = captureLayout([n({ kind: "orchestrator", name: "Orchestrator", wired: ["g1", "c1"], collapsed: [] }), n({ kind: "memory", wired: ["c1"], lastPush: 5 })]);
    for (const o of out) expect(Object.keys(o).sort()).toEqual(["h", "kind", "w", "x", "y"]);
  });
});

describe("S-647 nextSetName", () => {
  const s = (...ns: string[]) => ns.map((name) => ({ name }));
  it("Set 1, Set 2 …", () => {
    expect(nextSetName([])).toBe("Set 1");
    expect(nextSetName(s("Set 1"))).toBe("Set 2");
  });
  it("삭제 후 번호 재사용(안 쓴 가장 작은 N)", () => {
    expect(nextSetName(s("Set 1", "Set 3"))).toBe("Set 2");
    expect(nextSetName(s("Set 2", "Other"))).toBe("Set 1");
  });
});

describe("S-648 stampLayout", () => {
  it("덩어리 가운데가 center, 콘솔은 기본 크기", () => {
    const out = stampLayout({ name: "Set 1", nodes: [{ kind: "console", x: 0, y: 0, w: 900, h: 600, agentId: "claude" }, { kind: "text", x: 800, y: 0, w: 200, h: 100, text: "hi" }] }, { x: 1000, y: 500 });
    expect(out[0]).toMatchObject({ kind: "console", w: CONSOLE_W, h: CONSOLE_H, agentId: "claude" });
    expect(out[1]).toMatchObject({ kind: "text", w: 200, h: 100, text: "hi" });
    const x0 = Math.min(...out.map((o) => o.x)), x1 = Math.max(...out.map((o) => o.x + o.w));
    const y0 = Math.min(...out.map((o) => o.y)), y1 = Math.max(...out.map((o) => o.y + o.h));
    expect(Math.abs((x0 + x1) / 2 - 1000)).toBeLessThanOrEqual(1);
    expect(Math.abs((y0 + y1) / 2 - 500)).toBeLessThanOrEqual(1);
    expect(out[1]!.x - out[0]!.x).toBe(800); // 서로의 상대 위치는 그대로
  });
});

describe("FX4 S-647 잉크·create 없는 종류는 저장하지 않는다", () => {
  registerKind({ id: "image", label: "Image", Component: () => null, defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 }, resizable: false, bodyDrag: true, eraserTarget: true });
  registerKind({ id: "text", label: "Text", Component: () => null, defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 }, resizable: false, bodyDrag: true, eraserTarget: true, create: () => ({}) });
  it("ink 와 create 없는 image 를 거르고 text 는 남긴다", () => {
    const out = captureLayout([n({ kind: "ink", points: [[1, 2]] }), n({ kind: "image", src: "data:" }), n({ kind: "text", text: "a" }), n({ kind: "ink" })]);
    expect(out.map((o) => o.kind)).toEqual(["text"]);
  });
});
