import { expect, test, type Page } from "@playwright/test";

// U3 보드 메뉴 키보드·Group/Copy/Paste·Tidy up·F2/Ctrl+S (S-2640~S-2649). 가짜 PTY(Tauri 밖).
// 시드 보드: 줌 0.5, 뷰포트 1400×900 → 월드 (x,y) = 화면 (700 + x/2, 450 + y/2). 콘솔 720×440 = 화면 360×220.
type C = { id: string; x: number; y: number };
const seed = async (page: Page, cons: C[]) => {
  const board = JSON.stringify({
    formatVersion: 1, savedBy: "symvibe-win",
    workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" },
    viewport: { x: 0, y: 0, zoom: 0.5 },
    nodes: cons.map((c, i) => ({ id: c.id, kind: "console", x: c.x, y: c.y, w: 720, h: 440, z: i + 1, name: `Con ${c.id}`, agentId: "shell", textSize: null, yolo: false })),
    groups: [],
  });
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), board);
  await page.goto("/");
  await expect(page.getByTestId("console")).toHaveCount(cons.length);
  await expect.poll(() => page.evaluate(() => (window as any).__fakePty.ids().length as number)).toBe(cons.length);
};
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const handle = (page: Page, id: string) => page.locator(`[data-node-id="${id}"] [data-node-handle]`);
const item = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });
const blank = (page: Page) => page.mouse.click(700, 60); // 빈 캔버스: 선택 해제 + 보드가 키보드를 되찾음
const at = (page: Page, id: string) => node(page, id).evaluate((e) => [parseFloat((e as HTMLElement).style.left), parseFloat((e as HTMLElement).style.top)]);
/** 지금 포커스된 메뉴 항목이 role=menuitem 목록의 몇 번째인가(없으면 -1) */
const focused = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].indexOf(document.activeElement as Element));
const labels = (page: Page) => page.getByRole("menuitem").evaluateAll((es) => es.map((e) => (e.textContent ?? "").trim()));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test("S-2640 노드 메뉴: 열면 첫 항목 포커스, ↓↑ 순환·Home/End, Enter 로 실행", async ({ page }) => {
  await page.goto("/?demo");
  await expect(page.locator("[data-node-id]")).toHaveCount(2);
  await page.mouse.click(500, 500, { button: "right" }); // n1
  await expect(page.getByTestId("node-menu")).toBeVisible();
  const n = (await labels(page)).length;
  expect(n).toBeGreaterThanOrEqual(3);
  expect(await focused(page)).toBe(0);
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).toBe(1);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp"); // 처음에서 위 = 끝으로 순환
  expect(await focused(page)).toBe(n - 1);
  await page.keyboard.press("ArrowDown"); // 끝에서 아래 = 처음
  expect(await focused(page)).toBe(0);
  await page.keyboard.press("End");
  expect(await focused(page)).toBe(n - 1);
  await page.keyboard.press("Home");
  expect(await focused(page)).toBe(0);
  await page.keyboard.press("ArrowDown"); // Bring to front
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("node-menu")).toHaveCount(0);
  const z = (id: string) => node(page, id).evaluate((e) => Number((e as HTMLElement).style.zIndex));
  expect(await z("n1")).toBeGreaterThan(await z("n2"));
});

test("S-2640 Space 로도 실행하고, Esc 로 닫으면 열기 전 포커스로 돌아간다", async ({ page }) => {
  await page.goto("/?demo");
  await expect(page.locator("[data-node-id]")).toHaveCount(2);
  await page.evaluate(() => { const b = document.createElement("button"); b.id = "probe"; b.textContent = "probe"; document.body.append(b); b.focus(); });
  // 마우스를 거치지 않는 contextmenu 라 포커스가 probe 에 남은 채 메뉴가 열린다
  await node(page, "n1").dispatchEvent("contextmenu", { clientX: 500, clientY: 500, bubbles: true, cancelable: true });
  await expect(page.getByTestId("node-menu")).toBeVisible();
  expect(await focused(page)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("node-menu")).toHaveCount(0);
  await expect(page.locator("#probe")).toBeFocused();
  await node(page, "n1").dispatchEvent("contextmenu", { clientX: 500, clientY: 500, bubbles: true, cancelable: true });
  await page.keyboard.press("Space"); // 첫 항목 = Duplicate
  await expect(page.locator("[data-node-id]")).toHaveCount(3);
});

