import { describe, expect, it } from "vitest";
import { inRepo } from "./inRepo";

// S-951: 경로를 \ → / 로 맞추고 대소문자를 무시해 repo 폴더 접두로 본다
describe("inRepo (S-951)", () => {
  it("repo 아래 경로는 안", () => {
    expect(inRepo("C:/fake/repo/src/a.ts", "C:/fake/repo")).toBe(true);
    expect(inRepo("C:/fake/repo/a.ts", "C:/fake/repo/")).toBe(true); // repo 끝 슬래시
  });
  it("\\ 와 / 가 섞여도 같다", () => {
    expect(inRepo("C:\\fake\\repo\\src\\a.ts", "C:/fake/repo")).toBe(true);
    expect(inRepo("C:/fake/repo/src/a.ts", "C:\\fake\\repo")).toBe(true);
  });
  it("대소문자를 무시한다", () => {
    expect(inRepo("c:/FAKE/Repo/A.ts", "C:/fake/repo")).toBe(true);
  });
  it("접두 함정: repo2 는 repo 안이 아니다", () => {
    expect(inRepo("C:/fake/repo2/a.ts", "C:/fake/repo")).toBe(false);
    expect(inRepo("C:/fake/repository/a.ts", "C:/fake/repo")).toBe(false);
  });
  it("다른 드라이브·상위 폴더는 밖", () => {
    expect(inRepo("D:/fake/repo/a.ts", "C:/fake/repo")).toBe(false);
    expect(inRepo("C:/fake", "C:/fake/repo")).toBe(false);
  });
  it("repo 폴더 자신은 안", () => {
    expect(inRepo("C:/fake/repo", "C:/fake/repo")).toBe(true);
    expect(inRepo("C:\\fake\\repo\\", "C:/fake/repo")).toBe(true);
  });
});
