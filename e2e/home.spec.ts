import { expect, test, type Page } from "@playwright/test";

// B3: 홈 화면과 repo 관리. 근거 S-310~S-325. 가짜 IPC 에 repos 2개를 심고 reopenLastRepo:false 로 시작해 홈을 띄운다.
//   window.__symSeed.repos / localStorage symvibe.fakeSettings / window.__fakeMissing / window.__fakeBranches / window.__dropFolders
const A = "C:/fake/a";
const B = "C:/fake/b";
const repos = (last: string | null = A) => ({
  repos: [
    { path: A, name: "alpha", workspaces: [{ id: "ws-a", name: "Workspace 1" }] },
    { path: B, name: "beta", workspaces: [] },
  ],
  lastRepo: last,
  lastWorkspace: {},
});

const openHome = async (page: Page, o: { reopen?: boolean; missing?: string[]; last?: string | null } = {}) => {
  await page.addInitScript(
    ([seed, settings, missing]) => {
      (window as any).__symSeed = { repos: seed };
      (window as any).__fakeMissing = missing;
      (window as any).__fakeBranches = { "C:/fake/b": "dev" };
      localStorage.setItem("symvibe.fakeSettings", JSON.stringify(settings));
    },
    [repos(o.last === undefined ? A : o.last), { reopenLastRepo: o.reopen ?? false }, o.missing ?? []] as const,
  );
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
};
const rows = (page: Page) => page.getByTestId("repo-row");
const key = (page: Page, k: string) => page.keyboard.press(k);
const saved = (page: Page) => page.evaluate(() => (window as any).__shell.repos());

test("S-310·S-315·S-323: 홈이 뜨고 행 2개, active 뱃지는 lastRepo 에만, 브랜치(가짜) 표시, 보드는 숨김", async ({ page }) => {
  await openHome(page);
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText("alpha");
  await expect(rows(page).nth(0)).toContainText(A);
  await expect(rows(page).nth(0).getByTestId("repo-branch")).toHaveText("main"); // 가짜 기본
  await expect(rows(page).nth(1).getByTestId("repo-branch")).toHaveText("dev");
  await expect(page.getByTestId("repo-active")).toHaveCount(1);
  await expect(rows(page).nth(0).getByTestId("repo-active")).toBeVisible();
  await expect(page.getByTestId("add-repo")).toBeVisible();
  await expect(page.getByTestId("greeting")).toHaveText(/^Good (morning|afternoon|evening)/);
  await expect(page.getByTestId("orb")).toBeVisible();
  await expect(page.getByTestId("theme-toggle")).toBeVisible();
  await expect(page.getByTestId("home-settings")).toBeVisible();
  await expect(page.getByTestId("preset-pill")).toHaveText("No preset");
  await expect(page.getByTestId("dispatch")).toHaveText("Dispatch");
  await expect(page.locator("[data-ws]:visible")).toHaveCount(0);
});

test("S-316·S-322: ↓ 로 고르고 Return 하면 그 repo 의 보드가 열리고 lastRepo 가 된다", async ({ page }) => {
  await openHome(page);
  await expect(rows(page)).toHaveCount(2);
  await key(page, "ArrowDown");
  await expect(rows(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await key(page, "Enter");
  await expect(page.getByTestId("home")).toBeHidden();
  await expect(page.locator("[data-ws]:visible")).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__shell.activeRepo())).toBe(B);
  expect((await saved(page)).lastRepo).toBe(B);
});

test("S-316·S-320: 행 클릭으로도 열린다. 이미 열린 repo 는 Resume 으로 그 보드에 돌아간다(새로 만들지 않음)", async ({ page }) => {
  await openHome(page);
  await rows(page).nth(0).click();
  await expect(page.locator("[data-ws]:visible")).toHaveCount(1);
  await page.evaluate(() => (window as any).__shell.showHome());
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(page.getByTestId("dispatch")).toHaveText("Resume");
  await page.getByTestId("dispatch").click();
  await expect(page.getByTestId("home")).toBeHidden();
  expect((await page.evaluate(() => (window as any).__shell.list())).length).toBe(1);
});

test("S-318: 이름 더블클릭 → 25자를 넣어도 24자, Return 저장, Esc 취소", async ({ page }) => {
  await openHome(page);
  await rows(page).nth(1).getByTestId("repo-name").dblclick();
  const input = page.getByTestId("repo-rename");
  await input.fill("x".repeat(25));
  await expect(input).toHaveValue("x".repeat(24));
  await key(page, "Enter");
  await expect(rows(page).nth(1).getByTestId("repo-name")).toHaveText("x".repeat(24));
  const r = await saved(page);
  expect(r.repos[1].name).toBe("x".repeat(24));
  expect(r.repos[1].path).toBe(B);
  await rows(page).nth(0).getByTestId("repo-name").dblclick();
  await page.getByTestId("repo-rename").fill("zzz");
  await key(page, "Escape");
  await expect(rows(page).nth(0).getByTestId("repo-name")).toHaveText("alpha");
  await expect(page.getByTestId("home")).toBeVisible();
});

