import { describe, expect, it } from "vitest";
import { suggestSubject } from "./suggest";

// S-1025: 추가만 Add / 삭제만 Remove / 그 밖 Update, 3개 넘으면 "Update N files"
const f = (path: string, status: string) => ({ path, status });
describe("suggestSubject", () => {
  it("추가만 → Add a.ts, b.ts (경로는 파일 이름만)", () => {
    expect(suggestSubject([f("src/a.ts", "A"), f("b.ts", "?")])).toBe("Add a.ts, b.ts");
  });
  it("삭제만 → Remove", () => {
    expect(suggestSubject([f("old.ts", "D")])).toBe("Remove old.ts");
  });
  it("섞이면 Update", () => {
    expect(suggestSubject([f("a.ts", "M"), f("b.ts", "A"), f("c.ts", "D")])).toBe("Update a.ts, b.ts, c.ts");
  });
  it("3개를 넘으면 종류와 상관없이 Update N files", () => {
    expect(suggestSubject([f("a", "A"), f("b", "A"), f("c", "A"), f("d", "A")])).toBe("Update 4 files");
  });
  it("변경이 없으면 빈 문자열", () => {
    expect(suggestSubject([])).toBe("");
  });
});
