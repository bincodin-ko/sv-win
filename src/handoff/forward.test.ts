import { describe, it, expect } from "vitest";
import { createForward, type FOrder, type Dest } from "./forward";
import { fakeClock } from "./fake";

const min = (n: number) => n * 60_000;
const hr = (n: number) => 60 * min(n);

function setup() {
  const clk = fakeClock();
  const said: string[] = [];
  const sent: [string, string][] = [];
  const orders: Record<string, FOrder> = {};
  const replies: Record<string, string> = {};
  const f = createForward({
    now: clk.now, sleep: clk.sleep, say: (t) => said.push(t), submit: async () => {},
    orders: (id) => orders[id], reply: async (id) => replies[id] ?? null,
    nameOf: (id) => ({ a: "Otto", b: "Bex" } as Record<string, string>)[id] ?? id,
    send: async (id, text) => { sent.push([id, text]); },
  });
  const fin = (id: string, sentAtMs: number, secs = 60, text = id.toUpperCase()): void => { orders[id] = { sentAt: clk.t0 + sentAtMs, verdict: { state: "finished", secs } }; replies[id] = text; };
  const work = (id: string, sentAtMs: number): void => { orders[id] = { sentAt: clk.t0 + sentAtMs, verdict: { state: "working" } }; };
  return { f, clk, said, sent, fin, work };
}
const idle = (id: string, name = id) => ({ id, name, status: "READY", agent: true });
const group: Dest = { label: "group 2", cands: [idle("g1", "Rex"), idle("g2", "Sol")] };

describe("D14 Forward", () => {
  it("S-1701·1703·1704 소스가 다 끝나면 digest 를 한가한 멤버에게", async () => {
    const t = setup();
    t.work("a", -min(1)); t.work("b", -min(1));
    t.clk.at(min(10), () => t.fin("a", -min(1), 600));
    t.clk.at(min(12), () => t.fin("b", -min(1), 700));
    await t.f.add({ sources: ["a", "b"], dests: [group], everyone: true });
    expect(t.clk.now() - t.clk.t0).toBeGreaterThanOrEqual(min(12));
    expect(t.sent).toEqual([["g1", "Results from Otto:\nA\n\nResults from Bex:\nB"]]);
    expect(t.said).toContain("Forwarded 2 result(s) to group 2.");
  });

  it("끝난 지 30분 안의 결과는 바로 보낸다", async () => {
    const t = setup();
    t.fin("a", -min(20), 60);
    await t.f.add({ sources: ["a"], dests: [group] });
    expect(t.sent.length).toBe(1);
    expect(t.clk.now() - t.clk.t0).toBeLessThan(min(1));
  });

  it("끝난 지 30분 넘은 결과는 쓰지 않고 새 주문을 기다린다(최대 4시간)", async () => {
    const t = setup();
    t.fin("a", -min(60), 60);
    await t.f.add({ sources: ["a"], dests: [group] });
    expect(t.sent).toEqual([]);
    expect(t.clk.now() - t.clk.t0).toBeGreaterThanOrEqual(hr(4));
    expect(t.said).toContain("Nothing to forward.");
  });

  it("4시간 안에 주문이 오면 그 결과를 보낸다", async () => {
    const t = setup();
    t.clk.at(hr(1), () => t.work("a", hr(1)));
    t.clk.at(hr(1) + min(5), () => t.fin("a", hr(1), 300, "LATE"));
    await t.f.add({ sources: ["a"], dests: [group] });
    expect(t.sent[0]![1]).toBe("Results from Otto:\nLATE");
  });

  it("주문 뒤 30분 넘게 일하는 소스는 빼고 나머지만 보낸다", async () => {
    const t = setup();
    t.work("a", 0);
    t.fin("b", -min(2), 60);
    await t.f.add({ sources: ["a", "b"], dests: [group], everyone: true });
    expect(t.clk.now() - t.clk.t0).toBeGreaterThanOrEqual(min(30));
    expect(t.clk.now() - t.clk.t0).toBeLessThan(min(31));
    expect(t.sent[0]![1]).toBe("Results from Bex:\nB");
    expect(t.said).toContain("Forwarded 1 result(s) to group 2.");
  });

  it("S-1703 CLI 목적지에 한가한 콘솔이 없으면 새로 만들지 않고 알린다", async () => {
    const t = setup();
    t.fin("a", -min(1));
    await t.f.add({ sources: ["a"], dests: [{ label: "Codex", cli: true, cands: [{ id: "x", name: "X", status: "WORKING", agent: true }] }] });
    expect(t.sent).toEqual([]);
    expect(t.said).toContain("No Codex console to forward to.");
  });

  it("S-1703 목적지 여럿: 소스 답을 나눠 보내고 못 받은 쪽은 한가하게 둔다", async () => {
    const t = setup();
    t.fin("a", -min(1)); t.fin("b", -min(1));
    const d3: Dest[] = ["x", "y", "z"].map((i) => ({ label: i, cands: [idle(i)] }));
    await t.f.add({ sources: ["a", "b"], dests: d3 });
    expect(t.sent).toEqual([["x", "Results from Otto:\nA"], ["y", "Results from Bex:\nB"]]);
    expect(t.said).toContain("Forwarded 2 result(s) to x, y.");
  });

  it("S-1703 나눌 수 없으면(답 하나) 첫 목적지에만", async () => {
    const t = setup();
    t.fin("a", -min(1));
    await t.f.add({ sources: ["a"], dests: ["x", "y"].map((i) => ({ label: i, cands: [idle(i)] })) });
    expect(t.sent.map((s) => s[0])).toEqual(["x"]);
  });

  it("S-1704 동시에 5개까지", async () => {
    const t = setup();
    const ps = [1, 2, 3, 4, 5].map(() => t.f.add({ sources: ["a"], dests: [group] }));
    expect(t.f.pending()).toBe(5);
    await t.f.add({ sources: ["a"], dests: [group] });
    expect(t.said).toContain("Too many forwards are waiting.");
    expect(t.f.cancel()).toBe(5);
    await Promise.all(ps);
    expect(t.f.pending()).toBe(0);
    expect(t.sent).toEqual([]);
  });
});
