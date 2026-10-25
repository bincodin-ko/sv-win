import { expect, test, type Page } from "@playwright/test";

// U2: 키보드 영역 이동·콘솔 전환·워크스페이스 탭·창 크기. 근거 spec/8묶음.md S-2620~S-2630. 가짜 IPC(Tauri 밖).
const tabs = (p: Page) => p.getByTestId("tab");
const dlg = (p: Page) => p.getByRole("dialog");
const writes = (p: Page, id: number) => p.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);
const ptyIds = (p: Page) => p.evaluate(() => (window as any).__fakePty.ids() as number[]);
// 지금 키보드가 있는 영역 이름
const where = (p: Page) =>
  p.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a) return "none";
    if (a.closest(".xterm")) return "console";
    if (a.dataset.testid === "bar-input") return "bar";
    if (a.closest('[data-testid="topbar"]')) return "top";
    if (a.closest('[data-testid="rail"]')) return "left";
    if (a.dataset.testid === "rail-presets") return "right";
    if (a.closest('[data-testid="board"]')) return "board";
    return "other";
  });
const selectedIdx = async (p: Page) => (await tabs(p).evaluateAll((els) => els.map((e) => e.getAttribute("aria-selected")))).indexOf("true");

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

async function withConsoles(page: Page, n: number) {
  await page.goto(`/?console=${n}&agent=shell`);
  await expect(page.locator(".xterm")).toHaveCount(n);
  await expect.poll(async () => (await ptyIds(page)).length).toBe(n);
}

test("S-2620 F6 가 콘솔→명령줄→상단 바→좌 레일→우 레일→콘솔로 돌고 Shift+F6 은 거꾸로", async ({ page }) => {
  await withConsoles(page, 1);
  await page.locator(".xterm-helper-textarea").first().focus();
  expect(await where(page)).toBe("console");
  for (const w of ["bar", "top", "left", "right", "console"]) {
    await page.keyboard.press("F6");
    expect(await where(page)).toBe(w);
  }
  for (const w of ["right", "left", "top", "bar", "console"]) {
    await page.keyboard.press("Shift+F6");
    expect(await where(page)).toBe(w);
  }
  expect(await writes(page, (await ptyIds(page))[0])).toEqual([]); // 셸로 안 감
});

test("S-2621 Ctrl+Shift+P 는 콘솔 안에서도 명령줄로", async ({ page }) => {
  await withConsoles(page, 1);
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Control+Shift+P");
  expect(await where(page)).toBe("bar");
  expect(await writes(page, (await ptyIds(page))[0])).toEqual([]);
});

test("S-2622 Ctrl+F6 / Ctrl+Shift+F6 이 콘솔 3개를 읽기 순서로 돌며 선택·포커스", async ({ page }) => {
  await withConsoles(page, 3);
  // 기대 순서는 화면 위치(y 행 → x)에서 직접 계산
  const order = await page.locator("[data-node-id]").evaluateAll((els) => {
    const r = els.map((e) => {
      const b = e.getBoundingClientRect();
      return { id: e.getAttribute("data-node-id")!, x: b.x, y: b.y, h: b.height };
    });
    const rows: (typeof r)[] = [];
    for (const n of [...r].sort((a, b) => a.y - b.y)) {
      const row = rows.at(-1);
      if (row && n.y - row[0].y < row[0].h / 2) row.push(n);
      else rows.push([n]);
    }
    return rows.flatMap((row) => row.sort((a, b) => a.x - b.x)).map((n) => n.id);
  });
  expect(order).toHaveLength(3);
  const cur = () =>
    page.evaluate(() => ({
      sel: [...document.querySelectorAll('[data-node-id][data-selected="true"]')].map((e) => e.getAttribute("data-node-id")),
      focus: document.activeElement?.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null,
      term: !!document.activeElement?.closest(".xterm"),
    }));
  await page.locator(".xterm-helper-textarea").first().focus();
  const seq: (string | null)[] = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Control+F6");
    const c = await cur();
    expect(c.term).toBe(true);
    expect(c.sel).toEqual([c.focus]);
    seq.push(c.focus);
  }
  // 세 번 만에 한 바퀴: 읽기 순서의 순환 순서로 나오고 네 번째는 처음으로 돌아온다
  const i0 = order.indexOf(seq[0]!);
  expect(i0).toBeGreaterThanOrEqual(0);
  expect(seq.slice(0, 3)).toEqual([0, 1, 2].map((k) => order[(i0 + k) % 3]));
  expect(seq[3]).toBe(seq[0]);
  await page.keyboard.press("Control+Shift+F6");
  expect((await cur()).focus).toBe(seq[2]);
});

