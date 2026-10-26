import { expect, test, type Page } from "@playwright/test";

// 1-3 우클릭 = 메뉴만, 1-4 콘솔 크게 보기, 1-6 pill 로 콘솔별 일시정지 (가짜 PTY)
const ids = (page: Page) => page.evaluate(() => (window as any).__fakePty.ids() as number[]);
const writes = (page: Page, id: number) => page.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);
const ctl = (page: Page) => page.evaluate(() => (window as any).__fakePty.ctl() as { id: number; op: string }[]);
const emit = (page: Page, id: number, text: string) => page.evaluate(([i, t]) => (window as any).__fakePty.emit(i, t), [id, text] as const);
const text = (page: Page, id: number) =>
  page.evaluate((i) => {
    const b = (window as any).__terms.get(i).buffer.active;
    let s = "";
    for (let r = 0; r < b.length; r++) s += (b.getLine(r)?.translateToString(true) ?? "") + "\n";
    return s;
  }, id);
const pill = (page: Page, n: number) => page.getByTestId("console-status").nth(n);
const node = (page: Page, n = 0) => page.locator("[data-node-id]").nth(n);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=2&agent=claude");
  await expect(page.getByTestId("console")).toHaveCount(2);
});

test("1-3 우클릭 = 메뉴만: 메뉴가 뜨고 PTY 로 아무것도 안 간다(메뉴 Paste 가 유일한 길)", async ({ page }) => {
  const [a] = await ids(page);
  await page.evaluate(() => navigator.clipboard.writeText("PASTED").catch(() => {}));
  await page.locator(".xterm").first().click({ button: "right" });
  const menu = page.getByTestId("node-menu");
  await expect(menu).toBeVisible();
  for (const n of ["Paste", "Select all", "Maximize", "Pause"]) await expect(menu.getByRole("button", { name: n, exact: true }).or(menu.getByText(n, { exact: true }))).toBeVisible();
  await page.waitForTimeout(300);
  expect(await writes(page, a!)).toEqual([]);
});

test("1-4 크게 보기: ⤢ 단추 → 창 전체, 같은 xterm·세션·출력 유지, Esc 복귀", async ({ page }) => {
  const [a, b] = await ids(page);
  await emit(page, a!, "KEEP-ME\r\n");
  await page.evaluate(() => { (document.querySelector(".xterm") as any).__mark = 1; });
  const before = await node(page).boundingBox();
  await page.getByTestId("console-maximize").first().click();
  await expect.poll(async () => Math.round((await node(page).boundingBox())!.width)).toBe(1400);
  const big = (await node(page).boundingBox())!;
  expect([Math.round(big.x), Math.round(big.y), Math.round(big.height)]).toEqual([0, 0, 900]);
  expect(await ids(page)).toEqual([a, b]); // 새 PTY 없음
  expect(await page.evaluate(() => (document.querySelector(".xterm") as any).__mark)).toBe(1); // 같은 DOM
  await emit(page, a!, "AFTER\r\n");
  expect(await text(page, a!)).toContain("KEEP-ME");
  await expect.poll(() => text(page, a!)).toContain("AFTER"); // 출력은 프레임 묶음으로 써진다
  await page.keyboard.press("Escape");
  await expect.poll(async () => Math.round((await node(page).boundingBox())!.width)).toBe(Math.round(before!.width));
  expect(await ids(page)).toEqual([a, b]);
});

test("1-4 크게 보기: 빈 머리줄 더블클릭 = 크게, 이름 더블클릭 = 이름 바꾸기, 같은 단추로 복귀", async ({ page }) => {
  await page.getByTestId("console-name").first().dblclick();
  await expect(page.getByTestId("console-name-input")).toBeVisible();
  expect(Math.round((await node(page).boundingBox())!.width)).toBeLessThan(1400);
  await page.keyboard.press("Escape");
  const h = (await page.locator("[data-node-handle]").first().boundingBox())!;
  await page.mouse.dblclick(h.x + h.width / 2, h.y + h.height / 2); // 가운데 = 빈 칸(오른쪽은 알약·단추가 넓어짐)
  await expect.poll(async () => Math.round((await node(page).boundingBox())!.width)).toBe(1400);
  await expect(page.getByTestId("console-maximize").first()).toHaveText(/Restore/); // 크게 보기 중엔 글자 단추(아이콘 ⤢ 와 헷갈리지 않게)
  await page.getByTestId("console-maximize").first().click();
  await expect.poll(async () => Math.round((await node(page).boundingBox())!.width)).toBeLessThan(1400);
  await expect(page.getByTestId("console-maximize").first()).toHaveText("⤢");
});

test("1-4 Ctrl+Shift+Enter = 선택된 콘솔 크게/복귀", async ({ page }) => {
  await page.locator("[data-node-handle]").first().click();
  await page.keyboard.press("Control+Shift+Enter");
  await expect.poll(async () => Math.round((await node(page).boundingBox())!.width)).toBe(1400);
  await page.keyboard.press("Control+Shift+Enter");
  await expect.poll(async () => Math.round((await node(page).boundingBox())!.width)).toBeLessThan(1400);
});

test("1-6 pill 클릭 = 그 콘솔만 PAUSED, 다시 클릭 = 재개, 출력 유실 없음, Enter 도 된다", async ({ page }) => {
  const [a, b] = await ids(page);
  await emit(page, a!, "x");
  await expect(pill(page, 0)).toHaveText("RUNNING", { timeout: 4000 });
  await expect(pill(page, 0)).toHaveAttribute("title", /Click to pause\/resume/);
  await pill(page, 0).click();
  await expect(pill(page, 0)).toHaveText("PAUSED");
  await expect(pill(page, 1)).not.toHaveText("PAUSED");
  expect(await ctl(page)).toEqual([{ id: a, op: "pause" }]);
  await emit(page, a!, "WHILE-PAUSED\r\n");
  await expect.poll(() => text(page, a!)).toContain("WHILE-PAUSED"); // 멈춰도 화면 출력은 계속 받는다
  await pill(page, 0).click();
  await expect(pill(page, 0)).not.toHaveText("PAUSED");
  expect(await ctl(page)).toEqual([{ id: a, op: "pause" }, { id: a, op: "resume" }]);
  await pill(page, 1).focus();
  await page.keyboard.press("Enter");
  await expect(pill(page, 1)).toHaveText("PAUSED");
  expect((await ctl(page)).at(-1)).toEqual({ id: b, op: "pause" });
});
