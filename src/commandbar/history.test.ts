import { describe, expect, it } from "vitest";
import { down, MAX_HISTORY, newHist, push, up } from "./history";

describe("S-548 최근 명령", () => {
  it("↑ 는 가장 최근부터 오래된 쪽으로, 끝에서 멈춘다", () => {
    let h = [..."abc"].reduce((x, t) => push(x, t), newHist());
    const seen: (string | null)[] = [];
    for (let i = 0; i < 4; i++) { const r = up(h, "draft"); h = r.h; seen.push(r.text); }
    expect(seen).toEqual(["c", "b", "a", "a"]);
  });
  it("↓ 는 새 쪽으로, 맨 끝에서는 쓰던 글로 돌아간다", () => {
    let h = [..."ab"].reduce((x, t) => push(x, t), newHist());
    h = up(h, "draft").h; h = up(h, "draft").h; // a
    const r1 = down(h); expect(r1.text).toBe("b");
    const r2 = down(r1.h); expect(r2.text).toBe("draft");
    expect(down(r2.h).text).toBeNull(); // 이동 중이 아니면 할 일 없음
  });
  it("빈 글과 바로 앞과 같은 글은 건너뛰고, 50개까지만 남긴다", () => {
    let h = push(push(push(newHist(), ""), "x"), "x");
    expect(h.items).toEqual(["x"]);
    for (let i = 0; i < 60; i++) h = push(h, `m${i}`);
    expect(h.items).toHaveLength(MAX_HISTORY);
    expect(h.items.at(-1)).toBe("m59");
    expect(h.items[0]).toBe("m10");
  });
  it("기록이 없으면 ↑ 는 null", () => {
    expect(up(newHist(), "d").text).toBeNull();
  });
});
