import { expect, test, type Page } from "@playwright/test";

// U8: 스튜디오 대화상자 포커스(S-2740)·확인창 단추 순서(S-2605·S-2606)·Mission Map 행 Enter(S-2741). 기대값은 spec/8묶음.md 문장에서.
test.use({ actionTimeout: 5000 });
const inside = (p: Page, id: string) => p.evaluate((id) => !!document.activeElement && !!document.querySelector(`[data-testid="${id}"]`)?.contains(document.activeElement), id);
const names = (p: Page, id: string) => p.getByTestId(id).getByRole("button").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
const focusedName = (p: Page) => p.evaluate(() => (document.activeElement?.textContent ?? "").trim());

async function bootStudio(p: Page) {
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto("/?studioTest");
  await expect(p.getByTestId("command-bar")).toBeVisible();
}
async function openTool(p: Page, name: string) {
  await p.getByTestId("tools-btn").click();
  await p.getByRole("menuitem", { name, exact: true }).click();
  await expect(p.getByTestId("studio-frame")).toBeVisible();
}

test("S-2740 스튜디오 모달: Tab 15번 후에도 안에 있고, Esc 로 한 번 닫히며 Tools 단추로 포커스가 돌아온다", async ({ page }) => {
  await bootStudio(page);
  await page.getByTestId("tools-btn").focus();
  await page.getByTestId("tools-btn").press("Enter");
  await page.getByRole("menuitem", { name: "Code", exact: true }).click();
  await expect(page.getByTestId("studio-frame")).toBeVisible();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    expect(await inside(page, "studio-frame")).toBe(true);
  }
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await inside(page, "studio-frame")).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("studio-frame")).toHaveCount(0);
  await expect(page.getByTestId("tools-btn")).toBeFocused();
});

test("S-2740·S-2605·S-2606 저장 안 한 변경 확인창: 순서 Save·Don't Save·Cancel, 기본 포커스 Save, Tab 가둠, Esc = Cancel", async ({ page }) => {
  await bootStudio(page);
  await page.evaluate(() => (window as any).__openFakeStudio());
  await expect(page.getByTestId("studio-frame")).toBeVisible();
  await page.getByTestId("fake-studio-editor").fill("changed");
  await page.getByTestId("studio-close").click();
  const dlg = page.getByTestId("unsaved-dialog");
  await expect(dlg).toBeVisible();
  expect(await names(page, "unsaved-dialog")).toEqual(["Save", "Don't Save", "Cancel"]);
  expect(await focusedName(page)).toBe("Save");
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    expect(await inside(page, "unsaved-dialog")).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId("studio-frame")).toBeVisible(); // Esc = Cancel: 스튜디오는 그대로
  await expect(page.getByTestId("fake-studio-editor")).toHaveValue("changed");
});

test("S-2605·S-2606 md-confirm(휴지통): 순서 주 동작·Cancel, 위험이라 기본 포커스 Cancel, Esc 닫기", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__fakeStudio = { memoryDir: "C:/fake/mem", files: { "C:/fake/repo/README.md": "# Hello\n", "C:/fake/repo/docs/guide.md": "# Guide\n" }, mtimes: {} };
    w.__fakeFiles = { "C:/fake/repo/README.md": { text: "# Hello\n" } };
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("command-bar")).toBeVisible();
  await openTool(page, "Markdown");
  await page.locator('[data-testid="md-row"][data-path="C:/fake/repo/docs/guide.md"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to Recycle Bin" }).click();
  await expect(page.getByTestId("md-confirm")).toBeVisible();
  expect(await names(page, "md-confirm")).toEqual(["Move to Recycle Bin", "Cancel"]);
  expect(await focusedName(page)).toBe("Cancel");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await inside(page, "md-confirm")).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("md-confirm")).toHaveCount(0);
  await expect(page.getByTestId("studio-frame")).toBeVisible(); // 확인창만 닫힘
});

test("S-2741 Mission Map 행: Tab 정류장이고 포커스된 행에서 Enter = 그 콘솔로 이동(더블클릭과 같음)", async ({ page }) => {
  const con = (id: string, x: number, y: number) => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name: `Con ${id}`, agentId: "shell", textSize: null, yolo: false });
  const board = JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 0.5 }, nodes: [con("c1", -760, -400), con("c2", 40, -400)], groups: [] });
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), board);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("console")).toHaveCount(2);
  await page.mouse.click(1300, 100);
  await page.keyboard.press("x");
  await expect(page.getByTestId("mission-map")).toBeVisible();
  const row = page.locator('[data-testid="mm-console"][data-id="c2"]');
  await page.getByTestId("mm-search").focus();
  for (let i = 0; i < 12 && !(await row.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(row).toBeFocused(); // Tab 으로 닿는다
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("mission-map")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__kt.st().selection as string[])).toEqual(["c2"]);
});
