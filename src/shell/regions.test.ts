import { describe, expect, it } from "vitest";
import { cycleId, nextRegion, readingOrder } from "./regions";

// 기대값 출처: spec S-2620(보드 → 명령줄 → 상단 바 → 좌 레일 → 우 레일 → 처음), S-2622(읽기 순서: 위→아래, 같은 줄이면 왼→오)
describe("nextRegion S-2620", () => {
  it("앞으로 한 바퀴", () => {
    expect(nextRegion("board", 1)).toBe("bar");
    expect(nextRegion("bar", 1)).toBe("top");
    expect(nextRegion("top", 1)).toBe("left");
    expect(nextRegion("left", 1)).toBe("right");
    expect(nextRegion("right", 1)).toBe("board");
  });
  it("뒤로 한 바퀴", () => {
    expect(nextRegion("board", -1)).toBe("right");
    expect(nextRegion("bar", -1)).toBe("board");
  });
  it("어느 영역도 아니면 앞=보드 뒤=오른쪽 레일", () => {
    expect(nextRegion(null, 1)).toBe("board");
    expect(nextRegion(null, -1)).toBe("right");
  });
});

describe("readingOrder S-2622", () => {
  it("위→아래", () => {
    expect(readingOrder([{ id: "b", x: 0, y: 500, h: 400 }, { id: "a", x: 0, y: 0, h: 400 }])).toEqual(["a", "b"]);
  });
  it("같은 줄(y 차이가 행 높이 절반 미만)이면 왼→오", () => {
    expect(readingOrder([{ id: "r", x: 800, y: 0, h: 400 }, { id: "l", x: 0, y: 150, h: 400 }, { id: "d", x: 0, y: 600, h: 400 }])).toEqual(["l", "r", "d"]);
  });
});

describe("cycleId S-2622", () => {
  const ids = ["a", "b", "c"];
  it("다음/이전, 끝에서 처음으로", () => {
    expect(cycleId(ids, "a", 1)).toBe("b");
    expect(cycleId(ids, "c", 1)).toBe("a");
    expect(cycleId(ids, "a", -1)).toBe("c");
  });
  it("현재가 없으면 앞=첫째 뒤=마지막, 빈 목록은 null", () => {
    expect(cycleId(ids, null, 1)).toBe("a");
    expect(cycleId(ids, null, -1)).toBe("c");
    expect(cycleId([], null, 1)).toBeNull();
  });
});