test("S-2640 상단 바 드롭다운(Menu): 열면 첫 항목 포커스, ↓ 이동, Esc 로 닫으면 단추로 복원", async ({ page }) => {
  await page.goto("/");
  const btn = page.getByTestId("tools-btn");
  await btn.click();
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).toBe(1);
  await page.keyboard.press("End");
  expect(await focused(page)).toBe((await labels(page)).length - 1);
  await page.keyboard.press("ArrowDown"); // 순환
  expect(await focused(page)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(btn).toBeFocused();
});

test("S-2641 우클릭 링: 첫 항목 포커스, →↓ 다음 / ←↑ 이전(순환)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("rail-spawn").waitFor();
  await page.mouse.click(700, 450, { button: "right" });
  await expect(page.getByTestId("ring-menu")).toBeVisible();
  const n = (await labels(page)).length;
  expect(await focused(page)).toBe(0);
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe(1);
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).toBe(2);
  await page.keyboard.press("ArrowLeft");
  expect(await focused(page)).toBe(1);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowLeft"); // 처음에서 이전 = 끝
  expect(await focused(page)).toBe(n - 1);
  await page.keyboard.press("ArrowRight"); // 끝에서 다음 = 처음
  expect(await focused(page)).toBe(0);
});

test("S-2647 링 More 메뉴에 Tidy up(오른쪽에 Ctrl+Shift+T), 하위 메뉴로 들어가도 첫 항목 포커스", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("rail-spawn").waitFor();
  await page.mouse.click(700, 450, { button: "right" });
  await page.keyboard.press("End"); // More
  await page.keyboard.press("Enter");
  await expect(item(page, "Tidy up")).toBeVisible();
  await expect(item(page, "Tidy up")).toContainText("Ctrl+Shift+T");
  expect(await focused(page)).toBe(0);
});

test("S-2642 콘솔 2개 선택 → 노드 메뉴 Group(Ctrl+G 표시) → 그룹 생기고, Ungroup(Ctrl+Shift+G)으로 해제", async ({ page }) => {
  await seed(page, [{ id: "c1", x: -760, y: -200 }, { id: "c2", x: 40, y: -200 }, { id: "c3", x: -360, y: 300 }]);
  await blank(page);
  await handle(page, "c1").click({ position: { x: 100, y: 8 } });
  await handle(page, "c2").click({ position: { x: 100, y: 8 }, modifiers: ["Shift"] });
  await handle(page, "c2").click({ position: { x: 100, y: 8 }, button: "right" });
  await expect(page.getByTestId("node-menu")).toBeVisible();
  await expect(item(page, "Ungroup")).toHaveCount(0); // 그룹 소속이 없으면 없다
  await expect(item(page, "Group")).toContainText("Ctrl+G");
  await item(page, "Group").click();
  await expect(page.getByTestId("group-halo")).toHaveCount(1);
  await expect(page.getByTestId("group-halo")).toHaveAttribute("data-members", "c1,c2");
  await handle(page, "c1").click({ position: { x: 100, y: 8 }, button: "right" });
  await expect(item(page, "Ungroup")).toContainText("Ctrl+Shift+G");
  await item(page, "Ungroup").click();
  await expect(page.getByTestId("group-halo")).toHaveCount(0);
});

test("S-2642 콘솔 1개만 선택이면 Group 이 없다", async ({ page }) => {
  await seed(page, [{ id: "c1", x: -760, y: -200 }, { id: "c2", x: 40, y: -200 }]);
  await blank(page);
  await handle(page, "c1").click({ position: { x: 100, y: 8 }, button: "right" });
  await expect(page.getByTestId("node-menu")).toBeVisible();
  await expect(item(page, "Group")).toHaveCount(0);
});

test("S-2644 실행 중 콘솔 우클릭에도 Delete 가 보이고, 누르면 닫기 확인창", async ({ page }) => {
  await seed(page, [{ id: "c1", x: -360, y: -200 }]);
  await handle(page, "c1").click({ position: { x: 100, y: 8 }, button: "right" });
  await expect(item(page, "Delete")).toBeVisible();
  await item(page, "Delete").click();
  await expect(page.getByTestId("confirm-close")).toBeVisible();
  await expect(node(page, "c1")).toHaveCount(1); // 확인 전에는 그대로
});

