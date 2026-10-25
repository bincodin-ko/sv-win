import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeClock } from "../hidden/fakeclock";
import { runHidden } from "../hidden/probe";
import { readReply } from "../hidden/reply";
import { effortLimitMs, skipCodexUpdate, studioRun, type StudioPhase, type StudioResult } from "./run";

vi.mock("../hidden/probe", () => ({ runHidden: vi.fn() }));
vi.mock("../hidden/reply", () => ({ readReply: vi.fn() }));
vi.mock("../profiles/env", () => ({ profileEnvFor: vi.fn(async () => [["X", "1"]]) }));

type Fake = {
  sessionId: string;
  startedAt: number;
  lastOutputAt: () => number;
  type: ReturnType<typeof vi.fn>;
  waitQuiet: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};
let clock: ReturnType<typeof fakeClock>;
let sess: Fake;
let reply: string | null;
let lastOut: number;
let blocked: string | null;
let opts: Record<string, unknown>;
const closed = () => sess.close.mock.calls.length;

beforeEach(() => {
  clock = fakeClock();
  reply = null;
  blocked = null;
  lastOut = clock.now();
  sess = {
    sessionId: "u1",
    startedAt: clock.now(),
    lastOutputAt: () => lastOut,
    type: vi.fn(async () => ({ blocked: false })),
    waitQuiet: vi.fn(async () => (blocked ? { blocked: true, screen: blocked } : { blocked: false })),
    close: vi.fn(),
  };
  vi.mocked(readReply).mockImplementation(async () => reply);
  // 진짜 runHidden 처럼: 일이 끝나면(실패해도) 닫는다
  vi.mocked(runHidden).mockImplementation((async (o: Record<string, unknown>, fn: (s: Fake) => Promise<unknown>) => {
    opts = o;
    try {
      return await fn(sess);
    } finally {
      sess.close();
    }
  }) as never);
});
afterEach(() => vi.clearAllMocks());

function start(extra: Record<string, unknown> = {}) {
  const phases: StudioPhase[] = [];
  const texts: string[] = [];
  let res: StudioResult | undefined;
  void studioRun({
    agentId: "claude",
    cwd: "C:\\r",
    prompt: "draw",
    limitMs: effortLimitMs("balanced"),
    onStatus: (p: StudioPhase) => phases.push(p),
    onText: (t: string) => texts.push(t),
    clock,
    ...extra,
  } as never).then((r) => (res = r));
  return { phases, texts, res: () => res };
}

