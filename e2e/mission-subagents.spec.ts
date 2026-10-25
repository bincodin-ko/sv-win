import { expect, test, type Page } from "@playwright/test";

// 12묶음 Q5 S-3170~S-3180 Mission Map 하위 에이전트 줄. 가짜 ipc: window.__fakeSubagents[sessionId], 호출 수 window.__fakeSubCalls.
// 약속(testid): mm-sub(data-state) mm-sub-state mm-sub-more / 검사창 mm-subs mm-subs-row
test.use({ actionTimeout: 5000 });
type N = Record<string, unknown> & { id: string };
const claude = (id: string, x: number, y: number, sid: string): N => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name: `Con ${id}`, agentId: "claude", textSize: null, yolo: false, resume: { claudeSessionId: sid } });
const shell = (id: string, x: number, y: number): N => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name: `Con ${id}`, agentId: "shell", textSize: null, yolo: false });
const NODES = [claude("c1", -760, -400, "sess-1"), claude("c2", 40, -400, "sess-2"), shell("c3", -760, 300)];

const seed = async (page: Page, o: { lang?: string; many?: boolean; unknown?: boolean } = {}) => {
  const board = JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 0.5 }, nodes: NODES, groups: [] });
  await page.addInitScript(([b, lang, many, unknown]) => {
    (window as any).__symSeed = { boards: { "ws-fake": b }, transcripts: ["sess-1", "sess-2"] };
    if (lang) localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ language: lang }));
    const now = Date.now();
    const subs: any[] = [
      { id: "t1", name: "mimic-planner", title: "Plan the loop", state: "running", startedAt: now - 30_000 },
      { id: "t2", name: "explorer", title: "Scan the repo", state: "failed", startedAt: now - 100_000, endedAt: now - 50_000 },
      { id: "t3", name: "reviewer", title: "Review the diff", state: "done", startedAt: now - 200_000, endedAt: now - 20_000 },
    ];
    if (many) for (let i = 0; i < 4; i++) subs.push({ id: `m${i}`, name: "extra", title: `Extra ${i}`, state: "running", startedAt: now - 300_000 - i * 1000 });
    if (unknown) subs.push({ id: "u1", name: "stale-one", title: "Parent died", state: "unknown", startedAt: now - 3 * 3600_000, endedAt: now - 60_000 });
    (window as any).__fakeSubagents = { "sess-1": subs };
  }, [board, o.lang ?? null, o.many ?? false, o.unknown ?? false] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await expect(page.getByTestId("console")).toHaveCount(NODES.length);
};
const open = async (p: Page) => {
  await p.mouse.click(1300, 100);
  await p.keyboard.press("x");
  await expect(p.getByTestId("mission-map")).toBeVisible();
};
const con1 = (p: Page, id: string) => p.locator(`[data-testid="mm-console"][data-id="${id}"]`);
const calls = (p: Page) => p.evaluate(() => ((window as any).__fakeSubCalls ?? 0) as number);

test("S-3173 하위 3개: 줄 글·순서(최근 시작 먼저)·콘솔 행 바로 밑", async ({ page }) => {
  await seed(page);
  await open(page);
  const rows = page.getByTestId("mm-sub");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("↳ mimic-planner · Plan the loop");
  await expect(rows.nth(0).getByTestId("mm-sub-state")).toHaveText(/^Running \d+s$/);
  await expect(rows.nth(0)).toHaveAttribute("data-state", "running");
  await expect(rows.nth(1)).toContainText("↳ explorer · Scan the repo");
  await expect(rows.nth(1).getByTestId("mm-sub-state")).toHaveText("Failed");
  await expect(rows.nth(2)).toContainText("↳ reviewer · Review the diff");
  await expect(rows.nth(2).getByTestId("mm-sub-state")).toHaveText("Done in 3m 00s");
  // 콘솔 c1 행 바로 밑, 들여쓰기 16px 이상, 12px 글씨
  const c = (await con1(page, "c1").boundingBox())!, r = (await rows.nth(0).boundingBox())!;
  expect(r.y).toBeGreaterThanOrEqual(c.y + c.height - 1);
  expect(r.y - (c.y + c.height)).toBeLessThan(12);
  expect(r.x - c.x).toBeGreaterThanOrEqual(16);
  expect(await rows.nth(0).evaluate((e) => getComputedStyle(e).fontSize)).toBe("12px");
  // 가짜가 없는 콘솔(c2)·셸 콘솔(c3)에는 줄 없음, 셸은 부르지도 않음
  await expect(page.getByTestId("mm-console")).toHaveCount(3);
});

