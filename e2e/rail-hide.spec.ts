import { expect, test } from "@playwright/test";

// 대기열 2번: 왼쪽 도구 막대·오른쪽 빠른 단추 줄을 각각 접을 수 있다(작은 탭만 남음). 다시 켜도 기억
test("대기열 2번 — 왼쪽·오른쪽 레일 접기/펴기, 새로고침해도 기억", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?demo");
  await expect(page.getByTestId("rail")).toBeVisible();
  await expect(page.getByTestId("rail-presets")).toBeVisible();
  await page.getByTestId("rail-hide").click();
  await expect(page.getByTestId("rail")).toHaveCount(0);
  await expect(page.getByTestId("rail-show")).toBeVisible();
  await page.getByTestId("rail-right-hide").click();
  await expect(page.getByTestId("rail-presets")).toHaveCount(0);
  await expect(page.getByTestId("rail-right-show")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("rail-show")).toBeVisible();
  await expect(page.getByTestId("rail-right-show")).toBeVisible();
  await expect(page.getByTestId("rail")).toHaveCount(0);
  await page.getByTestId("rail-show").click();
  await expect(page.getByTestId("rail")).toBeVisible();
  await page.getByTestId("rail-right-show").click();
  await expect(page.getByTestId("rail-presets")).toBeVisible();
  // 접힌 탭도 앱 틀(data-chrome) — 진짜 웹뷰가 덮지 않게
  await page.getByTestId("rail-hide").click();
  await expect(page.getByTestId("rail-show")).toHaveAttribute("data-chrome");
});

// 대기열 3번: 오른쪽 접기 단추는 줄 맨 아래(루프 밑)
test("대기열 3번 — 오른쪽 접기 단추가 맨 아래", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?demo");
  const hide = (await page.getByTestId("rail-right-hide").boundingBox())!;
  const ys = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="rail-"]')].filter((e) => e.closest("[data-chrome]") && !e.closest('[data-testid="rail"]') && e.getAttribute("data-testid") !== "rail-right-hide").map((e) => e.getBoundingClientRect().bottom));
  expect(ys.length).toBeGreaterThan(1);
  expect(hide.y).toBeGreaterThanOrEqual(Math.max(...ys) - 1);
});
