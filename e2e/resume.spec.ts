import { expect, test, type Page } from "@playwright/test";

// A9: 저장된 보드(claude 콘솔 2개) + transcript 가 있는 상태로 열기(가짜 IPC, window.__symSeed 로 심는다)
const BOARD = JSON.stringify({
  formatVersion: 1,
  savedBy: "symvibe-win",
  workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" },
  viewport: { x: 0, y: 0, zoom: 0.5 },
  nodes: [
    { id: "c1", kind: "console", x: -760, y: -200, w: 720, h: 440, z: 1, name: "Claude 1", agentId: "claude", textSize: null, yolo: false, resume: { claudeSessionId: "sess-1" } },
    { id: "c2", kind: "console", x: 40, y: -200, w: 720, h: 440, z: 2, name: "Claude 2", agentId: "claude", textSize: null, yolo: false, resume: { claudeSessionId: "sess-2" } },
  ],
});
const seed = async (page: Page, transcripts: string[]) => {
  await page.addInitScript(([b, t]) => ((window as any).__symSeed = { boards: { "ws-fake": b }, transcripts: t }), [BOARD, transcripts] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("console")).toHaveCount(2);
};
const spawns = (page: Page) => page.evaluate(() => (window as any).__fakePty.spawns() as { id: number; args: string[] }[]);
const resumed = async (page: Page) => (await spawns(page)).filter((s) => s.args.includes("--resume"));
const text = (page: Page, id: number) =>
  page.evaluate((i) => {
    const b = (window as any).__terms.get(i).buffer.active;
    let s = "";
    for (let r = 0; r < b.length; r++) s += (b.getLine(r)?.translateToString(true) ?? "") + "\n";
    return s;
  }, id);
const banners = (page: Page) => page.getByTestId("resume-banner");

test("S-233 보드를 다시 열면 각 콘솔에 'lane restored — relaunching' 메모, CLI 는 새로 시작(--session-id)", async ({ page }) => {
  await seed(page, ["sess-1", "sess-2"]);
  await expect.poll(async () => (await spawns(page)).length).toBe(2);
  for (const s of await spawns(page)) {
    expect(s.args[0]).toBe("--session-id");
    expect(s.args).not.toContain("--resume");
    expect(await text(page, s.id)).toContain("Claude lane restored — relaunching");
  }
});

test("S-234·S-235 콘솔 배너 2개 + Resume all → Yes → --resume <id> 두 번", async ({ page }) => {
  await seed(page, ["sess-1", "sess-2"]);
  await expect(banners(page)).toHaveCount(2);
  await expect(banners(page).first()).toContainText("Resume last conversation?");
  await expect(page.getByTestId("resume-all")).toContainText("Resume all conversations?");
  await page.getByTestId("resume-all-yes").click();
  await expect.poll(async () => (await resumed(page)).length).toBe(2);
  const ids = (await resumed(page)).map((s) => s.args[s.args.indexOf("--resume") + 1]);
  expect(ids.sort()).toEqual(["sess-1", "sess-2"]);
  await expect(banners(page)).toHaveCount(0);
  await expect(page.getByTestId("resume-all")).toHaveCount(0);
});

test("S-234 한 콘솔에 타이핑하면 그 배너만 닫힌다(새 대화)", async ({ page }) => {
  await seed(page, ["sess-1", "sess-2"]);
  await expect(banners(page)).toHaveCount(2);
  await page.getByTestId("console").first().locator(".xterm-helper-textarea").focus();
  await page.keyboard.type("x");
  await expect(banners(page)).toHaveCount(1);
  await expect(page.getByTestId("resume-all")).toHaveCount(0); // 1개 남으면 Resume all 은 사라진다
  expect((await resumed(page)).length).toBe(0);
});

test("S-235 No 는 모든 배너를 닫는다", async ({ page }) => {
  await seed(page, ["sess-1", "sess-2"]);
  await page.getByTestId("resume-all-no").click();
  await expect(banners(page)).toHaveCount(0);
  await expect(page.getByTestId("resume-all")).toHaveCount(0);
});

test("S-236 transcript 가 없으면 제안하지 않는다", async ({ page }) => {
  await seed(page, ["sess-1"]);
  await expect(banners(page)).toHaveCount(1);
  await expect(page.getByTestId("resume-all")).toHaveCount(0);
});

