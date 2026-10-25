import { describe, expect, it, vi } from "vitest";
import type { ApiErr } from "../../lib/ipc";
import { makeHandles, PRIMER, type BoardCtx } from "../prompt";
import { apiAsk, cancelApi } from "./api";

const ctx: BoardCtx = { consoles: [{ id: "ws:c1", name: "Otto", agentId: "claude", status: "ready" }], groups: [], workspaces: [], agents: [{ id: "claude", name: "Claude Code", aliases: [] }] };
const handles = makeHandles(ctx);
const base = { id: "r7", provider: "api:openai" as const, model: "m", baseUrl: "http://x/v1", req: "REQ", handles };
const run = (text: string | ApiErr) => {
  const ask = vi.fn(async () => { if (typeof text === "string") return text; throw text; });
  return { ask, p: apiAsk(base, { ask: ask as never }) };
};

describe("S-3351 apiAsk", () => {
  it("system=PRIMER, user=req, reqId=id 로 부르고 plan 을 돌려준다", async () => {
    const { ask, p } = run(JSON.stringify({ id: "r7", intent: { t: "tidy" }, why: "w" }));
    expect(await p).toEqual({ plan: { ok: { t: "tidy" }, why: "w" } });
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ reqId: "r7", provider: "api:openai", model: "m", baseUrl: "http://x/v1", system: PRIMER, user: "REQ" }));
  });
  it("id 가 없으면 요청 id 로 채운다", async () => {
    expect(await run(JSON.stringify({ intent: { t: "undo" } })).p).toEqual({ plan: { ok: { t: "undo" } } });
  });
  it("id 가 다르면 bad", async () => {
    expect(await run(JSON.stringify({ id: "r1", intent: { t: "undo" } })).p).toEqual({ fail: { reason: "bad", detail: "wrong id" } });
  });
  it("JSON 이 없으면 bad(no JSON)", async () => {
    expect(await run("sorry").p).toEqual({ fail: { reason: "bad", detail: "no JSON" } });
  });
  it("none·검증 실패", async () => {
    expect(await run(JSON.stringify({ none: "nope" })).p).toEqual({ fail: { reason: "none", detail: "nope" } });
    expect(await run(JSON.stringify({ intent: { t: "rm" } })).p).toMatchObject({ fail: { reason: "bad" } });
  });
  it("ApiErr 종류 -> fail 종류", async () => {
    expect((await run({ kind: "no key" }).p)).toEqual({ fail: { reason: "no key", provider: "api:openai" } });
    expect((await run({ kind: "no model" }).p)).toEqual({ fail: { reason: "no model", provider: "api:openai" } });
    expect((await run({ kind: "auth" }).p)).toEqual({ fail: { reason: "auth" } });
    expect((await run({ kind: "quota" }).p)).toEqual({ fail: { reason: "quota" } });
    expect((await run({ kind: "url" }).p)).toEqual({ fail: { reason: "url" } });
    expect((await run({ kind: "timeout" }).p)).toEqual({ fail: { reason: "timeout" } });
    expect((await run({ kind: "net", detail: "h.io" }).p)).toEqual({ fail: { reason: "net", detail: "h.io" } });
    expect((await run({ kind: "model" }).p)).toEqual({ fail: { reason: "model", detail: "m" } });
    expect((await run({ kind: "http", status: 500, detail: "x" }).p)).toEqual({ fail: { reason: "http", detail: "500: x" } });
    expect((await run({ kind: "cancelled" }).p)).toEqual({ fail: { reason: "cancelled" } });
    expect((await run({ kind: "weird", detail: "d" }).p)).toEqual({ fail: { reason: "bad", detail: "d" } });
  });
});

describe("S-3355 cancelApi", () => {
  it("지금 요청 id 로 plannerApiCancel", async () => {
    const cancel = vi.fn(async () => true);
    let release!: (s: string) => void;
    const ask = vi.fn(() => new Promise<string>((r) => (release = r)));
    const p = apiAsk(base, { ask: ask as never, cancel: cancel as never });
    cancelApi({ cancel: cancel as never });
    expect(cancel).toHaveBeenCalledWith("r7");
    release("{}");
    await p;
    cancelApi({ cancel: cancel as never }); // 끝난 뒤에는 부르지 않는다
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
