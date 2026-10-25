import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeClock } from "../hidden/fakeclock";
import { runHidden } from "../hidden/probe";
import { readReply } from "../hidden/reply";
import { ask } from "./ask";

vi.mock("../hidden/probe", () => ({ runHidden: vi.fn() }));
vi.mock("../hidden/reply", () => ({ readReply: vi.fn(async () => null) }));
vi.mock("../profiles/env", () => ({ profileEnvFor: vi.fn(async () => [["CLAUDE_CONFIG_DIR", "D:\\prof\\a"]]) }));
afterEach(() => vi.clearAllMocks());

describe("FX1 S-1624·S-1628 ask 는 프로필 폴더로 답을 읽는다", () => {
  it("readReply 대상에 configDir = 프로필 env 쌍의 값", async () => {
    const clock = fakeClock();
    const sess = { sessionId: "u1", startedAt: clock.now(), lastOutputAt: () => 0, type: vi.fn(async () => ({ blocked: false })), waitQuiet: vi.fn(async () => ({ blocked: false })), close: vi.fn() };
    vi.mocked(runHidden).mockImplementation((async (_o: unknown, fn: (s: typeof sess) => Promise<unknown>) => fn(sess)) as never);
    let n = 0;
    vi.mocked(readReply).mockImplementation(async () => (n++ ? "answer" : null));
    const p = ask({ agent: "claude", repo: "C:\\r", prompt: "hi", timeoutMs: 600000, clock });
    await clock.advance(20000);
    expect(await p).toBe("answer");
    expect(vi.mocked(readReply).mock.calls.length).toBeGreaterThan(1);
    for (const [t] of vi.mocked(readReply).mock.calls) expect(t.configDir).toBe("D:\\prof\\a");
  });
});
