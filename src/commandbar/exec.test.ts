import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sessions: new Map<string, any>() }));
vi.mock("../console/session", () => ({
  getSession: (ws: string, id: string) => h.sessions.get(`${ws}/${id}`),
  allSessions: () => [...h.sessions.values()],
}));
vi.mock("../shell/workspaces", () => ({
  createWorkspace: vi.fn(async () => ({ id: "w3", name: "Workspace 3" })),
  renameWorkspace: vi.fn(async () => {}),
  switchWorkspace: vi.fn(),
  closeWorkspaceFlow: vi.fn(async () => true),
  useRepoList: { getState: () => ({ repos: [{ path: "r", name: "r", workspaces: [{ id: "w", name: "Workspace 1" }, { id: "w2", name: "QA" }] }] }) },
}));

vi.mock("../lib/notice", () => ({ showNotice: vi.fn() }));
vi.mock("../ui/ConfirmDialog", () => ({ confirmDialog: vi.fn(async () => true) }));

import { getStore } from "../board/boards";
import { confirmDialog } from "../ui/ConfirmDialog";
import { useLoops } from "../loops/store";
import { useUi } from "../ui/useUi";
import { showNotice } from "../lib/notice";
import { cancelPending } from "./deliver";
import { execute, onlyInstalled, runIntent } from "./exec";
import { useConfirm } from "./confirm";
import { clearOrders } from "./report";
import { useThread } from "./thread";
import { useSettings } from "../settings/useSettings";
import { closeWorkspaceFlow, createWorkspace, renameWorkspace, switchWorkspace } from "../shell/workspaces";
import { sessionKey } from "../console/sessionKey";
import { clearTasks, taskOf } from "../mission/tasks";

const ctx = { repo: "r", wsId: "w" };
const store = getStore("w");
const texts = () => (useThread.getState().byRepo["r"] ?? []).map((m) => m.text);
const last = () => texts().at(-1) ?? "";
const nodes = () => Object.values(store.getState().nodes);

function fakeSession(o: { agent?: boolean; status?: string } = {}) {
  const s = {
    running: true, paused: false, agent: o.agent ?? true, st: o.status ?? "RUNNING",
    writes: [] as string[], killed: 0, restarted: 0,
    isRunning: () => s.running, isPaused: () => s.paused,
    pause: vi.fn(() => { s.paused = true; s.st = "PAUSED"; }), resume: vi.fn(() => { s.paused = false; s.st = "RUNNING"; }),
    kill: vi.fn(() => { s.killed++; s.running = false; }), restart: vi.fn(() => { s.restarted++; }),
    write: (d: string) => void s.writes.push(d), bracketedPaste: () => false,
    status: () => s.st, isAgent: () => s.agent, hasOutput: () => true, tail: () => ["> "], lastDataAt: () => 0,
    fetchReply: async () => "done", dispose: vi.fn(),
  };
  return s;
}
function add(agentId = "claude", o: Parameters<typeof fakeSession>[0] = {}) {
  const id = store.getState().spawnConsole(agentId);
  const s = fakeSession({ agent: agentId !== "shell", ...o });
  h.sessions.set(`w/${id}`, s);
  return { id, s };
}

