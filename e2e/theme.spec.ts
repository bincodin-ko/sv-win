import { expect, test, type Page } from "@playwright/test";

// S-361/S-411: Light 로 바꾸면 모든 화면이 따라 바뀌고 터미널 세션은 유지
const setTheme = (page: Page, t: "og" | "light") => page.evaluate((x) => document.documentElement.setAttribute("data-theme", x), t);
const bg = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor);

test("Light 로 바꾸면 보드·콘솔 헤더·터미널 색이 바뀌고 세션·글자는 그대로, OG 로 되돌리면 원래 값", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=shell");
  await expect(page.locator(".xterm")).toHaveCount(1);
  const [id] = await page.evaluate(() => (window as any).__fakePty.ids() as number[]);
  await page.evaluate((i) => (window as any).__fakePty.emit(i, "KEEPME\r\n"), id);
  const sels = ["body", '[data-testid="console"]', "[data-node-id]", ".xterm-screen"];
  const og = await Promise.all(sels.map((s) => bg(page, s)));
  const ogTerm = await page.evaluate((i) => (window as any).__terms.get(i).options.theme.background as string, id);
  await setTheme(page, "light");
  const li = await Promise.all(sels.map((s) => bg(page, s)));
  expect(li[0]).not.toBe(og[0]); // 바탕
  expect(li[1]).not.toBe(og[1]); // 콘솔 본체(헤더 줄 포함)
  await expect.poll(() => page.evaluate((i) => (window as any).__terms.get(i).options.theme.background as string, id)).not.toBe(ogTerm);
  const buf = await page.evaluate((i) => { const b = (window as any).__terms.get(i).buffer.active; let s = ""; for (let r = 0; r < b.length; r++) s += b.getLine(r)?.translateToString(true) ?? ""; return s; }, id);
  expect(buf).toContain("KEEPME");
  expect(await page.evaluate(() => (window as any).__fakePty.ids().length)).toBe(1);
  await setTheme(page, "og");
  expect(await Promise.all(sels.map((s) => bg(page, s)))).toEqual(og);
});

test("Light 에서 확인창(종료 확인)이 OG 와 다른 배경", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=shell");
  await page.getByTestId("console-close").click();
  const dlg = page.getByRole("dialog").first();
  await expect(dlg).toBeVisible();
  const og = await dlg.evaluate((el) => getComputedStyle(el).backgroundColor);
  await setTheme(page, "light");
  expect(await dlg.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(og);
});
