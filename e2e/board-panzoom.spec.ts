import { expect, test, type Page } from "@playwright/test";

// world 요소의 transform 을 {x,y,zoom} 으로 읽는다(matrix: a=zoom, e,f=이동)
const view = (page: Page) =>
  page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('[data-testid="world"]')!).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
const pct = (page: Page) => page.getByTestId("zoom-pct").innerText();

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto("/?demo");
  await expect(page.getByTestId("world")).toBeAttached();
  await page.mouse.move(500, 350);
});

test("S-013/S-014 점 격자 배경과 world 요소 하나", async ({ page }) => {
  await expect(page.getByTestId("grid")).toHaveCSS("background-image", /radial-gradient/);
  await expect(page.getByTestId("world")).toHaveCount(1);
  expect(await view(page)).toEqual({ x: 0, y: 0, zoom: 1 });
  await expect(page.locator("[data-node-id]")).toHaveCount(2);
});

test("S-003 휠=세로 팬, Shift+휠=가로 팬, deltaX/Y=동시 팬", async ({ page }) => {
  await page.mouse.wheel(0, 100);
  expect(await view(page)).toMatchObject({ x: 0, y: -100, zoom: 1 });
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 60);
  await page.keyboard.up("Shift");
  expect(await view(page)).toMatchObject({ x: -60, y: -100 });
  await page.mouse.wheel(30, -40);
  expect(await view(page)).toMatchObject({ x: -90, y: -60 });
});

test("S-004 가운데 버튼 끌기 팬(노드 위에서 시작해도)", async ({ page }) => {
  const box = (await page.locator('[data-node-id="n1"]').boundingBox())!;
  const sx = box.x + box.width / 2,
    sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(sx + 80, sy + 40, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  expect(await view(page)).toMatchObject({ x: 80, y: 40, zoom: 1 });
});

test("S-005/S-002 Ctrl+휠 포인터 기준 줌, 20~300% 고정", async ({ page }) => {
  // 포인터(700,350) = 화면 가운데에서 +200,0 → world 점 (200,0)
  await page.mouse.move(700, 350);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  const v = await view(page);
  expect(v.zoom).toBeGreaterThan(1);
  expect(200 * v.zoom + v.x).toBeCloseTo(200, 1);
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -200);
  expect((await view(page)).zoom).toBeCloseTo(3, 6);
  for (let i = 0; i < 80; i++) await page.mouse.wheel(0, 200);
  expect((await view(page)).zoom).toBeCloseTo(0.2, 6);
  await page.keyboard.up("Control");
  expect(await pct(page)).toBe("20%");
});

test("S-006/S-007/S-009 Ctrl+=, Ctrl+-, Ctrl+0, 줌 컨트롤", async ({ page }) => {
  await page.keyboard.press("Control+=");
  expect((await view(page)).zoom).toBeCloseTo(1.2, 6);
  expect(await pct(page)).toBe("120%");
  await page.keyboard.press("Control+-");
  await page.keyboard.press("Control+-");
  expect((await view(page)).zoom).toBeCloseTo(1 / 1.2, 6);
  expect(await pct(page)).toBe("83%");
  await page.getByTestId("zoom-in").click();
  expect((await view(page)).zoom).toBeCloseTo(1, 6);
  await page.getByTestId("zoom-out").click();
  await page.mouse.wheel(0, 50);
  await page.keyboard.press("Control+0");
  expect((await view(page)).zoom).toBeCloseTo(1, 6);
  await page.getByTestId("zoom-out").click();
  await page.getByTestId("zoom-pct").click();
  expect((await view(page)).zoom).toBe(1);
  expect(await pct(page)).toBe("100%");
});

test("S-008 Shift+1 모든 노드에 맞춤", async ({ page }) => {
  await page.keyboard.press("Shift+Digit1");
  const v = await view(page);
  // 데모 노드 합친 경계 x -300..900, y -200..600 → 1200x800 + 여백 96, 중심 (300,200)
  const z = Math.min(1000 / (1200 + 96), 700 / (800 + 96));
  expect(v.zoom).toBeCloseTo(z, 3);
  expect(v.x).toBeCloseTo(-300 * z, 1);
  expect(v.y).toBeCloseTo(-200 * z, 1);
});

test("S-010 노드 더블클릭 = 그 노드에 맞춤", async ({ page }) => {
  await page.locator('[data-node-id="n2"]').dblclick({ position: { x: 20, y: 20 } });
  const v = await view(page);
  // n2: x 500..900, y 300..600 (400x300) 중심 (700,450)
  const z = Math.min(1000 / (400 + 96), 700 / (300 + 96));
  expect(v.zoom).toBeCloseTo(z, 3);
  expect(v.x).toBeCloseTo(-700 * z, 1);
  expect(v.y).toBeCloseTo(-450 * z, 1);
});

test("입력란 포커스 중에는 보드 단축키가 안 먹는다", async ({ page }) => {
  await page.locator('[data-node-id="n1"] input').focus();
  await page.keyboard.press("Control+=");
  expect((await view(page)).zoom).toBe(1);
});
