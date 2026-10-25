import { expect, test, type Page } from "@playwright/test";

// B9: 명령 바·Thread 틀(S-540~S-557). 가짜 IPC·가짜 PTY. 기본 콘솔 이름은 Otto, Dax 순(console/names.ts).
const bar = (p: Page) => p.getByTestId("command-bar");
const input = (p: Page) => p.getByTestId("bar-input");
const chip = (p: Page, id: string) => p.getByTestId(`chip-${id}`);
const msgs = (p: Page) => p.getByTestId("thread-msg");
const ctl = (p: Page) => p.evaluate(() => (window as any).__fakePty.ctl() as { id: number; op: string }[]);
const barLog = (p: Page) => p.evaluate(() => ((window as any).__barLog ?? []) as string[]);
const focusedTestId = (p: Page) => p.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? "");

const open = async (p: Page, n = 2) => {
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto(n ? `/?console=${n}&agent=claude` : "/");
  await expect(bar(p)).toBeVisible();
  if (n) await expect(p.getByTestId("console")).toHaveCount(n);
};
const box = async (loc: ReturnType<Page["getByTestId"]>) => (await loc.boundingBox())!;
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("S-540/S-541 바는 보드 아래 가운데에 있고 홈에는 없다, 줌 컨트롤과 겹치지 않는다", async ({ page }) => {
  await open(page);
  const b = await box(bar(page));
  expect(Math.abs(b.x + b.width / 2 - 700)).toBeLessThan(8);
  expect(900 - (b.y + b.height)).toBeLessThan(40);
  expect(overlap(b, await box(page.getByTestId("zoom-pct")))).toBe(false);
  expect(overlap(b, await box(page.getByTestId("rail")))).toBe(false);
  // 요소: orb · 입력란 · ∧ · 보내기. 마이크는 없다
  await expect(page.getByTestId("bar-orb")).toBeVisible();
  await expect(page.getByTestId("thread-toggle")).toHaveText("∧");
  await expect(page.getByTestId("bar-send")).toBeVisible();
  await expect(bar(page).getByTestId("bar-mic")).toHaveCount(1); // F3 S-2268: 마이크 버튼이 생겼다
  await expect(input(page)).toHaveAttribute("placeholder", "Hold space to speak · @ to direct"); // F3 S-2269
  // 줌과 무관한 고정: 줌을 바꿔도 같은 자리
  await page.getByTestId("zoom-in").click();
  expect(await box(bar(page))).toEqual(b);
  // 홈 화면에는 없다
  await page.evaluate(() => (window as any).__shell.home());
  await expect(bar(page)).toHaveCount(0);
  await page.evaluate(() => (window as any).__shell.show("ws-fake"));
  await expect(bar(page)).toBeVisible();
});

test("S-540 빈 보드에서는 what can you do? 를 제안한다", async ({ page }) => {
  await open(page, 0);
  await expect(input(page)).toHaveAttribute("placeholder", "what can you do?");
});

test("S-542 칩 줄: 7개(Memory 항상), Thread 를 열면 Loops·Mission Map·Kill all(주황)이 더해진다", async ({ page }) => {
  await open(page);
  const names = () => bar(page).locator('[data-testid^="chip-"]').allTextContents();
  expect(await names()).toEqual(["New console", "Spawn 4…", "Group", "Presets", "Pause all", "Resume all", "Memory"]);
  await expect(page.getByTestId("thread-panel")).toHaveCount(0);
  await page.getByTestId("thread-toggle").click();
  await expect(page.getByTestId("thread-panel")).toBeVisible();
  const base = ["New console", "Spawn 4…", "Group", "Presets", "Pause all", "Resume all", "Memory", "Loops", "Mission Map", "Kill all"]; // 5묶음 E1: Docs·Code·Skills 칩은 스튜디오가 등록된 뒤에만 끼므로 기본 칩만 걸러 본다
  expect((await names()).filter((n) => base.includes(n))).toEqual(base);
  const c = await chip(page, "kill-all").evaluate((el) => getComputedStyle(el).color + "|" + getComputedStyle(el).borderColor + "|" + getComputedStyle(el).backgroundColor);
  const rgb = c.match(/rgb\((\d+), (\d+), (\d+)\)/g)!.map((s) => s.match(/\d+/g)!.map(Number));
  expect(rgb.some(([r, g, b]) => r! > 200 && g! > 80 && g! < 190 && b! < 90)).toBe(true); // 주황 계열이 글자·테두리·바탕 중 하나에 있다
  await page.getByTestId("thread-toggle").click();
  await expect(page.getByTestId("thread-panel")).toHaveCount(0);
  await expect(chip(page, "kill-all")).toHaveCount(0);
  expect(await names()).toHaveLength(7); // Memory 는 스레드와 상관없이 항상 (S-1736)
});

