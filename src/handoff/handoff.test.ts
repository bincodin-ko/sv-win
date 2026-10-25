import { describe, it, expect } from "vitest";
import { createHandoff, type HSrc } from "./handoff";
import { fakeClock } from "./fake";
import type { HSession } from "./types";

const REQ = "Please summarize this task and where it stands, so another agent can continue it from exactly this state. Reply with the summary only.";
const sec = (n: number) => n * 1000;
type Fake = HSession & { mark(): void };

function setup(o: { srcs?: HSrc[]; answerAfter?: number | null; trustUntil?: number | null } = {}) {
  const clk = fakeClock();
  const said: string[] = [];
  const typed: { id: string; text: string }[] = [];
  const spawned: [string, string][] = [];
  const srcs = o.srcs ?? [{ id: "c1", name: "Otto", agent: true, status: "READY" }];
  const sess: Record<string, Fake> = {};
  const after = o.answerAfter === undefined ? sec(20) : o.answerAfter;
  // 요청을 받으면 2초 뒤부터 WORKING, after 가 지나면 READY 로 돌아오며 새 답을 낸다
  const mkSrc = (): Fake => {
    let sent = -1;
    const working = () => sent >= 0 && after !== null && clk.now() - sent >= sec(2) && clk.now() - sent < after;
    const done = () => sent >= 0 && after !== null && clk.now() - sent >= after;
    return {
      write() {}, bracketedPaste: () => false, isAgent: () => true, hasOutput: () => true, tail: () => [],
      status: () => (working() ? "WORKING" : "READY"),
      lastDataAt: () => (done() ? sent + after! : 0),
      fetchReply: async () => (done() ? "SUMMARY" : "OLD"),
      mark: () => { sent = clk.now(); },
    };
  };
  for (const s of srcs) sess[s.id] = mkSrc();
  let born = 0;
  const mkNew = (): Fake => ({
    write() {}, bracketedPaste: () => false, isAgent: () => true,
    hasOutput: () => clk.now() - born >= sec(3),
    status: () => "READY", lastDataAt: () => 0, fetchReply: async () => null, mark() {},
    tail: () => (o.trustUntil != null && clk.now() - born < o.trustUntil ? ["Do you trust the files in this folder?"] : []),
  });
  const h = createHandoff({
    now: clk.now, sleep: clk.sleep, say: (t) => said.push(t),
    submit: async (w, text) => {
      const id = Object.keys(sess).find((k) => sess[k] === w) ?? "?";
      typed.push({ id, text });
      (w as Fake).mark();
    },
    sources: () => srcs, session: (id) => sess[id],
    spawn: (agentId, beside) => { spawned.push([agentId, beside]); born = clk.now(); sess.n1 = mkNew(); return "n1"; },
    nameOf: (id) => (id === "n1" ? "Cleo" : srcs.find((s) => s.id === id)?.name ?? id),
  });
  return { h, clk, said, typed, spawned };
}