test("S-319: Delete → 확인창 → 취소하면 유지, 확인하면 사라지고 저장된다", async ({ page }) => {
  await openHome(page);
  await expect(rows(page)).toHaveCount(2);
  await key(page, "ArrowDown"); // beta
  await key(page, "Delete");
  const dlg = page.getByRole("dialog");
  await expect(dlg).toContainText("Remove beta?");
  await expect(dlg).toContainText("Files stay on disk; consoles running in this repo end.");
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(rows(page)).toHaveCount(2);
  await key(page, "Delete");
  await dlg.getByRole("button", { name: "Remove" }).click();
  await expect(rows(page)).toHaveCount(1);
  expect((await saved(page)).repos.map((r: any) => r.path)).toEqual([A]);
});

test("S-319: 행의 ⋯ 메뉴에서도 제거(확인창을 거침). 열린 repo 를 지우면 보드도 닫힌다", async ({ page }) => {
  await openHome(page);
  await rows(page).nth(0).click(); // alpha 보드 열림
  await expect(page.locator("[data-ws]:visible")).toHaveCount(1);
  await page.evaluate(() => (window as any).__shell.showHome());
  await rows(page).nth(0).hover();
  await rows(page).nth(0).getByTestId("row-menu").click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(rows(page)).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__shell.list())).toEqual([]);
  expect((await saved(page)).lastRepo).toBeNull();
});

test("S-317: 폴더를 끌어놓으면 추가(선택됨), 이미 있는 폴더는 그 행만 고른다", async ({ page }) => {
  await openHome(page);
  await expect(rows(page)).toHaveCount(2);
  await page.evaluate(() => (window as any).__dropFolders(["D:/proj/hello", "D:/proj/world"]));
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).nth(3)).toContainText("world");
  await expect(rows(page).nth(3)).toHaveAttribute("aria-selected", "true");
  await expect(rows(page).nth(3).getByTestId("repo-active")).toBeVisible(); // 마지막으로 추가한 repo
  await page.evaluate(() => (window as any).__dropFolders(["c:\\fake\\a\\"]));
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).nth(0)).toHaveAttribute("aria-selected", "true");
});

test("S-317·S-322: 홈에서 Ctrl+O = 폴더 추가(행 +1, 홈 유지, 보드 안 열림). 이미 있는 폴더는 그 행만 고른다", async ({ page }) => {
  await openHome(page);
  await expect(rows(page)).toHaveCount(2);
  await page.evaluate(() => ((window as any).__fakePickFolder = "D:/proj/hello"));
  await key(page, "Control+o");
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(2)).toContainText("hello");
  await expect(page.getByTestId("home")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__shell.list())).toEqual([]);
  await key(page, "ArrowUp"); // 다른 행으로 옮겨 둔다
  await page.evaluate(() => ((window as any).__fakePickFolder = "c:\\fake\\a\\"));
  await key(page, "Control+o");
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("home")).toBeVisible();
});

test("S-323: repo 가 없으면 Add a repo 카드만 보이고 Dispatch 는 비활성", async ({ page }) => {
  await openHome(page);
  await expect(rows(page)).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await key(page, "Delete");
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByTestId("add-repo")).toBeVisible();
  await expect(page.getByTestId("dispatch")).toBeDisabled();
});

test("S-315: 폴더가 사라진 repo 는 Folder missing 으로 보이고 열리지 않는다", async ({ page }) => {
  await openHome(page, { missing: [B] });
  await expect(rows(page).nth(1)).toContainText("Folder missing");
  await key(page, "ArrowDown");
  await key(page, "Enter");
  await rows(page).nth(1).click();
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(page.locator("[data-ws]:visible")).toHaveCount(0);
  await expect(page.getByTestId("dispatch")).toBeDisabled();
});

test("S-313: 해/달 버튼은 OG↔Light 를 바꾸고 설정에 저장한다", async ({ page }) => {
  await openHome(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "og");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings")!).theme)).toBe("light");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "og");
});

test("S-325: 홈에서도 톱니와 Ctrl+, 로 설정이 열린다", async ({ page }) => {
  await openHome(page);
  await page.getByTestId("home-settings").click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await key(page, "Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
  await key(page, "Control+,");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
});

test("S-324: reopen 켜짐이면 홈 없이 lastRepo 보드, 폴더가 사라졌으면 홈", async ({ page, browser }) => {
  await openHome(page, { reopen: true });
  await expect(page.locator("[data-ws]:visible")).toHaveCount(1);
  await expect(page.getByTestId("home")).toHaveCount(0);
  const p2 = await browser.newPage();
  await openHome(p2, { reopen: true, missing: [A] });
  await expect(p2.getByTestId("home")).toBeVisible();
  await p2.close();
});
