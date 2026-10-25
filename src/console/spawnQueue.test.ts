import { describe, expect, it } from "vitest";
import { MAX_SPAWN, limitSpawn } from "./spawnQueue";

describe("limitSpawn", () => {
  it("12개를 한꺼번에 요청해도 동시 spawn 은 MAX_SPAWN 이하이고 모두 끝난다", async () => {
    let cur = 0, peak = 0, done = 0;
    const one = () => limitSpawn(async () => {
      peak = Math.max(peak, ++cur);
      await new Promise((r) => setTimeout(r, 5));
      cur--; done++;
      return done;
    });
    await Promise.all(Array.from({ length: 12 }, one));
    expect(peak).toBeLessThanOrEqual(MAX_SPAWN);
    expect(done).toBe(12);
  });
  it("실패해도 자리를 놓아 다음이 시작된다", async () => {
    await expect(limitSpawn(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(await limitSpawn(async () => 7)).toBe(7);
  });
});
