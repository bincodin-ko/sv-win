import { expect, test, type Page } from "@playwright/test";

// U1 대화상자 포커스·단추 순서·설정 창. 근거 S-2600~S-2607 (spec/8묶음.md §1). 가짜 IPC 기본 repo.
// 확인창은 Close repo(danger:true, shell/workspaces.ts)로 연다.
const dlg = (p: Page) => p.getByRole("dialog");
const inside = (p: Page) => p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
const openConfirm = async (p: Page) => { await p.getByTestId("close-repo").click(); await expect(dlg(p)).toBeVisible(); };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("tab")).toHaveCount(1);
});

test("S-2601 확인창에서 Tab 12번 눌러도 포커스가 대화상자 안에 있다", async ({ page }) => {
  await openConfirm(page);
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); expect(await inside(page)).toBe(true); }
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Shift+Tab"); expect(await inside(page)).toBe(true); }
});

test("S-2602 포커스가 밖(body)이어도 Esc 로 닫힌다", async ({ page }) => {
  await openConfirm(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await inside(page)).toBe(false);
  await page.keyboard.press("Escape");
  await expect(dlg(page)).toHaveCount(0);
});

test("S-2603 닫으면 열었던 단추로 포커스가 돌아간다", async ({ page }) => {
  await openConfirm(page);
  await page.keyboard.press("Escape");
  await expect(dlg(page)).toHaveCount(0);
  await expect(page.getByTestId("close-repo")).toBeFocused();
});

test("S-2605·S-2606 danger 확인창: 단추 순서 [주 동작, Cancel], Cancel 에 포커스, Enter = 취소", async ({ page }) => {
  await openConfirm(page);
  const btns = dlg(page).getByRole("button");
  await expect(btns).toHaveCount(2);
  await expect(btns.nth(1)).toHaveText("Cancel");
  await expect(btns.nth(0)).not.toHaveText("Cancel");
  await expect(btns.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dlg(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__shell.view() as string)).toBe("board");
});

test("S-2607 설정 창: Tab 가두기·마지막 pane 기억·pane 목록 ↑↓ 와 Tab 한 정류장", async ({ page }) => {
  await page.keyboard.press("Control+,");
  const s = page.getByRole("dialog", { name: "Settings" });
  await expect(s).toBeVisible();
  for (let i = 0; i < 25; i++) { await page.keyboard.press("Tab"); expect(await inside(page)).toBe(true); }
  const tabs = s.getByRole("tab");
  await expect(s.locator('[role="tab"][tabindex="0"]')).toHaveCount(1); // roving tabindex
  await tabs.nth(0).focus();
  await page.keyboard.press("ArrowDown");
  await expect(tabs.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(tabs.nth(2)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(tabs.nth(1)).toBeFocused();
  await s.getByRole("tab", { name: "Voice" }).click();
  await expect(page.getByTestId("settings-pane-voice")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(s).toHaveCount(0);
  await page.keyboard.press("Control+,");
  await expect(page.getByTestId("settings-pane-voice")).toBeVisible();
});