test("S-3174 부모 세션이 죽어 남은 에이전트는 Running 이 아니라 Unknown", async ({ page }) => {
  await seed(page, { unknown: true });
  await open(page);
  const row = page.getByTestId("mm-sub").filter({ hasText: "stale-one" });
  await expect(row).toHaveAttribute("data-state", "unknown");
  await expect(row.getByTestId("mm-sub-state")).toHaveText("Unknown");
});

test("S-3173 5줄까지 + 더 있으면 '+n more'", async ({ page }) => {
  await seed(page, { many: true });
  await open(page);
  await expect(page.getByTestId("mm-sub")).toHaveCount(5);
  await expect(page.getByTestId("mm-sub-more")).toHaveText("+2 more");
});

test("S-1314 하위 줄이 있어도 선이 콘솔 행 중앙에 붙는다", async ({ page }) => {
  await seed(page);
  await open(page);
  await expect(page.getByTestId("mm-sub")).toHaveCount(3);
  const line = page.locator('[data-testid="mm-line"][data-to="con:c2"]').first();
  await expect(line).toHaveCount(1);
  const c2 = (await con1(page, "c2").boundingBox())!;
  const c1 = (await con1(page, "c1").boundingBox())!;
  expect(c2.y).toBeGreaterThan(c1.y + c1.height + 3 * 16); // c2 는 하위 줄 밑으로 밀려 있다
});

test("S-3175 검사창 Subagents 절: 이름·설명·상태·시작 시각·걸린 시간", async ({ page }) => {
  await seed(page);
  await open(page);
  await con1(page, "c1").click();
  await expect(page.getByTestId("mm-subs")).toContainText("Subagents (3)");
  const rows = page.getByTestId("mm-subs-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("mimic-planner");
  await expect(rows.nth(0)).toContainText("Plan the loop");
  await expect(rows.nth(0)).toContainText("Running");
  await expect(rows.nth(2)).toContainText("Done in 3m 00s");
  await expect(rows.nth(2)).toContainText(/\d{1,2}:\d{2}/); // 시작 시각
  await con1(page, "c2").click();
  await expect(page.getByTestId("mm-subs")).toHaveCount(0);
});

test("S-3172·S-3177 열려 있는 동안만 부른다(Claude 콘솔만), 닫으면 멈춘다", async ({ page }) => {
  await seed(page);
  expect(await calls(page)).toBe(0);
  await open(page);
  await expect.poll(() => calls(page)).toBe(2); // c1·c2 (셸 c3 제외)
  await page.getByTestId("mm-close").click();
  await expect(page.getByTestId("mission-map")).toHaveCount(0);
  const n = await calls(page);
  await page.waitForTimeout(3600);
  expect(await calls(page)).toBe(n);
});

test("S-3176 검색어가 하위 이름에 맞으면 그 콘솔을 남긴다", async ({ page }) => {
  await seed(page);
  await open(page);
  await expect(page.getByTestId("mm-sub")).toHaveCount(3);
  await page.getByTestId("mm-search").fill("reviewer");
  await expect(page.getByTestId("mm-console")).toHaveCount(1);
  await expect(con1(page, "c1")).toBeVisible();
});

test("S-3179 한국어", async ({ page }) => {
  await seed(page, { lang: "ko" });
  await open(page);
  const rows = page.getByTestId("mm-sub");
  await expect(rows.nth(0).getByTestId("mm-sub-state")).toHaveText(/^실행 중 \d+s$/);
  await expect(rows.nth(1).getByTestId("mm-sub-state")).toHaveText("실패");
  await expect(rows.nth(2).getByTestId("mm-sub-state")).toHaveText("3m 00s 만에 완료");
  await con1(page, "c1").click();
  await expect(page.getByTestId("mm-subs")).toContainText("하위 에이전트 (3)");
});
