import { beforeEach, describe, expect, it } from "vitest";
import { plannerApiAsk, plannerApiCancel, plannerApiModels, plannerKeyClear, plannerKeyHas, plannerKeySet, type FakePlannerApi } from "./ipc";

// S-3343 가짜 IPC + S-3340 Rust와 같은 키 검사(가짜)
const fake = () => (window as unknown as { __fakePlannerApi: FakePlannerApi }).__fakePlannerApi;
const A = { reqId: "r1", provider: "api:openai", model: "m", baseUrl: "http://x/v1", system: "S", user: "U" };
beforeEach(() => { delete (window as unknown as { __fakePlannerApi?: unknown }).__fakePlannerApi; localStorage.clear(); });

const rejection = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e; } return "resolved"; };

describe("키 가짜 (S-3340·S-3341·S-3343)", () => {
  it("저장·있음·지움, 키는 메모리 객체에만(localStorage 금지)", async () => {
    expect(await plannerKeyHas("api:openai")).toBe(false);
    await plannerKeySet("api:openai", "  sk-test-1  ");
    expect(await plannerKeyHas("api:openai")).toBe(true);
    expect(await plannerKeyHas("api:gemini")).toBe(false);
    expect(fake().keys["api:openai"]).toBe("sk-test-1");
    expect(JSON.stringify(localStorage)).not.toContain("sk-test");
    await plannerKeyClear("api:openai");
    expect(await plannerKeyHas("api:openai")).toBe(false);
    await plannerKeyClear("api:openai"); // 없던 것도 Ok
  });
  it("빈 글·줄바꿈·512자 초과 → reject \"invalid key\"(키 글자 없음)", async () => {
    for (const bad of ["", "   ", "a\nb", "a\r\nb", "x".repeat(513)]) {
      expect(await rejection(plannerKeySet("api:openai", bad))).toBe("invalid key");
    }
    await plannerKeySet("api:openai", "x".repeat(512));
    expect(await rejection(plannerKeySet("claude", "sk-ok-123"))).toBe("invalid key");
    expect(await plannerKeyHas("claude")).toBe(false);
  });
});

describe("plannerApiAsk 가짜 (S-3343)", () => {
  it("ask 가 돌려준 글, calls 에 키 없이 쌓임", async () => {
    window.__fakePlannerApi = { keys: { "api:openai": "sk-secret-9" }, calls: [], cancels: [], ask: (a) => `echo:${a.user}` } as FakePlannerApi;
    expect(await plannerApiAsk({ ...A, timeoutMs: 5000 })).toBe("echo:U");
    expect(fake().calls).toEqual([A]);
    expect(JSON.stringify(fake().calls)).not.toContain("sk-secret");
  });
  it("Promise 를 돌려줘도 기다린다", async () => {
    window.__fakePlannerApi = { keys: {}, calls: [], cancels: [], ask: () => new Promise((r) => setTimeout(() => r("late"), 20)) } as FakePlannerApi;
    expect(await plannerApiAsk(A)).toBe("late");
  });
  it("{err} 는 ApiErr 로 reject, ask 가 없으면 {kind:\"bad\"}", async () => {
    window.__fakePlannerApi = { keys: {}, calls: [], cancels: [], ask: () => ({ err: { kind: "auth", status: 401 } }) } as FakePlannerApi;
    expect(await rejection(plannerApiAsk(A))).toEqual({ kind: "auth", status: 401 });
    delete (window as unknown as { __fakePlannerApi?: unknown }).__fakePlannerApi;
    expect(await rejection(plannerApiAsk(A))).toEqual({ kind: "bad" });
  });
  it("cancel: cancels 에 id, 기다리던 ask 를 cancelled 로 reject", async () => {
    window.__fakePlannerApi = { keys: {}, calls: [], cancels: [], ask: () => new Promise(() => {}) } as FakePlannerApi;
    const p = rejection(plannerApiAsk(A));
    await new Promise((r) => setTimeout(r, 5));
    expect(await plannerApiCancel("r1")).toBe(true);
    expect(await p).toEqual({ kind: "cancelled" });
    expect(fake().cancels).toEqual(["r1"]);
    expect(await plannerApiCancel("nope")).toBe(false);
    expect(fake().cancels).toEqual(["r1", "nope"]);
  });
});

describe("plannerApiModels 가짜", () => {
  it("목록 또는 {err}", async () => {
    window.__fakePlannerApi = { keys: {}, calls: [], cancels: [], models: (p, b) => [p, b ?? ""] } as FakePlannerApi;
    expect(await plannerApiModels("api:compat", "http://h/v1")).toEqual(["api:compat", "http://h/v1"]);
    window.__fakePlannerApi = { keys: {}, calls: [], cancels: [], models: async () => ({ err: { kind: "net", detail: "h" } }) } as FakePlannerApi;
    expect(await rejection(plannerApiModels("api:compat"))).toEqual({ kind: "net", detail: "h" });
  });
});

declare global { interface Window { __fakePlannerApi?: FakePlannerApi } }
