// A8 보드 저장 (S-109, S-201, S-202, S-206, S-208, S-209). 순수 함수 + 가짜 타이머 + 가짜 IO.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FORMAT_VERSION,
  READONLY_BANNER,
  attachBoard,
  createAutosave,
  deserialize,
  flushAll,
  openRepoWs,
  serialize,
  startWorkspace,
  type LoadResult,
  type Repos,
  type StartIo,
  type WorkspaceInfo,
} from "./persist";
import { useBoard, type BoardNode } from "./store";

const WS: WorkspaceInfo = { id: "ws1", name: "Workspace 1", repoPath: "C:/work/app" };
const consoleNode = {
  id: "c1", kind: "console", x: 10, y: 20, w: 720, h: 440, z: 3, name: "Console 1", agentId: "claude", textSize: 120, yolo: true,
  resume: { claudeSessionId: "abc", lastChatAt: 1700000000000 },
};

beforeEach(() => {
  vi.useFakeTimers();
  useBoard.setState({ nodes: {}, groups: [], viewport: { x: 0, y: 0, zoom: 1 } });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("serialize / deserialize (S-201, S-109)", () => {
  it("S-201: 버전 있는 JSON — formatVersion 1, savedBy, workspace, viewport, nodes[]", () => {
    const o = JSON.parse(serialize({ viewport: { x: 5, y: -6, zoom: 1.5 }, nodes: { c1: consoleNode as BoardNode } }, WS));
    expect(o.formatVersion).toBe(1);
    expect(FORMAT_VERSION).toBe(1);
    expect(typeof o.savedBy).toBe("string");
    expect(o.savedBy).not.toBe("");
    expect(o.workspace).toEqual(WS);
    expect(o.viewport).toEqual({ x: 5, y: -6, zoom: 1.5 });
    expect(Array.isArray(o.nodes)).toBe(true);
    expect(o.nodes).toEqual([consoleNode]);
  });

  it("S-201 / S-109: 프로세스·스크롤백 필드는 저장하지 않는다", () => {
    const dirty = { ...consoleNode, ptyId: 7, pid: 1234, scrollback: "긴 출력", buffer: "x", exited: true } as BoardNode;
    const text = serialize({ viewport: { x: 0, y: 0, zoom: 1 }, nodes: { c1: dirty } }, WS);
    const n = JSON.parse(text).nodes?.[0];
    expect(n).toBeDefined();
    for (const k of ["ptyId", "pid", "scrollback", "buffer", "exited"]) expect(n, k).not.toHaveProperty(k);
    expect(n.resume).toEqual(consoleNode.resume);
  });

  it("S-201: 왕복 — 노드 자리·크기·z·이름·agentId·textSize·yolo·resume 이 그대로", () => {
    const box: BoardNode = { id: "n1", kind: "box", x: -300, y: -200, w: 400, h: 300, z: 0 };
    const state = { viewport: { x: 1, y: 2, zoom: 0.75 }, nodes: { c1: consoleNode as BoardNode, n1: box } };
    const back = deserialize(serialize(state, WS));
    expect(back.readOnly).toBe(false);
    expect(back.viewport).toEqual(state.viewport);
    expect(back.nodes).toEqual(state.nodes);
    expect(back.workspace).toEqual(WS);
  });

  it("S-109: 불러온 콘솔 노드에도 프로세스·스크롤백 필드가 없다(새 세션으로 시작)", () => {
    const file = JSON.stringify({ formatVersion: 1, savedBy: "x", workspace: WS, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [{ ...consoleNode, ptyId: 7, scrollback: "옛 출력" }] });
    const n = deserialize(file).nodes.c1;
    expect(n).toBeDefined();
    expect(n).not.toHaveProperty("ptyId");
    expect(n).not.toHaveProperty("scrollback");
    expect(n.resume).toEqual(consoleNode.resume);
  });

  it("S-206: formatVersion 이 앱보다 높으면 readOnly, 내용은 그대로 읽는다", () => {
    const file = JSON.stringify({ formatVersion: 2, savedBy: "future", workspace: WS, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [consoleNode], newField: 1 });
    const d = deserialize(file);
    expect(d.readOnly).toBe(true);
    expect(Object.keys(d.nodes)).toEqual(["c1"]);
  });

  it("S-206: 배너 문구", () => {
    expect(READONLY_BANNER).toBe("이 보드는 더 새 버전에서 저장돼 변경이 저장되지 않음");
  });
});

describe("저장 일정 (S-202, S-209)", () => {
  it("변경이 멈추고 2초 뒤 1번 저장", () => {
    const save = vi.fn();
    const a = createAutosave({ save });
    a.touch();
    vi.advanceTimersByTime(1999);
    expect(save).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60000);
    expect(save).toHaveBeenCalledTimes(1); // 변경이 없으면 더 저장하지 않는다
    a.dispose();
  });

  it("변경이 1초마다 계속돼도 첫 미저장 변경 뒤 7초 안에 1번 저장", () => {
    const save = vi.fn();
    const a = createAutosave({ save });
    for (let t = 0; t <= 6000; t += 1000) {
      a.touch();
      if (t < 6000) vi.advanceTimersByTime(1000);
    }
    expect(save).toHaveBeenCalledTimes(0); // 6초 시점
    vi.advanceTimersByTime(999);
    expect(save).toHaveBeenCalledTimes(0); // 6.999초
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1); // 7초
    a.dispose();
  });

  it("저장 뒤 다시 바뀌면 새 2초가 시작된다", () => {
    const save = vi.fn();
    const a = createAutosave({ save });
    a.touch();
    vi.advanceTimersByTime(2000);
    a.touch();
    vi.advanceTimersByTime(1999);
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(2);
    a.dispose();
  });

  it("백그라운드 워크스페이스는 1분마다 (바뀐 게 있을 때만)", () => {
    const save = vi.fn();
    const a = createAutosave({ save });
    a.setBackground(true);
    a.touch();
    vi.advanceTimersByTime(59999);
    expect(save).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(180000);
    expect(save).toHaveBeenCalledTimes(1);
    a.dispose();
  });

  it("flush: 미저장 변경이 있으면 바로 1번, 그 뒤 타이머로 또 저장하지 않는다. 없으면 저장 안 함", async () => {
    const save = vi.fn();
    const a = createAutosave({ save });
    await a.flush();
    expect(save).toHaveBeenCalledTimes(0);
    a.touch();
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(save).toHaveBeenCalledTimes(1);
    a.dispose();
  });

  it("flushAll: 만들어 둔 모든 보드의 미저장 변경을 저장 (종료 때, S-202)", async () => {
    const s1 = vi.fn(), s2 = vi.fn(), s3 = vi.fn();
    const a1 = createAutosave({ save: s1 }), a2 = createAutosave({ save: s2 }), a3 = createAutosave({ save: s3 });
    a1.touch();
    a2.touch();
    await flushAll();
    expect([s1.mock.calls.length, s2.mock.calls.length, s3.mock.calls.length]).toEqual([1, 1, 0]);
    [a1, a2, a3].forEach((a) => a.dispose());
  });
});

