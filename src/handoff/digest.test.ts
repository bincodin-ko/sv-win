import { describe, it, expect } from "vitest";
import { buildDigest, cutReply, divide } from "./digest";

describe("S-1702 digest", () => {
  it("답 하나 24,000자 넘으면 자르고 [cut]", () => {
    expect(cutReply("a".repeat(24_000))).toBe("a".repeat(24_000));
    expect(cutReply("a".repeat(24_001))).toBe("a".repeat(24_000) + "[cut]");
  });
  it("형식: Results from <이름>: 줄 + 답, 사이는 빈 줄", () => {
    const d = buildDigest([{ name: "Otto", text: "A" }, { name: "Bex", text: "B" }]);
    expect(d.digest).toBe("Results from Otto:\nA\n\nResults from Bex:\nB");
    expect(d.parts).toEqual(["Results from Otto:\nA", "Results from Bex:\nB"]);
  });
  it("전체 약 72,000자: 넘으면 뒤쪽 답을 자른다", () => {
    const r = [1, 2, 3, 4].map((i) => ({ name: `c${i}`, text: "x".repeat(24_000) }));
    const d = buildDigest(r);
    expect(d.digest.length).toBeLessThanOrEqual(72_000 + 5);
    expect(d.digest.endsWith("[cut]")).toBe(true);
    expect(d.digest).not.toContain("Results from c4");
  });
});

describe("S-1703 divide", () => {
  const p = ["p0", "p1", "p2", "p3"];
  it("목적지 하나면 전체", () => expect(divide(p, 1, false)).toEqual(["p0\n\np1\n\np2\n\np3"]));
  it("여럿이면 라운드로빈", () => expect(divide(p, 2, false)).toEqual(["p0\n\np2", "p1\n\np3"]));
  it("답이 모자라면 못 받은 목적지는 null(한가하게 둠)", () => expect(divide(["p0", "p1"], 3, false)).toEqual(["p0", "p1", null]));
  it("나눌 수 없으면(답 하나) 첫 목적지만", () => expect(divide(["p0"], 3, false)).toEqual(["p0", null, null]));
  it("to everyone 은 전체를 모두에게", () => expect(divide(["p0", "p1"], 2, true)).toEqual(["p0\n\np1", "p0\n\np1"]));
});
