import { describe, expect, it } from "vitest";
import { editName, nextName, POOL } from "./names";

describe("S-061 새 콘솔 이름", () => {
  it("풀 16개, 첫 이름은 Otto", () => {
    expect(POOL).toHaveLength(16);
    expect(nextName([])).toBe("Otto");
  });
  it("안 쓰인 첫 이름(앞이 비면 앞 이름)", () => {
    expect(nextName(["Otto", "Dax"])).toBe("Maya");
    expect(nextName(["Dax"])).toBe("Otto");
  });
  it("16개가 다 쓰이면 Otto 2, Dax 2… 그다음 Otto 3", () => {
    expect(nextName([...POOL])).toBe("Otto 2");
    expect(nextName([...POOL, "Otto 2"])).toBe("Dax 2");
    expect(nextName([...POOL, ...POOL.map((n) => n + " 2")])).toBe("Otto 3");
  });
});

describe("S-062 이름 편집", () => {
  it("그대로 저장, 앞뒤 공백 제거", () => {
    expect(editName("  Nova Prime ", [])).toBe("Nova Prime");
  });
  it("빈 이름은 취소(null)", () => {
    expect(editName("   ", [])).toBeNull();
  });
  it("최대 23자", () => {
    expect(editName("a".repeat(40), [])).toBe("a".repeat(23));
  });
  it("같은 이름이 있으면 ' 2', ' 3' 을 붙여 유일하게", () => {
    expect(editName("Maya", ["Maya"])).toBe("Maya 2");
    expect(editName("Maya", ["Maya", "Maya 2"])).toBe("Maya 3");
  });
  it("자르고 나서 붙인 이름이 중복이어도 유일", () => {
    const long = "b".repeat(23);
    expect(editName(long + "zzz", [long])).toBe(long + " 2");
  });
});
