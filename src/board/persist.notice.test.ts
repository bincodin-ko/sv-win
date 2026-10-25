// S-2666: 보드 저장 실패 알림 — 같은 보드의 연속 실패는 30초에 한 번, 재시도(dirty 유지)는 그대로
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/notice", () => ({ showNotice: vi.fn() }));
import { showNotice } from "../lib/notice";
import { createAutosave, flushAll } from "./persist";

const TEXT = "Couldn't save the board. It will keep trying.";
beforeEach(() => { vi.useFakeTimers(); vi.mocked(showNotice).mockClear(); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("S-2666 저장 실패 알림", () => {
  it("자동 저장이 실패하면 알림 한 번", async () => {
    const save = vi.fn(async () => { throw new Error("disk"); });
    const a = createAutosave({ save });
    a.touch();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(showNotice).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showNotice).mock.calls[0][0]).toBe(TEXT);
    a.dispose();
  });
  it("연속 실패는 30초에 한 번만, 30초 뒤엔 다시. 재시도는 계속", async () => {
    const save = vi.fn(async () => { throw new Error("disk"); });
    const a = createAutosave({ save });
    a.touch();
    await vi.advanceTimersByTimeAsync(2000);
    await a.flush(); // 곧바로 재시도(dirty 유지) — 또 실패
    expect(save).toHaveBeenCalledTimes(2);
    expect(showNotice).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await a.flush();
    expect(save).toHaveBeenCalledTimes(3);
    expect(showNotice).toHaveBeenCalledTimes(2);
    a.dispose();
  });
  it("종료 때 flushAll 실패도 같은 알림", async () => {
    const a = createAutosave({ save: async () => { throw new Error("disk"); } });
    a.touch();
    await flushAll();
    expect(showNotice).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showNotice).mock.calls[0][0]).toBe(TEXT);
    a.dispose();
  });
  it("성공하면 알림 없음", async () => {
    const a = createAutosave({ save: async () => {} });
    a.touch();
    await vi.advanceTimersByTimeAsync(2000);
    expect(showNotice).not.toHaveBeenCalled();
    a.dispose();
  });
});
