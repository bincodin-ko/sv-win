import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../i18n";
import { helpText, laterText, needsPlannerText, orchestratorAddedText, smallTalkText, statusText, whoFinishedText } from "./answers";
import { answerConfirm, askConfirm, CONFIRM_MS, isNo, isYes, useConfirm } from "./confirm";
import { fmtDuration, type Order } from "./report";
import { useThread } from "./thread";

// K8 S-2520~S-2522: 답 문구는 화면 언어를 따른다. 끝에 영어로 복원.
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); setLang("ko"); useThread.setState({ byRepo: {}, open: false }); useConfirm.setState({ pending: null }); });
afterEach(() => { vi.useRealTimers(); setLang("en"); });

const r = (name: string, status: string, needsYou = false) => ({ name, status, needsYou });
const ord = (name: string, verdict: Order["verdict"], sentAt = 0): Order => ({ id: 1, repo: "r", name, nodeId: "c", wsId: "w", sentAt, sawWorking: true, verdict });
const bots = () => (useThread.getState().byRepo["r"] ?? []).filter((m) => m.role === "bot").map((m) => m.text);

describe("S-2521 상태 한 줄 · 누가 끝났어 · 시간", () => {
  it("statusText: 5개 콘솔", () => {
    expect(statusText([r("Otto", "RUNNING", true), r("Dax", "WORKING"), r("Bex", "WORKING"), r("Cy", "RUNNING"), r("Di", "IDLE")]))
      .toBe("콘솔 5개: 작업 중 2, 확인 필요 1 (Otto), 준비됨 2");
    expect(statusText([r("Otto", "PAUSED")])).toBe("콘솔 1개: 일시 중지 1");
    expect(statusText([])).toBe("아직 콘솔이 없어요.");
  });
  it("fmtDuration: 분/초/시간", () => {
    expect(fmtDuration(192)).toBe("3분 12초");
    expect(fmtDuration(45)).toBe("45초");
    expect(fmtDuration(3720)).toBe("1시간 2분");
  });
  it("whoFinishedText", () => {
    const t = whoFinishedText(
      [ord("Otto", { state: "finished", secs: 130 }), ord("Dax", { state: "working" }, 0), ord("Bex", { state: "failed", secs: 4, reason: "the agent exited" }), ord("Cy", { state: "expired" })],
      ["Eli"], 65_000);
    expect(t.split("\n")).toEqual([
      "Otto 끝남 · 2분 10초", "Dax 아직 작업 중 · 1분 5초", "Bex 실패: 에이전트가 끝났어요", "Cy 30분이 지나도 답이 없었어요", "Eli 확인 필요",
    ]);
    expect(whoFinishedText([], [], 0)).toBe("아직 보낸 지시가 없어요.");
  });
});

describe("S-2520 고정 문구", () => {
  it("한국어로 나오고 영어 상수는 그대로", () => {
    expect(laterText()).toBe("이 버전에서는 아직 쓸 수 없어요.");
    expect(needsPlannerText()).toContain("@Otto 테스트 돌려");
    expect(smallTalkText()).toBe("언제든지요. 다음에 할 일을 말해 주세요.");
    expect(orchestratorAddedText("Group 1", 2)).toBe("Group 1용 오케스트레이터를 추가했어요. 콘솔 2개와 연결했어요.");
    expect(orchestratorAddedText(null, 0)).toBe("오케스트레이터를 추가했어요.");
  });
  it("도움말: 첫 줄과 예문이 한국어", () => {
    const h = helpText().split("\n");
    expect(h[0]).toBe("이런 걸 할 수 있어요:");
    expect(helpText()).toContain("클로드 세 개 띄워");
    expect(helpText()).toContain("그룹 만들어");
    expect(helpText()).not.toMatch(/spawn|pause/i);
  });
  it("S-2985 도움말 마지막 줄(플래너)이 한국어", () => {
    const h = helpText().split("\n");
    expect(h).toHaveLength(18);
    expect(h.at(-1)).toContain("플래너");
    expect(h.at(-1)).not.toMatch(/planner/i);
  });
  it("영어 화면에서는 영어 그대로", () => {
    setLang("en");
    expect(statusText([r("Otto", "WORKING")])).toBe("1 console: 1 working");
    expect(helpText().split("\n")[0]).toBe("Here is what I can do:");
    expect(laterText()).toBe("That isn't available in this version yet.");
  });
});

describe("확인 질문 · 취소", () => {
  it("질문 끝말과 시간 초과 취소가 한국어, 한국어 예/아니오를 알아듣는다", () => {
    askConfirm("r", "Otto 닫을까요?", vi.fn());
    expect(bots()).toEqual(["Otto 닫을까요? 예라고 말하거나 확인을 누르세요"]);
    vi.advanceTimersByTime(CONFIRM_MS + 1);
    expect(bots().at(-1)).toBe("취소했어요: 60초 안에 답이 없었어요.");
    for (const x of ["네", "예", "응", "확인", "yes"]) expect(isYes(x), x).toBe(true);
    for (const x of ["아니", "아니요", "싫어", "취소", "no"]) expect(isNo(x), x).toBe(true);
    const run = vi.fn();
    askConfirm("r", "Otto 닫을까요?", run);
    expect(answerConfirm("r", "네")).toBe("ran");
    expect(run).toHaveBeenCalledOnce();
  });
  it("저장된 Thread 글은 그때의 언어 그대로 남는다(S-2522)", () => {
    askConfirm("r", "Otto 닫을까요?", vi.fn());
    setLang("en");
    expect(bots()[0]).toContain("예라고 말하거나");
  });
});
