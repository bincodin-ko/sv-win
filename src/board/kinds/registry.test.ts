import { beforeEach, describe, expect, it } from "vitest";
import { makeBoardStore } from "../store";
import { registerTool, resetToolsForTest, tools } from "../toolsRegistry";
import { getKind, kindsWith, placeNew, registerKind, resetKindsForTest, unsupportedText, type KindDef } from "./registry";

const Dummy = () => null;
const def = (id: string, extra: Partial<KindDef> = {}): KindDef => ({
  id, label: id.toUpperCase(), Component: Dummy, defaultSize: { w: 300, h: 200 }, minSize: { w: 120, h: 80 },
  resizable: true, bodyDrag: false, eraserTarget: false, ...extra,
});

beforeEach(() => { resetKindsForTest(); resetToolsForTest(); });

describe("S-800 registry", () => {
  it("등록한 종류를 id 로 찾는다. 없는 id 는 undefined", () => {
    const d = def("zz");
    registerKind(d);
    expect(getKind("zz")).toBe(d);
    expect(getKind("nope")).toBeUndefined();
  });
  it("kindsWith(slot) 은 그 자리 항목이 있는 종류만, slot.order 순으로", () => {
    registerKind(def("b", { ring: { label: "B", order: 20 } }));
    registerKind(def("a", { ring: { label: "A", order: 10 }, more: { label: "A more", order: 5 } }));
    registerKind(def("c"));
    expect(kindsWith("ring").map((k) => k.id)).toEqual(["a", "b"]);
    expect(kindsWith("more").map((k) => k.id)).toEqual(["a"]);
  });
  it("종류가 없으면 어느 자리도 비어 있다 — 고리·More·Insert to-do 에 안 그린다(S-806·S-807)", () => {
    expect(kindsWith("ring")).toEqual([]);
    expect(kindsWith("more")).toEqual([]);
    expect(kindsWith("insertTodo")).toEqual([]);
  });
});

describe("S-801 Unsupported", () => {
  it("글은 'Unsupported node: <kind>'", () => {
    expect(unsupportedText("future-thing")).toBe("Unsupported node: future-thing");
  });
});

describe("S-804 placeNew", () => {
  it("새 노드를 at(왼쪽 위)에 기본 크기로 놓고 선택하고, 되돌리기 1단계", () => {
    registerKind(def("zz", { create: (o) => ({ title: o?.title ?? "none" }) }));
    const store = makeBoardStore();
    const id = placeNew(store, "zz", { title: "hi" }, { x: 100, y: -50 });
    const n = store.getState().nodes[id]!;
    expect([n.kind, n.x, n.y, n.w, n.h, n.title]).toEqual(["zz", 100, -50, 300, 200, "hi"]);
    expect(store.getState().selection).toEqual([id]);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().nodes[id]).toBeUndefined();
    expect(store.getState().undo()).toBe(false); // 한 단계뿐
  });
  it("at 가 없으면 보이는 화면 가운데(뷰포트 0,0,1 이면 노드 중심이 원점)", () => {
    registerKind(def("zz"));
    const store = makeBoardStore();
    const id = placeNew(store, "zz");
    const n = store.getState().nodes[id]!;
    expect([n.x, n.y]).toEqual([-150, -100]);
  });
  it("자리에 다른 노드가 있으면 겹치지 않는 자리(S-030)", () => {
    registerKind(def("zz"));
    const store = makeBoardStore();
    const ida = placeNew(store, "zz", undefined, { x: 0, y: 0 });
    const idb = placeNew(store, "zz", undefined, { x: 0, y: 0 });
    const a = store.getState().nodes[ida]!, b = store.getState().nodes[idb]!;
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    expect(overlap).toBe(false);
  });
  it("새 노드가 맨 위(z 최대)", () => {
    registerKind(def("zz"));
    const store = makeBoardStore();
    store.getState().addNode({ id: "old", kind: "zz", x: 1000, y: 0, w: 10, h: 10, z: 7 });
    const id = placeNew(store, "zz", undefined, { x: 0, y: 0 });
    const n = store.getState().nodes[id]!;
    expect(n.z).toBeGreaterThan(7);
  });
  it("registry 에 없는 종류면 던진다", () => {
    expect(() => placeNew(makeBoardStore(), "nope")).toThrow("nope");
  });
});

describe("S-803 도구 표", () => {
  it("처음엔 Select·Spawn agent·Fit to content 만, 이 순서", () => {
    expect(tools().map((t) => t.id)).toEqual(["select", "spawn", "fit"]);
  });
  it("order 순으로 끼워 넣는다", () => {
    const o = (id: string) => tools().find((t) => t.id === id)?.order ?? 0;
    registerTool({ id: "zz", label: "ZZ", order: (o("spawn") + o("fit")) / 2 });
    expect(tools().map((t) => t.id)).toEqual(["select", "spawn", "zz", "fit"]);
  });
});

describe("D1 S-1233 rail 슬롯", () => {
  it("rail 항목이 있는 종류만 rail.order 순으로 나온다. 없으면 비어 있다", () => {
    expect(kindsWith("rail")).toEqual([]);
    registerKind(def("b", { rail: { label: "Orchestrator", order: 20 } }));
    registerKind(def("a", { rail: { label: "Memory", order: 10 } }));
    registerKind(def("c"));
    expect(kindsWith("rail").map((k) => k.id)).toEqual(["a", "b"]);
  });
  it("wireColor 는 orange 도 받는다(S-1223)", () => {
    registerKind(def("o", { wireColor: "orange" }));
    expect(getKind("o")!.wireColor).toBe("orange");
  });
});