test("S-234 배너의 Resume 버튼 → 그 콘솔만 --resume 으로 다시 시작 + 'picking your last chat…' 메모", async ({ page }) => {
  await seed(page, ["sess-1", "sess-2"]);
  await banners(page).first().getByRole("button", { name: "Resume" }).click();
  await expect.poll(async () => (await resumed(page)).length).toBe(1);
  const s = (await resumed(page))[0]!;
  expect(s.args).toEqual(["--resume", "sess-1"]);
  expect(await text(page, s.id)).toContain("Claude lane — picking your last chat…");
  await expect(banners(page)).toHaveCount(1);
});

test("S-240 resume 한 프로세스가 8초 안에 끝나면 배너가 다시 뜬다", async ({ page }) => {
  await seed(page, ["sess-1", "sess-2"]);
  await banners(page).first().getByRole("button", { name: "Resume" }).click();
  await expect(banners(page)).toHaveCount(1);
  await expect.poll(async () => (await resumed(page)).length).toBe(1);
  const id = (await resumed(page))[0]!.id;
  await page.evaluate((i) => (window as any).__fakePty.exit(i, 1), id);
  await expect(banners(page)).toHaveCount(2);
});

test("S-230 실행 중 콘솔이 있을 때 Ctrl+Q → 'Quit Symvibe?' + '2 sessions will end.', Cancel 은 그대로", async ({ page }) => {
  await seed(page, []);
  await expect.poll(async () => (await spawns(page)).length).toBe(2);
  await page.keyboard.press("Control+q");
  const dlg = page.getByTestId("quit-confirm");
  await expect(dlg).toContainText("Quit Symvibe?");
  await expect(dlg).toContainText("2 sessions will end.");
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(dlg).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__fakeQuit)).toBeFalsy();
});

test("S-231 Quit 을 누르면 저장 후 종료 요청, 모든 PTY 가 끝난다", async ({ page }) => {
  await seed(page, []);
  await expect.poll(async () => (await spawns(page)).length).toBe(2);
  await page.keyboard.press("Control+q");
  await page.getByTestId("quit-confirm").getByRole("button", { name: "Quit" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__fakeQuit)).toBeTruthy();
  expect(await page.evaluate(() => (window as any).__fakePty.ids().length)).toBe(0);
});

test("S-230 실행 중 콘솔이 없으면 확인 없이 바로 끈다", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toBeVisible();
  await page.keyboard.press("Control+q");
  await expect.poll(() => page.evaluate(() => (window as any).__fakeQuit)).toBeTruthy();
  await expect(page.getByTestId("quit-confirm")).toHaveCount(0);
});

// 431번: 끈 콘솔을 다시 시작하면 새 대화만 열렸다 → 끄면 배너('이어서 하기'·'새로 시작'), 이어서 하기 = 그 대화 --resume
test("431번 끄기 → 배너 이어서 하기(같은 대화 --resume) / 새로 시작(새 --session-id)", async ({ page }) => {
  await seed(page, []);
  await expect.poll(async () => (await spawns(page)).length).toBe(2);
  await expect(banners(page)).toHaveCount(0);
  const first = (await spawns(page))[0]!;
  const sid = first.args[first.args.indexOf("--session-id") + 1];
  await page.getByTestId("live-chip").click();
  await page.getByTestId("live-stop").first().click();
  await expect(banners(page)).toHaveCount(1);
  await expect(banners(page).getByTestId("resume-new")).toBeVisible();
  await banners(page).getByTestId("resume-go").click();
  await expect.poll(async () => (await resumed(page)).length).toBe(1);
  expect((await resumed(page))[0]!.args).toEqual(["--resume", sid]);
  await expect(banners(page)).toHaveCount(0);
  // 다시 끄고 '새로 시작'
  await page.getByTestId("live-chip").click();
  await page.getByTestId("live-stop").first().click();
  await expect(banners(page)).toHaveCount(1);
  const n = (await spawns(page)).length;
  await banners(page).getByTestId("resume-new").click();
  await expect.poll(async () => (await spawns(page)).length).toBe(n + 1);
  expect((await spawns(page)).at(-1)!.args[0]).toBe("--session-id");
  await expect(banners(page)).toHaveCount(0);
});
