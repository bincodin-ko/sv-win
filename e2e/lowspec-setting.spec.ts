import { expect, test, type Page } from "@playwright/test";

// P4 저사양 모드 스위치. PW_PORT=1674. 가짜 설정은 localStorage "symvibe.fakeSettings".
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}") as Record<string, unknown>);
const open = async (page: Page) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=shell");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await page.keyboard.press("Control+,");
  await page.getByRole("tab", { name: "Appearance" }).click();
};

test("저사양 스위치: 켜면 lowSpec true 저장·html data-lowspec, 끄면 사라진다", async ({ page }) => {
  await open(page);
  const sw = page.getByTestId("set-lowspec");
  await expect(sw).not.toBeChecked();
  await expect(page.locator("html")).not.toHaveAttribute("data-lowspec", /.*/);
  await sw.check();
  await expect.poll(async () => (await saved(page)).lowSpec).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-lowspec", /.*/);
  await sw.uncheck();
  await expect.poll(async () => (await saved(page)).lowSpec).toBe(false);
  await expect(page.locator("html")).not.toHaveAttribute("data-lowspec", /.*/);
});

test("저장된 lowSpec true 로 시작하면 data-lowspec 이 이미 있고, 한국어 라벨", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ lowSpec: true, language: "ko" })));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=shell");
  await expect(page.locator("html")).toHaveAttribute("data-lowspec", /.*/);
  await page.keyboard.press("Control+,");
  await page.getByRole("tab", { name: "모양" }).click();
  await expect(page.getByTestId("set-lowspec")).toBeChecked();
  await expect(page.getByTestId("set-lowspec").locator("..")).toContainText("저사양 모드");
});