test("S-543 힌트 Try \"pass this task to codex\" (S-1737) 는 × 로 닫으면 다시 보이지 않는다(새로고침 뒤에도)", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("bar-hint")).toHaveText(/Try "pass this task to codex"/);
  const h = await box(page.getByTestId("bar-hint")), c = await box(chip(page, "new-console"));
  expect(h.y + h.height).toBeLessThanOrEqual(c.y + 1); // 칩 위
  await page.getByTestId("hint-close").click();
  await expect(page.getByTestId("bar-hint")).toHaveCount(0);
  await page.reload();
  await expect(bar(page)).toBeVisible();
  await expect(page.getByTestId("bar-hint")).toHaveCount(0);
});

test("S-544 New console 메뉴: 내장 6개만(내 에이전트 없음), 고르면 콘솔이 놓인다", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("symvibe.fakeCustomAgents", JSON.stringify([{ id: "custom:mine", name: "Mine", command: "mine --x" }])));
  await open(page);
  await chip(page, "new-console").click();
  const menu = page.getByRole("menu", { name: "New console" });
  await expect(menu).toBeVisible();
  expect(await menu.getByRole("menuitem").allTextContents()).toEqual(["Claude", "Codex", "Gemini", "Grok", "OpenCode", "Shell"]);
  await menu.getByRole("menuitem", { name: "Codex" }).click();
  await expect(page.getByTestId("console")).toHaveCount(3);
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId("console-badge").last()).toHaveAttribute("title", "codex");
});

test("S-545 Spawn 4 / Group 은 composer, Presets 는 라이브러리를 부른다", async ({ page }) => {
  await open(page);
  await chip(page, "spawn-4").click();
  await chip(page, "group").click();
  await chip(page, "presets").click();
  expect(await barLog(page)).toEqual(["composer:4", "composer:6", "presets"]);
});