describe("S-2026 studioRun", () => {
  it("노력별 한도 6/12/25분", () => {
    expect([effortLimitMs("quick"), effortLimitMs("balanced"), effortLimitMs("thorough")]).toEqual([6 * 60000, 12 * 60000, 25 * 60000]);
  });
  it("프롬프트를 한 번 입력하고 launching→thinking→writing→finishing→ok", async () => {
    const r = start();
    expect(r.phases[0]).toBe("launching");
    await clock.advance(2000);
    expect(sess.type).toHaveBeenCalledTimes(1);
    expect(sess.type).toHaveBeenCalledWith("draw");
    expect(r.phases).toEqual(["launching", "thinking"]);
    reply = "partial";
    lastOut = clock.now();
    await clock.advance(2000);
    expect(r.phases).toEqual(["launching", "thinking", "writing"]);
    expect(r.texts.at(-1)).toBe("partial");
    reply = "partial and more";
    lastOut = clock.now();
    await clock.advance(1000);
    expect(r.texts.at(-1)).toBe("partial and more");
    await clock.advance(4000); // 조용해짐 → finishing
    expect(r.phases.at(-1)).toBe("finishing");
    expect(r.res()).toBeUndefined();
    await clock.advance(6000); // 8초 조용
    expect(r.res()).toEqual({ ok: true, text: "partial and more" });
    expect(closed()).toBeGreaterThan(0);
  });
  it("질문하기 전 마지막 답(baseline)은 새 답이 아니다", async () => {
    reply = "old";
    const r = start();
    await clock.advance(30000);
    expect(r.res()).toBeUndefined();
    expect(r.phases).not.toContain("writing");
    reply = "new";
    await clock.advance(10000);
    expect(r.res()).toEqual({ ok: true, text: "new" });
  });
  it("프로필 환경을 넘기고 Yolo·print 인자는 없다", async () => {
    start();
    await clock.advance(1500);
    expect(opts.env).toEqual([["X", "1"]]);
    expect(opts.agentId).toBe("claude");
    expect(opts.cwd).toBe("C:\\r");
    expect(opts.args).toBeUndefined();
    // Yolo 는 runHidden→hiddenSession 이 항상 noYolo:true 로 막는다(probe.test.ts). runHidden 을 가짜로 둔 이 시험은 args 없음까지만 본다
  });
  it("FX1 S-1624·S-1628: 프로필 Use 면 readReply 가 프로필 폴더(env 쌍의 값)로 불린다", async () => {
    start();
    await clock.advance(1500);
    expect(vi.mocked(readReply).mock.calls.length).toBeGreaterThan(0);
    for (const [t] of vi.mocked(readReply).mock.calls) expect(t.configDir).toBe("1");
  });
  it("Stop: 지금까지 온 글과 함께 {stopped} 로 끝나고 세션을 닫는다", async () => {
    const ac = new AbortController();
    const r = start({ signal: ac.signal });
    await clock.advance(2000);
    reply = "half";
    lastOut = clock.now();
    await clock.advance(1500);
    ac.abort();
    await clock.advance(1500);
    expect(r.res()).toEqual({ stopped: true, text: "half" });
    expect(closed()).toBeGreaterThan(0);
  });
  it("한도: 프롬프트 보낸 뒤 limitMs 가 지나면 {timeout}", async () => {
    const r = start({ limitMs: 60000, noOutputMs: 10 * 60000 });
    await clock.advance(0); // 세션이 열려 프롬프트가 나간 뒤부터 센다
    await clock.advance(59000);
    expect(r.res()).toBeUndefined();
    await clock.advance(3000);
    expect(r.res()).toEqual({ timeout: true, text: "" });
    expect(closed()).toBeGreaterThan(0);
  });
  it("200초 동안 출력(PTY·transcript 둘 다)이 없으면 {timeout}", async () => {
    const r = start({ limitMs: 25 * 60000 });
    await clock.advance(0);
    await clock.advance(190000);
    expect(r.res()).toBeUndefined();
    await clock.advance(20000);
    expect(r.res()).toEqual({ timeout: true, text: "" });
  }, 30000);
  it("transcript 가 자라면 PTY 가 조용해도 무출력으로 세지 않는다", async () => {
    const r = start({ limitMs: 25 * 60000 });
    await clock.advance(0);
    for (let i = 1; i <= 50; i++) {
      reply = "x".repeat(i); // PTY 는 그대로(lastOut 고정), 글만 5초마다 늘어남 → 250초 동안 무출력 아님
      await clock.advance(5000);
    }
    expect(r.res()).toBeUndefined();
  }, 30000);
  it("막힘: {blocked, why}, 대신 답하지 않는다(type 은 프롬프트 한 번뿐)", async () => {
    const r = start();
    await clock.advance(2000);
    blocked = "Do you trust the files in this folder?";
    await clock.advance(2000);
    const res = r.res() as { blocked: true; why: string };
    expect(res.blocked).toBe(true);
    expect(res.why).toContain("trust the files");
    expect(sess.type).toHaveBeenCalledTimes(1);
    expect(closed()).toBeGreaterThan(0);
  });
  it("프롬프트 입력 중 막힘도 {blocked}", async () => {
    sess.type.mockResolvedValue({ blocked: true, screen: "Select login method" });
    const r = start();
    await clock.advance(1500);
    expect(r.res()).toMatchObject({ blocked: true });
  });
  it("세션 오류는 {error} 로, 세션은 닫힌다", async () => {
    sess.type.mockRejectedValue(new Error("boom"));
    const r = start();
    await clock.advance(1500);
    expect(r.res()).toEqual({ error: "boom" });
    expect(closed()).toBeGreaterThan(0);
  });
  it("세션이 제한 시간으로 timeout 을 던지면 {timeout}", async () => {
    sess.type.mockRejectedValue(new Error("timeout"));
    const r = start();
    await clock.advance(1500);
    expect(r.res()).toEqual({ timeout: true, text: "" });
  });
  it("S-1985 Codex 만 업데이트 질문 답 함수를 세션에 준다", async () => {
    start({ agentId: "codex" });
    await clock.advance(100);
    expect(opts.answerBlocked).toBe(skipCodexUpdate);
    start({ agentId: "claude" });
    await clock.advance(100);
    expect(opts.answerBlocked).toBeUndefined();
  });
});

describe("S-1985 skipCodexUpdate", () => {
  it("Skip 번호 + Enter", () => {
    const s =
      " Update available! 0.40.0 -> 0.41.0\n\n 1. Update now (runs `npm install -g @openai/codex`)\n 2. Skip\n 3. Skip until next version\n\n Press enter to continue";
    expect(skipCodexUpdate(s)).toBe("2\r");
  });
  it("Skip 이 없고 'Skip until' 만 있으면 그것", () => {
    expect(skipCodexUpdate("Update available!\n 1. Update now\n 2. Skip until next version")).toBe("2\r");
  });
  it("업데이트 화면이 아니거나 선택지를 못 알아보면 null(막힘으로 끝냄)", () => {
    expect(skipCodexUpdate("Do you trust the files in this folder?\n 1. Yes\n 2. Skip")).toBeNull();
    expect(skipCodexUpdate("Update available! press enter")).toBeNull();
  });
});
