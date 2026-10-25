import { expect, test, type Page } from "@playwright/test";

// D7 Mission Map (S-1300~S-1317). 가짜 PTY(Tauri 밖). 셸 콘솔은 hook 이 없어 IDLE → Working 으로 접힌다(S-1304).
// 후크: window.__mm = { recordTask(keys, text), rename(nodeId, name) }  (?kindsTest 일 때만, MissionHost 가 만든다)
// 약속(testid): mission-map(창) mm-summary mm-filter-<all|working|needs|idle|done> mm-search mm-close mm-empty mm-scroll
//   mm-cmd mm-card mm-group mm-console(data-id, data-selected) mm-line(data-from data-to data-dashed) mm-agg-<state> mm-struct-<orchestrators|teams|consoles|loops>
//   mm-inspector mm-status mm-since mm-task mm-act-goto|pause|resume|restart|kill mm-live-note mm-settings-link
test.use({ actionTimeout: 5000 });
type N = Record<string, unknown> & { id: string };
const con = (id: string, x: number, y: number, g?: string): N => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name: `Con ${id}`, agentId: "shell", textSize: null, yolo: false, ...(g ? { groupId: g } : {}) });
const ORCH: N = { id: "o1", kind: "orchestrator", x: -120, y: 60, w: 240, h: 120, z: 2, name: "Lead", wired: ["g1"] };
const NODES = [con("c1", -760, -400), con("c2", 40, -400), con("c3", -760, 300, "g1"), con("c4", 40, 300, "g1"), ORCH];
const GROUPS = [{ id: "g1", name: "Group 1", role: "general" }];

const seed = async (page: Page, nodes: N[] = NODES) => {
  const board = JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 0.5 }, nodes, groups: nodes.some((n) => n.groupId) ? GROUPS : [] });
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), board);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  const cons = nodes.filter((n) => n.kind === "console").length;
  await expect(page.getByTestId("console")).toHaveCount(cons);
  if (cons) await expect.poll(() => page.evaluate(() => (window as any).__fakePty.ids().length as number)).toBe(cons);
};
const map = (p: Page) => p.getByTestId("mission-map");
const open = async (p: Page) => {
  await p.mouse.click(1300, 100); // 빈 캔버스: 키보드를 보드가 받게
  await p.keyboard.press("x");
  await expect(map(p)).toBeVisible();
};
const cons = (p: Page) => p.getByTestId("mm-console");
const con1 = (p: Page, id: string) => p.locator(`[data-testid="mm-console"][data-id="${id}"]`);
const sel = (p: Page) => p.evaluate(() => (window as any).__kt.st().selection as string[]);

test("S-1300 X 키로 열고 Esc 로 닫는다", async ({ page }) => {
  await seed(page);
  await open(page);
  await page.keyboard.press("Escape");
  await expect(map(page)).toHaveCount(0);
});

test("S-1300 Tools › Mission Map 으로 열고 × 로 닫는다", async ({ page }) => {
  await seed(page);
  await page.getByTestId("tools-btn").click();
  await page.getByText("Mission Map", { exact: true }).click();
  await expect(map(page)).toBeVisible();
  await page.getByTestId("mm-close").click();
  await expect(map(page)).toHaveCount(0);
});

test("S-1301 요약 문구·필터 칩·검색창 placeholder", async ({ page }) => {
  await seed(page);
  await open(page);
  await expect(page.getByTestId("mm-summary")).toHaveText("Mission Map · 1 orchestrator · 1 team · 4 consoles · 4 working");
  for (const f of ["all", "working", "needs", "idle", "done"]) await expect(page.getByTestId(`mm-filter-${f}`)).toBeVisible();
  await expect(page.getByTestId("mm-search")).toHaveAttribute("placeholder", "Find a console or team");
  const r = (await map(page).boundingBox())!;
  expect(r.width).toBeLessThanOrEqual(1100);
  expect(r.height).toBeLessThanOrEqual(720);
});

