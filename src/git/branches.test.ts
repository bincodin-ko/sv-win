import { describe, expect, it } from "vitest";
import { branchNameError, MAX_BRANCHES, shownBranches } from "./branches";

const mk = (n: number, cur = "b000") => Array.from({ length: n }, (_, i) => { const name = "b" + String(i).padStart(3, "0"); return { name, current: name === cur }; });

describe("shownBranches (S-1051)", () => {
  it("최대 200개만 보인다", () => {
    expect(MAX_BRANCHES).toBe(200);
    expect(shownBranches(mk(250))).toHaveLength(200);
    expect(shownBranches(mk(3))).toHaveLength(3);
  });
  it("이름순이고 현재 브랜치 표시는 그대로 남는다(맨 위로 올리지 않는다)", () => {
    const out = shownBranches([{ name: "zeta", current: false }, { name: "main", current: true }, { name: "alpha", current: false }]);
    expect(out.map((b) => b.name)).toEqual(["alpha", "main", "zeta"]);
    expect(out.filter((b) => b.current).map((b) => b.name)).toEqual(["main"]);
  });
  it("현재 브랜치가 200개 밖이어도 현재 표시는 목록에 있다", () => {
    const out = shownBranches(mk(250, "b249"));
    expect(out).toHaveLength(200);
    expect(out.some((b) => b.current && b.name === "b249")).toBe(true);
  });
});

describe("branchNameError (S-1053)", () => {
  it("빈 이름·공백만 있는 이름은 오류", () => {
    expect(branchNameError("")).not.toBeNull();
    expect(branchNameError("   ")).not.toBeNull();
  });
  it("git 이 받는 이름은 통과(앞뒤 공백은 무시)", () => {
    for (const n of ["feature", "feature/x", "fix-1", "v1.2", " dev "]) expect(branchNameError(n), n).toBeNull();
  });
  it("git 이 거절하는 이름은 `'이름' is not a valid branch name`", () => {
    for (const n of ["a b", "a..b", "-x", "x/", "/x", "x.", "x.lock", "a~b", "a^b", "a:b", "a?b", "a*b", "a[b", "a\b", "a@{b", "@", "a//b"]) expect(branchNameError(n), n).toBe(`'${n}' is not a valid branch name`);
  });
});
