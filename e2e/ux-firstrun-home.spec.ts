import { expect, test, type Page } from "@playwright/test";

// U6: 첫 실행 3단계·Start 가 에이전트 1개·카드 포커스/Esc·홈 행 접근성. 근거 S-2700~S-2706 (8묶음 §0 #11).
const FIRST = "C:/fake/first";
const A = "C:/fake/a";
const B = "C:/fake/b";
const two = { repos: [{ path: A, name: "alpha", workspaces: [{ id: "ws-a", name: "Workspace 1" }] }, { path: B, name: "beta", workspaces: [] }], lastRepo: A, lastWorkspace: {} };
const none = { repos: [], lastRepo: null, lastWorkspace: {} };

const open = async (page: Page, seed: unknown, settings: Record<string, unknown>) => {
  await page.addInitScript(
    ([s, st]) => {
      (window as any).__symSeed = { repos: s };
      if (!localStorage.getItem("symvibe.fakeSettings")) localStorage.setItem("symvibe.fakeSettings", JSON.stringify(st));
    },
    [seed, { reopenLastRepo: false, ...settings }] as const,
  );
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
};
const first = (page: Page) => open(page, none, { firstRunDone: false });
const home = (page: Page) => open(page, two, {});
const card = (page: Page) => page.getByTestId("firstrun");
const rows = (page: Page) => page.getByTestId("repo-row");
const settings = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}"));
const pick = (page: Page, p: string) => page.evaluate((x) => ((window as any).__fakePickFolder = x), p);

test("S-2700·S-2701: 첫 실행 클릭 3번(Next·폴더·Next) 뒤 Start → 보드에 콘솔 1개", async ({ page }) => {
  await first(page);
  await expect(page.getByTestId("fr-step")).toHaveText("Step 1 of 3");
  await page.getByTestId("fr-next").click();
  await pick(page, FIRST);
  await card(page).getByRole("button", { name: "Open a folder" }).click();
  await page.getByTestId("fr-next").click();
  await expect(page.getByTestId("fr-step")).toHaveText("Step 3 of 3");
  await page.getByTestId("fr-start").click();
  await expect(card(page)).toBeHidden();
  await expect(page.locator("[data-ws]:visible")).toHaveCount(1);
  await expect(page.getByTestId("console")).toHaveCount(1);
});

test("S-2700: repo 를 안 더하고 Start 하면 에이전트를 안 띄운다(홈에 남음)", async ({ page }) => {
  await first(page);
  await page.getByTestId("fr-next").click();
  await page.getByTestId("fr-next").click();
  await page.getByTestId("fr-start").click();
  await expect(card(page)).toBeHidden();
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(page.getByTestId("console")).toHaveCount(0);
});

test("S-2702: 카드가 열리면 Next 에 포커스, Enter 로 다음 단계, 마지막은 Start 에 포커스", async ({ page }) => {
  await first(page);
  await expect(page.getByTestId("fr-next")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("fr-step")).toHaveText("Step 2 of 3");
  await page.getByTestId("fr-next").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("fr-step")).toHaveText("Step 3 of 3");
  await expect(page.getByTestId("fr-start")).toBeFocused();
});

test("S-2702: Esc = 건너뛰기(× 와 같음) — 카드가 닫히고 firstRunDone 저장, 다시 안 뜬다", async ({ page }) => {
  await first(page);
  await expect(page.getByTestId("fr-next")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card(page)).toBeHidden();
  await expect(page.getByTestId("home")).toBeVisible();
  expect((await settings(page)).firstRunDone).toBe(true);
  await page.reload();
  await expect(card(page)).toHaveCount(0);
});

test("S-2704: 선택 안 된 행의 ⋯ 도 Tab 으로 닿고, 포커스되면 보인다", async ({ page }) => {
  await home(page);
  await expect(rows(page)).toHaveCount(2);
  const m0 = rows(page).nth(0).getByTestId("row-menu");
  const m1 = rows(page).nth(1).getByTestId("row-menu");
  await expect(m1).toHaveCSS("opacity", "0"); // 숨김이 아니라 투명
  await expect(m1).not.toHaveCSS("visibility", "hidden");
  await m0.focus();
  await page.keyboard.press("Tab");
  await expect(m1).toBeFocused();
  await expect(m1).toHaveCSS("opacity", "1");
});

test("S-2705: 키보드로 고른 행에서 F2 → 이름 입력", async ({ page }) => {
  await home(page);
  await expect(rows(page)).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await expect(rows(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("F2");
  const input = page.getByTestId("repo-rename");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("beta");
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
});

test("S-2706: 행 우클릭 메뉴 Open·Rename·Remove — Remove 확인창은 Cancel 이 기본", async ({ page }) => {
  await home(page);
  await rows(page).nth(1).click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText(["Open", "Rename", "Remove"]);
  await menu.getByRole("menuitem", { name: "Rename" }).click();
  await expect(page.getByTestId("repo-rename")).toBeFocused();
  await page.keyboard.press("Escape");
  await rows(page).nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toContainText("Remove beta?");
  await expect(dlg.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Enter"); // 기본 = 취소
  await expect(rows(page)).toHaveCount(2);
  await rows(page).nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open" }).click();
  await expect(page.getByTestId("home")).toBeHidden();
  expect(await page.evaluate(() => (window as any).__shell.activeRepo())).toBe(B);
});

test("S-2703: 행 한 번 클릭 = 열기 (회귀)", async ({ page }) => {
  await home(page);
  await rows(page).nth(0).click();
  await expect(page.getByTestId("home")).toBeHidden();
  await expect(page.locator("[data-ws]:visible")).toHaveCount(1);
});

test("홈: 200자 경로 repo 가 있어도 홈 컬럼의 가운데·폭이 그대로(±2px), 경로는 title 로 전체", async ({ page }) => {
  const long = "C:/" + "very-long-folder-name/".repeat(10) + "x".repeat(10);
  const box = async () => (await page.getByTestId("greeting").boundingBox())!;
  await home(page);
  await expect(rows(page)).toHaveCount(2);
  const row0 = await rows(page).nth(0).boundingBox();
  const g0 = await box();
  const page2 = await page.context().newPage();
  await page2.addInitScript(([s]) => { (window as any).__symSeed = { repos: s }; localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ reopenLastRepo: false })); },
    [{ repos: [{ path: long, name: "longone", workspaces: [] }, two.repos[1]], lastRepo: null, lastWorkspace: {} }] as const);
  await page2.setViewportSize({ width: 1200, height: 800 });
  await page2.goto("/");
  await expect(page2.getByTestId("repo-row")).toHaveCount(2);
  const row1 = (await page2.getByTestId("repo-row").nth(0).boundingBox())!;
  const g1 = (await page2.getByTestId("greeting").boundingBox())!;
  expect(Math.abs(row1.width - row0!.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(row1.x - row0!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(g1.x + g1.width / 2 - (g0.x + g0.width / 2))).toBeLessThanOrEqual(2);
  await expect(page2.getByTestId("repo-row").nth(0).locator(`[title="${long}"]`)).toHaveCount(1);
});