test("S-546 Pause all / Resume all 은 열린 모든 콘솔에 적용된다(확인 없음)", async ({ page }) => {
  await open(page);
  await chip(page, "pause-all").click();
  await expect(page.getByTestId("console-status").nth(0)).toHaveText("PAUSED");
  await expect(page.getByTestId("console-status").nth(1)).toHaveText("PAUSED");
  expect((await ctl(page)).filter((c) => c.op === "pause")).toHaveLength(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await chip(page, "resume-all").click();
  await expect.poll(async () => (await ctl(page)).filter((c) => c.op === "resume").length).toBe(2);
});

test("S-547 Kill all: 첫 클릭 Confirm?(3초 뒤 원복) → 둘째 클릭 확인창 → Cancel 은 그대로, Kill all 은 모든 콘솔을 닫는다", async ({ page }) => {
  await open(page);
  await page.getByTestId("thread-toggle").click();
  const k = chip(page, "kill-all");
  await expect(k).toHaveText("Kill all");
  await k.click();
  await expect(k).toHaveText("Confirm?");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(k).toHaveText("Kill all", { timeout: 4500 }); // 3초 안에 안 누르면 원래대로
  await k.click();
  await k.click();
  const dlg = page.getByRole("dialog", { name: "Kill all 2 consoles?" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("console")).toHaveCount(2);
  await expect(k).toHaveText("Kill all"); // 둘째 클릭 뒤에는 처음으로
  await k.click();
  await k.click();
  await page.getByRole("dialog", { name: "Kill all 2 consoles?" }).getByRole("button", { name: "Kill all" }).click();
  await expect(page.getByTestId("console")).toHaveCount(0);
  expect((await ctl(page)).filter((c) => c.op === "kill")).toHaveLength(2);
});

test("S-548 Ctrl+K 는 보드에 키보드가 있을 때 바로 간다, Esc 는 보드에 돌려준다", async ({ page }) => {
  await open(page, 0); // 콘솔이 없는 보드: 가운데를 눌러도 콘솔이 키보드를 가져가지 않는다
  await page.mouse.click(700, 300); // 보드 빈 곳
  await page.keyboard.press("Control+k");
  await expect(input(page)).toBeFocused();
  await page.keyboard.type("abc");
  await page.keyboard.press("Escape");
  await expect(input(page)).not.toBeFocused();
  expect(await focusedTestId(page)).not.toBe("bar-input");
  await expect(input(page)).toHaveValue("abc"); // 쓰던 글은 그대로
});

test("S-548 콘솔이 키보드를 가졌으면 Ctrl+K 는 프로그램으로 간다(바를 가로채지 않는다)", async ({ page }) => {
  await open(page, 1);
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Control+k");
  await expect(input(page)).not.toBeFocused();
  await expect.poll(() => page.evaluate(() => ((window as any).__fakePty.writes(1) as string[]).join(""))).toContain("\x0b");
});

test("S-548/S-549 ↑↓ 는 최근 명령을 오간다, 쓰던 글로 돌아온다", async ({ page }) => {
  await open(page);
  await input(page).click();
  for (const t of ["first", "second"]) { await page.keyboard.type(t); await page.keyboard.press("Enter"); }
  await expect(input(page)).toHaveValue("");
  await page.keyboard.type("draft");
  await page.keyboard.press("ArrowUp");
  await expect(input(page)).toHaveValue("second");
  await page.keyboard.press("ArrowUp");
  await expect(input(page)).toHaveValue("first");
  await page.keyboard.press("ArrowUp");
  await expect(input(page)).toHaveValue("first");
  await page.keyboard.press("ArrowDown");
  await expect(input(page)).toHaveValue("second");
  await page.keyboard.press("ArrowDown");
  await expect(input(page)).toHaveValue("draft");
  // 앱을 다시 켜면(새로고침) 기억하지 않는다
  await page.reload();
  await input(page).click();
  await page.keyboard.press("ArrowUp");
  await expect(input(page)).toHaveValue("");
});

test("S-550/S-552 @ 메뉴: everyone·콘솔·그룹, 글자로 거르고 Tab/Return 으로 받는다, Esc 로 닫는다", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).__shell.group("ws-fake", ["c1", "c2"]));
  await input(page).click();
  await page.keyboard.type("@");
  const menu = page.getByRole("menu", { name: "Direct to" });
  await expect(menu).toBeVisible();
  const items = menu.getByRole("menuitem");
  expect(await items.allTextContents()).toEqual([expect.stringContaining("everyone"), expect.stringContaining("Otto"), expect.stringContaining("Dax"), expect.stringContaining("Group 1")]);
  await expect(items.nth(1)).toContainText("claude"); // 콘솔은 이름 + 에이전트
  await page.keyboard.type("da");
  await expect(items).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(input(page)).toHaveValue("@Dax ");
  await expect(menu).toHaveCount(0);
  // ↑↓ 로 고르고 Return 으로 받는다
  await input(page).fill("");
  await page.keyboard.type("@");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(input(page)).toHaveValue("@Otto ");
  await expect(page.getByTestId("thread-msg")).toHaveCount(0); // Return 은 받기만 했고 보내지 않았다
  // all 은 everyone
  await input(page).fill("");
  await page.keyboard.type("@all");
  await expect(page.getByRole("menu", { name: "Direct to" }).getByRole("menuitem")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(input(page)).toHaveValue("@everyone ");
  // Esc 는 메뉴만 닫고 키보드는 바에 둔다
  await input(page).fill("");
  await page.keyboard.type("@");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(input(page)).toBeFocused();
  await expect(input(page)).toHaveValue("@");
});

