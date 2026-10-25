// S-316~S-319·S-323: repo 목록 순수 규칙
import { describe, expect, it } from "vitest";
import type { Repos } from "../board/persist";
import { NAME_MAX, addFolders, clampName, editResult, moveSel, removeRepoFrom, renameRepo, samePath } from "./repoList";

const mk = (): Repos => ({
  repos: [
    { path: "C:/work/a", name: "a", workspaces: [{ id: "w1", name: "Workspace 1" }] },
    { path: "C:/work/b", name: "b", workspaces: [] },
  ],
  lastRepo: "C:/work/a",
  lastWorkspace: { "C:/work/a": "w1" },
});

describe("이름 (S-318)", () => {
  it("최대 24자", () => {
    expect(NAME_MAX).toBe(24);
    expect(clampName("x".repeat(25))).toBe("x".repeat(24));
    expect(clampName("짧은 이름")).toBe("짧은 이름");
  });
  it("Return 은 저장할 이름(24자로 자름, 앞뒤 공백 지움), Esc 는 취소", () => {
    expect(editResult("Enter", "  new name ", "old")).toBe("new name");
    expect(editResult("Enter", "y".repeat(30), "old")).toBe("y".repeat(24));
    expect(editResult("Escape", "new", "old")).toBeNull();
  });
  it("비워서 Return 하면 바꾸지 않는다(취소와 같다)", () => {
    expect(editResult("Enter", "   ", "old")).toBeNull();
  });
  it("renameRepo 는 보이는 이름만 바꾼다: 경로·워크스페이스·lastRepo 그대로", () => {
    const r = renameRepo(mk(), "C:/work/b", "z".repeat(40));
    expect(r.repos[1]).toEqual({ path: "C:/work/b", name: "z".repeat(24), workspaces: [] });
    expect(r.repos[0]).toEqual(mk().repos[0]);
    expect(r.lastRepo).toBe("C:/work/a");
  });
  it("없는 경로를 바꾸면 그대로", () => {
    expect(renameRepo(mk(), "C:/nope", "q")).toEqual(mk());
  });
});

describe("이동 (S-316·S-322)", () => {
  it("끝에서 멈춘다", () => {
    expect(moveSel(0, 1, 3)).toBe(1);
    expect(moveSel(2, 1, 3)).toBe(2);
    expect(moveSel(0, -1, 3)).toBe(0);
    expect(moveSel(2, -1, 3)).toBe(1);
  });
  it("목록이 비면 -1", () => {
    expect(moveSel(0, 1, 0)).toBe(-1);
  });
});

describe("추가 (S-317)", () => {
  it("같은 폴더 판정: 슬래시 방향·끝 슬래시·대소문자 무시", () => {
    expect(samePath("C:\\Work\\A\\", "c:/work/a")).toBe(true);
    expect(samePath("C:/work/a", "C:/work/b")).toBe(false);
  });
  it("새 폴더는 목록 끝에 붙고 이름은 폴더 이름, 마지막 추가가 lastRepo 이자 선택", () => {
    const { repos, selected } = addFolders(mk(), ["D:/proj/hello", "D:/proj/world/"]);
    expect(repos.repos.map((x) => [x.path, x.name])).toEqual([["C:/work/a", "a"], ["C:/work/b", "b"], ["D:/proj/hello", "hello"], ["D:/proj/world/", "world"]]);
    expect(repos.repos[2]!.workspaces).toEqual([]);
    expect(repos.lastRepo).toBe("D:/proj/world/");
    expect(selected).toBe("D:/proj/world/");
  });
  it("이미 있는 폴더는 늘리지 않고 그 행만 고른다(lastRepo 도 바뀌지 않음)", () => {
    const { repos, selected } = addFolders(mk(), ["c:\\work\\b\\"]);
    expect(repos.repos).toHaveLength(2);
    expect(selected).toBe("C:/work/b");
    expect(repos.lastRepo).toBe("C:/work/a");
  });
  it("한 번에 중복이 섞여도 한 번만 넣는다", () => {
    const { repos } = addFolders(mk(), ["D:/x", "D:/x"]);
    expect(repos.repos).toHaveLength(3);
  });
  it("빈 목록이면 그대로, 선택 없음", () => {
    expect(addFolders(mk(), [])).toEqual({ repos: mk(), selected: null });
  });
});

describe("제거 (S-319)", () => {
  it("행을 빼고 나머지는 그대로", () => {
    const r = removeRepoFrom(mk(), "C:/work/b");
    expect(r.repos.map((x) => x.path)).toEqual(["C:/work/a"]);
    expect(r.lastRepo).toBe("C:/work/a");
  });
  it("lastRepo 를 뺐으면 lastRepo 를 비우고 그 repo 의 lastWorkspace 도 지운다", () => {
    const r = removeRepoFrom(mk(), "C:/work/a");
    expect(r.lastRepo).toBeNull();
    expect(r.lastWorkspace).toEqual({});
  });
});
