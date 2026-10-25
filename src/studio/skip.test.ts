import { describe, expect, it } from "vitest";
import { showFile, skipDir } from "./skip";

describe("S-1814 skipDir·showFile", () => {
  it("문서의 건너뛰는 폴더와 점 폴더 전부", () => {
    for (const d of ["node_modules", ".git", "build", "dist", ".next", "venv", ".venv", "target", "vendor", "coverage", "DerivedData", "Pods", "__pycache__", "out", ".gradle", ".idea", ".vs", "bin", "obj", ".cache", ".turbo", ".whatever"]) expect(skipDir(d), d).toBe(true);
    for (const d of ["src", "docs", "Build2"]) expect(skipDir(d), d).toBe(false);
  });
  it("점 파일은 숨기되 쓸모 있는 7개는 보인다", () => {
    for (const f of [".gitignore", ".gitattributes", ".env.example", ".editorconfig", ".prettierrc", ".nvmrc", ".dockerignore", "a.txt", "README"]) expect(showFile(f), f).toBe(true);
    for (const f of [".env", ".DS_Store", ".eslintcache"]) expect(showFile(f), f).toBe(false);
  });
});
