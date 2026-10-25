import { describe, expect, it } from "vitest";
import { buildVaultTree, normalizeNoteName, renameTarget, searchVault } from "./vault";

const f = (...p: string[]) => p.map((x) => ({ path: `C:/r/${x}` }));
const names = (n: { name: string }[]) => n.map((x) => x.name);

describe("S-1921·S-1922 vault 트리", () => {
  const files = f("10-b/z.md", "2-a/x.md", "00-overview/o.md", "readme.md", "Docs/a.md", "Docs/sub/s.md", "alpha.md");
  it("Agent memory 가 맨 위, 폴더 먼저 번호 순(00 < 2 < 10), 그다음 파일 이름순", () => {
    const t = buildVaultTree(files, "C:/r", { dir: "C:/m", files: [] });
    expect(names(t)).toEqual(["Agent memory", "00-overview", "2-a", "10-b", "Docs", "alpha.md", "readme.md"]);
  });
  it("Agent memory 는 가상 폴더: 비면 No notes yet, 있으면 그 파일들", () => {
    const e = buildVaultTree([], "C:/r", { dir: "C:/m", files: [] })[0]!;
    expect(e).toMatchObject({ name: "Agent memory", isDir: true, virtual: true, empty: "No notes yet", path: "C:/m" });
    const m = buildVaultTree([], "C:/r", { dir: "C:/m", files: [{ path: "C:/m/b.md" }, { path: "C:/m/a.md" }] })[0]!;
    expect(names(m.children!)).toEqual(["a.md", "b.md"]);
    expect(m.empty).toBeUndefined();
  });
  it("폴더 안 폴더는 children 으로 중첩", () => {
    const docs = buildVaultTree(files, "C:/r").find((n) => n.name === "Docs")!;
    expect(names(docs.children!)).toEqual(["sub", "a.md"]);
  });
});

describe("S-1923 검색", () => {
  const files = f("00-overview/o.md", "README.md", "docs/Guide.md");
  it("이름·경로에 들어 있으면(대소문자 무시) 평평한 목록", () => {
    expect(searchVault(files, "C:/r", "READ").map((x) => x.rel)).toEqual(["README.md"]);
    expect(searchVault(files, "C:/r", "overview").map((x) => x.rel)).toEqual(["00-overview/o.md"]);
    expect(searchVault(files, "C:/r", "guide").map((x) => x.rel)).toEqual(["docs/Guide.md"]);
    expect(searchVault(files, "C:/r", " ")).toEqual([]);
  });
});

describe("S-1924·S-1925 이름", () => {
  it("새 글 이름: 확장자 없으면 .md, 금지 글자·빈 이름은 null", () => {
    expect(normalizeNoteName("idea")).toBe("idea.md");
    expect(normalizeNoteName("idea.markdown")).toBe("idea.markdown");
    expect(normalizeNoteName("a.mdx")).toBe("a.mdx");
    expect(normalizeNoteName("v1.2 plan")).toBe("v1.2 plan.md");
    expect(normalizeNoteName("a:b")).toBeNull();
    expect(normalizeNoteName("a/b")).toBeNull();
    expect(normalizeNoteName("  ")).toBeNull();
  });
  it("Rename: 확장자는 그대로 유지", () => {
    expect(renameTarget("note.md", "plan")).toBe("plan.md");
    expect(renameTarget("note.md", "plan.md")).toBe("plan.md");
    expect(renameTarget("note.mdx", "plan")).toBe("plan.mdx");
    expect(renameTarget("note.md", "a?b")).toBeNull();
  });
});