beforeEach(() => {
  localStorage.clear();
  h.sessions.clear();
  store.setState({ nodes: {}, groups: [], selection: [], history: { past: [], future: [] } });
  useThread.setState({ byRepo: {}, open: false });
  useConfirm.setState({ pending: null });
  clearOrders();
  clearTasks();
  cancelPending();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("S-600 시작·그룹 (S-533 상한)", () => {
  it("spawn 3 codex -> 콘솔 3개(그룹 없이)", async () => {
    await runIntent({ t: "spawn", n: 3, agentId: "codex" }, ctx);
    expect(nodes().map((n) => n.agentId)).toEqual(["codex", "codex", "codex"]);
    expect(store.getState().groups).toHaveLength(0);
    expect(last()).toMatch(/3/);
  });
  it("spawn name -> 콘솔 이름이 붙고, 둘 이상이면 뒤에 번호가 붙는다", async () => {
    await runIntent({ t: "spawn", n: 1, agentId: "claude", name: "검토자" }, ctx);
    expect(nodes().map((n) => (n as { name?: string }).name)).toEqual(["검토자"]);
    await runIntent({ t: "spawn", n: 2, agentId: "claude", name: "검토자" }, ctx);
    expect(nodes().map((n) => (n as { name?: string }).name).sort()).toEqual(["검토자", "검토자 2", "검토자 3"]);
  });
  it("planner 에 줄 에이전트는 설치된 것만", () => {
    const all = [{ id: "claude", name: "C", aliases: [] }, { id: "aider", name: "A", aliases: [] }];
    expect(onlyInstalled(all, [{ id: "claude", installed: true }, { id: "aider", installed: false }])).toEqual([all[0]]);
  });
  it("역할을 주면 그 역할 그룹으로", async () => {
    await runIntent({ t: "spawn", n: 2, agentId: "claude", role: "backend" }, ctx);
    expect(store.getState().groups.map((g) => g.role)).toEqual(["backend"]);
  });
  it("12 를 넘으면 12 로 줄이고 알린다", async () => {
    await runIntent({ t: "spawn", n: 14, agentId: "shell" }, ctx);
    expect(nodes()).toHaveLength(12);
    expect(last()).toMatch(/12/);
  });
  it("makeGroup -> 그룹 하나", async () => {
    await runIntent({ t: "makeGroup", n: 2, agentId: "claude" }, ctx);
    expect(nodes()).toHaveLength(2);
    expect(store.getState().groups).toHaveLength(1);
  });
  it("addToGroup -> 새 콘솔이 그 그룹에 들어간다", async () => {
    const a = add(), b = add();
    const gid = store.getState().createGroup([a.id, b.id])!;
    await runIntent({ t: "addToGroup", n: 2, groupId: sessionKey("w", gid), agentId: "claude" }, ctx);
    expect(nodes().filter((n) => n.groupId === gid)).toHaveLength(4);
  });
});

describe("FX5 그룹 이름·spawn 기본·작업 라벨", () => {
  beforeEach(() => vi.useFakeTimers());
  const flush = () => vi.advanceTimersByTimeAsync(600);
  it("D6 S-571 CLI·역할 없는 spawn 은 일반 Shell", async () => {
    await runIntent({ t: "spawn", n: 2 }, ctx);
    expect(nodes().map((n) => n.agentId)).toEqual(["shell", "shell"]);
  });
  it("D12 S-506 이름 없는 그룹은 역할 이름(없으면 Group N)으로 채워지고 문구에 이름이 든다", async () => {
    await runIntent({ t: "spawn", n: 2, agentId: "claude", role: "backend" }, ctx);
    await runIntent({ t: "makeGroup", n: 2, agentId: "claude" }, ctx);
    expect(store.getState().groups.map((g) => g.name)).toEqual(["Backend", "Group 1"]);
    expect(last()).toBe("Made Group 1 with 2 claude consoles.");
  });
  it("D1 S-577 이름 없이 만든 그룹 둘이 모두 문맥에 남아 the backend group 이 찾아진다", async () => {
    await runIntent({ t: "spawn", n: 2, agentId: "claude", role: "reviewers" }, ctx);
    await runIntent({ t: "spawn", n: 2, agentId: "claude", role: "backend" }, ctx);
    await execute("pause the backend group", ctx);
    expect(texts().some((t) => /couldn't find|not found/i.test(t))).toBe(false);
  });
  it("S-1311 그룹에게 한 주문은 [콘솔, 그룹]에, 멤버 한 명에게 한 주문은 [콘솔]에만 기록", async () => {
    const a = add(), b = add(), x = add();
    const gid = store.getState().createGroup([a.id, b.id, x.id])!;
    await runIntent({ t: "tell", targets: [{ kind: "console", id: sessionKey("w", a.id) }], text: "solo job" }, ctx);
    await flush();
    expect(taskOf(sessionKey("w", a.id))?.text).toBe("solo job");
    expect(taskOf(sessionKey("w", gid))).toBeUndefined();
    await runIntent({ t: "tell", targets: [{ kind: "group", id: sessionKey("w", gid) }], text: "team job" }, ctx);
    await flush();
    expect(taskOf(sessionKey("w", gid))?.text).toBe("team job");
  });
  it("S-1311 카드에서 보낸 주문은 카드 id 에도 기록", async () => {
    const a = add();
    await runIntent({ t: "tell", targets: [{ kind: "console", id: sessionKey("w", a.id) }], text: "from card" }, { ...ctx, scope: { consoles: [sessionKey("w", a.id)], groups: [], card: "CARD" } });
    await flush();
    expect(taskOf("CARD")?.text).toBe("from card");
  });
});

describe("S-603 멈춤·재개는 확인 없이", () => {
  it("pause all / resume all", async () => {
    const a = add(), b = add();
    await runIntent({ t: "pause", target: { kind: "all" } }, ctx);
    expect(a.s.pause).toHaveBeenCalledOnce();
    expect(b.s.pause).toHaveBeenCalledOnce();
    expect(useConfirm.getState().pending).toBeNull();
    await runIntent({ t: "resume", target: { kind: "all" } }, ctx);
    expect(a.s.resume).toHaveBeenCalledOnce();
  });
  it("pause Otto 만", async () => {
    const a = add(), b = add();
    await runIntent({ t: "pause", target: { kind: "console", id: sessionKey("w", a.id) } }, ctx);
    expect(a.s.pause).toHaveBeenCalledOnce();
    expect(b.s.pause).not.toHaveBeenCalled();
    expect(last()).toMatch(/Otto/);
  });
});

describe("S-601 확인이 필요한 명령", () => {
  it("kill Otto -> 질문 -> yes 로 닫힌다", async () => {
    const a = add();
    add();
    await execute("kill Otto", ctx);
    expect(last()).toBe("Close Otto? Say yes or click Confirm");
    expect(nodes()).toHaveLength(2);
    await execute("yes", ctx);
    expect(a.s.kill).toHaveBeenCalled();
    expect(nodes().map((n) => n.name)).toEqual(["Dax"]);
  });
  it("no 나 다른 말은 취소", async () => {
    const a = add();
    await execute("kill Otto", ctx);
    await execute("no", ctx);
    expect(last()).toMatch(/cancel/i);
    expect(nodes()).toHaveLength(1);
    await execute("yes", ctx);
    expect(a.s.kill).not.toHaveBeenCalled();
    await execute("kill Otto", ctx);
    await execute("thanks", ctx);
    await execute("yes", ctx);
    expect(nodes()).toHaveLength(1);
  });
  it("restart 도 확인 뒤에 한다", async () => {
    const a = add();
    await execute("restart Otto", ctx);
    expect(a.s.restart).not.toHaveBeenCalled();
    expect(last()).toBe("Restart Otto? Say yes or click Confirm");
    await execute("do it", ctx);
    expect(a.s.restart).toHaveBeenCalledOnce();
  });
  it("여럿이면 이름을 모두 말한다", async () => {
    add(); add();
    await runIntent({ t: "close", target: { kind: "all" } }, ctx);
    expect(last()).toBe("Close Otto and Dax? Say yes or click Confirm");
  });
});

describe("S-616·S-602 워크스페이스", () => {
  it("new workspace called QA", async () => {
    await runIntent({ t: "workspace", op: "new", name: "QA" }, ctx);
    expect(createWorkspace).toHaveBeenCalledWith("r");
    expect(renameWorkspace).toHaveBeenCalledWith("r", "w3", "QA");
  });
  it("go -> switchWorkspace", async () => {
    await runIntent({ t: "workspace", op: "go", ref: "w2" }, ctx);
    expect(switchWorkspace).toHaveBeenCalledWith("r", { id: "w2", name: "QA" });
  });
  it("실행 중 에이전트가 있는 워크스페이스를 닫으려면 같은 확인을 거친다", async () => {
    add();
    await runIntent({ t: "workspace", op: "close", ref: "w" }, ctx);
    expect(closeWorkspaceFlow).not.toHaveBeenCalled();
    expect(last()).toMatch(/^Close Workspace 1\? .*running.*Say yes or click Confirm$/);
    await execute("yes", ctx);
    expect(closeWorkspaceFlow).toHaveBeenCalledWith("r", "w", true);
  });
  it("실행 중인 게 없으면 바로 닫는다", async () => {
    await runIntent({ t: "workspace", op: "close", ref: "w2" }, ctx);
    expect(closeWorkspaceFlow).toHaveBeenCalledWith("r", "w2", true);
  });
});

describe("S-600 테마·되돌리기·카메라·답", () => {
  it("theme -> 설정", async () => {
    await runIntent({ t: "theme", value: "light" }, ctx);
    expect(useSettings.getState().s.theme).toBe("light");
  });
  it("undo -> 직전 spawn 을 되돌린다", async () => {
    await runIntent({ t: "spawn", n: 2, agentId: "claude" }, ctx);
    await runIntent({ t: "undo" }, ctx);
    expect(nodes()).toHaveLength(0);
    await runIntent({ t: "undo" }, ctx);
    expect(last()).toMatch(/nothing to undo/i);
  });
  it("zoom in / zoom out / reset", async () => {
    const z = () => store.getState().viewport.zoom;
    await runIntent({ t: "camera", op: "zoomIn" }, ctx);
    expect(z()).toBeCloseTo(1.2);
    await runIntent({ t: "camera", op: "zoomOut" }, ctx);
    expect(z()).toBeCloseTo(1);
    await runIntent({ t: "camera", op: "zoomIn" }, ctx);
    await runIntent({ t: "camera", op: "reset" }, ctx);
    expect(z()).toBeCloseTo(1);
  });
  it("go to <이름> -> 그 노드에 맞추고 선택한다", async () => {
    add(); const b = add();
    store.getState().updateNode(b.id, { x: 5000, y: 0 });
    await runIntent({ t: "camera", op: "goto", target: { kind: "console", id: sessionKey("w", b.id) } }, ctx);
    expect(store.getState().selection).toEqual([b.id]);
    expect(store.getState().viewport.x).toBeLessThan(-1000);
  });
  it("later·unavailable·needsPlanner·smallTalk 답", async () => {
    await runIntent({ t: "later", kind: "git" }, ctx);
    expect(last()).toBe("That isn't available in this version yet.");
    await runIntent({ t: "unavailable", what: "github" }, ctx); // S-1740: loops 는 이제 열린다, documents 는 E1 이 열 수 있게 했다(S-1807)
    expect(last()).toBe("That isn't available in this version yet.");
    await runIntent({ t: "needsPlanner" }, ctx);
    expect(last()).toMatch(/^I couldn't read that without the planner\. Start with who it is for, like @Otto/);
    await runIntent({ t: "smallTalk" }, ctx);
    expect(useThread.getState().byRepo["r"]!.at(-1)!.role).toBe("bot");
  });
  it("S-2901a execute: __plannerTest 없으면 못 읽는 문장은 기존 문구 그대로", async () => {
    await execute("blorp zxq vlorf", ctx);
    expect(last()).toMatch(/^I couldn't read that without the planner\./);
  });
  it("status 는 상태별 개수를 센다", async () => {
    add(); add("claude", { status: "WORKING" });
    await runIntent({ t: "status" }, ctx);
    expect(last()).toBe("2 consoles: 1 working, 1 ready");
  });
  it("help 와 closePanel", async () => {
    await runIntent({ t: "help" }, ctx);
    expect(last()).toMatch(/spawn/i);
    useThread.getState().setOpen(true);
    await runIntent({ t: "closePanel" }, ctx);
    expect(useThread.getState().open).toBe(false);
  });
});

describe("S-604·S-605·S-609 주문 전달", () => {
  beforeEach(() => vi.useFakeTimers());
  const flush = () => vi.advanceTimersByTimeAsync(600);

  it("@Otto run the tests -> Otto 에게만 한 줄 + Enter, 스레드에 Plan 노트", async () => {
    const a = add(), b = add();
    await execute("@Otto run the tests", ctx);
    await flush();
    expect(a.s.writes).toEqual(["run the tests", "\r"]);
    expect(b.s.writes).toEqual([]);
    const plan = useThread.getState().byRepo["r"]!.find((m) => m.role === "plan")!;
    expect(plan.text).toBe("Plan – tell → Otto 1 ← run the tests");
  });
  it("Plan 노트는 본문 앞 40자까지", async () => {
    add();
    await execute("@Otto " + "x".repeat(60), ctx);
    const plan = useThread.getState().byRepo["r"]!.find((m) => m.role === "plan")!;
    expect(plan.text).toBe("Plan – tell → Otto 1 ← " + "x".repeat(40));
  });
  it("Shell 콘솔에는 아무것도 가지 않고 알린다", async () => {
    const sh = add("shell");
    await execute("@" + nodes().find((n) => n.agentId === "shell")!.name + " run the tests", ctx);
    await flush();
    expect(sh.s.writes).toEqual([]);
    expect(last()).toMatch(/shell/i);
  });
  it("에이전트가 둘 이상인데 이름이 없으면 보내지 않고 안내", async () => {
    const a = add(), b = add();
    await execute("run the tests", ctx);
    await flush();
    expect(a.s.writes).toEqual([]);
    expect(b.s.writes).toEqual([]);
    expect(last()).toMatch(/say who it is for first/i);
  });
  it("에이전트가 하나뿐이면 이름 없이도 그에게", async () => {
    const a = add(); add("shell");
    await execute("run the tests", ctx);
    await flush();
    expect(a.s.writes).toEqual(["run the tests", "\r"]);
  });
  it("broadcast 는 모든 에이전트에게", async () => {
    const a = add(), b = add(), sh = add("shell");
    await runIntent({ t: "broadcast", text: "stop and summarize" }, ctx);
    await flush();
    expect(a.s.writes).toEqual(["stop and summarize", "\r"]);
    expect(b.s.writes).toEqual(["stop and summarize", "\r"]);
    expect(sh.s.writes).toEqual([]);
  });
  it("그룹에게 말하면 한가한 하나에게만 가고 나머지 수를 알린다", async () => {
    const a = add("claude", { status: "WORKING" }), b = add(), c = add();
    const gid = store.getState().createGroup([a.id, b.id, c.id])!;
    await runIntent({ t: "tell", targets: [{ kind: "group", id: sessionKey("w", gid) }], text: "review it" }, ctx);
    await flush();
    expect(a.s.writes).toEqual([]);
    expect(b.s.writes).toEqual(["review it", "\r"]);
    expect(c.s.writes).toEqual([]);
    expect(texts().some((t) => t === "2 others left to rest")).toBe(true);
  });
  it("thanks 는 콘솔에 안 간다", async () => {
    const a = add();
    await execute("thanks", ctx);
    await flush();
    expect(a.s.writes).toEqual([]);
  });
  it("cancel that 은 대기 중인 주문을 버린다", async () => {
    const a = add();
    a.s.tail = () => ["Do you want to proceed?", "❯ 1. Yes"];
    await execute("@Otto run the tests", ctx);
    await vi.advanceTimersByTimeAsync(1000);
    await execute("cancel that", ctx);
    a.s.tail = () => ["> "];
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.s.writes).toEqual([]);
    expect(last()).toMatch(/cancel/i);
  });
});

describe("S-611 보고 행", () => {
  it("보낸 뒤 출력이 3초 멈추면 finished 행(See output 이 붙을 nodeId 포함)", async () => {
    vi.useFakeTimers();
    const a = add();
    let lastOut = 0;
    a.s.lastDataAt = () => lastOut;
    await execute("@Otto run the tests", ctx);
    await vi.advanceTimersByTimeAsync(400);
    lastOut = Date.now();
    await vi.advanceTimersByTimeAsync(4000);
    const rep = useThread.getState().byRepo["r"]!.find((m) => m.role === "report")!;
    expect(rep.report).toMatchObject({ console: "Otto", nodeId: a.id, reply: "done" });
    expect(rep.report!.result).toMatch(/^finished · \d+s$/);
  });
});

describe("S-618 이름 찾기는 같은 repo 의 다른 워크스페이스까지, 같은 이름은 현재 것 먼저", () => {
  it("다른 워크스페이스의 콘솔도 이름으로 닿는다", async () => {
    const other = getStore("w2");
    other.setState({ nodes: {}, groups: [], selection: [] });
    const id = other.getState().spawnConsole("claude");
    other.getState().updateNode(id, { name: "Zed" });
    const s = fakeSession();
    h.sessions.set(`w2/${id}`, s);
    const { useShell } = await import("../shell/useShell");
    useShell.setState({ openRepos: [{ path: "r", activeWs: "w", workspaces: [{ id: "w", name: "Workspace 1", loaded: true }, { id: "w2", name: "QA", loaded: true }] }], activeRepo: "r" });
    vi.useFakeTimers();
    add();
    await execute("@Zed hello", ctx);
    await vi.advanceTimersByTimeAsync(600);
    expect(s.writes).toEqual(["hello", "\r"]);
    useShell.setState({ openRepos: [], activeRepo: null });
  });
});

// ---- D15 S-1730~S-1740 ----
const groupOf = () => {
  const a = add(), b = add();
  const gid = store.getState().createGroup([a.id, b.id])!;
  return { gid, key: sessionKey("w", gid), name: store.getState().groups.find((g) => g.id === gid)!.name };
};
const cards = () => nodes().filter((n) => n.kind === "orchestrator");

describe("S-1730 open 패널", () => {
  it("open mission/memory/loops/usage -> 해당 패널이 열리고 close that 이 닫는다", async () => {
    await runIntent({ t: "open", what: "loops" }, ctx);
    expect(useUi.getState().loops.open).toBe(true);
    await runIntent({ t: "closePanel" }, ctx);
    expect(useUi.getState().loops.open).toBe(false);
    await runIntent({ t: "open", what: "memory" }, ctx);
    expect(useUi.getState().memory.open).toBe(true);
    await runIntent({ t: "closePanel" }, ctx);
    expect(useUi.getState().memory.open).toBe(false);
    await runIntent({ t: "open", what: "mission" }, ctx);
    expect(useUi.getState().mission.open).toBe(true);
    await runIntent({ t: "closePanel" }, ctx);
    expect(useUi.getState().mission.open).toBe(false);
    await runIntent({ t: "open", what: "usage" }, ctx);
    expect(useUi.getState().usage.open).toBe(true);
    await runIntent({ t: "closePanel" }, ctx);
    expect(useUi.getState().usage.open).toBe(false);
  });
});

describe("S-1732 addOrchestrator", () => {
  it("그룹 없이 -> 카드 하나, 답 'Orchestrator added.'", async () => {
    await runIntent({ t: "addOrchestrator" }, ctx);
    expect(cards()).toHaveLength(1);
    expect(last()).toBe("Orchestrator added.");
  });
  it("for group -> 그 그룹이 연결되고 콘솔 수를 말한다", async () => {
    const g = groupOf();
    await runIntent({ t: "addOrchestrator", groupId: g.key }, ctx);
    expect(cards()[0]!.wired).toEqual([g.gid]);
    expect(last()).toBe(`Orchestrator added for ${g.name}. Wire to 2 consoles.`);
  });
  it("called X -> 이름", async () => {
    await runIntent({ t: "addOrchestrator", name: "Review" }, ctx);
    expect(cards()[0]!.name).toBe("Review");
  });
});

describe("S-1733 connect", () => {
  it("카드가 없으면 안내", async () => {
    const g = groupOf();
    await runIntent({ t: "connect", target: { kind: "group", id: g.key } }, ctx);
    expect(last()).toBe("There's no orchestrator on the board. Say add an orchestrator first.");
  });
  it("카드 하나 -> the orchestrator 가 그것", async () => {
    const g = groupOf();
    await runIntent({ t: "addOrchestrator" }, ctx);
    await runIntent({ t: "connect", target: { kind: "group", id: g.key } }, ctx);
    expect(cards()[0]!.wired).toEqual([g.gid]);
    expect(last()).toBe("Wired the group.");
    await runIntent({ t: "connect", target: { kind: "group", id: g.key } }, ctx);
    expect(last()).toBe("Already wired.");
  });
  it("카드 둘 + 이름 없음 -> 되묻는다, 번호·이름이 있으면 그 카드", async () => {
    const g = groupOf();
    await runIntent({ t: "addOrchestrator" }, ctx);
    await runIntent({ t: "addOrchestrator" }, ctx);
    await runIntent({ t: "connect", target: { kind: "group", id: g.key } }, ctx);
    expect(last()).toBe("Which orchestrator? Orchestrator, Orchestrator 2");
    expect(cards().every((n) => (n.wired as string[]).length === 0)).toBe(true);
    await runIntent({ t: "connect", target: { kind: "group", id: g.key }, card: "2" }, ctx);
    expect(cards().find((n) => n.name === "Orchestrator 2")!.wired).toEqual([g.gid]);
  });
  it("콘솔도 연결된다", async () => {
    const a = add();
    await runIntent({ t: "addOrchestrator" }, ctx);
    await runIntent({ t: "connect", target: { kind: "console", id: sessionKey("w", a.id) } }, ctx);
    expect(cards()[0]!.wired).toEqual([a.id]);
    expect(last()).toBe("Wired the console.");
  });
});

describe("S-1734·S-1735 loop 명령", () => {
  beforeEach(() => useLoops.setState({ loops: [], rt: {}, history: [] }));
  it("확인창 문구 -> Create 이면 켜진 schedule loop", async () => {
    await runIntent({ t: "loop", minutes: 10, text: "run the tests" }, ctx);
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: "Create a recurring instruction?", message: "Every 10 min: run the tests\nSent to all consoles on the board.", confirmLabel: "Create" }));
    const l = useLoops.getState().loops;
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ instruction: "run the tests", trigger: { kind: "schedule", everyMin: 10 }, target: { kind: "all" }, stop: {}, enabled: true, repo: "r", wsId: "w" });
    expect(last()).toBe("Loop started: every 10 min.");
  });
  it("이름 = 지시 앞 24자", async () => {
    await runIntent({ t: "loop", minutes: 5, text: "run the whole test suite and report back" }, ctx);
    expect(useLoops.getState().loops[0]!.name).toBe("run the whole test suite");
  });
  it("Cancel -> loop 없음, 'Okay, no loop.'", async () => {
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    await runIntent({ t: "loop", minutes: 10, text: "run the tests" }, ctx);
    expect(useLoops.getState().loops).toHaveLength(0);
    expect(last()).toBe("Okay, no loop.");
  });
  it("범위 밖·빈 지시는 확인창 없이 답", async () => {
    await runIntent({ t: "loop", bad: "range" }, ctx);
    expect(last()).toBe("Loops run every 1 minute to 24 hours.");
    await runIntent({ t: "loop", bad: "empty" }, ctx);
    expect(last()).toMatch(/^Say what to run/);
    expect(confirmDialog).not.toHaveBeenCalled();
  });
});

