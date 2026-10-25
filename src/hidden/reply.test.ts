import { afterEach, describe, expect, it, vi } from "vitest";
import { codexFindSession, lastReply } from "../lib/ipc";
import { fakeClock } from "./fakeclock";
import { readReply, waitReply } from "./reply";

vi.mock("../lib/ipc", async (orig) => {
  const m = await orig<typeof import("../lib/ipc")>();
  return { ...m, codexFindSession: vi.fn(async () => null), lastReply: vi.fn(m.lastReply) }; // lastReply: 인자를 기록하며 가짜 구현 그대로
});
const w = window as unknown as { __fakeReply?: Record<string, string> | string | null };
afterEach(() => {
  delete w.__fakeReply;
  vi.mocked(codexFindSession).mockReset();
});

describe("S-1206 readReply", () => {
  it("Claude: 준 session-id 의 transcript 마지막 답", async () => {
    w.__fakeReply = { u1: "hello", u2: "other" };
    expect(await readReply({ agentId: "claude", cwd: "C:\\r", sessionId: "u1", startedAtMs: 0 })).toBe("hello");
    expect(await readReply({ agentId: "claude", cwd: "C:\\r", sessionId: "none", startedAtMs: 0 })).toBeNull();
    expect(codexFindSession).not.toHaveBeenCalled();
  });
  it("Codex: cwd + 시작 시각으로 세션을 짝지은 뒤 읽는다", async () => {
    vi.mocked(codexFindSession).mockResolvedValue("cx1");
    w.__fakeReply = { cx1: "codex says" };
    expect(await readReply({ agentId: "codex", cwd: "C:\\r", startedAtMs: 555 })).toBe("codex says");
    expect(codexFindSession).toHaveBeenCalledWith("C:\\r", 555, [], undefined); // 프로필 없음 = 설정 폴더 인자 없음
  });
  it("FX1 S-1624·S-1628: configDir 를 주면 codexFindSession·lastReply 의 4번째 인자로 넘긴다", async () => {
    vi.mocked(codexFindSession).mockResolvedValue("cx1");
    w.__fakeReply = { cx1: "codex says", u1: "claude says" };
    expect(await readReply({ agentId: "codex", cwd: "C:\\r", startedAtMs: 555, configDir: "D:\\prof\\cx" })).toBe("codex says");
    expect(codexFindSession).toHaveBeenCalledWith("C:\\r", 555, [], "D:\\prof\\cx");
    expect(lastReply).toHaveBeenLastCalledWith("codex", "C:\\r", "cx1", "D:\\prof\\cx");
    expect(await readReply({ agentId: "claude", cwd: "C:\\r", sessionId: "u1", startedAtMs: 0, configDir: "D:\\prof\\cl" })).toBe("claude says");
    expect(lastReply).toHaveBeenLastCalledWith("claude", "C:\\r", "u1", "D:\\prof\\cl");
  });
  it("Codex 세션을 못 찾으면 null(화면 글자로 대신하지 않는다)", async () => {
    w.__fakeReply = "화면에 보이는 글자";
    expect(await readReply({ agentId: "codex", cwd: "C:\\r", startedAtMs: 1 })).toBeNull();
  });
});

describe("S-1207 waitReply", () => {
  const base = { agentId: "claude", cwd: "C:\\r", sessionId: "u1", startedAtMs: 0 };
  it("새 글이 생기고 8초 조용해야 끝난다", async () => {
    const clock = fakeClock();
    w.__fakeReply = { u1: "old" };
    let lastOut = clock.now();
    let done: string | null = null;
    void waitReply({ ...base, baseline: "old", lastOutputAt: () => lastOut, clock }).then((r) => (done = r));
    await clock.advance(20000);
    expect(done).toBeNull(); // 아직 옛 답 그대로
    w.__fakeReply = { u1: "new" };
    lastOut = clock.now();
    await clock.advance(7000);
    expect(done).toBeNull(); // 조용한 지 8초 전
    await clock.advance(2000);
    expect(done).toBe("new");
  });
  it("새 글이 와도 출력이 계속되면 기다린다", async () => {
    const clock = fakeClock();
    w.__fakeReply = { u1: "a" };
    let lastOut = clock.now();
    let done: string | null = null;
    void waitReply({ ...base, baseline: null, lastOutputAt: () => lastOut, clock }).then((r) => (done = r));
    for (let i = 0; i < 6; i++) {
      await clock.advance(5000);
      lastOut = clock.now();
    }
    expect(done).toBeNull();
    await clock.advance(8500);
    expect(done).toBe("a");
  });
  it("제한 시간이 지나면 timeout", async () => {
    const clock = fakeClock();
    w.__fakeReply = { u1: "old" };
    const err = waitReply({ ...base, baseline: "old", lastOutputAt: () => 0, timeoutMs: 30000, clock }).catch((e: Error) => e);
    await clock.advance(31000);
    expect(((await err) as Error).message).toMatch(/timeout/);
  });
});
