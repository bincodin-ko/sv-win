import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaver, SAVE_DELAY, DRAFT_DELAY, type StatusText } from "./status";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const mk = (res: () => "ok" | "changed" | "fail" = () => "ok") => {
  const log: StatusText[] = [];
  const save = vi.fn(async () => res());
  const draft = vi.fn();
  const clearDraft = vi.fn();
  const s = createSaver({ save, draft, clearDraft, onStatus: (t) => log.push(t) });
  return { s, log, save, draft, clearDraft };
};

describe("S-1928 자동 저장 1.5초", () => {
  it("상수", () => { expect(SAVE_DELAY).toBe(1500); expect(DRAFT_DELAY).toBe(300); });
  it("입력을 멈추고 1.5초 뒤에 저장하고, 계속 치면 미룬다", async () => {
    const { s, save, log } = mk();
    s.edit();
    await vi.advanceTimersByTimeAsync(1000);
    s.edit();
    await vi.advanceTimersByTimeAsync(1400);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(save).toHaveBeenCalledTimes(1);
    expect(log).toEqual(["Saving…", "Saved"]);
    expect(s.dirty()).toBe(false);
  });
  it("saveNow(Ctrl+S)는 바로 저장", async () => {
    const { s, save } = mk();
    s.edit();
    await s.saveNow();
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("S-1929·S-1931 상태 전이·초안", () => {
  it("입력 300ms 뒤 초안, 저장되면 초안 지움", async () => {
    const { s, draft, clearDraft } = mk();
    s.edit();
    await vi.advanceTimersByTimeAsync(299);
    expect(draft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(draft).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(clearDraft).toHaveBeenCalled();
  });
  it("실패하면 Could not save, 초안·dirty 유지, 다음 입력에 다시 시도", async () => {
    let r: "ok" | "fail" = "fail";
    const { s, log, save, clearDraft } = mk(() => r);
    s.edit();
    await vi.advanceTimersByTimeAsync(1600);
    expect(log.at(-1)).toBe("Could not save");
    expect(s.dirty()).toBe(true);
    expect(clearDraft).not.toHaveBeenCalled();
    r = "ok";
    s.edit();
    await vi.advanceTimersByTimeAsync(1600);
    expect(save).toHaveBeenCalledTimes(2);
    expect(log.at(-1)).toBe("Saved");
  });
  it("디스크가 달라졌으면(changed) Found a change on disk, dirty 유지", async () => {
    const { s, log } = mk(() => "changed");
    s.edit();
    await vi.advanceTimersByTimeAsync(1600);
    expect(log.at(-1)).toBe("Found a change on disk");
    expect(s.dirty()).toBe(true);
  });
  it("recovered 는 상태를 띄우고 자동 저장이 이어서 쓴다", async () => {
    const { s, log, save } = mk();
    s.recovered();
    expect(log).toEqual(["Recovered unsaved edits"]);
    await vi.advanceTimersByTimeAsync(1600);
    expect(save).toHaveBeenCalledTimes(1);
    expect(log.at(-1)).toBe("Saved");
  });
  it("S-1932 settled 는 저장이 끝날 때까지 기다린다", async () => {
    let done!: () => void;
    const s = createSaver({ save: () => new Promise((r) => (done = () => r("ok"))), draft() {}, clearDraft() {}, onStatus() {} });
    s.edit();
    await vi.advanceTimersByTimeAsync(1600);
    let fin = false;
    void s.settled().then(() => (fin = true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(fin).toBe(false);
    done();
    await vi.advanceTimersByTimeAsync(10);
    expect(fin).toBe(true);
  });
  it("S-1932 settled 는 3초가 지나면 포기하고 돌아온다", async () => {
    const s = createSaver({ save: () => new Promise(() => {}), draft() {}, clearDraft() {}, onStatus() {} });
    s.edit();
    await vi.advanceTimersByTimeAsync(1600);
    let fin = false;
    void s.settled().then(() => (fin = true));
    await vi.advanceTimersByTimeAsync(3100);
    expect(fin).toBe(true);
  });
});
