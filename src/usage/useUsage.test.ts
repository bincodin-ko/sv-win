import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageResult } from "./probe";

const calls: { agent: string; manual: boolean }[] = [];
let nowMs = 1_000_000;
vi.mock("./probe", async (orig) => ({
  ...(await orig<typeof import("./probe")>()),
  checkUsage: async (agent: string, o: { manual: boolean }): Promise<UsageResult> => {
    calls.push({ agent, manual: o.manual });
    return { at: nowMs, agent, parsed: { windows: [{ label: "Current session", pct: 10, resetText: "4pm" }] }, raw: "r", state: "ok" };
  },
}));
vi.mock("../hidden/screen", async (orig) => ({ ...(await orig<typeof import("../hidden/screen")>()), realClock: { now: () => nowMs, sleep: async () => {}, after: () => () => {} } }));

import { useUsage, usageKey } from "./useUsage";

beforeEach(() => {
  calls.length = 0;
  nowMs = 1_000_000;
  useUsage.setState({ results: {}, busy: {} });
});
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("S-1518 확인 시점", () => {
  it("보드가 열리면: 확인한 적 없으면 백그라운드(manual:false)로 확인", async () => {
    useUsage.getState().boardOpened(["claude"]);
    await tick();
    expect(calls).toEqual([{ agent: "claude", manual: false }]);
  });
  it("보드가 열려도 3분 안이면 안 한다, 3분 지나면 한다", async () => {
    await useUsage.getState().check("claude", { manual: false });
    calls.length = 0;
    nowMs += 179_000;
    useUsage.getState().boardOpened(["claude"]);
    await tick();
    expect(calls).toEqual([]);
    nowMs += 2_000;
    useUsage.getState().boardOpened(["claude"]);
    await tick();
    expect(calls).toEqual([{ agent: "claude", manual: false }]);
  });
  it("popover 열기: 30초 안이면 안 하고, 지나면 사용자 확인(manual:true)", async () => {
    await useUsage.getState().check("claude", { manual: true });
    calls.length = 0;
    nowMs += 29_000;
    await useUsage.getState().ensureFresh("claude", 30_000, true);
    expect(calls).toEqual([]);
    nowMs += 2_000;
    await useUsage.getState().ensureFresh("claude", 30_000, true);
    expect(calls).toEqual([{ agent: "claude", manual: true }]);
  });
  it("새로고침(check)은 시각과 상관없이 바로", async () => {
    await useUsage.getState().check("claude", { manual: true });
    await useUsage.getState().check("claude", { manual: true });
    expect(calls.length).toBe(2);
  });
  it("진행 중이면 같은 확인을 또 시작하지 않는다", async () => {
    void useUsage.getState().check("claude", { manual: true });
    void useUsage.getState().check("claude", { manual: true });
    await tick();
    expect(calls.length).toBe(1);
  });
});

describe("S-1520 결과는 메모리에, 에이전트·계정마다", () => {
  it("키는 agent 또는 agent:계정", async () => {
    expect(usageKey("claude")).toBe("claude");
    expect(usageKey("claude", "work")).toBe("claude:work");
    await useUsage.getState().check("claude", { manual: true });
    await useUsage.getState().check("claude", { manual: true, account: "work" });
    expect(Object.keys(useUsage.getState().results).sort()).toEqual(["claude", "claude:work"]);
    expect(useUsage.getState().results["claude"]).toMatchObject({ at: 1_000_000, state: "ok", raw: "r" });
  });
  it("앱을 켜면 비어 있다(저장하지 않는다)", () => {
    expect(localStorage.getItem("symvibe.usage")).toBeNull();
    expect(useUsage.getState().results).toEqual({});
  });
});