test("S-2623 터미널 안 Tab·Shift+Tab·Esc 는 셸로 간다", async ({ page }) => {
  await withConsoles(page, 1);
  const id = (await ptyIds(page))[0];
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Escape");
  const w = (await writes(page, id)).join("");
  expect(w).toContain("\t");
  expect(w).toContain("\x1b[Z");
  expect(w).toContain("\x1b");
  expect(await where(page)).toBe("console");
});

test("S-2624 탭은 button·roving tabindex, ←→ Home End Enter F2 Delete", async ({ page }) => {
  await page.goto("/");
  await expect(tabs(page)).toHaveCount(1);
  await page.getByTestId("tab-add").click();
  await page.getByTestId("tab-add").click();
  await expect(tabs(page)).toHaveCount(3);
  expect(await tabs(page).evaluateAll((els) => els.map((e) => e.tagName))).toEqual(["BUTTON", "BUTTON", "BUTTON"]);
  await expect(tabs(page).nth(2)).toHaveAttribute("tabindex", "0");
  await expect(tabs(page).nth(0)).toHaveAttribute("tabindex", "-1");
  // Tab 순서: back-home → repo-chip → 선택 탭 → tab-add → close-repo
  await page.getByTestId("repo-chip").focus();
  await page.keyboard.press("Tab");
  await expect(tabs(page).nth(2)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("tab-add")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("close-repo")).toBeFocused();
  await tabs(page).nth(2).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs(page).nth(1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tabs(page).nth(0)).toBeFocused();
  await page.keyboard.press("ArrowLeft"); // 처음에서 ← = 끝으로
  await expect(tabs(page).nth(2)).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect.poll(() => selectedIdx(page)).toBe(0);
  await page.keyboard.press("End");
  await page.keyboard.press("Space");
  await expect.poll(() => selectedIdx(page)).toBe(2);
  await page.keyboard.press("F2");
  await expect(page.getByTestId("tab-rename")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(tabs(page).nth(2)).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(dlg(page)).toBeVisible();
  await dlg(page).getByRole("button").first().click();
  await expect(tabs(page)).toHaveCount(2);
  await tabs(page).nth(0).focus();
  await page.keyboard.press("Delete");
  await dlg(page).getByRole("button").first().click();
  await expect(tabs(page)).toHaveCount(1);
  await page.keyboard.press("Delete"); // 하나뿐이면 무시
  await expect(dlg(page)).toHaveCount(0);
  await expect(tabs(page)).toHaveCount(1);
});

test("S-2625 Ctrl+PageUp/PageDown 은 탭을 돈다(콘솔 안에서도, 끝에서 처음으로)", async ({ page }) => {
  await withConsoles(page, 1);
  await page.getByTestId("tab-add").click();
  await expect(tabs(page)).toHaveCount(2);
  await tabs(page).nth(0).click();
  await expect.poll(() => selectedIdx(page)).toBe(0);
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Control+PageDown");
  await expect.poll(() => selectedIdx(page)).toBe(1);
  await page.keyboard.press("Control+PageDown");
  await expect.poll(() => selectedIdx(page)).toBe(0);
  await page.keyboard.press("Control+PageUp");
  await expect.poll(() => selectedIdx(page)).toBe(1);
});

test("S-2626 탭 우클릭 메뉴 Rename · Close, 탭이 하나면 Close 없음", async ({ page }) => {
  await page.goto("/");
  await expect(tabs(page)).toHaveCount(1);
  await tabs(page).first().click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Close" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await expect(page.getByTestId("tab-rename")).toBeFocused();
  await page.getByTestId("tab-rename").press("Escape");
  await page.getByTestId("tab-add").click();
  await expect(tabs(page)).toHaveCount(2);
  await tabs(page).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close" }).click();
  await dlg(page).getByRole("button").first().click();
  await expect(tabs(page)).toHaveCount(1);
});

test("S-2627 탭 × 의 눌리는 영역 24×24", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("tab-add").click();
  const b = (await page.getByTestId("tab-close").first().boundingBox())!;
  expect([Math.round(b.width), Math.round(b.height)]).toEqual([24, 24]);
});

test("S-2629·S-2630 960×600 에서 탭 5개여도 오른쪽 pill 이 화면 안, 단추 글자 Close repo", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/");
  for (let i = 0; i < 4; i++) await page.getByTestId("tab-add").click();
  await expect(tabs(page)).toHaveCount(5);
  await expect(page.getByTestId("close-repo")).toHaveText("Close repo");
  const av = (await page.getByTestId("topbar-avatar").boundingBox())!;
  expect(av.x + av.width).toBeLessThanOrEqual(960);
  expect(av.x).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(960);
});
