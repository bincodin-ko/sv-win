import { expect, test, type Page } from "@playwright/test";

// U5: 명령줄 composer 위치·Enter·칩 글자·답 알림·broadcast 문형(S-2680~S-2689). 가짜 IPC·가짜 PTY.
const bar = (p: Page) => p.getByTestId("command-bar");
const input = (p: Page) => p.getByTestId("bar-input");
const chip = (p: Page, id: string) => p.getByTestId(`chip-${id}`);
const composer = (p: Page) => p.getByTestId("group-composer");
const consoles = (p: Page) => p.getByTestId("console");
const writes = (p: Page) => p.evaluate(() => { const f = (window as any).__fakePty; return (f.ids() as number[]).map((i) => f.writes(i) as string[]); });
const send = async (p: Page, text: string) => { await input(p).fill(text); await input(p).press("Enter"); };

async function open(p: Page, n = 0, size = { width: 1400, height: 900 }) {
  await p.setViewportSize(size);
  await p.goto(n ? `/?console=${n}&agent=claude` : "/");
  await expect(bar(p)).toBeVisible();
  if (n) await expect(consoles(p)).toHaveCount(n);
}

for (const size of [{ width: 1280, height: 720 }, { width: 1400, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`S-2680 ${size.width}x${size.height}: 힌트가 떠 있어도 composer 가 명령줄 위, Spawn 단추 가운데 클릭이 먹는다`, async ({ page }) => {
    await open(page, 0, size);
    await expect(page.getByTestId("bar-hint")).toBeVisible();
    await chip(page, "group").click();
    await expect(composer(page)).toBeVisible();
    const c = (await composer(page).boundingBox())!, b = (await bar(page).boundingBox())!;
    expect(c.y + c.height).toBeLessThanOrEqual(b.y - 8 + 1);
    expect(c.y).toBeGreaterThanOrEqual(8 - 1);
    const s = (await page.getByTestId("composer-spawn").boundingBox())!;
    await page.mouse.click(s.x + s.width / 2, s.y + s.height / 2);
    await expect(consoles(page)).toHaveCount(6);
  });
}

test("S-2681 명령줄 안쪽 클릭은 composer 를 안 닫고, 바깥 클릭은 닫는다", async ({ page }) => {
  await open(page, 2);
  await chip(page, "group").click();
  await expect(composer(page)).toBeVisible();
  await input(page).click();
  await expect(composer(page)).toBeVisible();
  await page.mouse.click(40, 300);
  await expect(composer(page)).toHaveCount(0);
});

test("S-2682 이름 칸 Enter = Spawn", async ({ page }) => {
  await open(page, 0);
  await chip(page, "group").click();
  await page.getByTestId("composer-name").fill("QA");
  await page.getByTestId("composer-name").press("Enter");
  await expect(consoles(page)).toHaveCount(6);
});

test("S-2683·S-2684 칩 글자 'Spawn 4…', 새 콘솔 메뉴는 Space 로도 실행", async ({ page }) => {
  await open(page, 1);
  await expect(chip(page, "spawn-4")).toHaveText("Spawn 4…");
  await chip(page, "new-console").click();
  const item = page.getByRole("menuitem").first();
  await item.focus();
  await item.press("Space");
  await expect(consoles(page)).toHaveCount(2);
});

test("S-2686 Thread 닫힘이면 답이 알림으로 뜬다(status·못 알아들음), 열림이면 안 뜬다", async ({ page }) => {
  await open(page, 2);
  await send(page, "status");
  await expect(page.getByTestId("app-notice")).toContainText("2 consoles");
  await send(page, "hello?");
  await expect(page.getByTestId("app-notice")).not.toHaveText("");
  await page.getByTestId("thread-toggle").click();
  await expect(page.getByTestId("app-notice")).toHaveCount(0, { timeout: 6000 });
  await send(page, "status");
  await expect(page.getByTestId("thread-msg").last()).toContainText("2 consoles");
  await expect(page.getByTestId("app-notice")).toHaveCount(0);
});

for (const q of ["broadcast echo hi", "everyone: echo hi", "all: echo hi"]) {
  test(`S-2687 '${q}' 는 콘솔 2개에 같은 글`, async ({ page }) => {
    await open(page, 2);
    // 시작 중인 콘솔에는 보내지 않는다(S-606): 첫 출력을 낸 것으로 만든다
    await page.evaluate(() => { const f = (window as any).__fakePty; for (const i of f.ids()) f.emit?.(i, "Welcome\r\n> "); });
    await send(page, q);
    await expect.poll(async () => (await writes(page)).filter((w) => w.join("").includes("echo hi")).length, { timeout: 15000 }).toBe(2);
  });
}

test("S-2685 입력란 포커스 때 껍질 --accent 테두리, 입력란 자체 윤곽 없음", async ({ page }) => {
  await open(page, 0);
  const accent = await page.evaluate(() => { const d = document.createElement("div"); d.style.borderTop = "1px solid var(--accent)"; document.body.append(d); const c = getComputedStyle(d).borderTopColor; d.remove(); return c; });
  await page.mouse.click(40, 300);
  expect(await bar(page).evaluate((e) => getComputedStyle(e).borderTopColor)).not.toBe(accent);
  await input(page).focus();
  expect(await bar(page).evaluate((e) => getComputedStyle(e).borderTopColor)).toBe(accent);
  expect(await input(page).evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("none");
});
