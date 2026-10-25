import { beforeEach, describe, expect, it } from "vitest";
import { threadLoad, threadSave } from "../lib/ipc";
import { MAX_MESSAGES, mk, parse, serialize, trim, useThread, type Msg } from "./thread";

const many = (n: number): Msg[] => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, at: i, role: "user" as const, text: `t${i}` }));
const reset = () => useThread.setState({ byRepo: {}, open: false });
const settle = () => new Promise((r) => setTimeout(r, 30));
beforeEach(() => { localStorage.clear(); reset(); });

describe("S-554 500개 상한", () => {
  it("500개 이하면 그대로", () => {
    expect(trim(many(500))).toHaveLength(500);
    expect(trim(many(3))).toEqual(many(3));
  });
  it("넘으면 오래된 것부터 버린다", () => {
    const r = trim(many(MAX_MESSAGES + 7));
    expect(r).toHaveLength(MAX_MESSAGES);
    expect(r[0]!.id).toBe("m7");
    expect(r.at(-1)!.id).toBe(`m${MAX_MESSAGES + 6}`);
  });
  it("add 가 상한을 지킨다", () => {
    for (const m of many(MAX_MESSAGES + 1)) useThread.getState().add("r", m);
    const l = useThread.getState().byRepo["r"]!;
    expect(l).toHaveLength(MAX_MESSAGES);
    expect(l[0]!.id).toBe("m1");
  });
});

describe("S-554 Clear", () => {
  it("비운다(저장본도)", async () => {
    useThread.getState().add("r", mk("user", "hi"));
    useThread.getState().clear("r");
    expect(useThread.getState().byRepo["r"]).toEqual([]);
    await settle();
    expect(parse(await threadLoad("r"))).toEqual([]);
  });
  it("repo 마다 따로", () => {
    useThread.getState().add("a", mk("user", "A"));
    useThread.getState().add("b", mk("user", "B"));
    useThread.getState().clear("a");
    expect(useThread.getState().byRepo["a"]).toEqual([]);
    expect(useThread.getState().byRepo["b"]).toHaveLength(1);
  });
});

describe("S-557 메시지 모양·직렬화", () => {
  it("mk 는 id·at 이 채워진 메시지를 만든다(id 는 서로 다르다)", () => {
    const a = mk("bot", "hello"), b = mk("bot", "hello");
    expect(a).toMatchObject({ role: "bot", text: "hello" });
    expect(a.id).not.toBe("");
    expect(a.id).not.toBe(b.id);
    expect(a.at).toBeGreaterThan(1_700_000_000_000);
  });
  it("직렬화 왕복(보고 행 포함)", () => {
    const ms: Msg[] = [mk("user", "do it"), mk("report", "finished", { report: { console: "Otto", nodeId: "c1", secs: 12, result: "finished", reply: "all green" } }), mk("plan", "Plan: 1")];
    expect(parse(serialize(ms))).toEqual(ms);
  });
  it("읽지 못하거나 모양이 틀리면 빈 목록, 모양이 틀린 항목만 버린다", () => {
    expect(parse("")).toEqual([]);
    expect(parse("{broken")).toEqual([]);
    expect(parse('{"a":1}')).toEqual([]);
    const ok = mk("user", "ok");
    expect(parse(JSON.stringify([ok, { id: 1 }, null, { id: "z", at: 1, role: "weird", text: "x" }]))).toEqual([ok]);
  });
});

describe("S-554 repo 별 불러오기·저장", () => {
  it("add 한 것이 저장되고 새로 열어도(load) 복원된다", async () => {
    useThread.getState().add("repo1", mk("user", "first"));
    useThread.getState().add("repo1", mk("bot", "second"));
    await settle();
    reset();
    await useThread.getState().load("repo1");
    expect(useThread.getState().byRepo["repo1"]!.map((m) => m.text)).toEqual(["first", "second"]);
  });
  it("저장본이 500개를 넘어 있어도 불러올 때 자른다", async () => {
    await threadSave("big", serialize(many(MAX_MESSAGES + 5)));
    await useThread.getState().load("big");
    expect(useThread.getState().byRepo["big"]).toHaveLength(MAX_MESSAGES);
  });
  it("load 는 이미 메모리에 있는 스레드를 덮어쓰지 않는다", async () => {
    useThread.getState().add("r2", mk("user", "mem"));
    await useThread.getState().load("r2");
    expect(useThread.getState().byRepo["r2"]!.map((m) => m.text)).toEqual(["mem"]);
  });
});
