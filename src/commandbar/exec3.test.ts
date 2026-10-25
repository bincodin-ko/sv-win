import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../console/session", () => ({ getSession: () => undefined, allSessions: () => [] }));
vi.mock("../shell/workspaces", () => ({
  createWorkspace: vi.fn(), renameWorkspace: vi.fn(), switchWorkspace: vi.fn(), closeWorkspaceFlow: vi.fn(),
  useRepoList: { getState: () => ({ repos: [{ path: "r", name: "r", workspaces: [{ id: "w", name: "Workspace 1" }] }] }) },
}));
vi.mock("./gitCmd", () => ({ NO_REPO: "x", runGitOp: vi.fn(async () => "Pushed") }));

import { getStore } from "../board/boards";
import { runGitOp } from "./gitCmd";
import { runIntent } from "./exec";
import { useThread } from "./thread";

// S-1060~S-1067: 새 intent 를 실행하는 분기
const ctx = { repo: "r", wsId: "w" };
const store = getStore("w");
const last = () => (useThread.getState().byRepo["r"] ?? []).at(-1)?.text ?? "";
const nodes = () => Object.values(store.getState().nodes);

beforeEach(() => {
  store.setState({ nodes: {}, groups: [], selection: [], tool: "select", history: { past: [], future: [] } });
  useThread.setState({ byRepo: {}, open: false });
  vi.clearAllMocks();
});

describe("git (S-1060)", () => {
  it("열린 repo 경로·op·메시지로 runGitOp 를 부르고 그 답을 그대로 말한다", async () => {
    await runIntent({ t: "git", op: "commit", message: "fix login" }, ctx);
    expect(runGitOp).toHaveBeenCalledWith("r", "commit", "fix login");
    expect(last()).toBe("Pushed");
  });
  it("later git 은 그대로 later 답(S-1062)", async () => {
    await runIntent({ t: "later", kind: "git" }, ctx);
    expect(last()).toBe("That isn't available in this version yet.");
    expect(runGitOp).not.toHaveBeenCalled();
  });
});

describe("add (S-1064·S-1065)", () => {
  it("note + 글 -> 스티커 노드", async () => {
    await runIntent({ t: "add", what: "note", text: "ship the beta on Friday" }, ctx);
    const n = nodes();
    expect(n).toHaveLength(1);
    expect(n[0]!.kind).toBe("sticky");
    expect((n[0] as unknown as { text: string }).text).toBe("ship the beta on Friday");
    expect(last()).not.toBe("");
  });
  it.each([["kanban", "kanban"], ["calendar", "calendar"], ["checklist", "checklist"], ["browser", "web"]] as const)("%s -> %s", async (what, kind) => {
    await runIntent({ t: "add", what }, ctx);
    expect(nodes().map((n) => n.kind)).toEqual([kind]);
  });
});

describe("openWeb (S-1066)", () => {
  it("웹 타일을 놓고 그 주소를 연다", async () => {
    await runIntent({ t: "openWeb", url: "http://localhost:3000" }, ctx);
    const n = nodes()[0] as unknown as { kind: string; tabs: { url: string }[] };
    expect(n.kind).toBe("web");
    expect(n.tabs[0]!.url).toBe("http://localhost:3000");
  });
  it("http/https 가 아니면 노드 없이 거절 문구", async () => {
    await runIntent({ t: "openWeb", url: "ftp://x", bad: true }, ctx);
    expect(nodes()).toHaveLength(0);
    expect(last()).toBe("I can only open http and https pages.");
  });
});

describe("tool (S-1067)", () => {
  it("eraser / pen 도구를 켜고 한 줄로 답한다", async () => {
    await runIntent({ t: "tool", tool: "eraser" }, ctx);
    expect(store.getState().tool).toBe("eraser");
    expect(last()).toBe("Eraser is on.");
    await runIntent({ t: "tool", tool: "pen" }, ctx);
    expect(store.getState().tool).toBe("pen");
    expect(last()).toBe("Pen is on.");
  });
});
