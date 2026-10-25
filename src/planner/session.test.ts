import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeClock } from "../hidden/fakeclock";
import { ANSWER_MS, IDLE_MS, NUDGE_MS, READY_MS, RESEND_MS, abortPlanner, closePlanner, nextId, plannerAsk, plannerLive, type PlannerDeps } from "./session";
import { PRIMER, type BoardCtx } from "./prompt";
import { cliArgs } from "./providers/cli";
import { policyOf } from "./policy";
import type { ApiResult } from "./providers/api";
import { usePlanner } from "./state";

const ctx: BoardCtx = {
  consoles: [{ id: "ws:c1", name: "Otto", agentId: "claude", status: "ready" }],
  groups: [], workspaces: [],
  agents: [{ id: "claude", name: "Claude Code", aliases: [] }, { id: "codex", name: "Codex", aliases: [] }],
};

type Blocked = { blocked: true; screen: string } | { blocked: false };
function rig(o: { agent?: string; typeResult?: () => Blocked; openFail?: boolean } = {}) {
  const clock = fakeClock();
  const writes: string[] = [];
  const sessions: { close: ReturnType<typeof vi.fn>; sessionId?: string }[] = [];
  let reply: (id: string) => string | null = () => null;
  let agent = o.agent ?? "claude";
  const mkSession = (agentId?: string) => ({
    id: sessions.length + 1, agentId, cwd: "D", sessionId: agentId === "claude" ? `sid${sessions.length + 1}` : undefined, startedAt: clock.now(),
    lastOutputAt: () => 0, enter: vi.fn(), screenText: async () => "", close: vi.fn(),
    type: vi.fn(async (t: string) => { writes.push(t); return o.typeResult?.() ?? { blocked: false as const }; }),
    waitQuiet: vi.fn(async () => ({ blocked: false as const })),
  });
  const open = vi.fn(async (opts: { agentId?: string }) => {
    if (o.openFail) throw new Error("boom");
    const s = mkSession(opts.agentId);
    sessions.push(s);
    return s;
  });
  const lastId = () => /request id="(r\d+)"/.exec(writes.at(-1) ?? "")?.[1] ?? "";
  const find = vi.fn(async () => "codex-sid");
  const read = vi.fn(async () => { const id = lastId(); return id ? reply(id) : null; });
  const deps = { clock, open, read, find, agent: async () => agent, dir: async () => "D:\\PlannerBox", env: async () => [["CLAUDE_CONFIG_DIR", "P"] as [string, string]] } as unknown as PlannerDeps;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return {
    clock, writes, sessions, open, read, find, deps, tick, mkSession, setAgent: (a: string) => (agent = a),
    answer: (f: (id: string) => string | null) => (reply = f),
    ok: (intent: object) => (reply = (id) => JSON.stringify({ id, intent, why: "because" })),
  };
}
afterEach(() => { closePlanner(); usePlanner.setState({ busy: null, status: "none", lastFail: undefined }); });

describe("최종 확인 6번: 요청이 transcript 에 안 남는 경우", () => {
  it("보낸 뒤 화면이 조용한데 답이 없으면 Enter 한 번, 그래도 없으면 요청을 한 번만 다시 보낸다", async () => {
    const r = rig(); let seen = false;
    r.answer((id) => (seen ? JSON.stringify({ id, intent: { t: "tidy" } }) : null));
    const p = plannerAsk("정리해 줘", ctx, r.deps);
    await r.tick(); await r.clock.advance(NUDGE_MS + 600);
    expect(r.sessions[0]!.enter).toHaveBeenCalledTimes(1);
    expect(r.writes).toHaveLength(1);
    await r.clock.advance(RESEND_MS - NUDGE_MS);
    expect(r.writes).toHaveLength(2);
    expect(r.writes[1]).toContain("<user_sentence>정리해 줘</user_sentence>");
    await r.clock.advance(3000);
    expect(r.writes).toHaveLength(2); // 두 번까지만
    expect(r.sessions[0]!.enter).toHaveBeenCalledTimes(1);
    seen = true; await r.clock.advance(1000);
    expect(await p).toMatchObject({ plan: { ok: { t: "tidy" } } });
  });
  it("답이 제때 오면 Enter 도 재전송도 없다", async () => {
    const r = rig(); r.ok({ t: "tidy" });
    await plannerAsk("a", ctx, r.deps);
    expect(r.sessions[0]!.enter).not.toHaveBeenCalled();
    expect(r.writes).toHaveLength(1);
  });
});

