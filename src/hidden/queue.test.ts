import { describe, expect, it } from "vitest";
import { createQueue } from "./queue";

const defer = () => {
  let res!: (v: number) => void;
  const p = new Promise<number>((a) => (res = a));
  return { p, res };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("S-1208 동시 3개", () => {
  it("4번째는 줄을 서고, 앞이 끝나면 시작한다", async () => {
    const q = createQueue(3);
    const started: number[] = [];
    const d = [0, 1, 2, 3].map(defer);
    const out = d.map((x, i) => q.run(() => (started.push(i), x.p)));
    await tick();
    expect(started).toEqual([0, 1, 2]);
    expect([q.active(), q.waiting()]).toEqual([3, 1]);
    d[1].res(11);
    await tick();
    expect(started).toEqual([0, 1, 2, 3]);
    expect(await out[1]).toBe(11);
    d[0].res(10);
    d[2].res(12);
    d[3].res(13);
    expect(await Promise.all(out)).toEqual([10, 11, 12, 13]);
    expect([q.active(), q.waiting()]).toEqual([0, 0]);
  });
  it("일이 실패해도 자리를 돌려준다", async () => {
    const q = createQueue(1);
    const a = q.run(() => Promise.reject(new Error("x")));
    const b = q.run(async () => 7);
    await expect(a).rejects.toThrow("x");
    expect(await b).toBe(7);
  });
});
