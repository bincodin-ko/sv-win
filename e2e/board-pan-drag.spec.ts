import { expect, test, type Page } from "@playwright/test";

// 빈 보드 왼쪽 드래그 = 화면 이동, 사각형 선택은 Shift+드래그. ?demo: 1400×900 에서 n1 화면 x 400..800 y 250..550, n2 x 1200..1600 y 750..1050
const view = (page: Page) =>
  page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('[data-testid="world"]')!).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
const isSel = async (page: Page, id: string) => (await page.locator(`[data-node-id="${id}"]`).getAttribute("data-selected")) === "true";
async function drag(page: Page, from: [number, number], to: [number, number], up = true) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 12 });
  if (up) await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?demo");
  await expect(page.locator("[data-node-id]").first()).toBeVisible();
});

test("빈 곳을 왼쪽으로 끌면 viewport 가 따라 움직이고 사각형은 안 생긴다", async ({ page }) => {
  await drag(page, [1000, 150], [900, 170], false);
  await expect(page.getByTestId("board")).toHaveCSS("cursor", "grabbing");
  expect(await page.getByTestId("selection-box").count()).toBe(0);
  await page.mouse.up();
  expect(await view(page)).toMatchObject({ x: -100, y: 20, zoom: 1 });
  expect(await isSel(page, "n1")).toBe(false);
});

test("빈 곳 hover 는 grab 커서", async ({ page }) => {
  await page.mouse.move(1000, 150);
  await expect(page.getByTestId("board")).toHaveCSS("cursor", "grab");
});

test("4px 이하 움직임은 이동이 아니라 클릭: 선택 해제, viewport 그대로", async ({ page }) => {
  await page.keyboard.press("Control+a");
  await drag(page, [1000, 150], [1002, 151]);
  expect(await view(page)).toMatchObject({ x: 0, y: 0 });
  expect(await isSel(page, "n1")).toBe(false);
});

test("Shift+드래그 = 사각형 선택(걸친 노드만), 화면은 안 움직인다", async ({ page }) => {
  await page.keyboard.down("Shift");
  await drag(page, [100, 100], [500, 300], false);
  await expect(page.getByTestId("selection-box")).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up("Shift");
  expect(await isSel(page, "n1")).toBe(true);
  expect(await isSel(page, "n2")).toBe(false);
  expect(await view(page)).toMatchObject({ x: 0, y: 0 });
});

test("노드 위 드래그는 노드 이동, viewport 는 그대로", async ({ page }) => {
  const b0 = (await page.locator('[data-node-id="n1"]').boundingBox())!;
  await drag(page, [500, 500], [560, 540]);
  const b1 = (await page.locator('[data-node-id="n1"]').boundingBox())!;
  expect([b1.x - b0.x, b1.y - b0.y]).toEqual([60, 40]);
  expect(await view(page)).toMatchObject({ x: 0, y: 0 });
});

test("가운데 버튼 드래그와 Space 누른 채 드래그도 이동", async ({ page }) => {
  await page.mouse.move(1000, 150);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(1050, 170, { steps: 5 });
  await page.mouse.up({ button: "middle" });
  expect(await view(page)).toMatchObject({ x: 50, y: 20 });
  await page.keyboard.down("Space");
  await drag(page, [1000, 600], [940, 580]);
  await page.keyboard.up("Space");
  expect(await view(page)).toMatchObject({ x: -10, y: 0 });
});
