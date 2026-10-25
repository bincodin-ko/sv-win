import { expect, test, type Page } from "@playwright/test";

// 가짜 PTY(Tauri 밖)로 S-546·S-620~S-625 의 화면 쪽을 시험한다. window.__pause 는 시험 후크(pauseAll·resumeAll)
const ctl = (page: Page) => page.evaluate(() => (window as any).__fakePty.ctl() as { id: number; op: string }[]);
const emit = (page: Page, id: number, text: string) => page.evaluate(([i, t]) => (window as any).__fakePty.emit(i, t), [id, text] as const);
const pills = (page: Page) => page.getByTestId("console-status");
const ops = async (page: Page, id: number) => (await ctl(page)).filter((c) => c.id === id).map((c) => c.op);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=2&agent=claude");
  await expect(page.getByTestId("console")).toHaveCount(2);
});

test("S-546/S-620/S-621/S-624 pauseAll → pill PAUSED×2(호버 Paused)·ptyPause 기록 → resumeAll → 상태 복귀", async ({ page }) => {
  await emit(page, 1, "hi");
  await expect(pills(page).nth(0)).toHaveText("WORKING");
  await expect(pills(page).nth(0)).toHaveText("RUNNING", { timeout: 4000 });
  await page.evaluate(() => (window as any).__pause.pauseAll());
  await expect(pills(page).nth(0)).toHaveText("PAUSED");
  await expect(pills(page).nth(1)).toHaveText("PAUSED");
  await expect(pills(page).nth(0)).toHaveAttribute("title", /Click to pause\/resume/);
  expect((await ctl(page)).filter((c) => c.op === "pause").map((c) => c.id).sort()).toEqual([1, 2]);
  // 멈춘 동안 출력이 와도 PAUSED 유지
  await emit(page, 1, "more");
  await page.waitForTimeout(300);
  await expect(pills(page).nth(0)).toHaveText("PAUSED");
  // 이미 PAUSED 인 것을 또 멈추면 요청이 늘지 않는다
  await page.evaluate(() => (window as any).__pause.pauseAll());
  expect((await ctl(page)).filter((c) => c.op === "pause")).toHaveLength(2);

  await page.evaluate(() => (window as any).__pause.resumeAll());
  await expect(pills(page).nth(0)).toHaveText("RUNNING");
  await expect(pills(page).nth(1)).toHaveText("STARTING");
  expect((await ctl(page)).filter((c) => c.op === "resume")).toHaveLength(2);
  await emit(page, 1, "again");
  await expect(pills(page).nth(0)).toHaveText("WORKING");
});

test("S-622 PAUSED 콘솔 닫기 → 재개 뒤 kill 순서", async ({ page }) => {
  await page.evaluate(() => (window as any).__pause.pauseAll());
  await expect(pills(page).nth(0)).toHaveText("PAUSED");
  await page.getByTestId("console-close").nth(0).click();
  await page.getByTestId("confirm-close").getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(() => ops(page, 1)).toEqual(["pause", "resume", "kill"]);
});

test("S-622 PAUSED 콘솔 다시 시작 → 재개 뒤 kill, 새 PTY 는 멈춰 있지 않다", async ({ page }) => {
  await page.evaluate(() => (window as any).__pause.pauseAll());
  await expect(pills(page).nth(0)).toHaveText("PAUSED");
  await page.getByTestId("console-restart").nth(0).click();
  await page.getByTestId("confirm-close").getByRole("button", { name: "Close", exact: true }).click();
  await expect(pills(page).nth(0)).toHaveText("STARTING");
  await expect.poll(() => ops(page, 1)).toEqual(["pause", "resume", "kill"]);
  expect((await ctl(page)).filter((c) => c.id > 2 && c.op === "pause")).toHaveLength(0);
});
