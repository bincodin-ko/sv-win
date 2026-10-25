import { expect, test, type Page } from "@playwright/test";

// 5묶음 E1: 스튜디오 틀·진입 (S-1800~S-1810). 가짜 스튜디오(id fake) 하나를 ?studioTest 로 등록한다(진짜 E4~E7 과 안 겹침). 열기는 window.__openFakeStudio().
// 가짜 스튜디오: 글상자(fake-studio-editor, 쓰면 저장 안 한 편집으로 등록)와 arg 표시(fake-studio-arg). 저장하면 window.__fakeStudioSaves 에 쌓인다.
test.use({ actionTimeout: 5000 });
const frame = (p: Page) => p.getByTestId("studio-frame");
const input = (p: Page) => p.getByTestId("bar-input");
const say = async (p: Page, t: string) => { await input(p).fill(t); await input(p).press("Enter"); };
const blank = (p: Page) => p.mouse.click(1300, 100);
const boot = async (p: Page) => {
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto("/?studioTest");
  await expect(p.getByTestId("command-bar")).toBeVisible();
};
const openFake = (p: Page) => p.evaluate(() => (window as any).__openFakeStudio());
const tool = async (p: Page, name: string) => { await p.getByTestId("tools-btn").click(); await p.getByRole("menuitem", { name, exact: true }).click(); };

test("S-1800·S-1801 Tools 로 열면 가운데 모달, 제목에 repo 이름, × 로 닫고 바깥은 안 닫힌다", async ({ page }) => {
  await boot(page);
  await tool(page, "Code");
  await expect(frame(page)).toBeVisible();
  await expect(frame(page)).toHaveAttribute("role", "dialog");
  await expect(page.getByTestId("studio-title")).toHaveText("Code — repo");
  const box = (await frame(page).boundingBox())!;
  expect(box.width).toBeGreaterThan(1200);
  expect(box.width).toBeLessThanOrEqual(1288); // min(1280px, 92vw)
  await page.mouse.click(4, 450); // 바깥
  await expect(frame(page)).toBeVisible();
  await page.getByTestId("studio-close").click();
  await expect(frame(page)).toHaveCount(0);
});

