// A8: 가짜 IPC(메모리 저장). 기존 Playwright 시험이 폴더 선택 없이 보드가 바로 뜨려면 가짜 repos_get 이 기본 repo 하나를 줘야 한다.
import { describe, expect, it } from "vitest";
import { boardLoad, boardSave, reposGet, reposSet } from "./ipc";

describe("가짜 보드 IPC (A8)", () => {
  it("reposGet 기본값: 가짜 repo 1개, lastRepo 가 그 repo, 'Workspace 1' 포함 (S-208)", async () => {
    const r = await reposGet();
    expect(r.repos.length).toBe(1);
    expect(r.lastRepo).toBe(r.repos[0].path);
    expect(r.repos[0].workspaces[0].name).toBe("Workspace 1");
    expect(r.repos[0].workspaces[0].id).not.toBe("");
  });

  it("reposSet 한 것을 reposGet 이 돌려준다", async () => {
    const r = { repos: [{ path: "D:/x", name: "x", workspaces: [{ id: "w9", name: "Workspace 1" }] }], lastRepo: "D:/x" };
    await reposSet(r);
    expect(await reposGet()).toEqual(r);
  });

  it("boardLoad: 없으면 empty, boardSave 뒤에는 main 으로 같은 내용 (S-209)", async () => {
    expect(await boardLoad("nope")).toEqual({ json: null, source: "empty", archived: false });
    await boardSave("w1", '{"formatVersion":1,"nodes":[]}');
    expect(await boardLoad("w1")).toEqual({ json: '{"formatVersion":1,"nodes":[]}', source: "main", archived: false });
  });
});
