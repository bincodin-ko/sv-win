// S-1514·S-1564 히트맵 52주 달력, S-1574 숫자 형식
import { describe, expect, it } from "vitest";
import { compact, heatGrid } from "./parts";

describe("heatGrid", () => {
  it("활동 드문 날짜 목록 → 마지막 날 기준 52주 달력, 없는 날은 0", () => {
    const g = heatGrid([{ date: "2026-10-01", level: 3 }, { date: "2026-10-20", level: 1 }]); // 10-20 = 화요일
    expect(g.length).toBe(51 * 7 + 3);
    expect(g[0]!.date).toBe("2025-10-26"); // 일요일에서 시작
    expect(new Date(`${g[0]!.date}T00:00:00`).getDay()).toBe(0);
    expect(g.at(-1)).toEqual({ date: "2026-10-20", level: 1 });
    expect(g.find((c) => c.date === "2026-10-01")!.level).toBe(3);
    expect(g.find((c) => c.date === "2026-10-02")!.level).toBe(0);
  });
  it("52주보다 오래된 날은 자른다, 빈 목록은 빈 달력", () => {
    const g = heatGrid([{ date: "2024-01-01", level: 4 }, { date: "2026-10-20", level: 2 }]);
    expect(g.some((c) => c.date === "2024-01-01")).toBe(false);
    expect(heatGrid([])).toEqual([]);
  });
});

describe("숫자 형식 하나 S-1574", () => {
  it("통계 줄도 fmtTokens 규칙", () => {
    expect(compact(999)).toBe("999");
    expect(compact(1500)).toBe("1.5K");
    expect(compact(303_000)).toBe("303K");
    expect(compact(1_100_000)).toBe("1.1M");
    expect(compact(2_300_000_000)).toBe("2.3B");
  });
});
