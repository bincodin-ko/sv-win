import { beforeEach, describe, expect, it } from "vitest";
import { useBoard } from "./store";
import { clampCoord, clampZoom, fitBounds, screenToWorld, worldToScreen, zoomAt, zoomStep, panBy } from "./viewport";

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("viewport", () => {
  it("S-002 clampZoom: 20~300%", () => {
    expect(clampZoom(0.01)).toBe(0.2);
    expect(clampZoom(9)).toBe(3);
    expect(clampZoom(1.5)).toBe(1.5);
  });
  it("S-001 clampCoord: ±12,000", () => {
    expect(clampCoord(13000)).toBe(12000);
    expect(clampCoord(-99999)).toBe(-12000);
    expect(clampCoord(5)).toBe(5);
  });
  it("S-005 zoomAt: 포인터 아래 world 점이 고정", () => {
    const v = { x: 40, y: -30, zoom: 1.3 };
    const p = { x: 200, y: 120 };
    const before = screenToWorld(v, p);
    const v2 = zoomAt(v, p, 1.7);
    near(v2.zoom, 1.3 * 1.7);
    const after = screenToWorld(v2, p);
    near(after.x, before.x);
    near(after.y, before.y);
  });
  it("S-002 zoomAt: 범위 끝에서 멈추고 그때도 포인터 고정", () => {
    const v = { x: 0, y: 0, zoom: 2.9 };
    const p = { x: 100, y: 50 };
    const before = screenToWorld(v, p);
    const v2 = zoomAt(v, p, 5);
    expect(v2.zoom).toBe(3);
    near(screenToWorld(v2, p).x, before.x);
    expect(zoomAt({ x: 0, y: 0, zoom: 0.21 }, p, 0.1).zoom).toBe(0.2);
  });
  it("S-006 zoomStep: 화면 가운데 기준 ×1.2", () => {
    const v = { x: 100, y: 60, zoom: 1 };
    const up = zoomStep(v, 1);
    near(up.zoom, 1.2);
    near(screenToWorld(up, { x: 0, y: 0 }).x, screenToWorld(v, { x: 0, y: 0 }).x);
    near(zoomStep(up, -1).zoom, 1);
    expect(zoomStep({ x: 0, y: 0, zoom: 3 }, 1).zoom).toBe(3);
  });
  it("S-003 panBy: 화면 이동량만큼 view 이동", () => {
    expect(panBy({ x: 1, y: 2, zoom: 1 }, 10, -5)).toEqual({ x: 11, y: -3, zoom: 1 });
  });
  it("world<->screen 왕복", () => {
    const v = { x: 12, y: -7, zoom: 0.5 };
    const p = worldToScreen(v, { x: 300, y: -80 });
    near(screenToWorld(v, p).x, 300);
    near(screenToWorld(v, p).y, -80);
  });
  it("S-008 fitBounds: 빈 보드 = 원점 100%", () => {
    expect(fitBounds(null, { w: 1000, h: 800 })).toEqual({ x: 0, y: 0, zoom: 1 });
  });
  it("S-008 fitBounds: 여백 48 더해 맞춤, 경계 중심이 화면 가운데", () => {
    const b = { x: 100, y: 200, w: 400, h: 200 };
    const v = fitBounds(b, { w: 1000, h: 800 });
    near(v.zoom, Math.min(1000 / 496, 800 / 296));
    const c = worldToScreen(v, { x: 300, y: 300 });
    near(c.x, 0);
    near(c.y, 0);
  });
  it("S-008 fitBounds: 줌 범위 안으로 고정(작은 노드 300%, 큰 노드 20%)", () => {
    expect(fitBounds({ x: 0, y: 0, w: 10, h: 10 }, { w: 1000, h: 800 }).zoom).toBe(3);
    expect(fitBounds({ x: 0, y: 0, w: 20000, h: 20000 }, { w: 1000, h: 800 }).zoom).toBe(0.2);
  });
});

describe("store", () => {
  beforeEach(() => useBoard.setState({ nodes: {}, viewport: { x: 0, y: 0, zoom: 1 } }));
  it("S-001 addNode/updateNode: 좌표 ±12,000 고정", () => {
    useBoard.getState().addNode({ id: "a", kind: "box", x: 99999, y: -99999, w: 10, h: 10, z: 0 });
    expect(useBoard.getState().nodes.a.x).toBe(12000);
    expect(useBoard.getState().nodes.a.y).toBe(-12000);
    useBoard.getState().updateNode("a", { x: -50000 });
    expect(useBoard.getState().nodes.a.x).toBe(-12000);
    useBoard.getState().removeNode("a");
    expect(useBoard.getState().nodes.a).toBeUndefined();
  });
  it("S-002 setViewport: 줌 고정", () => {
    useBoard.getState().setViewport({ x: 0, y: 0, zoom: 50 });
    expect(useBoard.getState().viewport.zoom).toBe(3);
  });
});
