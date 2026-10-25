import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerConfirm, askConfirm, clickConfirm, CONFIRM_MS, isNo, isYes, useConfirm } from "./confirm";
import { useThread } from "./thread";

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); useThread.setState({ byRepo: {}, open: false }); useConfirm.setState({ pending: null }); });
afterEach(() => vi.useRealTimers());
const bots = () => (useThread.getState().byRepo["r"] ?? []).filter((m) => m.role === "bot").map((m) => m.text);

describe("S-601 확인 대기", () => {
  it("yes 변형: yes·confirm·do it·go ahead(대소문자·끝 문장부호 무시)", () => {
    for (const t of ["yes", "Yes", "YES!", "confirm", "do it", "Go ahead", " go ahead. "]) expect(isYes(t), t).toBe(true);
    for (const t of ["yeah maybe", "no", "yes close Dax", "", "kill Dax"]) expect(isYes(t), t).toBe(false);
    for (const t of ["no", "n", "nope", "cancel", "cancel that", "never mind"]) expect(isNo(t), t).toBe(true);
  });
  it("질문을 스레드에 남기고 yes 가 오면 실행한다", () => {
    const run = vi.fn();
    askConfirm("r", "Close Otto and Dax?", run);
    expect(bots()).toEqual(["Close Otto and Dax? Say yes or click Confirm"]);
    expect(useConfirm.getState().pending).not.toBeNull();
    expect(answerConfirm("r", "yes")).toBe("ran");
    expect(run).toHaveBeenCalledOnce();
    expect(useConfirm.getState().pending).toBeNull();
    expect(answerConfirm("r", "yes")).toBe("none");
  });
  it("그 밖의 입력은 취소하고 실행하지 않는다", () => {
    const run = vi.fn();
    askConfirm("r", "Close Otto?", run);
    expect(answerConfirm("r", "no")).toBe("cancelled");
    expect(run).not.toHaveBeenCalled();
    askConfirm("r", "Close Otto?", run);
    expect(answerConfirm("r", "status")).toBe("cancelled");
    expect(run).not.toHaveBeenCalled();
    expect(useConfirm.getState().pending).toBeNull();
  });
  it("스레드의 Confirm 버튼도 실행한다", () => {
    const run = vi.fn();
    askConfirm("r", "Restart Otto?", run);
    clickConfirm();
    expect(run).toHaveBeenCalledOnce();
    expect(useConfirm.getState().pending).toBeNull();
  });
  it("60초가 지나면 취소하고 알린다", () => {
    const run = vi.fn();
    askConfirm("r", "Close Otto?", run);
    vi.advanceTimersByTime(CONFIRM_MS - 1);
    expect(useConfirm.getState().pending).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(useConfirm.getState().pending).toBeNull();
    expect(bots().at(-1)).toMatch(/cancel/i);
    expect(answerConfirm("r", "yes")).toBe("none");
    expect(run).not.toHaveBeenCalled();
  });
  it("새 질문은 앞 질문을 대신한다(앞의 것은 실행되지 않는다)", () => {
    const a = vi.fn(), b = vi.fn();
    askConfirm("r", "A?", a);
    askConfirm("r", "B?", b);
    answerConfirm("r", "yes");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });
  it("다른 repo 의 입력은 대기를 건드리지 않는다", () => {
    const run = vi.fn();
    askConfirm("r", "Close?", run);
    expect(answerConfirm("other", "yes")).toBe("none");
    expect(useConfirm.getState().pending).not.toBeNull();
  });
});
