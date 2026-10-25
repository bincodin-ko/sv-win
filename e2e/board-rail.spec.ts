import { expect, test, type Page } from "@playwright/test";

// A7 좌측 레일·Spawn flyout·우클릭 메뉴·키 라우팅·빈 보드. 가짜 PTY·가짜 agents_list(Tauri 밖).
// 가짜 에이전트: claude·shell 설치됨, codex·gemini·grok·opencode 설치 안 됨. 기본 무장 = claude. 1400×900 이면 월드 원점 = 화면 (700,450)
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const consoles = (page: Page) => page.getByTestId("console");
const ids = (page: Page) => page.evaluate(() => (window as any).__fakePty.ids() as number[]);
const writes = (page: Page, id: number) => page.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);
const cols = (page: Page, id: number) => page.evaluate((i) => (window as any).__terms.get(i).cols as number, id);
const resizes = (page: Page, id: number) => page.evaluate((i) => (window as any).__fakePty.resizes(i) as [number, number][], id);
const item = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });
const handle = (page: Page) => page.locator("[data-node-handle]").first();

const open = async (page: Page, url = "/") => {
  await page.goto(url);
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/); // 무장 값이 읽힌 뒤
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test("S-040/S-041 T 키 → 캔버스 클릭 = 무장된 콘솔이 놓이고 도구는 Select 로", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("rail-select")).toHaveAttribute("data-active", "true");
  await page.keyboard.press("t");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-active", "true");
  await page.mouse.click(600, 300);
  await expect(consoles(page)).toHaveCount(1);
  await expect(page.getByTestId("console-badge")).toHaveAttribute("title", "claude");
  await expect(page.getByTestId("rail-select")).toHaveAttribute("data-active", "true");
  await page.mouse.click(1300, 100); // Select 로 돌아왔으니 더 놓이지 않는다
  await expect(consoles(page)).toHaveCount(1);
});

test("S-041/S-042 무장된 게 없으면 클릭이 flyout 을 열고, 행을 고르면 무장된다", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).__setArmed(null));
  await page.getByTestId("rail-spawn").click();
  await page.keyboard.press("Escape"); // 레일 클릭이 연 flyout 은 Esc 로 닫힌다(S-031)
  await expect(page.getByTestId("spawn-flyout")).toHaveCount(0);
  await page.keyboard.press("t");
  await page.mouse.click(600, 300);
  const fly = page.getByTestId("spawn-flyout");
  await expect(fly).toBeVisible();
  await expect(fly).toHaveAttribute("role", "menu");
  await item(page, "Shell").click();
  await expect(fly).toHaveCount(0);
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", "shell");
  await page.mouse.click(600, 300);
  await expect(page.getByTestId("console-badge")).toHaveAttribute("title", "shell");
});

test("S-042/S-168 flyout: 무장 → 설치된 내장 → Shell → All agents 3구역", async ({ page }) => {
  await open(page);
  await page.getByTestId("rail-spawn").click();
  const fly = page.getByTestId("spawn-flyout");
  const rows = fly.getByRole("menuitem");
  await expect(rows.first()).toHaveAttribute("data-armed", "true"); // 무장된 에이전트가 맨 위
  await expect(rows.first()).toContainText("Claude");
  await expect(fly.locator('[data-agent-id="codex"]')).toHaveCount(0); // 설치 안 된 건 All agents 안에서만
  await expect(item(page, "Shell")).toBeVisible();
  await item(page, "All agents").click();
  const all = page.getByTestId("all-agents");
  await expect(all.locator("[data-section]")).toHaveText(["Detected on your system", "Your agents", "Not installed yet"]);
  await expect(all.locator('[data-agent-id="codex"]')).toBeVisible();
});

test("S-043 무장 값은 다시 켜도 유지된다", async ({ page }) => {
  await open(page);
  await page.getByTestId("rail-spawn").click();
  await item(page, "Shell").click();
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", "shell");
  await page.reload();
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", "shell");
});

test("S-044 Fit to content 는 Shift+1 과 같다", async ({ page }) => {
  await open(page, "/?demo");
  await expect(page.locator("[data-node-id]").first()).toBeVisible();
  await page.getByTestId("zoom-in").click();
  await page.getByTestId("rail-fit").click();
  const z1 = await page.getByTestId("zoom-pct").innerText();
  await page.getByTestId("zoom-in").click();
  await page.keyboard.press("Shift+Digit1");
  expect(await page.getByTestId("zoom-pct").innerText()).toBe(z1);
});

