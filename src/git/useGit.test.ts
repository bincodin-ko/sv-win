import { beforeEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({
  gitStatus: vi.fn(), gitLog: vi.fn(), gitOversize: vi.fn(), gitCommit: vi.fn(), gitPush: vi.fn(), gitPull: vi.fn(),
}));
vi.mock("../lib/ipc", () => ipc);

import { commitOnly, commitPush, pullOnly } from "./actions";
import { checkedOf, commitBlock, primaryLabel, shownFiles, sumLines, useGit, repoOf } from "./useGit";

const R = "C:/r";
const res = (o: object = {}) => ({ ok: true, message: "", notGit: false, gitMissing: false, diverged: false, oversize: false, ...o });
const mk = (n: number, o: object = {}) => ({
  ...res(), branch: "main", detached: false, upstream: "origin/main", ahead: 0, behind: 0, remoteUrl: "x", webUrl: null, conflict: false, total: n,
  files: Array.from({ length: n }, (_, i) => ({ path: `f${i}.ts`, status: "M", add: i === 0 ? 9 : 0, del: i === 0 ? 4 : 0 })), ...o,
});
const st = () => repoOf(useGit.getState().by, R);

beforeEach(() => {
  useGit.setState({ by: {} });
  Object.values(ipc).forEach((f) => f.mockReset());
  ipc.gitOversize.mockResolvedValue({ ...res(), files: [] });
  ipc.gitLog.mockResolvedValue({ ...res(), commits: [] });
  ipc.gitCommit.mockResolvedValue(res());
  ipc.gitPush.mockResolvedValue(res());
  ipc.gitPull.mockResolvedValue(res());
  ipc.gitStatus.mockResolvedValue(mk(5));
});

describe("체크·합계 (S-1024)", () => {
  it("처음엔 전부 체크, None 이면 0, All 이면 다시 전부, toggle 은 하나만", async () => {
    await useGit.getState().refresh(R);
    expect(checkedOf(st().st, st().unchecked)).toHaveLength(5);
    useGit.getState().none(R);
    expect(checkedOf(st().st, st().unchecked)).toHaveLength(0);
    useGit.getState().all(R);
    expect(checkedOf(st().st, st().unchecked)).toHaveLength(5);
    useGit.getState().toggle(R, "f1.ts");
    expect(checkedOf(st().st, st().unchecked)).not.toContain("f1.ts");
    expect(checkedOf(st().st, st().unchecked)).toHaveLength(4);
  });
  it("새로 생긴 파일은 자동 체크, 줄 수 합은 체크한 것만(바이너리 -1 은 0)", async () => {
    await useGit.getState().refresh(R);
    useGit.getState().toggle(R, "f0.ts");
    ipc.gitStatus.mockResolvedValue(mk(6));
    await useGit.getState().refresh(R);
    expect(checkedOf(st().st, st().unchecked)).toHaveLength(5);
    expect(sumLines(st().st!.files, ["f0.ts", "f1.ts"])).toEqual({ add: 9, del: 4 });
    expect(sumLines([{ path: "b", status: "A", add: -1, del: -1 }], ["b"])).toEqual({ add: 0, del: 0 });
  });
  it("400개까지만 보이고 나머지는 +N more", () => {
    const { rows, more } = shownFiles(mk(450) as never);
    expect(rows).toHaveLength(400);
    expect(more).toBe(50);
  });
});

describe("버튼 (S-1026·S-1028)", () => {
  it("문구: 브랜치면 Commit & Push N files, 분리 HEAD면 Commit N files", () => {
    expect(primaryLabel(mk(5) as never, 5)).toBe("Commit & Push 5 files");
    expect(primaryLabel(mk(5, { detached: true }) as never, 5)).toBe("Commit 5 files");
  });
  it("비활성: 체크 0 / 메시지 빔 / 충돌 / 실행 중", () => {
    const s = mk(5) as never;
    expect(commitBlock(s, 5, "m", null)).toBeNull();
    expect(commitBlock(s, 0, "m", null)).toBe("none-checked");
    expect(commitBlock(s, 5, "  ", null)).toBe("no-message");
    expect(commitBlock(mk(5, { conflict: true }) as never, 5, "m", null)).toBe("conflict");
    expect(commitBlock(s, 5, "m", "push")).toBe("busy");
  });
});

describe("동작 (S-1026·S-1030·S-1037)", () => {
  it("commitPush: 체크한 파일만 커밋하고 푸시, 끝나면 안내 줄", async () => {
    await useGit.getState().refresh(R);
    useGit.getState().toggle(R, "f0.ts");
    useGit.getState().setMsg(R, "Update");
    ipc.gitStatus.mockResolvedValue(mk(0));
    await commitPush(R);
    expect(ipc.gitCommit).toHaveBeenCalledWith(R, ["f1.ts", "f2.ts", "f3.ts", "f4.ts"], "Update");
    expect(ipc.gitPush).toHaveBeenCalledTimes(1);
    expect(st().done).toBe("Committed 4 files · pushed");
    expect(st().busy).toBeNull();
  });
  it("commitOnly 는 푸시하지 않는다", async () => {
    await useGit.getState().refresh(R);
    await commitOnly(R, { message: "m" });
    expect(ipc.gitPush).not.toHaveBeenCalled();
    expect(st().done).toBe("Committed 5 files");
  });
  it("동시에 두 번 눌러도 하나만 돈다", async () => {
    await useGit.getState().refresh(R);
    let release!: () => void;
    ipc.gitCommit.mockReturnValue(new Promise((r) => (release = () => r(res()))));
    const a = commitPush(R, { message: "m" });
    const b = commitPush(R, { message: "m" });
    expect(await b).toBeNull();
    release();
    await a;
    expect(ipc.gitCommit).toHaveBeenCalledTimes(1);
  });
  it("오류는 한 줄로 남고 다음 동작을 시작하면 지워진다", async () => {
    await useGit.getState().refresh(R);
    ipc.gitCommit.mockResolvedValueOnce(res({ ok: false, message: "boom" }));
    await commitOnly(R, { message: "m" });
    expect(st().error).toBe("boom");
    expect(ipc.gitPush).not.toHaveBeenCalled();
    await commitOnly(R, { message: "m" });
    expect(st().error).toBeNull();
  });
  it("Pull 이 diverged 로 실패하면 정해진 문구", async () => {
    await useGit.getState().refresh(R);
    ipc.gitPull.mockResolvedValue(res({ ok: false, diverged: true, message: "fatal" }));
    await pullOnly(R);
    expect(st().error).toBe("Your branch and the remote have diverged. Merge in a console.");
  });
  it("푸시가 100MB 때문에 거절되면 oversizeRejected", async () => {
    await useGit.getState().refresh(R);
    ipc.gitPush.mockResolvedValue(res({ ok: false, oversize: true, message: "too big" }));
    await commitPush(R, { message: "m" });
    expect(st().oversizeRejected).toBe(true);
  });
});
