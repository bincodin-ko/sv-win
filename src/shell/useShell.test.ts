import { beforeEach, describe, expect, it } from "vitest";
import { useShell } from "./useShell";

const sh = () => useShell.getState();
const A = { path: "C:/work/a", id: "wa1", name: "Workspace 1" };
const A2 = { path: "C:/work/a", id: "wa2", name: "Workspace 2" };
const B = { path: "C:/work/b", id: "wb1", name: "Workspace 1" };
const ids = () => sh().openRepos.flatMap((r) => r.workspaces.map((w) => w.id));

beforeEach(() => useShell.setState({ openRepos: [], activeRepo: null, view: "board" }));

describe("S-300·S-301 앱 셸: 열린 repo·워크스페이스", () => {
  it("워크스페이스를 열면 repo 도 열리고, 그 탭이 보인다", () => {
    sh().openWorkspace(A);
    expect(sh().openRepos).toHaveLength(1);
    expect(sh().openRepos[0]?.path).toBe("C:/work/a");
    expect(sh().openRepos[0]?.activeWs).toBe("wa1");
    expect(sh().activeRepo).toBe("C:/work/a");
    expect(sh().view).toBe("board");
  });
  it("같은 repo 의 두 번째 워크스페이스를 열어도 첫째는 열린 채, 보이는 건 둘째", () => {
    sh().openWorkspace(A);
    sh().openWorkspace(A2);
    expect(ids()).toEqual(["wa1", "wa2"]);
    expect(sh().openRepos[0]?.activeWs).toBe("wa2");
  });
  it("같은 워크스페이스를 두 번 열어도 하나만 있다", () => {
    sh().openWorkspace(A);
    sh().openWorkspace(A);
    expect(ids()).toEqual(["wa1"]);
  });
  it("showWorkspace 는 보이는 것만 바꾸고 아무것도 닫지 않는다(S-343)", () => {
    sh().openWorkspace(A);
    sh().openWorkspace(A2);
    sh().showWorkspace("wa1");
    expect(sh().openRepos[0]?.activeWs).toBe("wa1");
    expect(ids()).toEqual(["wa1", "wa2"]);
  });
  it("다른 repo 의 워크스페이스를 보이면 activeRepo 도 따라간다", () => {
    sh().openWorkspace(A);
    sh().openWorkspace(B);
    expect(sh().activeRepo).toBe("C:/work/b");
    sh().showWorkspace("wa1");
    expect(sh().activeRepo).toBe("C:/work/a");
    expect(ids()).toEqual(["wa1", "wb1"]);
  });
  it("showHome 은 홈을 보이되 열린 것은 그대로, 워크스페이스를 보이면 다시 board", () => {
    sh().openWorkspace(A);
    sh().showHome();
    expect(sh().view).toBe("home");
    expect(ids()).toEqual(["wa1"]);
    sh().showWorkspace("wa1");
    expect(sh().view).toBe("board");
  });
  it("closeWorkspace 는 그 워크스페이스만 닫는다", () => {
    sh().openWorkspace(A);
    sh().openWorkspace(A2);
    sh().openWorkspace(B);
    sh().closeWorkspace("wa2");
    expect(ids()).toEqual(["wa1", "wb1"]);
  });
  it("closeRepo 는 그 repo 의 워크스페이스를 전부 닫고 다른 repo 는 둔다", () => {
    sh().openWorkspace(A);
    sh().openWorkspace(A2);
    sh().openWorkspace(B);
    sh().closeRepo("C:/work/a");
    expect(sh().openRepos.map((r) => r.path)).toEqual(["C:/work/b"]);
    expect(ids()).toEqual(["wb1"]);
  });
});