test("S-045 빈 캔버스 우클릭 고리: Spawn agent 하위 → 콘솔, Paste 는 누른 지점, More → Zoom to 100%", async ({ page }) => {
  await open(page);
  await page.mouse.click(700, 450, { button: "right" });
  const ring = page.getByTestId("ring-menu");
  await expect(ring).toHaveAttribute("role", "menu");
  await expect(item(page, "Spawn agent")).toBeVisible();
  await expect(item(page, "Paste")).toBeVisible();
  await expect(item(page, "More")).toBeVisible();
  await item(page, "Spawn agent").click();
  for (const n of ["Claude", "Codex", "Gemini", "Grok", "OpenCode", "Shell"]) await expect(item(page, n)).toBeVisible();
  await expect(item(page, "Other")).toHaveCount(0); // 내 에이전트가 없으면 Other 없음
  await item(page, "Codex").click();
  await expect(ring).toHaveCount(0);
  await expect(consoles(page)).toHaveCount(1);
  await expect(page.getByTestId("console-badge")).toHaveAttribute("title", "codex");
  // Paste: 방금 만든 콘솔을 복사해 두고 (300,700) 에서 우클릭 → Paste
  await handle(page).click({ position: { x: 300, y: 16 } });
  await page.keyboard.press("Control+c");
  await page.mouse.click(300, 700, { button: "right" });
  await item(page, "Paste").click();
  await expect(consoles(page)).toHaveCount(2);
  const b = (await page.locator("[data-node-id]").nth(1).boundingBox())!;
  expect([Math.round(b.x), Math.round(b.y)]).toEqual([300, 700]);
  // More → Select all / Fit to content / Zoom to 100%
  await page.getByTestId("zoom-in").click();
  expect(await page.getByTestId("zoom-pct").innerText()).not.toBe("100%");
  await page.mouse.click(100, 880, { button: "right" });
  await item(page, "More").click();
  await expect(item(page, "Select all")).toBeVisible();
  await expect(item(page, "Fit to content")).toBeVisible();
  await item(page, "Zoom to 100%").click();
  await expect(page.getByTestId("zoom-pct")).toHaveText("100%");
});

test("S-031 Esc 는 열린 메뉴만 닫고 선택은 그대로", async ({ page }) => {
  await open(page, "/?demo");
  await page.mouse.click(500, 500); // n1 선택
  await page.mouse.click(1000, 150, { button: "right" });
  await expect(page.getByTestId("ring-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ring-menu")).toHaveCount(0);
  await expect(node(page, "n1")).toHaveAttribute("data-selected", "true");
});

test("S-046 노드 우클릭: Duplicate · Bring to front · Delete (상자 노드)", async ({ page }) => {
  await open(page, "/?demo");
  await page.mouse.click(500, 500, { button: "right" }); // n1 (입력란 아래)
  await expect(page.getByTestId("node-menu")).toHaveAttribute("role", "menu");
  await expect(item(page, "Duplicate")).toBeVisible();
  await expect(item(page, "Delete")).toBeVisible();
  await expect(item(page, "Text size")).toHaveCount(0); // 콘솔만
  await item(page, "Bring to front").click();
  const z = (id: string) => node(page, id).evaluate((e) => Number((e as HTMLElement).style.zIndex));
  expect(await z("n1")).toBeGreaterThan(await z("n2"));
  await page.mouse.click(500, 500, { button: "right" });
  await item(page, "Duplicate").click();
  await expect(page.locator("[data-node-id]")).toHaveCount(3);
  await page.mouse.click(1250, 800, { button: "right" }); // n2
  await item(page, "Delete").click();
  await expect(node(page, "n2")).toHaveCount(0);
});

