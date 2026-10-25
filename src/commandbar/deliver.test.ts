import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelPending, deliver, PROMPT_WAIT_MS, START_WAIT_MS, type DTarget } from "./deliver";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cancelPending(); vi.useRealTimers(); });

type Opt = { agent?: boolean; out?: boolean; prompt?: boolean; bp?: boolean; st?: string };
function fake(o: Opt = {}) {
  const s = { agent: true, out: true, prompt: false, bp: false, st: "RUNNING", ...o };
  const writes: string[] = [];
  const t: DTarget = {
    write: (d) => void writes.push(d),
    bracketedPaste: () => s.bp,
    isAgent: () => s.agent,
    status: () => s.st,
    hasOutput: () => s.out,
    tail: () => (s.prompt ? ["Do you want to proceed?", "❯ 1. Yes", "  2. No"] : ["> "]),
  };
  return { t, s, writes };
}
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe("S-605 전달: 한 줄 붙여넣기 + 150ms 뒤 Enter", () => {
  it("줄바꿈은 공백으로, 150ms 뒤에 \\r", async () => {
    const f = fake();
    const p = deliver("k", f.t, "run the\ntests");
    await tick(100);
    expect(f.writes).toEqual(["run the tests"]);
    await tick(60);
    expect(f.writes).toEqual(["run the tests", "\r"]);
    expect(await p).toBe("sent");
  });
  it("bracketed paste 모드면 그것으로 붙인다", async () => {
    const f = fake({ bp: true });
    const p = deliver("k", f.t, "go");
    await tick(200);
    expect(f.writes).toEqual(["\x1b[200~go\x1b[201~", "\r"]);
    await p;
  });
});

describe("S-604 셸에는 입력하지 않는다", () => {
  it("에이전트가 아닌 콘솔은 아무것도 쓰지 않는다", async () => {
    const f = fake({ agent: false });
    const p = deliver("k", f.t, "rm -rf x");
    await tick(60_000);
    expect(await p).toBe("shell");
    expect(f.writes).toEqual([]);
  });
  it("기다리는 사이 에이전트가 끝나 셸이 되면 보내지 않는다", async () => {
    const f = fake({ out: false });
    const p = deliver("k", f.t, "x");
    await tick(1000);
    f.s.agent = false;
    await tick(1000);
    expect(await p).toBe("shell");
    expect(f.writes).toEqual([]);
  });
});

describe("S-606 시작 중인 콘솔", () => {
  it("출력이 나오면 그때 보낸다", async () => {
    const f = fake({ out: false });
    const p = deliver("k", f.t, "hi");
    await tick(5000);
    expect(f.writes).toEqual([]);
    f.s.out = true;
    await tick(400);
    expect(f.writes[0]).toBe("hi");
    expect(await p).toBe("sent");
  });
  it("최대 10초 기다린 뒤에도 출력이 없으면 보내지 않는다", async () => {
    const f = fake({ out: false });
    const p = deliver("k", f.t, "hi");
    await tick(START_WAIT_MS - 300);
    let done = false;
    void p.then(() => (done = true));
    await tick(0);
    expect(done).toBe(false);
    await tick(600);
    expect(await p).toBe("noOutput");
    expect(f.writes).toEqual([]);
  });
});

describe("S-607 권한/질문 프롬프트", () => {
  it("프롬프트가 사라질 때까지 기다렸다 보낸다", async () => {
    const f = fake({ prompt: true });
    const p = deliver("k", f.t, "hi");
    await tick(60_000);
    expect(f.writes).toEqual([]);
    f.s.prompt = false;
    await tick(400);
    expect(f.writes[0]).toBe("hi");
    expect(await p).toBe("sent");
  });
  it("라이브 상태가 NEEDS YOU 라고 하면 화면에 문구가 없어도 기다린다", async () => {
    const f = fake({ st: "NEEDS YOU" });
    const p = deliver("k", f.t, "hi");
    await tick(5000);
    expect(f.writes).toEqual([]);
    f.s.st = "READY";
    await tick(400);
    expect(await p).toBe("sent");
  });
  it("15분이 지나면 버린다", async () => {
    const f = fake({ prompt: true });
    const p = deliver("k", f.t, "hi");
    await tick(PROMPT_WAIT_MS - 1000);
    f.s.prompt = true;
    await tick(1500);
    expect(await p).toBe("promptTimeout");
    expect(f.writes).toEqual([]);
  });
});

describe("S-608 cancel", () => {
  it("대기 중인 주문을 버린다", async () => {
    const f = fake({ prompt: true });
    const p = deliver("k", f.t, "hi");
    await tick(1000);
    expect(cancelPending()).toBe(1);
    expect(await p).toBe("cancelled");
    f.s.prompt = false;
    await tick(1000);
    expect(f.writes).toEqual([]);
  });
  it("이미 붙여 넣은 글은 입력창에 남고 Enter 는 가지 않는다", async () => {
    const f = fake();
    const p = deliver("k", f.t, "hi");
    await tick(50);
    expect(f.writes).toEqual(["hi"]);
    cancelPending();
    await tick(200);
    expect(await p).toBe("cancelled");
    expect(f.writes).toEqual(["hi"]);
  });
  it("keys 로 일부 콘솔 것만 버릴 수 있다", async () => {
    const a = fake({ prompt: true }), b = fake({ prompt: true });
    const pa = deliver("a", a.t, "1"), pb = deliver("b", b.t, "2");
    await tick(500);
    expect(cancelPending(["a"])).toBe(1);
    expect(await pa).toBe("cancelled");
    b.s.prompt = false;
    await tick(400);
    expect(await pb).toBe("sent");
  });
});

describe("콘솔별 큐", () => {
  it("같은 콘솔의 주문은 앞의 것을 다 보낸 뒤 차례로 간다", async () => {
    const f = fake();
    const p1 = deliver("k", f.t, "one"), p2 = deliver("k", f.t, "two");
    await tick(50);
    expect(f.writes).toEqual(["one"]);
    await tick(1000);
    expect(f.writes).toEqual(["one", "\r", "two", "\r"]);
    await Promise.all([p1, p2]);
  });
});
