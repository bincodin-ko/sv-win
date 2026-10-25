import { describe, expect, it } from "vitest";
import { sweep } from "./eraser";
import type { BoardNode } from "../store";

const n = (id: string, kind: string, x: number, y: number, w: number, h: number, z: number, extra: Record<string, unknown> = {}): BoardNode => ({ id, kind, x, y, w, h, z, ...extra });
const ink = (id: string, x: number, y: number, z = 1) => n(id, "ink", x, y, 104, 14, z, { points: [[7, 7], [97, 7]], color: "red", width: 14 }); // 가로선 y=y+7, x..x+104
const can = (k: BoardNode) => k.kind !== "console" && k.kind !== "orchestrator";
const P = (x: number, y: number) => ({ x, y });

describe("S-866 지우개 고르기", () => {
  it("지나간 자리의 ink 를 고른다, 멀리 있는 것은 안 고른다", () => {
    const ids = sweep([ink("a", 0, 0), ink("b", 0, 200)], P(50, 7), P(60, 7), 8, can);
    expect(ids).toEqual(["a"]);
  });
  it("끌면서 지나는 ink 를 모두 고른다 (선분 중간에 걸친 것도)", () => {
    const ids = sweep([ink("a", 0, 0), ink("b", 0, 100), ink("c", 0, 300)], P(50, 7), P(50, 107), 8, can);
    expect(ids.sort()).toEqual(["a", "b"]);
  });
  it("선분이 얇은 ink 를 가로지르면 맞는다 (표본 간격이 반지름보다 촘촘)", () => {
    expect(sweep([ink("a", 0, 0)], P(50, 60), P(50, -46), 8, can)).toEqual(["a"]);
  });
  it("콘솔과 orchestrator 는 안 지운다, 그 위의 ink 는 지운다", () => {
    const con = n("c", "console", 0, 0, 400, 300, 1);
    const orch = n("o", "orchestrator", 500, 0, 400, 300, 1);
    const nodes = [con, orch, ink("a", 0, 100, 5)];
    expect(sweep(nodes, P(50, 107), P(60, 107), 8, can)).toEqual(["a"]);
    expect(sweep([con, orch], P(50, 100), P(600, 100), 8, can)).toEqual([]);
  });
  it("ink 가 아닌 노드는 포인터 아래 가장 위 1개만", () => {
    const low = n("low", "tk-plain", 0, 0, 200, 200, 1);
    const high = n("high", "tk-plain", 50, 50, 200, 200, 2);
    expect(sweep([low, high], P(100, 100), P(100, 100), 8, can)).toEqual(["high"]);
  });
  it("가장 위가 콘솔이면 그 아래 노드를 건너뛰어 지우지 않는다", () => {
    const low = n("low", "tk-plain", 0, 0, 200, 200, 1);
    const con = n("con", "console", 0, 0, 200, 200, 2);
    expect(sweep([low, con], P(100, 100), P(100, 100), 8, can)).toEqual([]);
  });
  it("끌면서 지나는 각 노드를 지운다", () => {
    const a = n("a", "tk-plain", 0, 0, 100, 100, 1);
    const b = n("b", "tk-plain", 200, 0, 100, 100, 1);
    expect(sweep([a, b], P(50, 50), P(250, 50), 8, can).sort()).toEqual(["a", "b"]);
  });
  it("can 이 false 인 종류는 안 지운다 (registry 의 eraserTarget)", () => {
    const x = n("x", "tk-card", 0, 0, 100, 100, 1);
    expect(sweep([x], P(50, 50), P(50, 50), 8, (k) => k.kind !== "tk-card")).toEqual([]);
  });
  it("같은 id 를 두 번 돌려주지 않는다", () => {
    const ids = sweep([ink("a", 0, 0)], P(0, 7), P(100, 7), 8, can);
    expect(ids).toEqual(["a"]);
  });
});
