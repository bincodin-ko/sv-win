// S-1518 보드가 열릴 때마다 확인
import { beforeEach, describe, expect, it, vi } from "vitest";

const boardOpened = vi.fn();
vi.mock("./useUsage", () => ({ useUsage: { getState: () => ({ boardOpened }) } }));
vi.mock("../agents/api", () => ({
  agentsList: async () => [{ id: "claude", installed: true }, { id: "codex", installed: true }],
  defaultAgent: async () => "codex",
}));
import { boardKey, checkOnBoardOpen } from "./boardCheck";

const sh = (view: string, repo: string | null, ws: string | null) => ({ view, activeRepo: repo, openRepos: repo ? [{ path: repo, workspaces: [], activeWs: ws }] : [] }) as never;
beforeEach(() => boardOpened.mockClear());

describe("boardKey", () => {
  it("보드가 열린 워크스페이스마다 다른 값, 보드가 아니면 null", () => {
    expect(boardKey(sh("board", "C:/r", "w1"))).not.toBeNull();
    expect(boardKey(sh("board", "C:/r", "w1"))).not.toBe(boardKey(sh("board", "C:/r", "w2")));
    expect(boardKey(sh("board", "C:/r", "w1"))).not.toBe(boardKey(sh("board", "C:/other", "w1")));
    expect(boardKey(sh("launcher", null, null))).toBeNull();
  });
});
describe("checkOnBoardOpen", () => {
  it("기본 에이전트(설치됨)로 boardOpened 를 부른다", async () => {
    await checkOnBoardOpen();
    expect(boardOpened).toHaveBeenCalledWith(["codex"]);
  });
});