test.describe("S-2643 터미널 본문 우클릭", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  });
  const open = async (page: Page) => {
    await page.goto("/?console=1&agent=shell");
    await expect(page.getByTestId("console")).toHaveCount(1);
    const id = (await page.evaluate(() => (window as any).__fakePty.ids() as number[]))[0]!;
    await page.evaluate((i) => (window as any).__fakePty.emit(i, "hello world line\r\nsecond\r\n"), id);
    await expect.poll(() => page.evaluate((i) => (window as any).__terms.get(i).buffer.active.getLine(0)?.translateToString(true) as string, id)).toContain("hello");
    return id;
  };
  const screen = (page: Page) => page.locator(".xterm-screen").boundingBox().then((b) => b!);
  const dragSelect = async (page: Page) => {
    const r = await screen(page);
    await page.mouse.move(r.x + 5, r.y + 5);
    await page.mouse.down();
    await page.mouse.move(r.x + 80, r.y + 8, { steps: 5 });
    await page.mouse.up();
  };
  const sel = (page: Page, id: number) => page.evaluate((i) => (window as any).__terms.get(i).getSelection() as string, id);

  test("선택이 없으면 Copy 없이 Paste·Select all 이 맨 위, 그 뒤에 기존 항목", async ({ page }) => {
    await open(page);
    const r = await screen(page);
    await page.mouse.click(r.x + r.width / 2, r.y + r.height - 20, { button: "right" });
    await expect(page.getByTestId("node-menu")).toBeVisible();
    await expect(item(page, "Copy")).toHaveCount(0);
    expect((await labels(page)).slice(0, 2)).toEqual(["Paste", "Select all"]);
    expect(await labels(page)).toContain("Duplicate");
  });

  test("선택이 있으면 Copy 가 맨 위 → 클립보드에 선택 글", async ({ page }) => {
    const id = await open(page);
    await dragSelect(page);
    const want = await sel(page, id);
    expect(want.length).toBeGreaterThan(3);
    const r = await screen(page);
    await page.mouse.click(r.x + 40, r.y + 6, { button: "right" });
    expect((await labels(page))[0]).toBe("Copy");
    await item(page, "Copy").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(want);
  });

  test("Select all → 터미널 전체 선택", async ({ page }) => {
    const id = await open(page);
    const r = await screen(page);
    await page.mouse.click(r.x + r.width / 2, r.y + r.height - 20, { button: "right" });
    await item(page, "Select all").click();
    await expect.poll(() => sel(page, id)).toContain("second");
  });

  test("Paste: 한 줄은 바로 들어가고, 여러 줄은 붙여넣기 확인(PasteCheck)을 탄다", async ({ page }) => {
    const id = await open(page);
    const r = await screen(page);
    const menu = () => page.mouse.click(r.x + r.width / 2, r.y + r.height - 20, { button: "right" });
    await page.evaluate(() => navigator.clipboard.writeText("echo one"));
    await menu();
    await item(page, "Paste").click();
    await expect.poll(() => page.evaluate((i) => ((window as any).__fakePty.writes(i) as string[]).join(""), id)).toContain("echo one");
    await page.evaluate(() => navigator.clipboard.writeText("ls\npwd"));
    await menu();
    await item(page, "Paste").click();
    await expect(page.getByTestId("paste-check")).toBeVisible();
  });
});

const FOUR: C[] = [{ id: "a", x: 300, y: 300 }, { id: "b", x: -800, y: -300 }, { id: "c", x: -500, y: 250 }, { id: "d", x: 100, y: -250 }];
// 읽기 순서 b d / c a, 칸 744×464, 왼쪽 위 = 경계 상자 왼쪽 위 월드(-800,-300)
const TIDIED: Record<string, number[]> = { b: [-800, -300], d: [-56, -300], c: [-800, 164], a: [-56, 164] };
const allAt = async (page: Page) => Object.fromEntries(await Promise.all(["a", "b", "c", "d"].map(async (id) => [id, await at(page, id)] as const)));