describe("S-1738 handoff·forward 연결", () => {
  it("대상이 내장 5종이 아니면 거절, 에이전트가 없으면 안내", async () => {
    await runIntent({ t: "handoff", agentId: "bard" }, ctx);
    expect(last()).toBe("I can hand off to Claude Code, Codex, Gemini, Grok or OpenCode.");
    await runIntent({ t: "handoff", agentId: "codex" }, ctx);
    expect(last()).toBe("There is no agent to hand off from.");
  });
  it("콘솔 하나면 요약 요청을 입력하고, cancel that 이 멈춘다", async () => {
    const a = add();
    void runIntent({ t: "handoff", agentId: "codex" }, ctx);
    await vi.waitFor(() => expect(a.s.writes.join("")).toContain("Please summarize this task"));
    expect(texts().some((t) => t.startsWith("Asking "))).toBe(true);
    await runIntent({ t: "cancel" }, ctx);
    expect(last()).toBe("Cancelled.");
    await new Promise((r) => setTimeout(r, 800)); // 대기 루프가 빠져나올 시간
  });
  it("forward they: 최근 주문이 없으면 안내", async () => {
    await runIntent({ t: "forward", sources: [], they: true, dests: [{ kind: "cli", agentId: "codex" }] }, ctx);
    expect(last()).toMatch(/^There are no recent orders to wait for/);
  });
  // S-2686: Thread 가 닫혀 있으면 답 첫 줄(120자)을 알림으로도 보인다
  it("S-2686 say: Thread 닫힘이면 첫 줄만 showNotice, 열림이면 안 띄움", async () => {
    add();
    await runIntent({ t: "status" }, ctx);
    expect(showNotice).toHaveBeenCalledWith("1 console: 1 ready");
    vi.mocked(showNotice).mockClear();
    await runIntent({ t: "help" }, ctx);
    expect(vi.mocked(showNotice).mock.calls[0]![0]).toBe("Here is what I can do:");
    vi.mocked(showNotice).mockClear();
    useThread.getState().setOpen(true);
    await runIntent({ t: "status" }, ctx);
    expect(showNotice).not.toHaveBeenCalled();
  });
});
