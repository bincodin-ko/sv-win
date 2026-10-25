import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/notice", () => ({ showNotice: vi.fn() }));
vi.mock("./session", async (orig) => ({ ...(await orig<typeof import("./session")>()), closePlanner: vi.fn(), abortPlanner: vi.fn() }));

import { useConfirm, answerConfirm } from "../commandbar/confirm";
import { useThread } from "../commandbar/thread";
import { showNotice } from "../lib/notice";
import { SETTING_DEFAULTS, useSettings } from "../settings/useSettings";
import { cancelPlanner, runPlanner, type RunDeps } from "./run";
import { abortPlanner, closePlanner } from "./session";
import { usePlanner } from "./state";

const ctx = { repo: "r", wsId: "w" };
const board = {
  consoles: [{ id: "w:c1", name: "Otto", agentId: "claude" }], groups: [], workspaces: [],
  agents: [{ id: "claude", name: "Claude Code", aliases: [] }],
};
const texts = () => (useThread.getState().byRepo["r"] ?? []).map((m) => `${m.role}:${m.text}`);
const win = window as unknown as { __plannerTest?: boolean };
const setPlanner = (planner: string) => useSettings.setState({ s: { ...SETTING_DEFAULTS, planner } });

function deps(ask: RunDeps["ask"]) {
  const d = { runIntent: vi.fn(async () => {}), board: async () => board, say: vi.fn((x: string) => useThread.getState().add("r", { id: String(Math.random()), role: "bot", text: x } as never)), note: vi.fn(), ask } as unknown as RunDeps;
  return d;
}
beforeEach(() => {
  win.__plannerTest = true;
  setPlanner("claude");
  useThread.setState({ byRepo: {}, open: true } as never);
  useConfirm.setState({ pending: null });
  vi.mocked(closePlanner).mockClear();
  vi.mocked(showNotice).mockClear();
});
afterEach(() => { delete win.__plannerTest; usePlanner.setState({ busy: null }); });

describe("S-2901a·S-2903 꺼짐", () => {
  it("__plannerTest가 없으면 false(기존 문구)", async () => {
    delete win.__plannerTest;
    const ask = vi.fn();
    expect(await runPlanner("x", ctx, deps(ask))).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });
  it("설정이 off면 false, 부르지 않는다", async () => {
    setPlanner("off");
    const ask = vi.fn();
    expect(await runPlanner("x", ctx, deps(ask))).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });
  it("ask가 off를 돌려주면 false", async () => {
    expect(await runPlanner("x", ctx, deps(async () => ({ fail: { reason: "off" } })))).toBe(false);
  });
  it("planner 설정이 바뀌면 closePlanner", () => {
    setPlanner("codex");
    expect(closePlanner).toHaveBeenCalledTimes(1);
    useSettings.setState({ s: { ...useSettings.getState().s, theme: "light" } });
    expect(closePlanner).toHaveBeenCalledTimes(1);
  });
  it("S-3303 plannerModel·plannerBaseUrl 이 바뀌어도 closePlanner", () => {
    useSettings.setState({ s: { ...useSettings.getState().s, plannerModel: { claude: "sonnet" } } as never });
    expect(closePlanner).toHaveBeenCalledTimes(1);
    useSettings.setState({ s: { ...useSettings.getState().s, plannerBaseUrl: "http://a/v1" } as never });
    expect(closePlanner).toHaveBeenCalledTimes(2);
  });
  it("S-3304 API 공급자는 세션이 없어도 늘 thinking", async () => {
    setPlanner("api:openai");
    let phase = "";
    const d = deps(async () => { phase = usePlanner.getState().busy?.phase ?? ""; return { plan: { ok: { t: "tidy" } } }; });
    await runPlanner("x", ctx, d);
    expect(phase).toBe("thinking");
    expect(showNotice).not.toHaveBeenCalledWith("Starting the planner…");
  });
});

