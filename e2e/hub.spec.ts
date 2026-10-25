import { expect, test, type Page } from "@playwright/test";

// H5 폴더 없는 Hub 보드. 근거 S-2870~S-2880 (+ S-2855 Hub 머리줄 폴더).
// 가짜: window.__symSeed.repos(hubs 포함 그대로 통과) / localStorage symvibe.fakeSettings / __shell.repos()·saved(id) / __fakePty.spawns() / __dropFiles
const REPO = "C:/fake/a";
type Hub = { id: string; name: string };
const seedRepos = (hubs: Hub[] = [], last: string | null = null) => ({
  repos: [{ path: REPO, name: "alpha", workspaces: [{ id: "ws-a", name: "Workspace 1" }] }],
  hubs,
  lastRepo: last,
  lastWorkspace: {},
});
async function home(page: Page, o: { hubs?: Hub[]; last?: string | null; reopen?: boolean; lang?: string } = {}) {
  await page.addInitScript(
    ([seed, settings]) => {
      (window as any).__symSeed = { repos: seed };
      localStorage.setItem("symvibe.fakeSettings", JSON.stringify(settings));
    },
    [seedRepos(o.hubs, o.last ?? null), { reopenLastRepo: o.reopen ?? false, firstRunDone: true, ...(o.lang ? { language: o.lang } : {}) }] as const,
  );
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
}
const newHub = (page: Page) => page.getByTestId("new-hub");
const saved = (page: Page) => page.evaluate(() => (window as any).__shell.repos());
const spawns = (page: Page) => page.evaluate(() => (window as any).__fakePty.spawns() as { cwd?: string }[]);
async function openNewHub(page: Page) {
  await home(page);
  await newHub(page).click();
  await expect(page.getByTestId("repo-chip")).toContainText("Hub 1");
}

test("S-2870/S-2873 New Hub board → hubs 에 Hub 1 저장, 보드가 열리고 chip·탭에 이름, + 없음", async ({ page }) => {
  await home(page);
  await expect(page.getByTestId("add-repo")).toBeVisible();
  await expect(newHub(page)).toContainText("New Hub board");
  await newHub(page).click();
  await expect(page.getByTestId("home")).toHaveCount(0);
  await expect(page.getByTestId("repo-chip")).toContainText("Hub 1");
  await expect(page.getByTestId("tab-name")).toHaveText("Hub 1");
  await expect(page.getByTestId("tab-add")).toHaveCount(0);
  const r = await saved(page);
  expect(r.hubs).toEqual([{ id: expect.stringMatching(/^ws-/), name: "Hub 1" }]);
  expect(r.lastRepo).toBe(`hub:${r.hubs[0].id}`);
  expect(r.repos).toHaveLength(1); // 가짜 폴더를 repos 에 넣지 않는다
});

test("S-2870 두 번째 Hub 는 Hub 2", async ({ page }) => {
  await home(page, { hubs: [{ id: "ws-h1", name: "Hub 1" }] });
  await newHub(page).click();
  await expect(page.getByTestId("repo-chip")).toContainText("Hub 2");
  expect((await saved(page)).hubs.map((h: Hub) => h.name)).toEqual(["Hub 1", "Hub 2"]);
});

test("S-2873 Close repo 는 그 Hub 보드를 닫고 홈으로", async ({ page }) => {
  await openNewHub(page);
  await page.getByTestId("close-repo").click();
  await page.getByRole("dialog").getByRole("button", { name: "Close repo" }).click(); // 단추로 닫기는 늘 확인(closeRepoAsk)
  await expect(page.getByTestId("home")).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => (window as any).__shell.list())).length).toBe(0);
  expect((await saved(page)).hubs).toHaveLength(1); // 목록에서는 안 빠진다
});

test("S-2876 Hub: Git pill 없음, Tools 에 GitHub·Code·Markdown·Memory·Skills·Loops 없음, 레일 Loops 없음, 키 g·l 무시", async ({ page }) => {
  await openNewHub(page);
  await expect(page.getByTestId("git-pill")).toHaveCount(0);
  await page.getByTestId("tools-btn").click();
  const names = await page.getByRole("menuitem").allInnerTexts();
  expect(names).toEqual(["All conversations", "Presets", "Mission Map", "Settings"]);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("rail-loops")).toHaveCount(0);
  await page.mouse.click(600, 450);
  await page.keyboard.press("g");
  await page.keyboard.press("l");
  await page.waitForTimeout(300);
  await expect(page.getByTestId("git-panel")).toHaveCount(0);
  await expect(page.getByTestId("loops-panel")).toHaveCount(0);
});