test("S-1301 콘솔이 없으면 Nothing to map yet", async ({ page }) => {
  await seed(page, []);
  await open(page);
  await expect(page.getByTestId("mm-empty")).toHaveText("Nothing to map yet");
  await expect(cons(page)).toHaveCount(0);
});

test("S-1302·S-1303 3열: Command bar · 카드 · 그룹 · 콘솔과 선(점선 포함)", async ({ page }) => {
  await seed(page);
  await open(page);
  await expect(page.getByTestId("mm-cmd")).toHaveCount(1);
  await expect(page.getByTestId("mm-card")).toHaveCount(1);
  await expect(page.getByTestId("mm-group")).toHaveCount(1);
  await expect(cons(page)).toHaveCount(4);
  const x = async (id: string) => (await page.getByTestId(id).first().boundingBox())!.x;
  expect(await x("mm-cmd")).toBeLessThan(await x("mm-group"));
  expect(await x("mm-group")).toBeLessThan(await x("mm-console"));
  // 카드 → 그룹 실선, 그룹 → 멤버 2, 낱개 c1·c2 는 Command bar 점선
  await expect(page.locator('[data-testid="mm-line"][data-from="card:o1"][data-to="group:g1"]')).toHaveAttribute("data-dashed", "false");
  await expect(page.locator('[data-testid="mm-line"][data-from="group:g1"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="mm-line"][data-dashed="true"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="mm-line"][data-from="cmd"][data-to="con:c1"]')).toHaveAttribute("data-dashed", "true");
  await expect(page.getByTestId("mm-group")).toContainText("Group 1");
  await expect(page.getByTestId("mm-group")).toContainText("2/2");
  await expect(page.getByTestId("mm-card")).toContainText("2 agents");
});

test("S-1305 필터 칩과 검색은 줄이고 All 로 돌아온다", async ({ page }) => {
  await seed(page);
  await open(page);
  await page.getByTestId("mm-filter-needs").click();
  await expect(cons(page)).toHaveCount(0);
  await page.getByTestId("mm-filter-working").click();
  await expect(cons(page)).toHaveCount(4);
  await page.getByTestId("mm-filter-all").click();
  await page.getByTestId("mm-search").fill("con c1");
  await expect(cons(page)).toHaveCount(1);
  await expect(con1(page, "c1")).toBeVisible();
  await page.getByTestId("mm-search").fill("group 1");
  await expect(cons(page)).toHaveCount(2);
});

test("S-1306·S-1308 클릭 → 검사창(상태·시간·작업 라벨), 선택 테두리", async ({ page }) => {
  await seed(page);
  await open(page);
  await page.evaluate(() => (window as any).__mm.recordTask([JSON.stringify(["ws-fake", "c1"])], "write the unit tests for login"));
  await con1(page, "c1").click();
  await expect(page.getByTestId("mm-inspector")).toBeVisible();
  await expect(page.getByTestId("mm-status")).toHaveText(/Working/i);
  await expect(page.getByTestId("mm-since")).toHaveText(/^\d+s$|^\d+m \d+s$/);
  await expect(page.getByTestId("mm-task")).toHaveText("write the unit tests for login");
  await con1(page, "c2").click();
  await expect(page.getByTestId("mm-task")).toHaveText("No task yet");
  await expect(con1(page, "c2")).toHaveAttribute("data-selected", "true");
  await expect(con1(page, "c1")).not.toHaveAttribute("data-selected", "true");
});

test("S-1306 더블클릭 → 지도가 닫히고 그 콘솔이 선택된다", async ({ page }) => {
  await seed(page);
  await open(page);
  await con1(page, "c2").dblclick();
  await expect(map(page)).toHaveCount(0);
  expect(await sel(page)).toEqual(["c2"]);
});