describe("첫 요청 프라이머 누락(재확인 3번)", () => {
  it("전달이 확인되기 전(답이 없는 동안)엔 재전송도 프라이머+요청을 함께 보낸다", async () => {
    const r = rig(); let seen = false;
    r.answer((id) => (seen ? JSON.stringify({ id, intent: { t: "tidy" } }) : null));
    const p = plannerAsk("정리해 줘", ctx, r.deps);
    await r.tick(); await r.clock.advance(RESEND_MS + 600);
    expect(r.writes).toHaveLength(2);
    expect(r.writes[1]).toContain(PRIMER);
    expect(r.writes[1]).toContain("<user_sentence>정리해 줘</user_sentence>");
    seen = true; await r.clock.advance(1000);
    expect(await p).toMatchObject({ plan: { ok: { t: "tidy" } } });
  });
  it("답이 없어 끝난 세션은 프라이머가 확인된 적 없으니 다음 요청도 새 세션+프라이머", async () => {
    const r = rig(); r.answer(() => null);
    const p = plannerAsk("x", ctx, r.deps);
    await r.tick(); await r.clock.advance(ANSWER_MS + 1000);
    await p;
    r.ok({ t: "tidy" });
    await plannerAsk("y", ctx, r.deps);
    expect(r.writes.at(-1)).toContain(PRIMER);
  });
});

describe("S-2960·S-2961 첫 요청", () => {
  it("세션을 인자·env·폴더와 함께 띄우고 프라이머+요청을 보낸 뒤 답의 plan을 돌려준다", async () => {
    const r = rig(); r.ok({ t: "tidy" });
    const res = await plannerAsk("정리해 줘", ctx, r.deps);
    expect(res).toEqual({ plan: { ok: { t: "tidy" }, why: "because" } });
    const o = r.open.mock.calls[0]![0] as Record<string, unknown>;
    expect(o).toMatchObject({ agentId: "claude", cwd: "D:\\PlannerBox", args: cliArgs("claude", ""), manual: true, emptyFolder: true });
    expect(o.env).toEqual([["CLAUDE_CONFIG_DIR", "P"]]);
    expect(r.writes[0]).toContain(PRIMER);
    expect(r.writes[0]).toContain("<user_sentence>정리해 줘</user_sentence>");
    expect(usePlanner.getState().status).toBe("ready");
  });
  it("cliArgs 모양(S-3312: 옛 ARGS 값 그대로)", () => {
    // 최종 확인 5·6번: 사용자 전역 훅(effort 올림)·MCP 서버(RAM 2.3GB)를 안 물려받는다. 실측 2.1.310: 2176MB -> 292MB, 로그인 유지
    expect(cliArgs("claude", "")).toEqual(["--model", "haiku", "--effort", "low", "--tools", "", "--disable-slash-commands", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "project"]);
    expect(cliArgs("codex", "")).toEqual(["-s", "read-only", "-a", "never"]);
  });
  it("둘째 요청은 새 세션 없이 요청만(프라이머 없음), 요청 번호는 계속 늘어난다", async () => {
    const r = rig(); r.ok({ t: "tidy" });
    await plannerAsk("a", ctx, r.deps);
    expect(plannerLive()).toBe(true);
    await plannerAsk("b", ctx, r.deps);
    expect(r.open).toHaveBeenCalledTimes(1);
    expect(r.writes[1]).not.toContain(PRIMER);
    expect(r.writes[1]).toContain("<user_sentence>b</user_sentence>");
    const a = Number(/id="r(\d+)"/.exec(r.writes[0]!)![1]), b = Number(/id="r(\d+)"/.exec(r.writes[1]!)![1]);
    expect(b).toBeGreaterThan(a);
    expect(nextId()).toMatch(/^r\d+$/);
  });
  it("Codex는 세션 id를 한 번만 찾아 저장한다", async () => {
    const r = rig({ agent: "codex" }); r.ok({ t: "tidy" });
    await plannerAsk("a", ctx, r.deps); await plannerAsk("b", ctx, r.deps);
    expect(r.find).toHaveBeenCalledTimes(1);
    expect(r.read.mock.calls.every((c) => (c as unknown as [{ sessionId?: string }])[0].sessionId === "codex-sid")).toBe(true);
  });
  it("Claude는 hiddenSession의 --session-id로 읽는다", async () => {
    const r = rig(); r.ok({ t: "tidy" });
    await plannerAsk("a", ctx, r.deps);
    expect((r.read.mock.calls[0] as unknown as [{ sessionId: string; agentId: string }])[0]).toMatchObject({ agentId: "claude", sessionId: "sid1" });
  });
});