test("S-1802 Esc 로 닫히고, 열려 있는 동안 보드 한 글자 키는 안 먹는다", async ({ page }) => {
  await boot(page);
  await tool(page, "Skills");
  await expect(page.getByTestId("studio-title")).toHaveText("Skills");
  await page.keyboard.press("m"); // Memory 키
  await expect(page.getByTestId("memory-panel")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(frame(page)).toHaveCount(0);
  await blank(page);
  await page.keyboard.press("m");
  await expect(page.getByTestId("memory-panel")).toBeVisible();
});

test("S-1804 Tools 메뉴 순서(스튜디오 항목은 등록돼 있을 때만, Documents 는 없다)", async ({ page }) => {
  await boot(page);
  await page.getByTestId("tools-btn").click();
  await expect(page.getByRole("menuitem")).toHaveText(["Presets", "GitHub", "Code", "Markdown", "Mission Map", "Memory", "Skills", "Loops", "Settings"]);
});

test("S-1805 우측 레일: Browse project code·Browse markdown docs·Generate PDF(고르면 Documents 에서 그 항목만 선택)", async ({ page }) => {
  await boot(page);
  const order = await page.locator('[data-testid^="rail-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")).filter((t) => ["rail-presets", "rail-insert-todo", "rail-code", "rail-markdown", "rail-pdf", "rail-loops"].includes(t!)));
  expect(order).toEqual(["rail-presets", "rail-insert-todo", "rail-code", "rail-markdown", "rail-pdf", "rail-loops"]);
  await expect(page.getByTestId("rail-code")).toHaveText("Browse project code");
  await expect(page.getByTestId("rail-markdown")).toHaveText("Browse markdown docs");
  await page.getByTestId("rail-code").click();
  await expect(page.getByTestId("studio-title")).toHaveText("Code — repo");
  await page.keyboard.press("Escape");
  await page.getByTestId("rail-pdf").click();
  await expect(page.getByRole("menuitem")).toHaveText(["Project overview", "Onboarding guide", "Architecture", "Ask for anything"]);
  await page.getByRole("menuitem", { name: "Architecture" }).click();
  await expect(page.getByTestId("studio-title")).toHaveText("Documents — repo");
  await expect(page.getByTestId("doc-item-architecture")).toHaveAttribute("aria-selected", "true"); // E6: 진짜 Documents 가 등록돼 가짜 대신 목록 선택으로 확인
});

test("S-1806 키: D = Markdown, S = Skills", async ({ page }) => {
  await boot(page);
  await blank(page);
  await page.keyboard.press("d");
  await expect(page.getByTestId("studio-title")).toHaveText("Markdown — repo");
  await page.keyboard.press("Escape");
  await expect(frame(page)).toHaveCount(0);
  await blank(page);
  await page.keyboard.press("s");
  await expect(page.getByTestId("studio-title")).toHaveText("Skills");
});

test("S-1807 명령 open code/markdown/documents/skills 로 열고 close that 으로 닫는다", async ({ page }) => {
  await boot(page);
  await page.getByTestId("thread-toggle").click();
  for (const [w, title] of [["code", "Code — repo"], ["markdown", "Markdown — repo"], ["documents", "Documents — repo"], ["skills", "Skills"]] as const) {
    await say(page, `open ${w}`);
    await expect(page.getByTestId("studio-title")).toHaveText(title);
    await say(page, "close that");
    await expect(frame(page)).toHaveCount(0);
  }
});

test("S-1808 칩: 스레드가 열리면 Loops, Docs, Code, Skills, Mission Map, Kill all 순서, 누르면 열린다", async ({ page }) => {
  await boot(page);
  const names = () => page.getByTestId("command-bar").locator('[data-testid^="chip-"]').allTextContents();
  await page.getByTestId("thread-toggle").click();
  await expect(page.getByTestId("thread-panel")).toBeVisible();
  const n = await names();
  expect(n.slice(n.indexOf("Loops"))).toEqual(["Loops", "Docs", "Code", "Skills", "Mission Map", "Kill all"]);
  await page.getByTestId("chip-docs").click();
  await expect(page.getByTestId("studio-title")).toHaveText("Documents — repo");
  await page.keyboard.press("Escape");
  await page.getByTestId("chip-code").click();
  await expect(page.getByTestId("studio-title")).toHaveText("Code — repo");
});

test("S-1809 help 에 스튜디오 열기가 있다", async ({ page }) => {
  await boot(page);
  await page.getByTestId("thread-toggle").click();
  await say(page, "help");
  await expect(page.getByTestId("thread-msg").last()).toContainText("open documents");
});

test("S-1810 저장 안 한 편집: Cancel 은 그대로, Don't Save 는 버리고 닫고, Save 는 저장하고 닫고, 저장 실패면 안 닫힌다", async ({ page }) => {
  await boot(page);
  const dlg = page.getByTestId("unsaved-dialog");
  await openFake(page);
  await page.getByTestId("fake-studio-editor").fill("changed");
  await page.getByTestId("studio-close").click();
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("Save your code changes?");
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(frame(page)).toBeVisible();
  await expect(page.getByTestId("fake-studio-editor")).toHaveValue("changed");
  await page.getByTestId("studio-close").click();
  await dlg.getByRole("button", { name: "Don't Save" }).click();
  await expect(frame(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__fakeStudioSaves ?? [])).toEqual([]);
  // Save
  await openFake(page);
  await page.getByTestId("fake-studio-editor").fill("v2");
  await page.getByTestId("studio-close").click();
  await dlg.getByRole("button", { name: "Save", exact: true }).click();
  await expect(frame(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__fakeStudioSaves)).toEqual(["v2"]);
  // 저장 실패
  await openFake(page);
  await page.evaluate(() => { (window as any).__fakeStudioFail = true; });
  await page.getByTestId("fake-studio-editor").fill("v3");
  await page.getByTestId("studio-close").click();
  await dlg.getByRole("button", { name: "Save", exact: true }).click();
  await expect(frame(page)).toBeVisible();
  await expect(dlg).toHaveCount(0);
});

test("S-1810 Ctrl+Q 도 저장 안 한 편집을 먼저 묻는다", async ({ page }) => {
  await boot(page);
  await openFake(page);
  await page.getByTestId("fake-studio-editor").fill("x");
  await page.keyboard.press("Control+q");
  await expect(page.getByTestId("unsaved-dialog")).toBeVisible();
  await page.getByTestId("unsaved-dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("quit-confirm")).toHaveCount(0);
});
