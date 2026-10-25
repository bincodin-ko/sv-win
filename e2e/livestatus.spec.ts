import { expect, test, type Page } from "@playwright/test";

// B16 라이브 상태(S-372·S-680~S-693·S-339). 가짜 IPC: window.__agentEvent(console, event, payload?) 가 hook 수신기를 대신한다.
// 가짜 livestatus 호출 기록은 window.__liveLog, 시작한 PTY 의 env 는 __fakePty.spawns()[i].env
const seedLive = (page: Page) => page.addInitScript(() => localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ liveStatus: true })));
const ids = (page: Page) => page.locator("[data-node-id]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.nodeId!));
const agentEvent = (page: Page, node: string, event: string, payload?: object) => page.evaluate(([n, e, p]) => (window as any).__agentEvent(n, e, p), [node, event, payload] as const);
const pill = (page: Page, i: number) => page.getByTestId("console-status").nth(i);
const log = (page: Page) => page.evaluate(() => ((window as any).__liveLog ?? []) as string[]);
const openAgents = async (page: Page) => {
  await page.keyboard.press("Control+,");
  await page.getByRole("dialog", { name: "Settings" }).getByRole("tab", { name: "Agents" }).click();
  await expect(page.getByTestId("settings-pane-agents")).toBeVisible();
};
type Spawn = { env?: [string, string][] };
const ready = async (page: Page) => expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/); // 앱이 뜬 뒤에야 Ctrl+, 가 먹는다
const spawns = (page: Page) => page.evaluate(() => (window as any).__fakePty.spawns() as Spawn[]);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test("S-680·S-686 켜기 전에 바뀌는 파일 2개·백업을 보이고, 켜면 live_status_enable, 재시작·Codex 신뢰 안내, 끄면 disable", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await openAgents(page);
  const box = page.getByLabel("Report status from the agent itself");
  await expect(box).not.toBeChecked();
  await box.check();
  const ask = page.getByTestId("live-confirm");
  await expect(ask).toContainText("settings.json");
  await expect(ask).toContainText("hooks.json");
  await expect(ask).toContainText("backup");
  expect(await log(page)).toEqual([]); // 안내만 — 아직 아무것도 바꾸지 않았다
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(box).not.toBeChecked();
  expect(await log(page)).toEqual([]);

  await box.check();
  await page.getByTestId("live-confirm").getByRole("button", { name: "Turn on" }).click();
  await expect(box).toBeChecked();
  expect(await log(page)).toEqual(["enable"]);
  await expect(page.getByTestId("live-notice")).toContainText("Restart");
  await expect(page.getByTestId("live-notice")).toContainText("Trust all and continue");
  await box.uncheck();
  await expect(box).not.toBeChecked();
  expect(await log(page)).toEqual(["enable", "disable"]);
});

test("S-683 켠 뒤 시작한 claude 콘솔의 env 에 SYMVIBE_CONSOLE·SYMVIBE_HOOK_URL", async ({ page }) => {
  await seedLive(page);
  await page.goto("/?console=2&agent=claude");
  await expect(page.getByTestId("console")).toHaveCount(2);
  const nodes = await ids(page);
  const env = Object.fromEntries((await spawns(page))[0]!.env ?? []);
  expect(env.SYMVIBE_HOOK_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/.+/);
  expect(decodeURIComponent(String(env.SYMVIBE_CONSOLE).split("|")[1]!)).toBe(nodes[0]);
});

test("S-688 꺼짐(기본): hook 이벤트가 와도 NEEDS YOU 는 없고 chip 도 없고 env 도 없다", async ({ page }) => {
  await page.goto("/?console=2&agent=claude");
  await expect(page.getByTestId("console")).toHaveCount(2);
  const [a] = await ids(page);
  await agentEvent(page, a!, "PermissionRequest", { tool_name: "Bash" });
  await page.waitForTimeout(300);
  await expect(pill(page, 0)).toHaveText("STARTING");
  await expect(page.getByTestId("needs-you-chip")).toHaveCount(0);
  expect(Object.fromEntries((await spawns(page))[0]!.env ?? []).SYMVIBE_HOOK_URL).toBeUndefined();
});