describe("S-2916·S-2930 답 짝맞추기", () => {
  it("id가 다른 이전 답은 버리고 계속 기다린다", async () => {
    const r = rig();
    r.answer((id) => (r.clock.now() < 3000 ? JSON.stringify({ id: "r0", intent: { t: "close" } }) : JSON.stringify({ id, intent: { t: "undo" } })));
    const p = plannerAsk("x", ctx, r.deps);
    await r.tick(); await r.clock.advance(3000);
    expect(await p).toEqual({ plan: { ok: { t: "undo" } } });
  });
  it("답 앞뒤 설명·울타리가 있어도 첫 객체만 쓴다", async () => {
    const r = rig();
    r.answer((id) => `sure\n\`\`\`json\n${JSON.stringify({ id, intent: { t: "redo" } })}\n\`\`\`\n{"id":"${id}","intent":{"t":"close","target":"all"}}`);
    expect(await plannerAsk("x", ctx, r.deps)).toEqual({ plan: { ok: { t: "redo" } } });
  });
  it("none·검증 실패는 fail", async () => {
    const r = rig();
    r.answer((id) => JSON.stringify({ id, none: "not a board command" }));
    expect(await plannerAsk("x", ctx, r.deps)).toEqual({ fail: { reason: "none", detail: "not a board command" } });
    r.answer((id) => JSON.stringify({ id, intent: { t: "rm" } }));
    expect(await plannerAsk("y", ctx, r.deps)).toMatchObject({ fail: { reason: "bad" } });
  });
});

describe("S-2960 꺼짐·없음·긴 문장", () => {
  it("off·no agent는 세션을 띄우지 않는다", async () => {
    const r = rig({ agent: "off" });
    expect(await plannerAsk("x", ctx, r.deps)).toEqual({ fail: { reason: "off" } });
    r.setAgent("no agent");
    expect(await plannerAsk("x", ctx, r.deps)).toEqual({ fail: { reason: "no agent" } });
    expect(r.open).not.toHaveBeenCalled();
  });
  it("500자 넘으면 부르지 않고 long", async () => {
    const r = rig();
    expect(await plannerAsk("x".repeat(501), ctx, r.deps)).toEqual({ fail: { reason: "long" } });
    expect(r.open).not.toHaveBeenCalled();
  });
});

