// S-1363·S-1364·S-1368 (spec/4묶음-2.md)
import { describe, expect, it } from "vitest";
import { canSave, findCard, KINDS, kindVar, newFact, repoName, summary } from "./facts";

describe("facts", () => {
  it("종류 6개 순서 S-1364", () => expect([...KINDS]).toEqual(["Architecture", "Structure", "Commands", "Conventions", "Gotchas", "Context"]));
  it("종류별 색 변수 이름 S-1363", () => {
    expect(kindVar("Architecture")).toBe("--mem-architecture");
    expect(kindVar("Gotchas")).toBe("--mem-gotchas");
  });
  it("repo 폴더 이름 S-1361 (역슬래시·끝 슬래시도)", () => {
    expect(repoName("C:/fake/repo")).toBe("repo");
    expect(repoName("C:\\Users\\me\\my-app\\")).toBe("my-app");
  });
  it("본문 요약 = 첫 줄 100자 S-1363", () => {
    expect(summary("one\ntwo")).toBe("one");
    expect(summary("a".repeat(100))).toBe("a".repeat(100));
    expect(summary("a".repeat(101))).toBe("a".repeat(100));
    expect(summary("\n\nfirst real line")).toBe("first real line");
  });
  it("제목이 비면(공백만도) 저장 불가 S-1364", () => {
    expect(canSave("")).toBe(false);
    expect(canSave("   ")).toBe(false);
    expect(canSave("Build")).toBe(true);
  });
  it("새 사실: 제목 앞뒤 공백 제거, id·시각 채움 S-1364", () => {
    const f = newFact({ kind: "Context", title: " T ", body: "b", scope: "all" });
    expect(f).toMatchObject({ kind: "Context", title: "T", body: "b", scope: "all" });
    expect(f.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(f.at))).toBe(false);
  });
  it("이미 있는 카드 찾기 S-1368: memory 종류 노드의 id, 없으면 null", () => {
    const n = (id: string, kind: string) => ({ id, kind, x: 0, y: 0, w: 1, h: 1, z: 1 });
    expect(findCard({ a: n("a", "console"), m1: n("m1", "memory") })).toBe("m1");
    expect(findCard({ a: n("a", "console") })).toBeNull();
  });
});
