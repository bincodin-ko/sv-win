import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearOrders, EXPIRE_MS, fmtDuration, judge, QUIET_MS, recentOrders, track, type Snap } from "./report";

const snap = (o: Partial<Snap> = {}): Snap => ({ status: "WORKING", lastOut: 0, agent: true, blocked: false, ...o });

describe("S-611 소요 시간 문구", () => {
  it("2m 10s / 45s / 1h 2m", () => {
    expect(fmtDuration(130)).toBe("2m 10s");
    expect(fmtDuration(45)).toBe("45s");
    expect(fmtDuration(0)).toBe("0s");
    expect(fmtDuration(60)).toBe("1m 0s");
    expect(fmtDuration(3725)).toBe("1h 2m");
  });
});

describe("S-611 끝남 판정", () => {
  const o = { sentAt: 1000, sawWorking: false };
  it("출력이 있고 3초 멈추면 끝났다(소요 = 마지막 출력까지)", () => {
    expect(judge(o, snap({ status: "RUNNING", lastOut: 6000 }), 6000 + QUIET_MS - 1)).toEqual({ state: "working" });
    expect(judge(o, snap({ status: "RUNNING", lastOut: 6000 }), 6000 + QUIET_MS)).toEqual({ state: "finished", secs: 5 });
  });
  it("보낸 뒤 출력이 하나도 없으면 아직이다", () => {
    expect(judge(o, snap({ status: "RUNNING", lastOut: 500 }), 20_000)).toEqual({ state: "working" });
  });
  it("라이브 상태: WORKING 을 본 뒤 READY 면 바로 끝났다", () => {
    expect(judge({ ...o, sawWorking: true }, snap({ status: "READY", lastOut: 2000 }), 4000)).toEqual({ state: "finished", secs: 3 });
    expect(judge({ ...o, sawWorking: false }, snap({ status: "READY", lastOut: 500 }), 4000)).toEqual({ state: "working" });
  });
  it("멈춤·프롬프트 대기(blocked)이면 조용해도 끝난 게 아니다", () => {
    expect(judge(o, snap({ status: "PAUSED", lastOut: 2000, blocked: true }), 60_000)).toEqual({ state: "working" });
    expect(judge(o, snap({ status: "RUNNING", lastOut: 2000, blocked: true }), 60_000)).toEqual({ state: "working" });
  });
  it("에이전트가 끝나거나(셸로 떨어짐) 시작에 실패하면 failed", () => {
    expect(judge(o, snap({ status: "RUNNING", agent: false, lastOut: 4000 }), 9000)).toMatchObject({ state: "failed", reason: expect.stringMatching(/exited/) });
    expect(judge(o, snap({ status: "ERROR" }), 9000)).toMatchObject({ state: "failed" });
    expect(judge(o, snap({ status: "DONE" }), 9000)).toMatchObject({ state: "failed" });
  });
  it("30분이 지나면 폐기", () => {
    const at = 1000 + EXPIRE_MS; // 계속 출력이 나오는 중이어도 30분이면 버린다
    expect(judge(o, snap({ status: "WORKING", lastOut: at - 1 }), at - 1)).toEqual({ state: "working" });
    expect(judge(o, snap({ status: "WORKING", lastOut: at }), at)).toEqual({ state: "expired" });
  });
});

describe("주문 추적기", () => {
  beforeEach(() => { vi.useFakeTimers(); clearOrders(); });
  afterEach(() => vi.useRealTimers());
  const base = { repo: "r", name: "Otto", nodeId: "c1", wsId: "w" };

  it("출력이 3초 멈추면 onEnd 로 finished 를 알리고 기록에 남는다", async () => {
    let s: Snap = snap({ status: "RUNNING", lastOut: 0 });
    const ended = vi.fn();
    track(base, () => s, ended);
    await vi.advanceTimersByTimeAsync(2000);
    s = snap({ status: "WORKING", lastOut: Date.now() });
    await vi.advanceTimersByTimeAsync(1000);
    s = { ...s, status: "RUNNING" };
    await vi.advanceTimersByTimeAsync(1500);
    expect(ended).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(ended).toHaveBeenCalledOnce();
    expect(ended.mock.calls[0]![0].verdict).toMatchObject({ state: "finished" });
    expect(recentOrders("r")[0]!.verdict.state).toBe("finished");
  });
  it("30분 안에 안 끝나면 expired 로 알리고 멈춘다", async () => {
    const ended = vi.fn();
    track(base, () => snap({ status: "WORKING", lastOut: Date.now() }), ended);
    await vi.advanceTimersByTimeAsync(EXPIRE_MS + 1000);
    expect(ended).toHaveBeenCalledOnce();
    expect(ended.mock.calls[0]![0].verdict.state).toBe("expired");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ended).toHaveBeenCalledOnce();
  });
  it("콘솔이 사라지면(snap 이 null) failed 로 끝낸다", async () => {
    const ended = vi.fn();
    track(base, () => null, ended);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ended.mock.calls[0]![0].verdict.state).toBe("failed");
  });
});
