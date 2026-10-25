// H4 S-2851·S-2852·S-2855: 콘솔 폴더 우선순위, 같은 폴더 판정, 복원 때 transcript 확인 폴더
import { beforeEach, describe, expect, it, vi } from "vitest";

const exists = vi.hoisted(() => vi.fn(async (_repo: string, _id: string, _dir?: string) => true));
vi.mock("../lib/ipc", async (orig) => ({ ...(await orig<typeof import("../lib/ipc")>()), claudeTranscriptExists: exists }));
vi.mock("../agents/api", async (orig) => ({ ...(await orig<typeof import("../agents/api")>()), settingsGet: async () => ({ resumeAgentChats: true }) }));

import { consoleCwd, prepareRestore, sameFolder, setRepoPath } from "./offers";
import type { BoardNode } from "../board/store";

const con = (id: string, extra: object = {}): BoardNode => ({ id, kind: "console", x: 0, y: 0, w: 1, h: 1, z: 0, name: id, agentId: "claude", textSize: null, yolo: false, ...extra }) as BoardNode;

beforeEach(() => {
  exists.mockClear();
  setRepoPath(null, "w");
});

describe("S-2851 consoleCwd", () => {
  it("노드 cwd → 보드 repo → 없음", () => {
    setRepoPath("C:/repo", "w");
    expect(consoleCwd("w", con("c1", { cwd: "D:/other" }))).toBe("D:/other");
    expect(consoleCwd("w", con("c1"))).toBe("C:/repo");
    expect(consoleCwd("w", con("c1", { cwd: "" }))).toBe("C:/repo");
    setRepoPath(null, "w");
    expect(consoleCwd("w", con("c1"))).toBeUndefined();
    expect(consoleCwd("w", { id: "b", kind: "box", x: 0, y: 0, w: 1, h: 1, z: 0 })).toBeUndefined();
  });
});

describe("S-2855 sameFolder", () => {
  it("대소문자·구분자·끝 구분자를 무시한다", () => {
    expect(sameFolder("C:/Work/App", "c:\\work\\app\\")).toBe(true);
    expect(sameFolder("C:/work/app", "C:/work/app2")).toBe(false);
    expect(sameFolder("C:/work/app", "")).toBe(false);
  });
});

describe("S-2852 복원 제안 폴더", () => {
  const claude = (id: string, extra: object = {}) => con(id, { resume: { claudeSessionId: `s-${id}` }, ...extra });
  it("cwd 있는 Claude 콘솔은 그 cwd 로 transcript 를 본다, 없으면 보드 repo", async () => {
    setRepoPath("C:/repo", "w");
    await prepareRestore("w", { a: claude("a", { cwd: "D:/other" }), b: claude("b") });
    expect(exists.mock.calls.map((c) => [c[0], c[1]]).sort()).toEqual([["C:/repo", "s-b"], ["D:/other", "s-a"]]);
  });
  it("보드 repo 가 없어도(Hub) cwd 가 있으면 확인한다", async () => {
    await prepareRestore("w", { a: claude("a", { cwd: "D:/other" }), b: claude("b") });
    expect(exists.mock.calls.map((c) => [c[0], c[1]])).toEqual([["D:/other", "s-a"]]);
  });
});