describe("S-2962 시간", () => {
  it("답이 20초 안에 안 오면 세션을 닫고 timeout, 다음 요청은 새 세션+프라이머", async () => {
    const r = rig(); r.answer(() => null);
    const p = plannerAsk("x", ctx, r.deps);
    await r.tick(); await r.clock.advance(ANSWER_MS + 1000);
    expect(await p).toEqual({ fail: { reason: "timeout" } });
    expect(r.sessions[0]!.close).toHaveBeenCalled();
    expect(plannerLive()).toBe(false);
    expect(usePlanner.getState()).toMatchObject({ status: "failed", lastFail: "timeout" });
    r.ok({ t: "tidy" });
    await plannerAsk("y", ctx, r.deps);
    expect(r.open).toHaveBeenCalledTimes(2);
    expect(r.writes.at(-1)).toContain(PRIMER);
  });
  it("20초는 질문을 보낸 시각부터 센다(세션 준비 시간은 따로)", async () => {
    const r = rig();
    let release!: () => void;
    r.open.mockImplementationOnce((async () => {
      await new Promise<void>((res) => (release = res));
      const s = r.mkSession("claude");
      r.sessions.push(s);
      return s;
    }) as never);
    r.answer((id) => (r.clock.now() >= 1000 + 30000 + 5000 ? JSON.stringify({ id, intent: { t: "undo" } }) : null));
    const p = plannerAsk("x", ctx, r.deps);
    await r.tick(); await r.clock.advance(30000); release(); // 준비 30초(45초 안)
    await r.tick(); await r.clock.advance(6000);
    expect(await p).toEqual({ plan: { ok: { t: "undo" } } });
  });
  it("준비가 45초를 넘으면 start", async () => {
    const r = rig();
    r.open.mockImplementationOnce((() => new Promise(() => {})) as never);
    const p = plannerAsk("x", ctx, r.deps);
    await r.tick(); await r.clock.advance(READY_MS + 1000);
    expect(await p).toEqual({ fail: { reason: "start" } });
  });
  it("세션 열기 실패는 start이고 다음 요청을 막지 않는다", async () => {
    const r = rig({ openFail: true });
    expect(await plannerAsk("x", ctx, r.deps)).toEqual({ fail: { reason: "start" } });
    expect(await plannerAsk("y", ctx, r.deps)).toEqual({ fail: { reason: "start" } });
    expect(r.open).toHaveBeenCalledTimes(2);
  });
});

describe("S-2963 막힘", () => {
  it("로그인 문구면 login + status=login, 세션 닫음", async () => {
    const r = rig({ typeResult: () => ({ blocked: true, screen: "Please sign in to continue" }) });
    expect(await plannerAsk("x", ctx, r.deps)).toEqual({ fail: { reason: "login", cli: "claude" } });
    expect(usePlanner.getState().status).toBe("login");
    expect(r.sessions[0]!.close).toHaveBeenCalled();
    expect(plannerLive()).toBe(false);
  });
  it("그 밖의 막힘은 blocked", async () => {
    const r = rig({ typeResult: () => ({ blocked: true, screen: "Allow tool? (y/n)" }) });
    expect(await plannerAsk("x", ctx, r.deps)).toEqual({ fail: { reason: "blocked" } });
  });
  it("답을 기다리는 중 막히면(waitQuiet) 같은 처리", async () => {
    const r = rig(); r.answer(() => null);
    r.open.mockImplementationOnce((async () => {
      const s = r.mkSession("claude");
      s.waitQuiet = vi.fn(async () => ({ blocked: true as const, screen: "log in first" })) as never;
      r.sessions.push(s);
      return s;
    }) as never);
    const p = plannerAsk("x", ctx, r.deps);
    await r.tick(); await r.clock.advance(1000);
    expect(await p).toEqual({ fail: { reason: "login", cli: "claude" } });
  });
});

describe("S-2964 줄서기", () => {
  it("앞 요청이 끝나야 다음 요청을 보낸다, 앞 실패가 다음을 막지 않는다", async () => {
    const r = rig(); r.answer(() => null);
    const p1 = plannerAsk("one", ctx, r.deps);
    const p2 = plannerAsk("two", ctx, r.deps);
    await r.tick(); await r.clock.advance(1000);
    expect(r.writes).toHaveLength(1);
    await r.clock.advance(ANSWER_MS);
    expect(await p1).toEqual({ fail: { reason: "timeout" } });
    r.ok({ t: "undo" });
    await r.tick(); await r.clock.advance(1000);
    expect(await p2).toEqual({ plan: { ok: { t: "undo" }, why: "because" } });
    expect(r.writes.at(-1)).toContain("<user_sentence>two</user_sentence>");
  });
});