test("S-2645·S-2646·S-2647 링 More › Tidy up → 2×2, Ctrl+Z 한 번에 원위치", async ({ page }) => {
  await seed(page, FOUR);
  const before = await allAt(page);
  await page.mouse.click(700, 20, { button: "right" });
  await item(page, "More").click();
  await item(page, "Tidy up").click();
  expect(await allAt(page)).toEqual(TIDIED);
  await blank(page);
  await page.keyboard.press("Control+z");
  expect(await allAt(page)).toEqual(before);
});

test("S-2647 Ctrl+Shift+T 도 같은 Tidy(보드가 키보드를 가졌을 때)", async ({ page }) => {
  await seed(page, FOUR);
  await blank(page);
  await page.keyboard.press("Control+Shift+T");
  expect(await allAt(page)).toEqual(TIDIED);
});

test("S-2647 콘솔 안(xterm 포커스)에서는 Ctrl+Shift+T 가 Tidy 를 하지 않는다", async ({ page }) => {
  await seed(page, FOUR);
  const before = await allAt(page);
  await page.locator('[data-node-id="b"] .xterm-helper-textarea').focus();
  await page.keyboard.press("Control+Shift+T");
  expect(await allAt(page)).toEqual(before);
});

test("S-2646·S-2647 노드 메뉴 Tidy up: 2개 선택이면 선택만 정리(표시 Ctrl+Shift+T)", async ({ page }) => {
  await seed(page, FOUR);
  await blank(page);
  await handle(page, "a").click({ position: { x: 100, y: 8 } });
  await handle(page, "d").click({ position: { x: 100, y: 8 }, modifiers: ["Shift"] });
  await handle(page, "d").click({ position: { x: 100, y: 8 }, button: "right" });
  await expect(item(page, "Tidy up")).toContainText("Ctrl+Shift+T");
  await item(page, "Tidy up").click();
  // a(300,300) d(100,-250): 읽기 순서 d a, 왼쪽 위 = (100,-250)
  expect(await at(page, "d")).toEqual([100, -250]);
  expect(await at(page, "a")).toEqual([100 + 744, -250]);
  expect(await at(page, "b")).toEqual([-800, -300]); // 선택 밖은 그대로
  expect(await at(page, "c")).toEqual([-500, 250]);
});

test("S-2647 노드 1개 선택의 노드 메뉴에는 Tidy up 이 없다", async ({ page }) => {
  await seed(page, FOUR);
  await blank(page);
  await handle(page, "a").click({ position: { x: 100, y: 8 }, button: "right" });
  await expect(page.getByTestId("node-menu")).toBeVisible();
  await expect(item(page, "Tidy up")).toHaveCount(0);
});

test("S-2648 F2: 콘솔 정확히 1개 선택이면 symvibe:rename-console 이벤트(detail.id)", async ({ page }) => {
  await seed(page, [{ id: "c1", x: -760, y: -200 }, { id: "c2", x: 40, y: -200 }]);
  await page.evaluate(() => { (window as any).__ren = []; window.addEventListener("symvibe:rename-console", (e) => (window as any).__ren.push((e as CustomEvent).detail.id)); });
  await blank(page);
  await page.keyboard.press("F2"); // 선택 없음
  await handle(page, "c1").click({ position: { x: 100, y: 8 } });
  await handle(page, "c2").click({ position: { x: 100, y: 8 }, modifiers: ["Shift"] });
  await page.keyboard.press("F2"); // 2개
  expect(await page.evaluate(() => (window as any).__ren)).toEqual([]);
  await handle(page, "c2").click({ position: { x: 100, y: 8 } });
  await page.keyboard.press("F2");
  await expect.poll(() => page.evaluate(() => (window as any).__ren)).toEqual(["c2"]);
});

test("S-2649 Ctrl+S: 알림 'Saved' (2초 뒤 사라짐)", async ({ page }) => {
  await page.goto("/?demo");
  await expect(page.locator("[data-node-id]")).toHaveCount(2);
  await blank(page);
  await page.keyboard.press("Control+s");
  await expect(page.getByTestId("app-notice")).toHaveText("Saved");
  await expect(page.getByTestId("app-notice")).toHaveCount(0, { timeout: 4000 });
});
