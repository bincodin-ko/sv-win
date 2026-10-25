import { expect, test, type Page } from "@playwright/test";

// U4 (S-2660~S-2667): F2 이름 입력·조합 중 Enter·pill 글자색·전역 포커스 윤곽·라이브 상태 안내. 저장 실패 알림(S-2666)은 vitest(persist.notice.test.ts).
const ready = (page: Page) => expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
const ids = (page: Page) => page.evaluate(() => (window as any).__fakePty.ids() as number[]);
const status = (page: Page) => page.getByTestId("console-status").first();
const color = (page: Page, tid: string) => page.getByTestId(tid).first().evaluate((e) => getComputedStyle(e).color);
const nodeId = (page: Page) => page.locator("[data-node-id]").first().getAttribute("data-node-id");
const rename = (page: Page, id: string | null) => page.evaluate((i) => window.dispatchEvent(new CustomEvent("symvibe:rename-console", { detail: { id: i } })), id);
const ORANGE = "rgb(249, 115, 22)";
const WHITE = "rgb(255, 255, 255)";
const INK = "rgb(17, 17, 17)";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test("S-2660 symvibe:rename-console(자기 id)가 이름 입력을 연다, 다른 id 는 무시", async ({ page }) => {
  await page.goto("/?console=2&agent=shell");
  await expect(page.getByTestId("console-name")).toHaveCount(2);
  const id = (await nodeId(page))!;
  await rename(page, "nope");
  await expect(page.getByTestId("console-name-input")).toHaveCount(0);
  await rename(page, id);
  await expect(page.getByTestId("console-name-input")).toHaveCount(1);
  await expect(page.getByTestId("console-name-input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("console-name-input")).toHaveCount(0);
});

test("S-2661 조합 중 Enter·Esc 는 입력기 몫(이름 입력이 그대로), 일반 Enter 는 확정", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  await rename(page, (await nodeId(page))!);
  const input = page.getByTestId("console-name-input");
  await input.fill("가나");
  await input.evaluate((el) => {
    for (const key of ["Enter", "Escape"]) el.dispatchEvent(new KeyboardEvent("keydown", { key, isComposing: true, bubbles: true, cancelable: true }));
  });
  await expect(input).toHaveCount(1);
  await expect(input).toHaveValue("가나");
  await page.keyboard.press("Enter");
  await expect(input).toHaveCount(0);
  await expect(page.getByTestId("console-name")).toHaveText("가나");
});

test("S-2662 pill 글자색: IDLE·DONE 흰색, STARTING·WORKING·RUNNING #111", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  await expect(status(page)).toHaveText("IDLE");
  expect(await color(page, "console-status")).toBe(WHITE);
  await page.goto("/?console=1&agent=claude");
  await expect(status(page)).toHaveText("STARTING");
  expect(await color(page, "console-status")).toBe(INK);
  const [a] = await ids(page);
  await page.evaluate((i) => (window as any).__fakePty.emit(i, "hello\r\n"), a);
  await expect(status(page)).toHaveText("WORKING");
  expect(await color(page, "console-status")).toBe(INK);
  await expect(status(page)).toHaveText("RUNNING", { timeout: 4000 });
  expect(await color(page, "console-status")).toBe(INK);
  await page.goto("/?console=1&agent=shell"); // 에이전트는 끝나면 셸로 떨어지므로 DONE 은 셸로
  const [sh] = await ids(page);
  await page.evaluate((i) => (window as any).__fakePty.exit(i, 0), sh);
  await expect(status(page)).toHaveAttribute("data-status", "DONE");
  expect(await color(page, "console-status")).toBe(WHITE);
});

test("S-2663 주황 단추 위 글자 = #111 (Resume 등 --accent-text 를 쓰는 곳)", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent-text").trim())).toBe("#111");
});

test("S-2664 Tab 키보드 포커스는 주황 2px 윤곽, 마우스 클릭에는 없다", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const outline = () => page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return { w: s.outlineWidth, st: s.outlineStyle, c: s.outlineColor, o: s.outlineOffset, tag: document.activeElement!.tagName }; });
  let o = await outline();
  for (let i = 0; i < 12 && o.tag !== "BUTTON"; i++) { await page.keyboard.press("Tab"); o = await outline(); }
  expect(o).toMatchObject({ tag: "BUTTON", w: "2px", st: "solid", c: ORANGE, o: "2px" });
  await page.getByTestId("rail-select").click(); // 마우스 → :focus-visible 아님
  expect((await outline()).st).not.toBe("solid");
});

test("S-2664 홈 화면의 설정 단추도 Tab 으로 포커스 윤곽", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ reopenLastRepo: false })));
  await page.goto("/");
  const btn = page.getByTestId("home-settings");
  await expect(btn).toBeVisible();
  for (let i = 0; i < 30 && !(await btn.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(btn).toBeFocused();
  const s = await btn.evaluate((e) => { const c = getComputedStyle(e); return [c.outlineWidth, c.outlineStyle, c.outlineColor]; });
  expect(s).toEqual(["2px", "solid", ORANGE]);
});

const spawnAgent = async (page: Page) => {
  await page.keyboard.press("t");
  await page.mouse.click(600, 300); // 무장된 에이전트(claude) 콘솔이 놓인다
  await expect(page.getByTestId("console")).toHaveCount(1);
};
const settingsJson = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}"));

test("S-2667 첫 에이전트 콘솔 뒤 안내 → [Turn on] 은 설정 Agents 를 열고, 다시 시작해도 안 뜬다", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.waitForTimeout(3500); // 복원 직후 유예
  await spawnAgent(page);
  const note = page.getByTestId("app-notice");
  await expect(note).toContainText("Turn on live status?");
  await expect(note.getByRole("button", { name: "Not now" })).toBeVisible();
  await note.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByTestId("settings-pane-agents")).toBeVisible();
  expect((await settingsJson(page)).liveStatusAsked).toBe(true);
  expect((await settingsJson(page)).liveStatus).not.toBe(true); // 안내가 대신 켜지 않는다
  await page.reload();
  await ready(page);
  await page.waitForTimeout(3500);
  await spawnAgent(page);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("app-notice")).toHaveCount(0);
});

test("S-2667 [Not now] 도 liveStatusAsked 를 저장하고 알림이 닫힌다", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.waitForTimeout(3500);
  await spawnAgent(page);
  await page.getByTestId("app-notice").getByRole("button", { name: "Not now" }).click();
  await expect(page.getByTestId("app-notice")).toHaveCount(0);
  expect((await settingsJson(page)).liveStatusAsked).toBe(true);
});

test("S-2667 liveStatus 가 이미 켜져 있으면 안내 없음", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ liveStatus: true })));
  await page.goto("/");
  await ready(page);
  await page.waitForTimeout(3500);
  await spawnAgent(page);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("app-notice")).toHaveCount(0);
});
