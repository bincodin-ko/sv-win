import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeClock } from "../hidden/fakeclock";
import { closeAllHidden } from "../hidden/probe";
import { fakePty } from "../lib/ipc";
import { JUDGE_TIMEOUT_MS, judgeGoal } from "./judge";
import type { Loop } from "./types";

const REPO = "C:\\fake\\repo";
const w = window as unknown as { __fakeReply?: string | null };
const real = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Clock = ReturnType<typeof fakeClock>;
async function drive(c: Clock, ms: number) {
  for (let t = 0; t < ms; t += 250) {
    await c.advance(250);
    await real(15);
  }
}
const loop = (goal: Loop["stop"]["goal"]): Loop => ({ id: "l1", name: "L", instruction: "go", trigger: { kind: "idle" }, target: { kind: "all" }, stop: { goal }, keepBehind: false, enabled: true, wsId: "w", repo: REPO });
const kills = (id: number) => fakePty.ctl().filter((c) => c.id === id && c.op === "kill").length;
const agentGoal = () => loop({ mode: "agent", text: "All tests pass", agent: "claude" });
afterEach(() => {
  closeAllHidden();
  delete w.__fakeReply;
});

/** 판정을 시작해 질문을 보낸 뒤 reply 를 심고(null 이면 안 심고) tail 만큼 흘린다 */
async function judge(l: Loop, reply: string | null, o: { timeoutMs?: number; tail?: number; first?: string } = {}) {
  const before = fakePty.spawns().length;
  const clock = fakeClock();
  const p = judgeGoal(l, REPO, { clock, timeoutMs: o.timeoutMs });
  await vi.waitFor(() => expect(fakePty.spawns().length).toBeGreaterThan(before));
  const id = fakePty.spawns().at(-1)!.id;
  fakePty.emit(id, o.first ?? "ready\r\n");
  await drive(clock, 2500);
  await real(300);
  await drive(clock, 500);
  if (reply !== null) w.__fakeReply = reply;
  await drive(clock, o.tail ?? 9000);
  return { v: await p, id };
}

describe("S-1470 judgeGoal", () => {
  it("질문은 목표 글을 담고, repo 에서 연다", async () => {
    const { id } = await judge(agentGoal(), "MET");
    expect(fakePty.writes(id).join("")).toContain("All tests pass");
    expect(fakePty.spawns().find((s) => s.id === id)!.cwd).toBe(REPO);
  });
  it("MET → met, 끝나면 세션을 닫는다", async () => {
    const { v, id } = await judge(agentGoal(), "MET");
    expect(v).toBe("met");
    expect(kills(id)).toBe(1);
  });
  it("NOT MET → notMet", async () => {
    expect((await judge(agentGoal(), "NOT MET")).v).toBe("notMet");
  });
  it("그 밖의 답 → unknown", async () => {
    expect((await judge(agentGoal(), "Hard to say.")).v).toBe("unknown");
  });
  it("시간 초과(5분) → unknown", async () => {
    expect(JUDGE_TIMEOUT_MS).toBe(300_000);
    const { v, id } = await judge(agentGoal(), null, { timeoutMs: 6000, tail: 8000 });
    expect(v).toBe("unknown");
    expect(kills(id)).toBeGreaterThanOrEqual(1);
  });
  it("막힘(로그아웃) → unknown", async () => {
    const { v } = await judge(agentGoal(), null, { first: "Select login method\r\n", tail: 1000 });
    expect(v).toBe("unknown");
  });
  it("에이전트 목표가 아니면 세션을 열지 않고 unknown", async () => {
    const before = fakePty.spawns().length;
    expect(await judgeGoal(loop({ mode: "command", text: "npm test" }), REPO)).toBe("unknown");
    expect(await judgeGoal(loop(undefined), REPO)).toBe("unknown");
    expect(fakePty.spawns().length).toBe(before);
  });
});
