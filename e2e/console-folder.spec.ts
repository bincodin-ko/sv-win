import { expect, test, type Page } from "@playwright/test";

// H4 콘솔 폴더(cwd): In folder… · 머리줄 폴더 이름 · 복제/에이전트 바꾸기 뒤 유지. 근거 S-2850~S-2857.
// 가짜: window.__fakePickFolder = 폴더 선택창 결과(없으면 취소), __fakePty.spawns() 의 cwd, window.__symSeed = 저장된 보드.
const REPO = "C:/fake/repo";
const con = (id: string, x: number, extra: object) => ({ id, kind: "console", x, y: -200, w: 720, h: 440, z: 1, name: id, agentId: "shell", textSize: null, yolo: false, ...extra });
const BOARD = JSON.stringify({
  formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: REPO }, viewport: { x: 0, y: 0, zoom: 0.4 },
  nodes: [
    con("c1", -1500, { cwd: "c:\\FAKE\\Repo\\" }), // 보드 repo 와 같음(대소문자·구분자 무시)
    con("c2", -700, { cwd: "D:/other/Proj" }),
    con("c3", 100, {}),
  ],
});
const item = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });
const spawns = (page: Page) => page.evaluate(() => (window as any).__fakePty.spawns() as { cwd?: string }[]);
const folder = (page: Page, i: number) => page.getByTestId("console").nth(i).getByTestId("console-folder");

async function ring(page: Page, pick?: string) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript((p) => { if (p) (window as any).__fakePickFolder = p; }, pick);
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await page.mouse.click(700, 450, { button: "right" });
  await item(page, "Spawn agent").click();
  await item(page, "In folder…").click();
}
async function seeded(page: Page) {
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), BOARD);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("console")).toHaveCount(3);
}

test("S-2854/S-2855 In folder… → 고른 폴더로 콘솔이 생기고 머리줄에 폴더 이름", async ({ page }) => {
  await ring(page, "D:/work/proj-x");
  await expect(page.getByTestId("console")).toHaveCount(1);
  await expect.poll(async () => (await spawns(page)).at(-1)?.cwd).toBe("D:/work/proj-x");
  await expect(folder(page, 0)).toHaveText(/proj-x/);
  await expect(folder(page, 0)).toHaveAttribute("title", "Folder: D:/work/proj-x");
});

test("S-2854 폴더 선택을 취소하면 아무것도 안 생긴다", async ({ page }) => {
  await ring(page);
  await expect(page.getByTestId("ring-menu")).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(page.getByTestId("console")).toHaveCount(0);
});

test("S-2855 cwd 가 보드 repo 와 같거나 없으면 폴더 표시 없음, 다르면 마지막 조각", async ({ page }) => {
  await seeded(page);
  await expect(folder(page, 0)).toHaveCount(0);
  await expect(folder(page, 1)).toHaveText(/Proj/);
  await expect(folder(page, 1)).toHaveAttribute("title", "Folder: D:/other/Proj");
  await expect(folder(page, 2)).toHaveCount(0);
  const cwds = (await spawns(page)).map((s) => s.cwd);
  expect(cwds).toEqual(expect.arrayContaining(["D:/other/Proj", REPO]));
});

test("S-2853/S-2856 Duplicate·에이전트 바꾸기 뒤에도 cwd 유지", async ({ page }) => {
  await seeded(page);
  await page.getByTestId("console").nth(1).getByTestId("console-duplicate").click();
  await expect(page.getByTestId("console")).toHaveCount(4);
  await expect(page.getByTestId("console-folder")).toHaveCount(2);
  await page.getByTestId("console").nth(1).getByTestId("console-badge").click();
  await page.locator('[data-agent-id="claude"]').click();
  const confirm = page.getByTestId("confirm-close"); // 실행 중이라 확인이 뜰 수 있다
  if (await confirm.isVisible({ timeout: 500 }).catch(() => false)) await confirm.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("console-folder")).toHaveCount(2);
  await expect.poll(async () => (await spawns(page)).filter((s) => s.cwd === "D:/other/Proj").length).toBeGreaterThanOrEqual(3);
});
