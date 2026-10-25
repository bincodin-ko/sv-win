import { expect, test, type Page } from "@playwright/test";

// 13묶음 R2: planner 공급자 흐름(S-3304·S-3310~S-3315·S-3350~S-3357). 가짜 api(__fakePlannerApi)·가짜 숨은 세션만. PW_PORT=1802.
test.use({ actionTimeout: 8000 });
test.setTimeout(60_000);
const input = (p: Page) => p.getByTestId("bar-input");
const msgs = (p: Page) => p.getByTestId("thread-msg");
const cons = (p: Page) => p.getByTestId("console");
const say = async (p: Page, t: string) => { await input(p).fill(t); await input(p).press("Enter"); };
type Sp = { id: number; args: string[] };
const spawns = (p: Page) => p.evaluate(() => (window as any).__fakePty.spawns() as Sp[]);
const writes = (p: Page, id: number) => p.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);
const calls = (p: Page) => p.evaluate(() => (window as any).__fakePlannerApi.calls as { reqId: string; system: string; user: string }[]);
const cancels = (p: Page) => p.evaluate(() => (window as any).__fakePlannerApi.cancels as string[]);

const open = async (p: Page, init: { settings: object; installed?: string[]; api?: string; sessions?: object }) => {
  await p.addInitScript((i) => {
    (window as any).__plannerTest = true;
    localStorage.setItem("symvibe.fakeSettings", JSON.stringify(i.settings));
    if (i.installed) localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(i.installed));
    if (i.sessions) (window as any).__fakeSessions = i.sessions;
    // eslint-disable-next-line no-new-func
    if (i.api) (window as any).__fakePlannerApi = { keys: { "api:openai": "k" }, calls: [], cancels: [], ask: new Function("a", i.api) };
  }, init);
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto("/?console=1&agent=claude");
  await expect(cons(p)).toHaveCount(1);
  await p.getByTestId("thread-toggle").click();
  await expect(p.getByTestId("thread-panel")).toBeVisible();
};
const SPAWN2 = `return JSON.stringify({ id: a.reqId, intent: { t: "spawn", n: 2, agent: "claude" } })`;

test("S-3304·S-3350·S-3351 API: 숨은 세션 없이 답이 실행된다 / system=PRIMER, user 에 <user_sentence>", async ({ page }) => {
  await open(page, { settings: { planner: "api:openai" }, api: SPAWN2 });
  const before = (await spawns(page)).length;
  await say(page, "kindly produce a pair of helpers please");
  await expect(cons(page)).toHaveCount(3);
  expect((await spawns(page)).length).toBe(before + 2); // 새 콘솔 둘뿐 — planner 세션 없음
  const c = (await calls(page))[0]!;
  expect(c.system.startsWith("You convert one user sentence")).toBe(true);
  expect(c.user).toContain("<user_sentence>kindly produce a pair of helpers please</user_sentence>");
  await expect(msgs(page).filter({ hasText: "Thinking…" })).toHaveCount(0); // 알림은 사라졌고
  await expect(msgs(page).filter({ hasText: "Starting the planner" })).toHaveCount(0);
});

test("S-3357 API tell -> Run this? 확인", async ({ page }) => {
  await open(page, { settings: { planner: "api:openai" }, api: `return JSON.stringify({ id: a.reqId, intent: { t: "tell", targets: ["c1"], text: "hello there" } })` });
  await say(page, "kindly tell the first one hello there");
  await expect(msgs(page).filter({ hasText: /Run this\? Tell .*"hello there"/ })).toHaveCount(1);
});

test("S-3354 auth 실패 -> 한국어 화면에서 API 키가 거부됐어요", async ({ page }) => {
  await open(page, { settings: { planner: "api:openai", language: "ko" }, api: `return { err: { kind: "auth" } }` });
  await say(page, "kindly produce a pair of helpers please");
  await expect(msgs(page).filter({ hasText: "API 키가 거부됐어요" })).toHaveCount(1);
});

test("S-3355 생각 중 cancel -> Cancelled., cancels 에 id, 늦은 답 무시", async ({ page }) => {
  await open(page, { settings: { planner: "api:openai" }, api: `return new Promise((res) => { window.__lateAnswer = () => res(JSON.stringify({ id: a.reqId, intent: { t: "spawn", n: 2, agent: "claude" } })); })` });
  await say(page, "kindly produce a pair of helpers please");
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await say(page, "cancel");
  await expect(msgs(page).filter({ hasText: "Cancelled." })).toHaveCount(1);
  expect(await cancels(page)).toEqual([(await calls(page))[0]!.reqId]);
  await page.evaluate(() => (window as any).__lateAnswer?.());
  await page.waitForTimeout(600);
  await expect(cons(page)).toHaveCount(1);
});

test("S-3312·S-3313·S-3315 Gemini CLI: 숨은 세션 인자 -m <설정 모델>·--skip-trust, 답 실행", async ({ page }) => {
  await open(page, { settings: { planner: "gemini", plannerModel: { gemini: "gemini-2.5-pro" } }, installed: ["gemini"], sessions: { gemini: "g1" } });
  await say(page, "kindly produce a pair of helpers please");
  await expect.poll(async () => (await spawns(page)).filter((s) => s.args.includes("--skip-trust")).length).toBe(1);
  const sp = (await spawns(page)).find((s) => s.args.includes("--skip-trust"))!;
  expect(sp.args).toContain("-m");
  expect(sp.args[sp.args.indexOf("-m") + 1]).toBe("gemini-2.5-pro");
  await page.evaluate((i) => (window as any).__fakePty.emit(i, "ready\r\n❯ "), sp.id);
  await expect.poll(async () => (await writes(page, sp.id)).join("")).toContain("request id=");
  const rid = /request id="(r\d+)"/.exec((await writes(page, sp.id)).join(""))![1];
  await page.evaluate((r) => ((window as any).__fakeReply = { g1: JSON.stringify({ id: r, intent: { t: "spawn", n: 2, agent: "claude" } }) }), rid);
  await expect(cons(page)).toHaveCount(3);
});
