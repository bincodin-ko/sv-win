import { describe, expect, it } from "vitest";
import { columnAt, isDragMove, slotAt } from "./dnd";

describe("S-940 포인터 끌기 계산", () => {
  it("3px 미만 이동은 클릭, 3px 이상은 끌기", () => {
    expect(isDragMove(0, 0)).toBe(false);
    expect(isDragMove(2, 2)).toBe(false); // 2.83
    expect(isDragMove(3, 0)).toBe(true);
    expect(isDragMove(-2, 3)).toBe(true);
  });
  it("놓을 자리 = pos 보다 위(앞)에 중심이 있는 카드 수", () => {
    expect(slotAt([], 50)).toBe(0);
    expect(slotAt([10, 30, 50], 5)).toBe(0);
    expect(slotAt([10, 30, 50], 20)).toBe(1);
    expect(slotAt([10, 30, 50], 40)).toBe(2);
    expect(slotAt([10, 30, 50], 99)).toBe(3);
    expect(slotAt([10, 30, 50], 30)).toBe(1); // 중심 위 = 그 카드 앞
  });
  it("x 에서 가장 가까운 열: 안이면 그 열, 틈·바깥은 가까운 쪽(같으면 앞)", () => {
    const r = [{ id: "a", left: 0, right: 100 }, { id: "b", left: 110, right: 210 }];
    expect(columnAt(r, 50)).toBe("a");
    expect(columnAt(r, 150)).toBe("b");
    expect(columnAt(r, 104)).toBe("a");
    expect(columnAt(r, 108)).toBe("b");
    expect(columnAt(r, 105)).toBe("a");
    expect(columnAt(r, -40)).toBe("a");
    expect(columnAt(r, 900)).toBe("b");
    expect(columnAt([], 10)).toBeNull();
  });
});
