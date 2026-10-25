import { expect, test, type Page } from "@playwright/test";

// K1 S-2403~S-2406. PW_PORT=1601. 가짜 설정은 localStorage "symvibe.fakeSettings".
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}") as Record<string, unknown>);
const dlg = (page: Page, name: string) => page.getByRole("dialog", { name });
const seed = (page: Page, v: object) => page.addInitScript((s) => localStorage.setItem("symvibe.fakeSettings", s), JSON.stringify(v));
const EN = ["Account", "General", "Appearance", "Shortcuts", "Agents", "Connections", "Voice", "About"];
const KO = ["계정", "일반", "모양", "단축키", "에이전트", "연결", "음성", "정보"];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  // 첫 화면은 설정을 읽은 뒤에 그려진다 → goto 뒤 앱이 뜰 때까지 기다린 다음에 키를 누른다
  const goto = page.goto.bind(page);
  page.goto = async (...a: Parameters<typeof goto>) => {
    const r = await goto(...a);
    await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
    return r;
  };
});

test("S-2405/S-2407 기본(en-US, 저장 없음): Language 줄이 English, 설정 창은 영어, html lang=en", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  await page.keyboard.press("Control+,");
  await expect(dlg(page, "Settings")).toBeVisible();
  expect(await dlg(page, "Settings").getByRole("tab").allTextContents()).toEqual(EN);
  await page.getByRole("tab", { name: "General" }).click();
  await expect(page.getByTestId("set-language")).toHaveValue("en");
  await expect(page.getByTestId("set-language").locator("option")).toHaveText(["English", "한국어"]);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("S-2403/S-2405/S-2406 한국어로 바꾸면 새로고침 없이 바뀌고 콘솔 노드·세션이 산다", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  await expect(page.getByTestId("console-name")).toHaveText("Otto");
  const nodeId = await page.locator("[data-node-id]").first().getAttribute("data-node-id");
  const ptys = await page.evaluate(() => (window as any).__fakePty.ids() as number[]);
  expect(ptys.length).toBeGreaterThan(0);
  await page.evaluate(() => ((window as any).__mark = 1));
  await page.keyboard.press("Control+,");
  await page.getByRole("tab", { name: "General" }).click();
  await page.getByTestId("set-language").selectOption("ko");
  await expect(dlg(page, "설정")).toBeVisible();
  expect(await dlg(page, "설정").getByRole("tab").allTextContents()).toEqual(KO);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("일반");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect.poll(async () => (await saved(page)).language).toBe("ko");
  expect(await page.evaluate(() => (window as any).__mark)).toBe(1); // 새로고침 아님
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-node-id]").first()).toHaveAttribute("data-node-id", nodeId!);
  expect(await page.evaluate(() => (window as any).__fakePty.ids() as number[])).toEqual(ptys);
  await page.keyboard.press("Control+,");
  await page.getByRole("tab", { name: "일반" }).click();
  await page.getByTestId("set-language").selectOption("en");
  await expect(dlg(page, "Settings")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("S-2404 저장값 language=ko 를 심으면 한국어로 시작", async ({ page }) => {
  await seed(page, { language: "ko" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await page.keyboard.press("Control+,");
  await expect(dlg(page, "설정")).toBeVisible();
});

test.describe("navigator ko-KR", () => {
  test.use({ locale: "ko-KR" });
  test("S-2404 저장값이 없으면 첫 실행 기본이 한국어, 고르기 전에는 저장하지 않음", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await page.keyboard.press("Control+,");
    await expect(dlg(page, "설정")).toBeVisible();
    expect("language" in (await saved(page))).toBe(false);
  });
});