test("S-685·S-687 이벤트에 따라 pill WORKING → NEEDS YOU → READY 이고 호버 문구가 바뀐다", async ({ page }) => {
  await seedLive(page);
  await page.goto("/?console=2&agent=claude");
  await expect(page.getByTestId("console")).toHaveCount(2);
  const [a] = await ids(page);
  await agentEvent(page, a!, "SessionStart");
  await expect(pill(page, 0)).toHaveText("READY");
  await agentEvent(page, a!, "PreToolUse", { tool_name: "Bash", tool_input: { command: "npm test" } });
  await expect(pill(page, 0)).toHaveText("WORKING");
  await expect(pill(page, 0)).toHaveAttribute("title", /npm test/);
  await page.waitForTimeout(1800); // 출력 기준이면 RUNNING 으로 떨어졌을 시간
  await expect(pill(page, 0)).toHaveText("WORKING");
  await agentEvent(page, a!, "PermissionRequest", { tool_name: "Edit" });
  await expect(pill(page, 0)).toHaveText("NEEDS YOU");
  await expect(pill(page, 0)).toHaveAttribute("title", /Edit/);
  await agentEvent(page, a!, "Stop");
  await expect(pill(page, 0)).toHaveText("READY");
  await expect(pill(page, 1)).toHaveText("STARTING"); // 다른 콘솔은 그대로
});

test("S-689·S-339 chip: NEEDS YOU·ERROR 개수만큼 보이고, 누르거나 N 키로 그 콘솔로 차례로 간다", async ({ page }) => {
  await seedLive(page);
  await page.goto("/?console=2&agent=claude");
  await expect(page.getByTestId("console")).toHaveCount(2);
  const [a, b] = await ids(page);
  const chip = page.getByTestId("needs-you-chip");
  await expect(chip).toHaveCount(0);
  await agentEvent(page, a!, "PermissionRequest", { tool_name: "Bash" });
  await expect(chip).toHaveText("1 needs you");
  await agentEvent(page, b!, "StopFailure");
  await expect(chip).toHaveText("2 needs you");
  // 누르면 먼저 기다린 콘솔로: 선택되고 화면 안에 들어온다
  await chip.click();
  await expect(page.locator(`[data-node-id="${a}"]`)).toHaveAttribute("data-selected", "true");
  const inView = (id: string) => page.locator(`[data-node-id="${id}"]`).evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
  expect(await inView(a!)).toBe(true);
  // N 키: 보드에 키보드가 있을 때(chip 버튼에 포커스) 다음 콘솔로. 선택된 콘솔이 있어도 N 은 순서 돌기가 먼저
  await page.keyboard.press("n");
  await expect(page.locator(`[data-node-id="${b}"]`)).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("n");
  await expect(page.locator(`[data-node-id="${a}"]`)).toHaveAttribute("data-selected", "true"); // 한 바퀴
  // 해결되면 줄어든다
  await agentEvent(page, a!, "Stop");
  await expect(chip).toHaveText("1 needs you");
  await agentEvent(page, b!, "UserPromptSubmit");
  await expect(chip).toHaveCount(0);
});

test("S-690 Shortcuts 창에 N 줄", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.keyboard.press("Control+,");
  await page.getByRole("dialog", { name: "Settings" }).getByRole("tab", { name: "Shortcuts" }).click();
  await expect(page.getByText("Jump to the console that needs you")).toBeVisible();
  await expect(page.getByTestId("shortcut-needsYou")).toHaveText("N");
});

test("Codex 콘솔은 질문·실패 이벤트를 무시한다(S-685)", async ({ page }) => {
  await seedLive(page);
  await page.addInitScript(() => localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(["codex"]))); // 가짜 모드에서 codex 를 설치된 것으로(아니면 셸로 떨어진다)
  await page.goto("/?console=1&agent=codex");
  await expect(page.getByTestId("console")).toHaveCount(1);
  const [a] = await ids(page);
  await agentEvent(page, a!, "SessionStart");
  await expect(pill(page, 0)).toHaveText("READY");
  await agentEvent(page, a!, "StopFailure");
  await agentEvent(page, a!, "Notification", { message: "x" });
  await page.waitForTimeout(300);
  await expect(pill(page, 0)).toHaveText("READY");
});