test("S-551 멘션만 보내면 스레드에 Say what Otto should do 안내", async ({ page }) => {
  await open(page);
  await input(page).click();
  await page.keyboard.type("@Otto");
  await page.keyboard.press("Escape"); // 메뉴를 닫고
  await page.keyboard.press("Enter");
  await page.getByTestId("thread-toggle").click();
  await expect(msgs(page)).toHaveCount(2);
  await expect(msgs(page).nth(0)).toHaveAttribute("data-role", "user");
  await expect(msgs(page).nth(1)).toHaveAttribute("data-role", "bot");
  await expect(msgs(page).nth(1)).toHaveText("Say what Otto should do");
});

test("S-553/S-554 Return 이 스레드에 내 메시지를 남긴다, 새로고침 뒤에도 복원, Clear 로 비운다", async ({ page }) => {
  await open(page);
  const users = page.locator('[data-testid="thread-msg"][data-role="user"]'); // B12 실행기가 등록되면 답(bot)도 같이 남는다
  await input(page).click();
  await page.keyboard.type("hello there");
  await page.getByTestId("bar-send").click();
  await expect(input(page)).toHaveValue("");
  await input(page).click(); // 보내기 버튼을 눌렀으니 포커스를 다시 바에
  await page.keyboard.type("second one");
  await page.keyboard.press("Enter");
  await page.getByTestId("thread-toggle").click();
  const panel = page.getByTestId("thread-panel");
  await expect(panel.getByTestId("thread-title")).toHaveText("THREAD");
  await expect(users).toHaveText(["hello there", "second one"]);
  await expect(msgs(page).first()).toHaveAttribute("data-role", "user");
  // 내 메시지는 오른쪽 정렬
  const p = await box(panel), m = await box(msgs(page).first());
  expect(p.x + p.width - (m.x + m.width)).toBeLessThan(24);
  expect(m.x - p.x).toBeGreaterThan(40);
  // 바 위로 열린다
  expect(p.y + p.height).toBeLessThanOrEqual((await box(bar(page))).y + 2);
  await page.reload();
  await expect(bar(page)).toBeVisible();
  await page.getByTestId("thread-toggle").click();
  await expect(users).toHaveText(["hello there", "second one"]);
  await page.getByTestId("thread-clear").click();
  await expect(msgs(page)).toHaveCount(0);
  await page.reload();
  await expect(bar(page)).toBeVisible();
  await page.getByTestId("thread-toggle").click();
  await expect(msgs(page)).toHaveCount(0);
});

test("S-556 바에 키보드가 있으면 한 글자 키·편집 키가 보드로 새지 않는다", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).__shell.select("ws-fake", ["c1"]));
  await expect(page.locator('[data-selected="true"]')).toHaveCount(1);
  await input(page).click();
  await page.keyboard.type("tvt");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-active", "false");
  await page.keyboard.press("Backspace"); // 글자만 지운다. 선택된 콘솔을 닫지 않는다
  await page.keyboard.press("Delete");
  await page.keyboard.press("Control+a"); // 입력란 안의 전체 선택. 보드 전체 선택이 아니다
  await expect(input(page)).toHaveValue("tv");
  await expect(page.getByTestId("console")).toHaveCount(2);
  await expect(page.locator('[data-selected="true"]')).toHaveCount(1);
});

test("S-361 Light 테마에서 명령 바 배경은 페이지 톤(어둡지 않다) (FX5 D7)", async ({ page }) => {
  await open(page);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  const rgb = await bar(page).evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
  expect((r! + g! + b!) / 3).toBeGreaterThan(200);
});

test("S-550 @ 메뉴의 그룹 줄에는 이름이 있다 (FX5 D1)", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).__shell.group("ws-fake", ["c1", "c2"]));
  await input(page).click();
  await page.keyboard.type("@");
  const items = page.getByRole("menu", { name: "Direct to" }).getByRole("menuitem");
  await expect(items.last()).toContainText("Group 1");
});