describe("S-2951·S-2953 바로 실행", () => {
  it("Plan 노트를 남기고 runIntent를 그대로 부른다, busy는 끝나면 꺼진다", async () => {
    let phaseSeen = "";
    const d = deps(async () => { phaseSeen = usePlanner.getState().busy?.phase ?? ""; return { plan: { ok: { t: "tidy" }, why: "messy" } }; });
    expect(await runPlanner("x", ctx, d)).toBe(true);
    expect(d.runIntent).toHaveBeenCalledWith({ t: "tidy" }, ctx);
    expect(vi.mocked(d.note).mock.calls[0]![0]).toBe("Plan – tidy ← messy");
    expect(phaseSeen).toBe("starting");
    expect(usePlanner.getState().busy).toBeNull();
  });
  it("Thread가 닫혀 있으면 알림으로 한 번 보인다(S-2981)", async () => {
    useThread.setState({ open: false } as never);
    await runPlanner("x", ctx, deps(async () => ({ plan: { ok: { t: "tidy" } } })));
    expect(showNotice).toHaveBeenCalledWith("Starting the planner…");
  });
  it("ask가 던져도 busy는 꺼진다", async () => {
    await expect(runPlanner("x", ctx, deps(async () => { throw new Error("x"); }))).rejects.toThrow();
    expect(usePlanner.getState().busy).toBeNull();
  });
});

describe("S-2952 확인", () => {
  it("tell은 Run this? 확인 전에는 실행하지 않고 yes 뒤에 실행", async () => {
    const intent = { t: "tell", targets: [{ kind: "console", id: "w:c1" }], text: "hi" };
    const d = deps(async () => ({ plan: { ok: intent as never } }));
    await runPlanner("x", ctx, d);
    expect(d.runIntent).not.toHaveBeenCalled();
    expect(texts().at(-1)).toBe('bot:Run this? Tell Otto: "hi" Say yes or click Confirm');
    expect(answerConfirm("r", "yes")).toBe("ran");
    expect(d.runIntent).toHaveBeenCalledWith(intent, ctx);
  });
  it("broadcast·git도 확인, close는 확인 없이 runIntent(자기 확인)", async () => {
    const d = deps(async () => ({ plan: { ok: { t: "broadcast", text: "yo" } } }));
    await runPlanner("x", ctx, d);
    expect(d.runIntent).not.toHaveBeenCalled();
    expect(useConfirm.getState().pending).not.toBeNull();
    useConfirm.setState({ pending: null });
    const d2 = deps(async () => ({ plan: { ok: { t: "close", target: { kind: "all" } } } }));
    await runPlanner("x", ctx, d2);
    expect(d2.runIntent).toHaveBeenCalled();
  });
});

describe("S-2940 scope", () => {
  it("카드 범위 밖 intent는 guard 문구가 답이고 실행하지 않는다", async () => {
    const d = deps(async () => ({ plan: { ok: { t: "undo" } } }));
    await runPlanner("x", { ...ctx, scope: { consoles: [], groups: [] } }, d);
    expect(d.runIntent).not.toHaveBeenCalled();
    expect(d.say).toHaveBeenCalledWith("Undo, redo and workspace commands work from the main command bar.");
  });
});

describe("S-2983·S-2984 실패", () => {
  it("실패 문구 한 개로 끝(재시도 없음)", async () => {
    const ask = vi.fn(async () => ({ fail: { reason: "timeout" } }));
    const d = deps(ask as never);
    expect(await runPlanner("x", ctx, d)).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(d.say).toHaveBeenCalledWith("I couldn't read that: the planner took longer than 20 seconds. Start with who it is for, like @Otto run the tests");
  });
});

describe("S-2955 취소", () => {
  it("생각 중 cancelPlanner → true, abort, 뒤늦은 답은 무시", async () => {
    let answer!: (v: never) => void;
    const d = deps(() => new Promise((r) => (answer = r as never)));
    const p = runPlanner("x", ctx, d);
    await new Promise((r) => setTimeout(r, 0));
    expect(usePlanner.getState().busy).not.toBeNull();
    expect(cancelPlanner()).toBe(true);
    expect(abortPlanner).toHaveBeenCalled();
    expect(usePlanner.getState().busy).toBeNull();
    answer({ plan: { ok: { t: "tidy" } } } as never);
    expect(await p).toBe(true);
    expect(d.runIntent).not.toHaveBeenCalled();
    expect(cancelPlanner()).toBe(false);
  });
});