describe("D14 Handoff", () => {
  it("S-1680 내장 5종만", async () => {
    const t = setup();
    await t.h.start({ agentId: "cursor" });
    expect(t.said).toEqual(["I can hand off to Claude Code, Codex, Gemini, Grok or OpenCode."]);
    expect(t.typed).toEqual([]);
  });

  describe("S-1681 소스 고르기", () => {
    const two: HSrc[] = [{ id: "c1", name: "Otto", agent: true, status: "READY" }, { id: "c2", name: "Bex", agent: true, status: "READY" }];
    it("둘 이상이면 되묻는다", async () => {
      const t = setup({ srcs: two });
      await t.h.start({ agentId: "codex" });
      expect(t.said).toEqual(["Which console should hand it off? @ mention it."]);
      expect(t.spawned).toEqual([]);
    });
    it("선택된 것 하나면 그것", async () => {
      const t = setup({ srcs: [two[0]!, { ...two[1]!, selected: true }] });
      await t.h.start({ agentId: "codex" });
      expect(t.said[0]).toBe("Asking Bex for a summary.");
    });
    it("멘션이 선택보다 우선", async () => {
      const t = setup({ srcs: [two[0]!, { ...two[1]!, selected: true }] });
      await t.h.start({ agentId: "codex", from: "c1" });
      expect(t.said[0]).toBe("Asking Otto for a summary.");
    });
    it("에이전트 없음", async () => {
      const t = setup({ srcs: [] });
      await t.h.start({ agentId: "codex" });
      expect(t.said).toEqual(["There is no agent to hand off from."]);
    });
    it("하나뿐이면 그것", async () => {
      const t = setup();
      await t.h.start({ agentId: "codex" });
      expect(t.said[0]).toBe("Asking Otto for a summary.");
    });
  });

  it("S-1682 진행 중이면 거절, 끝나면 다시 가능", async () => {
    const t = setup();
    const first = t.h.start({ agentId: "codex" });
    expect(t.h.active()).toBe(true);
    await t.h.start({ agentId: "gemini" });
    expect(t.said).toContain("A handoff is already running.");
    await first;
    expect(t.h.active()).toBe(false);
  });

  it("S-1683~1686 요약 요청 → 새 콘솔 → 브리프", async () => {
    const t = setup();
    await t.h.start({ agentId: "codex" });
    expect(t.typed[0]).toEqual({ id: "c1", text: REQ });
    expect(t.said[0]).toBe("Asking Otto for a summary.");
    expect(t.spawned).toEqual([["codex", "c1"]]);
    expect(t.typed[1]).toEqual({ id: "n1", text: "SUMMARY Continue this task from exactly that state." });
    expect(t.said).toContain("Brief delivered to Cleo.");
    expect(t.typed.length).toBe(2); // 소스에 다른 입력 없음
  });

  it("S-1684 4분 안에 못 받으면 요약 없이 열고 아무것도 입력하지 않는다", async () => {
    const t = setup({ answerAfter: null });
    await t.h.start({ agentId: "codex" });
    const el = t.clk.now() - t.clk.t0;
    expect(el).toBeGreaterThanOrEqual(sec(240));
    expect(el).toBeLessThan(sec(250));
    expect(t.spawned).toEqual([["codex", "c1"]]);
    expect(t.typed.length).toBe(1);
    expect(t.said).toContain("No summary came back. Started Codex with nothing typed.");
  });

  it("S-1684 3분 50초에 오는 답은 받는다", async () => {
    const t = setup({ answerAfter: sec(230) });
    await t.h.start({ agentId: "codex" });
    expect(t.typed[1]?.text).toContain("SUMMARY");
  });

  it("S-1687 신뢰 질문을 2분 안에 승인하면 전달", async () => {
    const t = setup({ trustUntil: sec(60) });
    await t.h.start({ agentId: "codex" });
    expect(t.typed[1]?.id).toBe("n1");
    expect(t.said).toContain("Brief delivered to Cleo.");
  });

  it("S-1687 2분 넘기면 전달하지 않고 전문을 보여 준다", async () => {
    const t = setup({ trustUntil: sec(10_000) });
    await t.h.start({ agentId: "codex" });
    expect(t.typed.length).toBe(1);
    const s = t.said.find((x) => x.startsWith("Not sent — paste it yourself:"));
    expect(s).toContain("SUMMARY Continue this task from exactly that state.");
  });

  it("S-1688 cancel: 요약 대기를 멈춘다(새 콘솔 없음)", async () => {
    const t = setup({ answerAfter: null });
    t.clk.at(sec(10), () => expect(t.h.cancel()).toBe(1));
    await t.h.start({ agentId: "codex" });
    expect(t.spawned).toEqual([]);
    expect(t.h.active()).toBe(false);
    expect(t.clk.now() - t.clk.t0).toBeLessThan(sec(20));
  });

  it("S-1688 cancel: 브리프 대기를 멈춘다(전달 안 함)", async () => {
    const t = setup({ trustUntil: sec(10_000) });
    t.clk.at(sec(40), () => t.h.cancel()); // 요약 20초 뒤 새 콘솔이 신뢰 질문에 멈춰 있는 때
    await t.h.start({ agentId: "codex" });
    expect(t.typed.length).toBe(1);
    expect(t.said.some((x) => x.startsWith("Not sent"))).toBe(false);
    expect(t.h.active()).toBe(false);
  });
});
