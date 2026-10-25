// S-1371~S-1373
import { describe, expect, it, vi } from "vitest";
import { composePush, pushLine, pushTo, PUSH_CAP, type PushTarget } from "./push";

const INTRO = "Background context for this project (not a task). Reply OK when you have read it.";
const f = (title: string, body = "b", kind = "Context") => ({ kind, title, body });
const factsPart = (text: string) => text.slice(INTRO.length + 1);
const HEAD_A = "- [Context] A: ".length;

describe("composePush S-1372", () => {
  it("소개 줄 + '- [Kind] Title: body' 를 공백으로 이어 붙인다", () => {
    const r = composePush([f("A", "x", "Commands"), f("B", "y")]);
    expect(r.text).toBe(`${INTRO} - [Commands] A: x - [Context] B: y`);
    expect(r).toMatchObject({ included: 2, omitted: 0 });
  });
  it("본문 줄바꿈은 공백 하나로", () => expect(composePush([f("A", "l1\nl2")]).text).toContain("A: l1 l2"));
  it("정확히 상한(3,400자)이면 모두 들어간다", () => {
    const r = composePush([f("A", "x".repeat(PUSH_CAP - HEAD_A))]);
    expect(factsPart(r.text).length).toBe(3400);
    expect(r).toMatchObject({ included: 1, omitted: 0 });
    expect(r.text).not.toContain("more fact");
  });
  it("한 글자 넘으면 그 사실부터 빠지고 '(N more facts not included)'", () => {
    const r = composePush([f("A", "x".repeat(PUSH_CAP - HEAD_A)), f("B"), f("C")]);
    expect(r).toMatchObject({ included: 1, omitted: 2 });
    expect(r.text.endsWith(" (2 more facts not included)")).toBe(true);
    const over = composePush([f("A", "x".repeat(PUSH_CAP - HEAD_A + 1)), f("B")]);
    expect(over).toMatchObject({ included: 0, omitted: 2 });
    expect(over.text.endsWith(" (2 more facts not included)")).toBe(true);
  });
  it("두 번째 사실의 경계: 합계(구분 공백 1자 포함)가 상한 이하일 때까지만", () => {
    const a = f("A", "x".repeat(1000 - HEAD_A));
    const bBody = 3400 - 1000 - 1 - "- [Context] B: ".length;
    expect(composePush([a, f("B", "y".repeat(bBody))]).omitted).toBe(0);
    expect(composePush([a, f("B", "y".repeat(bBody + 1))]).omitted).toBe(1);
  });
  it("순서는 받은 그대로(repo 사실 다음 All 사실은 부르는 쪽이 이어 붙인다)", () => {
    const r = composePush([f("R1"), f("R2"), f("ALL1")]);
    expect(r.text.indexOf("R1")).toBeLessThan(r.text.indexOf("R2"));
    expect(r.text.indexOf("R2")).toBeLessThan(r.text.indexOf("ALL1"));
  });
});

describe("pushLine S-1373", () => {
  it("문구", () => {
    expect(pushLine({ sent: 2, busy: 0, omitted: 0 })).toBe("Sent to 2");
    expect(pushLine({ sent: 2, busy: 1, omitted: 0 })).toBe("Sent to 2 · 1 busy");
    expect(pushLine({ sent: 0, busy: 1, omitted: 0 })).toBe("Nothing sent");
    expect(pushLine({ sent: 1, busy: 0, omitted: 3 })).toBe("Sent to 1 · 3 left out");
    expect(pushLine({ sent: 1, busy: 2, omitted: 3 })).toBe("Sent to 1 · 2 busy · 3 left out");
  });
});

const tgt = (o: Partial<{ agent: boolean; status: string; paused: boolean }> = {}): PushTarget & { w: string[] } => {
  const w: string[] = [];
  return { w, write: (d) => void w.push(d), bracketedPaste: () => false, isAgent: () => o.agent ?? true, status: () => o.status ?? "READY", isPaused: () => o.paused ?? false };
};
describe("pushTo S-1371", () => {
  it("에이전트 콘솔에만 한 줄 + Enter, 셸·폴백은 세지도 않는다, NEEDS YOU·일시중지·시작 중은 busy 로 세고 안 보냄", async () => {
    vi.useFakeTimers();
    const ok = tgt(), shell = tgt({ agent: false }), needs = tgt({ status: "NEEDS YOU" }), paused = tgt({ paused: true }), starting = tgt({ status: "STARTING" });
    const p = pushTo([ok, shell, needs, paused, starting], "hello\nworld");
    await vi.advanceTimersByTimeAsync(200);
    expect(await p).toEqual({ sent: 1, busy: 3 });
    expect(ok.w).toEqual(["hello world", "\r"]);
    for (const t of [shell, needs, paused, starting]) expect(t.w).toEqual([]);
    vi.useRealTimers();
  });
  it("대상이 없으면 아무것도 안 보냄", async () => expect(await pushTo([], "x")).toEqual({ sent: 0, busy: 0 }));
});
