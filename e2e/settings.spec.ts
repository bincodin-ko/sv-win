import { expect, test, type Page } from "@playwright/test";

// B1 설정 틀. 가짜 IPC 설정은 localStorage "symvibe.fakeSettings" 에 저장된다.
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}") as Record<string, unknown>);
const dlg = (page: Page) => page.getByRole("dialog", { name: "Settings" });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
});

test("S-350/S-383 Ctrl+, 로 열리고 Account 가 먼저, Esc 로 닫힘", async ({ page }) => {
  await page.keyboard.press("Control+,");
  await expect(dlg(page)).toBeVisible();
  await expect(page.getByTestId("settings-pane-account")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dlg(page)).toHaveCount(0);
  await page.keyboard.press("Control+,");
  await page.getByTestId("settings-close").click();
  await expect(dlg(page)).toHaveCount(0);
});

test("S-351 창 목록 순서: Account General Appearance Shortcuts Agents Connections Voice About", async ({ page }) => {
  await page.keyboard.press("Control+,");
  const names = await dlg(page).getByRole("tab").allTextContents();
  expect(names).toEqual(["Account", "General", "Appearance", "Shortcuts", "Agents", "Connections", "Voice", "About"]); // spec/2묶음.md:68
});

test("S-354/S-352 Account 이름 입력이 저장된다", async ({ page }) => {
  await page.keyboard.press("Control+,");
  await page.getByLabel("Name").fill("Ann Lee");
  await expect.poll(async () => (await saved(page)).profileName).toBe("Ann Lee");
});

test("S-360 Theme 을 Light 로 하면 html[data-theme=light]", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "og");
  await page.keyboard.press("Control+,");
  await page.getByRole("tab", { name: "Appearance" }).click();
  await page.getByRole("radio", { name: "Light" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(async () => (await saved(page)).theme).toBe("light");
});

test("S-363 Text size 150% 가 설정에 저장된다", async ({ page }) => {
  await page.keyboard.press("Control+,");
  await page.getByRole("tab", { name: "Appearance" }).click();
  await page.getByLabel("Terminal text size").selectOption("150");
  await expect.poll(async () => (await saved(page)).textSize).toBe(150);
});

test("S-350 열려 있는 동안 v·t 키가 도구를 안 바꾼다", async ({ page }) => {
  await page.keyboard.press("t");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-active", "true");
  await page.keyboard.press("Control+,");
  await page.keyboard.press("v");
  await page.getByTestId("settings-close").click();
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-active", "true");
});
