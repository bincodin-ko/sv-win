import { describe, expect, it } from "vitest";
import { makeCode, makeExplorer, makeMarkdown } from "./make";
import { getKind } from "../board/kinds/registry";
import "../board/kinds/code";
import "../board/kinds/markdown";
import "../board/kinds/explorer";

const rows = (n: number) => Array.from({ length: n }, () => "p").join("\n");

describe("카드 만들기 (C15 가 부른다)", () => {
  it("S-958 makeCode: 이름·경로·글, 5,001줄이면 5,000줄만 + truncated", () => {
    expect(makeCode("C:\\r\\src\\a.ts", "x")).toMatchObject({ path: "C:\\r\\src\\a.ts", name: "a.ts", text: "x", truncated: false });
    const big = makeCode("/r/b.py", rows(5001));
    expect(big.truncated).toBe(true);
    expect((big.text as string).split("\n").length).toBe(5000);
  });
  it("S-959 makeMarkdown: path 와 name 만", () => {
    expect(makeMarkdown("C:/r/README.md")).toEqual({ path: "C:/r/README.md", name: "README.md" });
  });
  it("S-962 makeExplorer: 40개까지, 첫 파일 선택, 폴더 이름", () => {
    const files = Array.from({ length: 55 }, (_, i) => `C:/r/src/f${i}.ts`);
    const e = makeExplorer("C:/r/src/", files);
    expect(e.files).toHaveLength(40);
    expect(e.selected).toBe(files[0]);
    expect(e.dir).toBe("C:/r/src/");
    expect(e.name).toBe("src");
    expect(makeExplorer("C:/r/empty", []).selected).toBe("");
  });
  it("S-963·S-964 종류 id 고정, 머리줄만 끌림, 크기 조절, 지우개 대상", () => {
    for (const k of ["code", "markdown", "explorer"]) {
      const d = getKind(k)!;
      expect(d, k).toBeTruthy();
      expect(d.bodyDrag).toBe(false);
      expect(d.resizable).toBe(true);
      expect(d.eraserTarget).toBe(true);
    }
  });
  it("S-958 code 의 create 도 5,000줄로 자른다", () => {
    const f = getKind("code")!.create!({ path: "/a.ts", name: "a.ts", text: rows(6000) });
    expect((f.text as string).split("\n").length).toBe(5000);
    expect(f.truncated).toBe(true);
  });
});
