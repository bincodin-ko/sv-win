import { expect, test, type Page } from "@playwright/test";

// Q4 S-3163·S-3164·S-3165: Gemini 게이지·OpenCode 요약 카드. 가짜 화면(__fakeUsage)만 쓴다 — 실제 CLI 는 띄우지 않는다.
const GEMINI = ["gemini-2.5-pro     34% used (Limit resets in 3h 20m)", "gemini-2.5-flash   5% used (Limit resets in 3h 20m)", "Usage limits span all sessions and reset daily."].join("\n");
const OC = ["│Sessions                 12 │", "│Messages              1,234 │", "│Days                      5 │", "│Total Cost           $12.34 │", "│Avg Cost/Day          $2.47 │"].join("\n");

async function setup(page: Page, o: { gemini?: string; opencode?: string; lang?: "ko" } = {}) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(
    ({ screens, lang }) => {
      localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(["gemini", "opencode"]));
      if (lang) localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ language: lang }));
      (window as any).__fakeUsage = { screens, blocked: [], fail: [], calls: [] };
    },
    { screens: { gemini: o.gemini ?? GEMINI, opencode: o.opencode ?? OC }, lang: o.lang },
  );
  await page.goto("/");
  await page.getByTestId("usage-pill").click();
  await expect(page.getByTestId("usage-panel")).toBeVisible();
}

test.describe("S-3163 Gemini 게이지", () => {
  test("파싱되면 창마다 막대", async ({ page }) => {
    await setup(page);
    await page.getByTestId("usage-tab-gemini").click();
    await expect(page.getByTestId("usage-bar")).toHaveCount(2);
    await expect(page.getByTestId("usage-bar").first()).toContainText("gemini-2.5-pro");
    await expect(page.getByTestId("usage-bar").first()).toContainText("34% used");
    await expect(page.getByTestId("usage-bar").first()).toContainText("Resets 3h 20m");
    await expect(page.getByTestId("usage-raw")).toHaveCount(0);
    await page.getByTestId("usage-raw-toggle").click();
    await expect(page.getByTestId("usage-raw")).toContainText("gemini-2.5-flash");
  });
  test("예시가 아닌 글이면 원문", async ({ page }) => {
    await setup(page, { gemini: "Session stats: 12 requests" });
    await page.getByTestId("usage-tab-gemini").click();
    await expect(page.getByTestId("usage-raw")).toContainText("12 requests");
    await expect(page.getByTestId("usage-bar")).toHaveCount(0);
  });
});

test.describe("S-3164 OpenCode 요약 카드", () => {
  test("Sessions·Messages·Total Cost·Avg Cost/Day 네 줄 + 안내 글", async ({ page }) => {
    await setup(page);
    await page.getByTestId("usage-tab-opencode").click();
    const c = page.getByTestId("usage-oc-summary");
    await expect(c).toContainText("Sessions");
    await expect(c).toContainText("12");
    await expect(c).toContainText("Messages");
    await expect(c).toContainText("1,234");
    await expect(c).toContainText("Total Cost");
    await expect(c).toContainText("$12.34");
    await expect(c).toContainText("Avg Cost/Day");
    await expect(c).toContainText("$2.47");
    await expect(page.getByTestId("usage-oc-note")).toHaveText("OpenCode has no plan limits here — totals from `opencode stats`");
    await expect(page.getByTestId("usage-bar")).toHaveCount(0);
  });
  test("예시가 아닌 글이면 원문", async ({ page }) => {
    await setup(page, { opencode: "error: no database" });
    await page.getByTestId("usage-tab-opencode").click();
    await expect(page.getByTestId("usage-raw")).toContainText("no database");
    await expect(page.getByTestId("usage-oc-summary")).toHaveCount(0);
  });
});

test("S-3165 한국어 화면", async ({ page }) => {
  await setup(page, { lang: "ko" });
  await page.getByTestId("usage-tab-gemini").click();
  await expect(page.getByTestId("usage-bar").first()).toContainText("34% 사용");
  await expect(page.getByTestId("usage-bar").first()).toContainText("초기화: 3h 20m");
  await page.getByTestId("usage-tab-opencode").click();
  await expect(page.getByTestId("usage-oc-summary")).toContainText("세션");
  await expect(page.getByTestId("usage-oc-summary")).toContainText("총 비용");
  await expect(page.getByTestId("usage-oc-note")).toContainText("플랜 한도가 없어요");
});
