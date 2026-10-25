import { describe, expect, it } from "vitest";
import { indentTab } from "./indent";

describe("S-1875 Tab = 공백 2칸", () => {
  it("커서 자리에 공백 2칸을 넣고 커서를 뒤로", () => {
    expect(indentTab("ab", 1, 1)).toEqual({ text: "a  b", start: 3, end: 3 });
    expect(indentTab("", 0, 0)).toEqual({ text: "  ", start: 2, end: 2 });
  });
  it("선택 영역은 공백 2칸으로 바뀐다", () => {
    expect(indentTab("abcd", 1, 3)).toEqual({ text: "a  d", start: 3, end: 3 });
  });
});