test("S-1309 그룹 검사창과 카드 검사창", async ({ page }) => {
  await seed(page);
  await open(page);
  await page.getByTestId("mm-group").click();
  await expect(page.getByTestId("mm-task")).toHaveText("No task yet");
  await expect(page.getByTestId("mm-act-goto")).toHaveText("Freeze the team on the board");
  await page.getByTestId("mm-card").click();
  await expect(page.getByTestId("mm-task")).toHaveText("No instruction yet");
  await expect(page.getByTestId("mm-act-goto")).toHaveText("Go to the card");
});

test("S-1307 집계와 STRUCTURE", async ({ page }) => {
  await seed(page);
  await open(page);
  await expect(page.getByTestId("mm-agg-working")).toContainText("4");
  await expect(page.getByTestId("mm-agg-needs")).toContainText("0");
  for (const [k, v] of [["orchestrators", "1"], ["teams", "1"], ["consoles", "4"], ["loops", "0"]]) await expect(page.getByTestId(`mm-struct-${k}`)).toContainText(v!);
});

test("S-1308 Pause → Idle, Resume → Working", async ({ page }) => {
  await seed(page);
  await open(page);
  await con1(page, "c1").click();
  await page.getByTestId("mm-act-pause").click();
  await expect(page.getByTestId("mm-status")).toHaveText(/Paused/i);
  await expect(page.getByTestId("mm-agg-idle")).toContainText("1");
  await page.getByTestId("mm-act-resume").click();
  await expect(page.getByTestId("mm-status")).toHaveText(/Working/i);
});

test("S-1308 세션 끝내기는 두 번 클릭 + 확인창, 취소하면 그대로", async ({ page }) => {
  await seed(page);
  await open(page);
  await con1(page, "c1").click();
  const btn = page.getByTestId("mm-act-kill");
  await btn.click();
  await expect(btn).toContainText("Confirm?");
  await btn.click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toContainText("Con c1's session?");
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("mm-status")).toHaveText(/Working/i);
  await btn.click();
  await btn.click();
  await page.getByRole("dialog").getByRole("button", { name: "Kill" }).click(); // 확인
  await expect(page.getByTestId("mm-status")).toHaveText(/Done/i);
  await expect(page.getByTestId("mm-act-restart")).toHaveText("Relaunch");
  await expect(page.getByTestId("mm-agg-done")).toContainText("1");
});

test("S-1312 지도가 열린 동안 콘솔 이름 변경이 0.5초 안에 반영된다", async ({ page }) => {
  await seed(page);
  await open(page);
  await expect(con1(page, "c1")).toContainText("Con c1");
  await page.evaluate(() => (window as any).__mm.rename("c1", "Renamed"));
  await expect(con1(page, "c1")).toContainText("Renamed", { timeout: 1500 });
});

test("S-1314 선은 열이 스크롤될 때 노드와 같이 움직인다", async ({ page }) => {
  const many = Array.from({ length: 14 }, (_, i) => con(`m${i}`, (i % 4) * 800 - 1600, Math.floor(i / 4) * 500 - 1000));
  await seed(page, many);
  await page.evaluate(() => (window as any).__kt.setUi({ mission: { open: true } })); // 콘솔이 화면을 덮어 X 키용 빈 자리가 없다
  await expect(map(page)).toBeVisible();
  const line = page.locator('[data-testid="mm-line"][data-to="con:m13"]');
  const node = con1(page, "m13");
  const gap = async () => (await line.boundingBox())!.y - (await node.boundingBox())!.y;
  const before = await gap();
  await page.getByTestId("mm-scroll").evaluate((e) => (e.scrollTop = 120));
  expect(Math.abs((await gap()) - before)).toBeLessThan(1);
});

test("S-1315 live status 꺼짐 안내와 Settings 링크", async ({ page }) => {
  await seed(page);
  await open(page);
  await expect(page.getByTestId("mm-live-note")).toContainText("States come from output. Turn on live agent status for Needs you and Idle.");
  await page.getByTestId("mm-settings-link").click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
});