describe("attachBoard: 불러오기 + 변경 감지 저장 (S-206, S-209)", () => {
  const fileOf = (version: number, nodes: unknown[]) =>
    JSON.stringify({ formatVersion: version, savedBy: "t", workspace: WS, viewport: { x: 0, y: 0, zoom: 1 }, nodes });
  const io = (json: string | null, source: LoadResult["source"] = json ? "main" : "empty") => ({
    load: vi.fn(async () => ({ json, source, archived: false }) as LoadResult),
    save: vi.fn(async () => {}),
  });

  it("저장된 보드를 useBoard 에 넣고, 바꾸면 2초 뒤 board_save(id, json) 한 번", async () => {
    const box = { id: "n1", kind: "box", x: 0, y: 0, w: 100, h: 100, z: 0 };
    const i = io(fileOf(1, [box]));
    const h = await attachBoard(WS, i);
    expect(i.load).toHaveBeenCalledWith("ws1");
    expect(h.readOnly).toBe(false);
    expect(useBoard.getState().nodes.n1).toEqual(box);
    await vi.advanceTimersByTimeAsync(5000);
    expect(i.save).toHaveBeenCalledTimes(0); // 불러온 것만으로는 저장하지 않는다
    useBoard.getState().updateNode("n1", { x: 50 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(i.save).toHaveBeenCalledTimes(1);
    const [id, json] = i.save.mock.calls[0] as unknown as [string, string];
    expect(id).toBe("ws1");
    expect(JSON.parse(json).formatVersion).toBe(1);
    expect(JSON.parse(json).nodes[0].x).toBe(50);
    h.detach();
  });

  it("빈 보드(source empty)에서 시작해도 변경하면 저장된다", async () => {
    const i = io(null);
    const h = await attachBoard(WS, i);
    useBoard.getState().addNode({ id: "n9", kind: "box", x: 1, y: 2, w: 3, h: 4, z: 0 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(i.save).toHaveBeenCalledTimes(1);
    h.detach();
  });

  it("S-206: formatVersion 2 보드는 열고 편집할 수 있지만 저장하지 않는다(flushAll 포함)", async () => {
    const box = { id: "n1", kind: "box", x: 0, y: 0, w: 100, h: 100, z: 0 };
    const i = io(fileOf(2, [box]));
    const h = await attachBoard(WS, i);
    expect(h.readOnly).toBe(true);
    expect(useBoard.getState().nodes.n1).toEqual(box);
    useBoard.getState().updateNode("n1", { x: 77 });
    expect(useBoard.getState().nodes.n1.x).toBe(77); // 편집은 된다
    await vi.advanceTimersByTimeAsync(120000);
    await flushAll();
    expect(i.save).toHaveBeenCalledTimes(0);
    h.detach();
  });

  it("detach 뒤에는 변경을 지켜보지 않는다", async () => {
    const i = io(null);
    const h = await attachBoard(WS, i);
    h.detach();
    useBoard.getState().addNode({ id: "n2", kind: "box", x: 1, y: 2, w: 3, h: 4, z: 0 });
    await vi.advanceTimersByTimeAsync(10000);
    expect(i.save).toHaveBeenCalledTimes(0);
  });
});

describe("앱 시작 흐름 (S-324: 홈 화면이 S-208 선택창을 대체)", () => {
  const repo = { path: "C:/work/app", name: "app", workspaces: [{ id: "w1", name: "Workspace 1" }] };
  const mk = (repos: Repos, exists: boolean) => {
    const pickFolder = vi.fn(async () => "D:/never");
    const io = {
      reposGet: vi.fn(async () => repos),
      reposSet: vi.fn(async (_r: Repos) => {}),
      dirExists: vi.fn(async () => exists),
      pickFolder, // 홈 화면이 대체하므로 불리면 안 된다(StartIo 에는 없는 필드)
    };
    return { io: io as StartIo, pickFolder, spies: io };
  };
  const on = { reopenLastRepo: true };

  it("reopen 켜짐 + lastRepo 폴더가 있으면 선택창 없이 그 repo 의 Workspace 1 을 보드로 연다", async () => {
    const { io, pickFolder, spies } = mk({ repos: [repo], lastRepo: "C:/work/app" }, true);
    expect(await startWorkspace(io, on)).toEqual({ kind: "board", ws: { id: "w1", name: "Workspace 1", repoPath: "C:/work/app" } });
    expect(pickFolder).not.toHaveBeenCalled();
    expect(spies.dirExists).toHaveBeenCalledWith("C:/work/app");
  });

  it("reopen 꺼짐이면 폴더가 있어도 홈, 선택창 없음", async () => {
    const { io, pickFolder } = mk({ repos: [repo], lastRepo: "C:/work/app" }, true);
    expect(await startWorkspace(io, { reopenLastRepo: false })).toEqual({ kind: "home" });
    expect(pickFolder).not.toHaveBeenCalled();
  });

  it("lastRepo 폴더가 사라졌으면 홈 — 선택창 없이, repo 목록은 지우지 않는다", async () => {
    const { io, pickFolder, spies } = mk({ repos: [repo], lastRepo: "C:/work/app" }, false);
    expect(await startWorkspace(io, on)).toEqual({ kind: "home" });
    expect(pickFolder).not.toHaveBeenCalled();
    expect(spies.reposSet).not.toHaveBeenCalled();
  });

  it("lastRepo 가 없으면(처음 실행) 홈", async () => {
    const { io, pickFolder, spies } = mk({ repos: [], lastRepo: null }, false);
    expect(await startWorkspace(io, on)).toEqual({ kind: "home" });
    expect(pickFolder).not.toHaveBeenCalled();
    expect(spies.reposSet).not.toHaveBeenCalled();
  });

  it("lastRepo 의 워크스페이스가 아직 없으면 Workspace 1 을 만들어 저장한다 (S-307: lastWorkspace 가 있으면 그것)", async () => {
    const bare = { path: "C:/work/bare", name: "bare", workspaces: [] };
    const { io, spies } = mk({ repos: [bare], lastRepo: "C:/work/bare" }, true);
    const r = await startWorkspace(io, on);
    expect(r.kind).toBe("board");
    const ws = (r as { ws: { id: string; name: string; repoPath: string } }).ws;
    expect(ws).toMatchObject({ name: "Workspace 1", repoPath: "C:/work/bare" });
    expect(spies.reposSet.mock.calls.at(-1)![0].repos[0]!.workspaces).toEqual([{ id: ws.id, name: "Workspace 1" }]);
    const two = { ...repo, workspaces: [{ id: "w1", name: "Workspace 1" }, { id: "w2", name: "Workspace 2" }] };
    const m2 = mk({ repos: [two], lastRepo: "C:/work/app", lastWorkspace: { "C:/work/app": "w2" } }, true);
    expect(await startWorkspace(m2.io, on)).toMatchObject({ kind: "board", ws: { id: "w2" } });
  });
});

describe("repo 열기 (S-316)", () => {
  const mk = (repos: Repos, exists = true) => {
    const io = { reposGet: vi.fn(async () => repos), reposSet: vi.fn(async (_r: Repos) => {}), dirExists: vi.fn(async () => exists) };
    return io;
  };

  it("폴더가 사라졌으면 null, 아무것도 저장하지 않는다", async () => {
    const io = mk({ repos: [{ path: "C:/x", name: "x", workspaces: [] }], lastRepo: null }, false);
    expect(await openRepoWs(io, "C:/x")).toBeNull();
    expect(io.reposSet).not.toHaveBeenCalled();
  });

  it("목록에 있는 repo 는 마지막 워크스페이스(없으면 첫째)를 돌려주고 lastRepo 로 저장한다", async () => {
    const r: Repos = {
      repos: [{ path: "C:/a", name: "a", workspaces: [{ id: "w1", name: "Workspace 1" }] }, { path: "C:/b", name: "b", workspaces: [{ id: "w2", name: "Workspace 1" }, { id: "w3", name: "Workspace 2" }] }],
      lastRepo: "C:/a",
      lastWorkspace: { "C:/b": "w3" },
    };
    const io = mk(r);
    expect(await openRepoWs(io, "C:/b")).toEqual({ id: "w3", name: "Workspace 2", repoPath: "C:/b" });
    expect(io.reposSet.mock.calls.at(-1)![0].lastRepo).toBe("C:/b");
    expect(await openRepoWs(io, "C:/a")).toEqual({ id: "w1", name: "Workspace 1", repoPath: "C:/a" });
  });

  it("워크스페이스가 없는 repo 는 Workspace 1 을 만들어 저장한다", async () => {
    const io = mk({ repos: [{ path: "C:/n", name: "n", workspaces: [] }], lastRepo: null });
    const ws = await openRepoWs(io, "C:/n");
    expect(ws).toMatchObject({ name: "Workspace 1", repoPath: "C:/n" });
    const saved = io.reposSet.mock.calls.at(-1)![0];
    expect(saved.lastRepo).toBe("C:/n");
    expect(saved.repos[0]!.workspaces).toEqual([{ id: ws!.id, name: "Workspace 1" }]);
  });
});

describe("B7 groups 저장 형식 (S-508)", () => {
  const G = { id: "g1", name: "Group 1", role: "general" as const };
  const cg = { ...consoleNode, groupId: "g1" } as BoardNode;
  const c2 = { ...consoleNode, id: "c2", groupId: "g1" } as BoardNode;
  const vp = { x: 0, y: 0, zoom: 1 };
  const file = (extra: Record<string, unknown>, version = 1) => JSON.stringify({ formatVersion: version, savedBy: "t", workspace: WS, viewport: vp, nodes: [consoleNode], ...extra });

  it("serialize: 최상위 groups[]{id,name,role} 와 콘솔 노드의 groupId, formatVersion 은 1 그대로", () => {
    const o = JSON.parse(serialize({ viewport: vp, nodes: { c1: cg, c2 }, groups: [G] }, WS));
    expect(o.formatVersion).toBe(1);
    expect(o.groups).toEqual([G]);
    expect(o.nodes.map((n: any) => n.groupId)).toEqual(["g1", "g1"]);
  });
  it("serialize: 그룹이 없으면 groups 는 빈 배열", () => {
    const o = JSON.parse(serialize({ viewport: vp, nodes: { c1: consoleNode as BoardNode } }, WS));
    expect(o.groups).toEqual([]);
  });
  it("왕복: groups 와 groupId 가 그대로(모르는 그룹 필드도 보존)", () => {
    const G2 = { ...G, id: "g2", name: "Alpha", role: "backend" as const, extra: 1 };
    const state = { viewport: vp, nodes: { c1: cg, c2 }, groups: [G, G2] as any };
    const back = deserialize(serialize(state, WS));
    expect(back.groups).toEqual([G, G2]);
    expect(back.nodes).toEqual(state.nodes);
  });
  it("옛 파일(groups 없음)도 열린다: groups 는 [] 이고 노드는 그대로", () => {
    const d = deserialize(file({}));
    expect(d.groups).toEqual([]);
    expect(d.readOnly).toBe(false);
    expect(Object.keys(d.nodes)).toEqual(["c1"]);
  });
  it("읽기 전용(formatVersion 2) 보드도 groups 를 그대로 읽어 둔다", () => {
    const d = deserialize(file({ nodes: [cg], groups: [G, { ...G, id: "g9", futureField: true }] }, 2));
    expect(d.readOnly).toBe(true);
    expect(d.groups).toEqual([G, { ...G, id: "g9", futureField: true }]);
    expect((d.nodes.c1 as any).groupId).toBe("g1");
  });
  it("attachBoard: 불러온 groups 가 저장소에 들어가고, 읽기 전용이면 그룹을 바꿔도 저장하지 않는다", async () => {
    const mk = (json: string) => ({ load: vi.fn(async () => ({ json, source: "main", archived: false }) as LoadResult), save: vi.fn(async () => {}) });
    const i = mk(file({ nodes: [cg, c2], groups: [G] }, 2));
    const h = await attachBoard(WS, i);
    expect(useBoard.getState().groups).toEqual([G]);
    useBoard.getState().renameGroup("g1", "Edited");
    await vi.advanceTimersByTimeAsync(120000);
    await flushAll();
    expect(i.save).toHaveBeenCalledTimes(0);
    h.detach();
  });
  it("attachBoard: 그룹만 바뀌어도(이름 변경) 2초 뒤 저장되고 저장본에 groups 가 있다", async () => {
    const i = { load: vi.fn(async () => ({ json: file({ nodes: [cg, c2], groups: [G] }), source: "main", archived: false }) as LoadResult), save: vi.fn(async () => {}) };
    const h = await attachBoard(WS, i);
    expect(useBoard.getState().groups).toEqual([G]);
    useBoard.getState().renameGroup("g1", "Edited");
    await vi.advanceTimersByTimeAsync(2000);
    expect(i.save).toHaveBeenCalledTimes(1);
    const saved = JSON.parse((i.save.mock.calls[0] as unknown as [string, string])[1]);
    expect(saved.groups).toEqual([{ ...G, name: "Edited" }]);
    h.detach();
  });
});

describe("C1 S-801·S-802·S-811·S-815 새 종류 저장 형식", () => {
  const vp = { x: 0, y: 0, zoom: 1 };
  const unknown = { id: "u1", kind: "future-thing", x: 5, y: 6, w: 70, h: 80, z: 2, payload: { a: [1, 2, { b: "c" }] }, label: "keep me", wireTo: "w1" } as BoardNode;
  const web = { id: "w1", kind: "tk-card", x: 0, y: 0, w: 300, h: 200, z: 1, html: "<b>x</b>" } as BoardNode;
  const state = { viewport: vp, nodes: { u1: unknown, w1: web }, groups: [] };

  it("S-801 모르는 종류 노드는 필드째 왕복한다(지우지 않음)", () => {
    const back = deserialize(serialize(state, WS));
    expect(back.nodes.u1).toEqual(unknown);
    expect(back.nodes.w1).toEqual(web);
  });
  it("S-811 wireTo 가 왕복한다", () => {
    expect(deserialize(serialize(state, WS)).nodes.u1!.wireTo).toBe("w1");
  });
  it("S-802 formatVersion 은 1, 최상위 필드는 그대로(새 종류는 nodes[] 안에만 더한다)", () => {
    const o = JSON.parse(serialize(state, WS));
    expect(o.formatVersion).toBe(1);
    expect(Object.keys(o).sort()).toEqual(["formatVersion", "groups", "nodes", "savedBy", "viewport", "workspace"]);
  });
  it("S-815 보드를 불러와 편집하면 모르는 종류도 같은 모양으로 저장된다", async () => {
    const saves: string[] = [];
    const io = { load: async () => ({ json: serialize(state, WS), source: "main" as const, archived: false }), save: async (_id: string, j: string) => void saves.push(j) };
    const h = await attachBoard(WS, io);
    useBoard.getState().moveBy(["u1"], 10, 0);
    await h.autosave.flush();
    const saved = JSON.parse(saves.at(-1)!);
    expect(saved.nodes.find((n: any) => n.id === "u1")).toEqual({ ...unknown, x: 15 });
    h.detach();
  });
});

describe("D1 S-1220 wired 저장 형식", () => {
  const vp = { x: 0, y: 0, zoom: 1 };
  const c1 = { id: "c1", kind: "console", x: 0, y: 0, w: 720, h: 440, z: 1, name: "Claude 1", agentId: "claude", textSize: null, yolo: false } as BoardNode;
  const orch = { id: "o1", kind: "orchestrator", x: 0, y: 500, w: 300, h: 200, z: 2, wired: ["c1", "g1"], future: { a: [1] } } as BoardNode;
  const state = { viewport: vp, nodes: { c1, o1: orch }, groups: [{ id: "g1", name: "Group 1", role: "general" as const }] };
  it("wired 는 순서째 왕복하고 모르는 필드도 남는다", () => {
    const back = deserialize(serialize(state, WS));
    expect(back.nodes.o1!.wired).toEqual(["c1", "g1"]);
    expect(back.nodes.o1).toEqual(orch);
  });
  it("formatVersion 은 1 그대로, 최상위 필드는 늘지 않는다", () => {
    const o = JSON.parse(serialize(state, WS));
    expect(o.formatVersion).toBe(1);
    expect(Object.keys(o).sort()).toEqual(["formatVersion", "groups", "nodes", "savedBy", "viewport", "workspace"]);
    expect(o.nodes.find((n: BoardNode) => n.id === "o1").wired).toEqual(["c1", "g1"]);
  });
});
