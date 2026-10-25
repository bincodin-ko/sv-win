import { expect, test, type Page } from "@playwright/test";

// P1(9묶음 저사양): perf-audit 병목 #2·#3·#4. 휠·팬·줌이 React 를 다시 그리지 않고, 격자는 별도 층, 저사양이면 격자·그림자 없음.
const renders = (page: Page) => page.evaluate(() => ({ ...((window as any).__renders ?? {}) }) as Record<string, number>);
const open = async (page: Page, lowSpec = false) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  if (lowSpec) await page.addInitScript(() => localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ lowSpec: true })));
  await page.goto("/?console=3&agent=shell");
  await expect(page.getByTestId("console")).toHaveCount(3);
  await page.waitForTimeout(500); // 마운트 직후 렌더가 가라앉게
  // 콘솔 본문 위 휠은 터미널 몫이라(S-011), 빈 캔버스 점을 찾아 거기서 시험한다
  const pt = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="board"]')!;
    for (let y = 120; y < 880; y += 20) for (let x = 100; x < 1380; x += 20) { const e = document.elementFromPoint(x, y); if (e === b || e === document.querySelector('[data-testid="world"]')) return { x, y }; }
    return null;
  });
  expect(pt).not.toBeNull();
  await page.mouse.move(pt!.x, pt!.y);
};
const world = (page: Page) => page.getByTestId("world");

test("S-003 휠 10번: ConsoleNode 다시 그리기 0~1회, Board 0~1회", async ({ page }) => {
  await open(page);
  const a = await renders(page);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 40);
  await page.keyboard.down("Control");
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -40);
  await page.keyboard.up("Control");
  await page.waitForTimeout(300);
  const b = await renders(page);
  expect((b.ConsoleNode ?? 0) - (a.ConsoleNode ?? 0)).toBeLessThanOrEqual(1);
  expect((b.Board ?? 0) - (a.Board ?? 0)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("zoom-pct")).not.toHaveText("100%"); // 저장소에는 반영됨
});

test("가운데 버튼 팬 중에도 ConsoleNode 다시 그리기 0~1회", async ({ page }) => {
  await open(page);
  const a = await renders(page);
  await page.mouse.move(700, 450);
  await page.mouse.down({ button: "middle" });
  for (let i = 1; i <= 10; i++) await page.mouse.move(700 + i * 8, 450 + i);
  await page.mouse.up({ button: "middle" });
  await page.waitForTimeout(300);
  const b = await renders(page);
  expect((b.ConsoleNode ?? 0) - (a.ConsoleNode ?? 0)).toBeLessThanOrEqual(1);
});

test("S-013 격자는 별도 층(grid), 보드 자체엔 배경 그림 없음, 제스처 중에만 will-change", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("grid")).toHaveCSS("background-image", /radial-gradient/);
  await expect(page.getByTestId("board")).toHaveCSS("background-image", "none");
  await expect(world(page)).toHaveCSS("will-change", "auto");
  await page.mouse.wheel(0, 50);
  await expect(world(page)).toHaveCSS("will-change", "transform");
  await expect(world(page)).toHaveCSS("will-change", "auto", { timeout: 2000 });
});

test("기본 모드: 콘솔 그림자 있음", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("console").first()).not.toHaveCSS("box-shadow", "none");
});

test("저사양 모드: 격자·콘솔 그림자 없음, 팬은 그대로", async ({ page }) => {
  await open(page, true);
  await expect(page.getByTestId("grid")).toHaveCount(0);
  await expect(page.getByTestId("console").first()).toHaveCSS("box-shadow", "none");
  await page.mouse.wheel(0, 100);
  const m = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('[data-testid="world"]')!).transform).f);
  expect(m).toBe(-100);
});
