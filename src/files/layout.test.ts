import { describe, expect, it } from "vitest";
import { findSpot } from "../board/placement";
import { gridBases } from "./layout";

type R = { x: number; y: number; w: number; h: number };
const hit = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("gridBases (S-954)", () => {
  it("개수만큼 서로 다른 후보, 첫 후보는 놓은 지점", () => {
    for (const n of [1, 2, 5, 9]) {
      const b = gridBases({ x: 100, y: 50 }, n);
      expect(b).toHaveLength(n);
      expect(new Set(b.map((p) => `${p.x},${p.y}`)).size).toBe(n);
      expect(b[0]).toEqual({ x: 100, y: 50 });
    }
  });
  it("여러 개가 한 점 둘레에 겹치지 않게 놓인다(크기가 제각각이어도, 이미 있는 노드가 있어도)", () => {
    const sizes = [{ w: 480, h: 360 }, { w: 240, h: 120 }, { w: 460, h: 345 }, { w: 600, h: 380 }, { w: 240, h: 120 }, { w: 300, h: 200 }];
    const placed: R[] = [{ x: 0, y: 0, w: 300, h: 300 }];
    const bases = gridBases({ x: 0, y: 0 }, sizes.length);
    sizes.forEach((s, i) => placed.push({ ...findSpot(bases[i]!, s, placed), ...s }));
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(hit(placed[i]!, placed[j]!), `${i}/${j}`).toBe(false);
  });
});