describe("S-2965·S-2903 닫기", () => {
  it("마지막 요청 10분 뒤 닫고, 요청이 오면 타이머를 다시 시작한다", async () => {
    const r = rig(); r.ok({ t: "tidy" });
    await plannerAsk("a", ctx, r.deps);
    await r.clock.advance(IDLE_MS - 1000);
    expect(plannerLive()).toBe(true);
    await plannerAsk("b", ctx, r.deps);
    await r.clock.advance(IDLE_MS - 1000);
    expect(plannerLive()).toBe(true);
    await r.clock.advance(2000);
    expect(plannerLive()).toBe(false);
    expect(r.sessions[0]!.close).toHaveBeenCalled();
  });
  it("closePlanner는 세션을 닫고 다음 요청은 프라이머를 다시 보낸다", async () => {
    const r = rig(); r.ok({ t: "tidy" });
    await plannerAsk("a", ctx, r.deps);
    closePlanner();
    expect(plannerLive()).toBe(false);
    await plannerAsk("b", ctx, r.deps);
    expect(r.open).toHaveBeenCalledTimes(2);
    expect(r.writes[1]).toContain(PRIMER);
  });
  it("에이전트가 바뀌면 옛 세션을 닫고 새로 띄운다", async () => {
    const r = rig(); r.ok({ t: "tidy" });
    await plannerAsk("a", ctx, r.deps);
    r.setAgent("codex");
    await plannerAsk("b", ctx, r.deps);
    expect(r.sessions[0]!.close).toHaveBeenCalled();
    expect((r.open.mock.calls[1]![0] as { agentId: string }).agentId).toBe("codex");
  });
});

describe("S-2955 abort", () => {
  it("abortPlanner는 기다리는 요청을 cancelled로 끝낸다(세션은 유지)", async () => {
    const r = rig(); r.answer(() => null);
    const p = plannerAsk("x", ctx, r.deps);
    await r.tick(); await r.clock.advance(1000);
    abortPlanner();
    await r.clock.advance(1000);
    expect(await p).toEqual({ fail: { reason: "cancelled" } });
    expect(plannerLive()).toBe(true);
  });
});

describe("S-3313·S-3314·S-3315 Gemini·OpenCode", () => {
  it("gemini: sessionId 없이도 read 를 부르고, 모델 인자(-m)로 띄우고 답을 받는다", async () => {
    const r = rig({ agent: "gemini" }); r.ok({ t: "tidy" });
    (r.deps as { model?: () => string }).model = () => "gm-1";
    expect(await plannerAsk("a", ctx, r.deps)).toMatchObject({ plan: { ok: { t: "tidy" } } });
    const o = r.open.mock.calls[0]![0] as { agentId: string; args: string[]; emptyFolder: boolean };
    expect(o).toMatchObject({ agentId: "gemini", args: ["-m", "gm-1"], emptyFolder: true });
    expect((r.read.mock.calls[0] as unknown as [{ sessionId?: string; agentId: string }])[0]).toMatchObject({ agentId: "gemini", sessionId: undefined });
  });
  it("opencode: --agent plan 으로 띄우고 답을 받는다", async () => {
    const r = rig({ agent: "opencode" }); r.ok({ t: "tidy" });
    expect(await plannerAsk("a", ctx, r.deps)).toMatchObject({ plan: { ok: { t: "tidy" } } });
    expect((r.open.mock.calls[0]![0] as { args: string[] }).args).toEqual(["--agent", "plan"]);
  });
  it("opencode 읽기 간격은 2초, claude 는 0.5초", async () => {
    const count = async (agent: string) => {
      const r = rig({ agent }); r.answer(() => null);
      const p = plannerAsk("x", ctx, r.deps);
      await r.tick(); await r.clock.advance(6000);
      const n = r.read.mock.calls.length;
      abortPlanner(); await r.clock.advance(3000); await p; closePlanner();
      return n;
    };
    expect(await count("opencode")).toBeLessThanOrEqual(4);
    expect(await count("claude")).toBeGreaterThanOrEqual(10);
  });
});