test("S-2876 repo 보드에서는 그대로(Git pill·Tools 항목·레일 Loops)", async ({ page }) => {
  await home(page, { last: REPO, reopen: true });
  await expect(page.getByTestId("repo-chip")).toContainText("alpha");
  await expect(page.getByTestId("git-pill")).toBeVisible();
  await expect(page.getByTestId("rail-loops")).toBeVisible();
  await page.getByTestId("tools-btn").click();
  await expect(page.getByRole("menuitem", { name: "GitHub", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Loops", exact: true })).toBeVisible();
});

test("S-2875/S-2855 Hub 에서 레일 Spawn → 가짜 PTY cwd = 노드 cwd(가짜 홈), 저장됨, 머리줄 폴더 보임", async ({ page }) => {
  await openNewHub(page);
  await page.evaluate(() => (window as any).__setArmed("shell"));
  await page.keyboard.press("t");
  await page.mouse.click(600, 300);
  await expect(page.getByTestId("console")).toHaveCount(1);
  const wsId = (await saved(page)).hubs[0].id as string;
  // 가짜 홈 값은 문자열 하드코딩 없이: PTY 가 받은 cwd 가 있고, 저장된 노드 cwd 와 같아야 한다
  await expect.poll(async () => (await spawns(page)).at(-1)?.cwd ?? "").not.toBe("");
  const ptyCwd = (await spawns(page)).at(-1)!.cwd!;
  await expect(page.getByTestId("console").first().getByTestId("console-folder")).toBeVisible();
  await expect
    .poll(async () => JSON.parse((await page.evaluate((id) => (window as any).__shell.saved(id), wsId)) ?? "{}").nodes?.[0]?.cwd, { timeout: 15000 })
    .toBe(ptyCwd);
});

test("S-2877 Hub 에 파일을 끌어 놓으면 카드 없이 알림", async ({ page }) => {
  await openNewHub(page);
  await page.evaluate(() => (window as any).__dropFiles(["C:/somewhere/a.txt"], { x: 500, y: 400 }));
  await expect(page.getByTestId("app-notice")).toHaveText("Hub boards have no folder — drop files on a repo board");
  await expect(page.locator("[data-node-id]")).toHaveCount(0);
});

test("S-2871 홈 Hubs 목록: 행을 누르면 열림, ×는 확인 뒤 목록에서 빠지고 닫힘", async ({ page }) => {
  await home(page, { hubs: [{ id: "ws-h1", name: "Hub 1" }, { id: "ws-h2", name: "Hub 2" }] });
  await expect(page.getByTestId("hubs-head")).toHaveText("Hubs");
  await expect(page.getByTestId("hub-row")).toHaveCount(2);
  await page.getByTestId("hub-row").nth(1).getByTestId("hub-open").click();
  await expect(page.getByTestId("repo-chip")).toContainText("Hub 2");
  await page.getByTestId("back-home").click();
  await page.getByTestId("hub-row").nth(1).getByTestId("hub-remove").click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toContainText("Remove Hub 2? Its consoles close.");
  await expect(dlg.getByRole("button", { name: "Cancel" })).toBeFocused(); // 위험 동작은 Cancel 기본
  await dlg.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("hub-row")).toHaveCount(1);
  expect((await saved(page)).hubs).toEqual([{ id: "ws-h1", name: "Hub 1" }]);
  expect(await page.evaluate(() => (window as any).__shell.list())).toHaveLength(0);
});

test("S-2879 Hub 에서 Presets 배치·Mission Map 이 된다", async ({ page }) => {
  await openNewHub(page);
  await page.getByTestId("rail-presets").click();
  await page.getByRole("menuitem", { name: "Open the full library", exact: true }).click();
  await page.locator('[data-testid="preset-card"][data-name="Sprint Room"]').click();
  await page.getByTestId("preset-deploy").click();
  await expect(page.getByTestId("console")).toHaveCount(4);
  await page.getByTestId("tools-btn").click();
  await page.getByRole("menuitem", { name: "Mission Map", exact: true }).click();
  await expect(page.getByTestId("mission-map")).toBeVisible();
});

test("S-2874 앱 시작 때 lastRepo 가 hub:<id> 면 그 Hub 가 다시 열린다", async ({ page }) => {
  await home(page, { hubs: [{ id: "ws-h1", name: "Hub 1" }], last: "hub:ws-h1", reopen: true });
  await expect(page.getByTestId("repo-chip")).toContainText("Hub 1");
  await expect(page.getByTestId("git-pill")).toHaveCount(0);
});

test("S-2880 한국어: 새 Hub 보드 · Hub 보드", async ({ page }) => {
  await home(page, { hubs: [{ id: "ws-h1", name: "Hub 1" }], lang: "ko" });
  await expect(newHub(page)).toContainText("새 Hub 보드");
  await expect(page.getByTestId("hubs-head")).toHaveText("Hub 보드");
});

test("Hub 보드 우측 레일에는 코드·마크다운·PDF 스튜디오 버튼이 없다(폴더가 없어 뿌리가 hub:<id> 가 됨)", async ({ page }) => {
  await openNewHub(page);
  await expect(page.getByTestId("rail-insert-todo")).toBeVisible();
  for (const id of ["rail-code", "rail-markdown", "rail-pdf"]) await expect(page.getByTestId(id)).toHaveCount(0);
});
