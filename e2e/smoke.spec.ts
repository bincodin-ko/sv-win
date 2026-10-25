import { expect, test } from "@playwright/test";

test("터미널 1개가 뜨고 타이핑이 되울려 보인다", async ({ page }) => {
  await page.goto("/?term");
  await expect(page.locator(".xterm")).toHaveCount(1);
  await page.locator(".xterm").click();
  await page.keyboard.type("hello-sym");
  await expect
    .poll(() => page.evaluate(() => [...((window as any).__terms?.values() ?? [])][0]?.buffer.active.getLine(0)?.translateToString(true)))
    .toContain("hello-sym");
});