describe("S-3350·S-3357·S-3304 API 갈래", () => {
  const apiRig = (reply: ApiResult | (() => Promise<ApiResult>)) => {
    const r = rig({ agent: "api:openai" });
    const api = vi.fn(async (_a: unknown) => (typeof reply === "function" ? reply() : reply));
    Object.assign(r.deps, { api, model: () => "gpt-x", baseUrl: () => "http://u/v1" });
    return { r, api };
  };
  it("숨은 세션을 띄우지 않고 요청을 apiAsk 로 보낸다(프라이머 상태 안 건드림)", async () => {
    const { r, api } = apiRig({ plan: { ok: { t: "tidy" } } });
    expect(await plannerAsk("정리해 줘", ctx, r.deps)).toEqual({ plan: { ok: { t: "tidy" } } });
    expect(r.open).not.toHaveBeenCalled();
    expect(plannerLive()).toBe(false);
    expect(api.mock.calls[0]![0]).toMatchObject({ provider: "api:openai", model: "gpt-x", baseUrl: "http://u/v1" });
    expect((api.mock.calls[0]![0] as { req: string }).req).toContain("<user_sentence>정리해 줘</user_sentence>");
    expect(usePlanner.getState().status).toBe("ready");
  });
  it("실패는 track() 상태로 이어진다", async () => {
    const { r } = apiRig({ fail: { reason: "auth" } });
    expect(await plannerAsk("x", ctx, r.deps)).toEqual({ fail: { reason: "auth" } });
    expect(usePlanner.getState()).toMatchObject({ status: "failed", lastFail: "auth" });
  });
  it("CLI 세션이 떠 있어도 건드리지 않는다", async () => {
    const r = rig(); r.ok({ t: "tidy" });
    await plannerAsk("a", ctx, r.deps);
    r.setAgent("api:openai");
    Object.assign(r.deps, { api: vi.fn(async () => ({ plan: { ok: { t: "tidy" } } })) });
    await plannerAsk("b", ctx, r.deps);
    expect(r.sessions[0]!.close).not.toHaveBeenCalled();
  });
  it("S-3357 주입 방어: close 는 자기 확인(run), tell·broadcast·git 은 확인, 표에 없는 필드는 버림", async () => {
    const { apiAsk } = await import("./providers/api");
    const { makeHandles } = await import("./prompt");
    const go = async (intent: object) => {
      const r = await apiAsk({ id: "r1", provider: "api:openai", model: "m", baseUrl: "u", req: "", handles: makeHandles(ctx) }, { ask: (async () => JSON.stringify({ intent })) as never });
      return (r as { plan: { ok: never } }).plan.ok;
    };
    const close = await go({ t: "close", target: "all", evil: "rm -rf" });
    expect(close).toMatchObject({ t: "close" });
    expect(JSON.stringify(close)).not.toContain("evil");
    expect(policyOf(await go({ t: "tell", targets: ["c1"], text: "hi" }))).toBe("confirm");
    expect(policyOf(await go({ t: "broadcast", text: "hi" }))).toBe("confirm");
    expect(policyOf(await go({ t: "git", op: "push" }))).toBe("confirm");
  });
  it("S-3355 abortPlanner 는 지금 API 요청을 끊는다(plannerApiCancel)", async () => {
    const w = window as unknown as { __fakePlannerApi?: unknown };
    const f = { keys: {}, calls: [] as { reqId: string }[], cancels: [] as string[], ask: () => new Promise<string>(() => {}) };
    w.__fakePlannerApi = f;
    const r = rig({ agent: "api:openai" });
    Object.assign(r.deps, { model: () => "m", baseUrl: () => "http://u/v1" });
    const p = plannerAsk("x", ctx, r.deps);
    await r.tick(); await r.tick();
    expect(f.calls).toHaveLength(1);
    abortPlanner();
    await r.tick();
    expect(f.cancels).toEqual([f.calls[0]!.reqId]);
    expect(await p).toEqual({ fail: { reason: "cancelled" } });
    delete w.__fakePlannerApi;
  });
});