test("S-046·S-2644 실행 중 콘솔 우클릭에도 Delete 가 있고(누르면 확인창), Text size 150% 는 resize 를 낸다", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Spawn an agent" }).click();
  await expect(consoles(page)).toHaveCount(1);
  const [id] = await ids(page);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => (window as any).__setTextSize(document.querySelector("[data-node-id]")!.getAttribute("data-node-id"), 100));
  const cols0 = await cols(page, id);
  const hb = (await handle(page).boundingBox())!;
  await page.mouse.click(hb.x + 300, hb.y + 16, { button: "right" });
  await expect(item(page, "Duplicate")).toBeVisible();
  await expect(item(page, "Bring to front")).toBeVisible();
  await expect(item(page, "Delete")).toBeVisible(); // S-2644: 실행 중이어도 보인다(누르면 기존 닫기 확인창)
  await item(page, "Text size").click();
  for (const n of ["Global", "85%", "100%", "115%", "130%", "150%", "175%", "200%"]) await expect(item(page, n)).toBeVisible();
  await item(page, "150%").click();
  await expect.poll(async () => (await resizes(page, id)).at(-1)?.[0] ?? cols0).toBeLessThan(cols0 * 0.8);
});

test("S-012 빈 보드 안내 · Spawn an agent · 최근 에이전트(재시작 뒤에도)", async ({ page }) => {
  await open(page);
  const empty = page.getByTestId("empty-board");
  await expect(empty).toContainText("This board is empty");
  await expect(empty.locator("[data-recent]")).toHaveCount(0);
  await page.getByRole("button", { name: "Spawn an agent" }).click(); // 무장된 claude
  await expect(consoles(page)).toHaveCount(1);
  await expect(empty).toHaveCount(0);
  await page.mouse.click(1300, 100, { button: "right" });
  await item(page, "Spawn agent").click();
  await item(page, "Shell").click();
  await page.reload();
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  const recent = page.getByTestId("empty-board").locator("[data-recent]");
  await expect(recent).toHaveText(["Shell", "Claude"]); // 가장 최근이 먼저
  await recent.first().click();
  await expect(page.getByTestId("console-badge")).toHaveAttribute("title", "shell");
  const b = (await page.locator("[data-node-id]").first().boundingBox())!; // 화면 가운데 빈 자리
  expect(Math.abs(b.x + b.width / 2 - 700)).toBeLessThan(40);
});

test("S-047 콘솔 1개 선택 상태에서 글자 키는 콘솔로, 빈 캔버스 클릭이면 보드로", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Spawn an agent" }).click();
  await expect(consoles(page)).toHaveCount(1);
  const [id] = await ids(page);
  await handle(page).click({ position: { x: 300, y: 16 } });
  await page.keyboard.press("v");
  await expect.poll(() => writes(page, id)).toContain("v");
  await page.keyboard.press("t");
  await expect.poll(() => writes(page, id)).toContain("t");
  await expect(page.getByTestId("rail-select")).toHaveAttribute("data-active", "true"); // T 가 도구를 바꾸지 않았다
  expect(await page.evaluate(() => !!document.activeElement?.closest(".xterm"))).toBe(true); // 그 콘솔이 키보드를 가졌다
  await page.mouse.click(1300, 150); // 빈 캔버스 → 보드가 되찾는다
  const n = (await writes(page, id)).length;
  await page.keyboard.press("t");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-active", "true");
  expect((await writes(page, id)).length).toBe(n);
  await page.keyboard.press("v");
  await expect(page.getByTestId("rail-select")).toHaveAttribute("data-active", "true");
});

test("S-047 입력란에 글자를 치면 보드 키가 아니다", async ({ page }) => {
  await open(page, "/?demo");
  await page.locator("input").first().click();
  await page.keyboard.type("t");
  await expect(page.getByTestId("rail-select")).toHaveAttribute("data-active", "true");
  await expect(page.locator("input").first()).toHaveValue("t");
});

// FIXRAIL: 우측 레일 컨테이너의 빈 영역(버튼 사이 틈)이 아래 보드 클릭을 가로채면 안 된다
test("FIXRAIL 우측 레일 버튼 사이 틈은 클릭을 먹지 않는다(보드가 받는다)", async ({ page }) => {
  await open(page);
  const hit = await page.evaluate(() => {
    const a = document.querySelector('[data-testid="rail-presets"]')!.getBoundingClientRect();
    const b = document.querySelector('[data-testid="rail-insert-todo"]')!.getBoundingClientRect();
    const x = Math.max(a.left, b.left) + 2, y = (a.bottom + b.top) / 2;
    const e = document.elementFromPoint(x, y);
    return { gap: b.top - a.bottom, inRail: !!e && document.querySelector('[data-testid="rail-presets"]')!.parentElement!.parentElement!.contains(e), board: !!e?.closest('[data-testid="board"]') };
  });
  expect(hit.gap).toBeGreaterThan(0);
  expect(hit.inRail).toBe(false);
});
