import { expect, test, type Page } from "@playwright/test";

// D15: 명령줄 4묶음 (S-1730~S-1740). 가짜 IPC·가짜 PTY만 쓴다.
const input = (p: Page) => p.getByTestId("bar-input");
const msgs = (p: Page) => p.getByTestId("thread-msg");
const lastMsg = (p: Page) => msgs(p).last();
const chip = (p: Page, id: string) => p.getByTestId(`chip-${id}`);
const ids = (p: Page) => p.evaluate(() => (window as any).__fakePty.ids() as number[]);
const writes = (p: Page, id: number) => p.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);
const emit = (p: Page, id: number, t: string) => p.evaluate(([i, s]) => (window as any).__fakePty.emit(i, s), [id, t] as const);
const say = async (p: Page, t: string) => {
  await input(p).fill(t);
  await input(p).press("Enter");
};
const open = async (p: Page, n = 2) => {
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto(n ? `/?console=${n}&agent=claude` : "/");
  await expect(p.getByTestId("command-bar")).toBeVisible();
  if (n) await expect(p.getByTestId("console")).toHaveCount(n);
  await p.getByTestId("thread-toggle").click();
  await expect(p.getByTestId("thread-panel")).toBeVisible();
};

test("S-1730 open memory/loops/mission map/usage 가 패널을 열고 close that 이 닫는다", async ({ page }) => {
  await open(page, 0);
  for (const [cmd, tid] of [["open memory", "memory-panel"], ["open loops", "loops-panel"], ["open mission map", "mission-map"], ["open usage", "usage-panel"]] as const) {
    await say(page, cmd);
    await expect(page.getByTestId(tid)).toBeVisible();
    await say(page, "close that");
    await expect(page.getByTestId(tid)).toHaveCount(0);
  }
});

test("S-1732·S-1733 add an orchestrator for group 1 -> 카드와 답, 카드 둘이면 connect 가 되묻는다", async ({ page }) => {
  await open(page, 0);
  await say(page, "make a group of two claude");
  await expect(page.getByTestId("group-halo")).toHaveCount(1);
  await say(page, "add an orchestrator for group 1");
  await expect(page.getByTestId("orch-card")).toHaveCount(1);
  await expect(lastMsg(page)).toHaveText(/^Orchestrator added for .+\. Wire to 2 consoles\.$/); // 이름 없는 그룹은 역할 이름으로 말한다
  await say(page, "add an orchestrator");
  await expect(page.getByTestId("orch-card")).toHaveCount(2);
  await say(page, "connect group 1 to the orchestrator");
  await expect(lastMsg(page)).toHaveText("Which orchestrator? Orchestrator, Orchestrator 2");
  await say(page, "connect group 1 to orchestrator 2");
  await expect(lastMsg(page)).toHaveText("Wired the group.");
});

test("S-1735 every 10 minutes run the tests -> 확인창, Create 면 Loops 에 loop, Cancel 이면 없음", async ({ page }) => {
  await open(page, 0);
  await say(page, "every 10 minutes run the tests");
  const dlg = page.getByRole("dialog", { name: "Create a recurring instruction?" });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("Every 10 min: run the tests");
  await expect(dlg).toContainText("Sent to all consoles on the board.");
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(lastMsg(page)).toHaveText("Okay, no loop.");
  await say(page, "open loops");
  await expect(page.getByTestId("loop-row")).toHaveCount(0);
  await say(page, "close that");
  await say(page, "every 10 minutes run the tests");
  await page.getByRole("dialog", { name: "Create a recurring instruction?" }).getByRole("button", { name: "Create" }).click();
  await expect(lastMsg(page)).toHaveText("Loop started: every 10 min.");
  await say(page, "open loops");
  await expect(page.getByTestId("loop-row")).toHaveCount(1);
  await say(page, "close that");
  await say(page, "every 30 seconds ping");
  await expect(lastMsg(page)).toHaveText("Loops run every 1 minute to 24 hours.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("S-1738 pass this task to codex -> 소스 콘솔에 요약 요청이 한 줄 입력된다", async ({ page }) => {
  await open(page, 1);
  const [id] = await ids(page);
  await emit(page, id!, "Welcome\r\n> ");
  await say(page, "pass this task to codex");
  await expect(lastMsg(page)).toHaveText(/^Asking .+ for a summary\.$/);
  await expect.poll(async () => (await writes(page, id!)).join("")).toContain("Please summarize this task and where it stands");
  await say(page, "cancel that");
  await expect(lastMsg(page)).toHaveText("Cancelled.");
});

test("S-1736 칩 줄: Memory 는 항상, 스레드가 열리면 Loops·Mission Map·Kill all, 순서", async ({ page }) => {
  await open(page, 0);
  const names = () => page.getByTestId("command-bar").locator('[data-testid^="chip-"]').allTextContents();
  await page.getByTestId("thread-toggle").click();
  await expect(page.getByTestId("thread-panel")).toHaveCount(0);
  expect(await names()).toEqual(["New console", "Spawn 4…", "Group", "Presets", "Pause all", "Resume all", "Memory"]);
  await page.getByTestId("thread-toggle").click();
  const base = ["New console", "Spawn 4…", "Group", "Presets", "Pause all", "Resume all", "Memory", "Loops", "Mission Map", "Kill all"]; // 5묶음 E1: Docs·Code·Skills 칩은 스튜디오가 등록된 뒤에만 끼므로 기본 칩만 걸러 본다
  expect((await names()).filter((n) => base.includes(n))).toEqual(base);
  for (const [c, tid] of [["loops", "loops-panel"], ["mission-map", "mission-map"], ["memory", "memory-panel"]] as const) {
    await chip(page, c).click();
    await expect(page.getByTestId(tid)).toBeVisible();
    await say(page, "close that");
    await expect(page.getByTestId(tid)).toHaveCount(0);
  }
});

test("S-1737 힌트 Try \"pass this task to codex\" 는 × 로 닫으면 새로고침 뒤에도 안 보인다", async ({ page }) => {
  await open(page, 0);
  await expect(page.getByTestId("bar-hint")).toHaveText(/Try "pass this task to codex"/);
  await page.getByTestId("hint-close").click();
  await expect(page.getByTestId("bar-hint")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("command-bar")).toBeVisible();
  await expect(page.getByTestId("bar-hint")).toHaveCount(0);
});
