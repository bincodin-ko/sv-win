import { beforeEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({
  gitStatus: vi.fn(), gitLog: vi.fn(), gitOversize: vi.fn(), gitCommit: vi.fn(), gitPush: vi.fn(), gitPull: vi.fn(),
}));
vi.mock("../lib/ipc", () => ipc);

import { DIVERGED, repoOf, useGit } from "../git/useGit";
import { NO_REPO, runGitOp } from "./gitCmd";

// S-1060~S-1062: 명령줄 git (C9 actions 를 부르고 결과를 답 한 줄로)
const R = "C:/r";
const res = (o: object = {}) => ({ ok: true, message: "", notGit: false, gitMissing: false, diverged: false, oversize: false, ...o });
const mk = (n: number, o: object = {}) => ({
  ...res(), branch: "main", detached: false, upstream: "origin/main", ahead: 0, behind: 0, remoteUrl: "x", webUrl: null, conflict: false, total: n,
  files: Array.from({ length: n }, (_, i) => ({ path: `f${i}.ts`, status: "M", add: 1, del: 0 })), ...o,
});

beforeEach(() => {
  useGit.setState({ by: {} });
  Object.values(ipc).forEach((f) => f.mockReset());
  ipc.gitOversize.mockResolvedValue({ ...res(), files: [] });
  ipc.gitLog.mockResolvedValue({ ...res(), commits: [] });
  ipc.gitCommit.mockResolvedValue(res());
  ipc.gitPush.mockResolvedValue(res());
  ipc.gitPull.mockResolvedValue(res());
  ipc.gitStatus.mockResolvedValue(mk(3));
});

describe("Hub 보드 (S-2878)", () => {
  it("hub: 경로면 git 을 부르지 않고 폴더 없음 답", async () => {
    expect(await runGitOp("hub:ws-h1", "push")).toBe("This board has no folder, so git isn't available");
    expect(ipc.gitStatus).not.toHaveBeenCalled();
  });
});

describe("저장소 없음 (S-1062)", () => {
  it("repo 경로가 비었으면 git 을 부르지 않고 답한다", async () => {
    expect(await runGitOp("", "push")).toBe(NO_REPO);
    expect(ipc.gitStatus).not.toHaveBeenCalled();
  });
  it("git 저장소가 아니면 같은 답", async () => {
    ipc.gitStatus.mockResolvedValue(mk(0, { ok: false, notGit: true }));
    expect(await runGitOp(R, "commitPush")).toBe(NO_REPO);
    expect(ipc.gitCommit).not.toHaveBeenCalled();
    expect(ipc.gitPush).not.toHaveBeenCalled();
  });
  it("NO_REPO 문구", () => expect(NO_REPO).toBe("There's no git repository open."));
});

describe("commit and push / commit (S-1060)", () => {
  it("패널을 연 적이 없어도 변경 전부를 커밋 → push, 제안 메시지, 답 한 줄", async () => {
    expect(await runGitOp(R, "commitPush")).toBe("Committed 3 files · pushed");
    expect(ipc.gitCommit).toHaveBeenCalledWith(R, ["f0.ts", "f1.ts", "f2.ts"], "Update f0.ts, f1.ts, f2.ts");
    expect(ipc.gitPush).toHaveBeenCalledTimes(1);
    expect(ipc.gitCommit.mock.invocationCallOrder[0]!).toBeLessThan(ipc.gitPush.mock.invocationCallOrder[0]!);
  });
  it("말한 메시지는 그대로 전달", async () => {
    await runGitOp(R, "commit", "fix login");
    expect(ipc.gitCommit).toHaveBeenCalledWith(R, ["f0.ts", "f1.ts", "f2.ts"], "fix login");
  });
  it("commit 만이면 push 안 하고 'Committed N files'", async () => {
    expect(await runGitOp(R, "commit")).toBe("Committed 3 files");
    expect(ipc.gitPush).not.toHaveBeenCalled();
  });
  it("체크를 뺀 파일은 커밋하지 않는다", async () => {
    await useGit.getState().refresh(R);
    useGit.getState().toggle(R, "f1.ts");
    expect(await runGitOp(R, "commit")).toBe("Committed 2 files");
    expect(ipc.gitCommit.mock.calls[0]![1]).toEqual(["f0.ts", "f2.ts"]);
  });
  it("변경이 없으면 'Nothing to commit'", async () => {
    ipc.gitStatus.mockResolvedValue(mk(0));
    expect(await runGitOp(R, "commit")).toBe("Nothing to commit");
    expect(await runGitOp(R, "commitPush")).toBe("Nothing to commit");
    expect(ipc.gitCommit).not.toHaveBeenCalled();
    expect(ipc.gitPush).not.toHaveBeenCalled();
  });
  it("push 실패는 'Couldn't push: <오류 첫 줄>'", async () => {
    ipc.gitPush.mockResolvedValue(res({ ok: false, message: "rejected\nhint: pull first" }));
    expect(await runGitOp(R, "commitPush")).toBe("Couldn't push: rejected");
  });
  it("commit 실패는 'Couldn't commit: …'", async () => {
    ipc.gitCommit.mockResolvedValue(res({ ok: false, message: "hook failed" }));
    expect(await runGitOp(R, "commit")).toBe("Couldn't commit: hook failed");
  });
  it("다른 동작이 돌고 있으면 알린다", async () => {
    await useGit.getState().refresh(R);
    useGit.setState((s) => ({ by: { ...s.by, [R]: { ...repoOf(s.by, R), busy: "pull" } } }));
    expect(await runGitOp(R, "commit")).toBe("Git is busy. Try again in a moment.");
  });
});

describe("push (S-1060)", () => {
  it("변경이 없으면 push 만 → 'Pushed'", async () => {
    ipc.gitStatus.mockResolvedValue(mk(0, { ahead: 2 }));
    expect(await runGitOp(R, "push")).toBe("Pushed");
    expect(ipc.gitCommit).not.toHaveBeenCalled();
    expect(ipc.gitPush).toHaveBeenCalledTimes(1);
  });
  it("변경이 있으면 먼저 커밋하고 push", async () => {
    expect(await runGitOp(R, "push")).toBe("Committed 3 files · pushed");
    expect(ipc.gitCommit).toHaveBeenCalledTimes(1);
  });
  it("push 실패", async () => {
    ipc.gitStatus.mockResolvedValue(mk(0));
    ipc.gitPush.mockResolvedValue(res({ ok: false, message: "No configured push destination" }));
    expect(await runGitOp(R, "push")).toBe("Couldn't push: No configured push destination");
  });
});

describe("pull (S-1061)", () => {
  it("behind 0 이어도 git pull 을 부른다 → 'Pulled'", async () => {
    expect(await runGitOp(R, "pull")).toBe("Pulled");
    expect(ipc.gitPull).toHaveBeenCalledTimes(1);
  });
  it("diverged 면 S-1030 문구", async () => {
    ipc.gitPull.mockResolvedValue(res({ ok: false, diverged: true, message: "fatal" }));
    expect(await runGitOp(R, "pull")).toBe(DIVERGED);
  });
  it("pull 실패", async () => {
    ipc.gitPull.mockResolvedValue(res({ ok: false, message: "offline" }));
    expect(await runGitOp(R, "pull")).toBe("Couldn't pull: offline");
  });
});
