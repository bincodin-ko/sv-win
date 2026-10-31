import { expect, test, type Page } from "@playwright/test";

// 222번: 보드 줌(CSS scale)에서 터미널 캔버스를 화면 크기대로 그려야 글자가 선명하다.
// 캔버스 실제 픽셀 폭 / 화면에 보이는 폭 = 1(× devicePixelRatio) 이어야 한다. 고치기 전엔 90% 줌에서 1.11(100% 로 그려 줄임)
const ratio = (page: Page) => page.evaluate(() => {
  const c = [...document.querySelectorAll<HTMLCanvasElement>(".xterm-screen canvas")].sort((a, b) => b.width - a.width)[0];
  return c ? Math.round((c.width / c.getBoundingClientRect().width / devicePixelRatio) * 100) / 100 : 0;
});

test("222번 줌 83%·확대 에서 캔버스 해상도 = 화면 크기", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=claude");
  await expect(page.getByTestId("console")).toHaveCount(1);
  await expect.poll(() => ratio(page)).toBeCloseTo(1, 1);
  await page.getByTestId("zoom-out").click();
  await expect(page.getByTestId("zoom-pct")).not.toHaveText("100%");
  await expect.poll(() => ratio(page)).toBeCloseTo(1, 1);
  for (let i = 0; i < 6; i++) await page.getByTestId("zoom-in").click();
  await expect(page.getByTestId("zoom-pct")).toHaveText(/1[3-9][0-9]%|2[0-9][0-9]%/);
  await expect.poll(() => ratio(page)).toBeCloseTo(1, 1);
});
