import { expect, test, type Page } from "@playwright/test";

// 가짜 PTY(Tauri 밖)로 콘솔 노드를 시험한다. 쿼리: ?console=N&agent=<id>
const view = (page: Page) =>
  page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('[data-testid="world"]')!).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
const ids = (page: Page) => page.evaluate(() => (window as any).__fakePty.ids() as number[]);
const emit = (page: Page, id: number, text: string) => page.evaluate(([i, t]) => (window as any).__fakePty.emit(i, t), [id, text] as const);
const exit = (page: Page, id: number, code: number | null) => page.evaluate(([i, c]) => (window as any).__fakePty.exit(i, c), [id, code] as const);
// xterm 버퍼 전체를 글자로
const text = (page: Page, id: number) =>
  page.evaluate((i) => {
    const b = (window as any).__terms.get(i).buffer.active;
    let s = "";
    for (let r = 0; r < b.length; r++) s += (b.getLine(r)?.translateToString(true) ?? "") + "\n";
    return s;
  }, id);
const status = (page: Page, n = 0) => page.getByTestId("console-status").nth(n);
const nodeBox = (page: Page, n = 0) => page.locator("[data-node-id]").nth(n).boundingBox();
const size = (b: { width: number; height: number }) => [Math.round(b.width), Math.round(b.height)];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test("S-060/S-061/S-063 콘솔 하나: 헤더 이름 Otto, 기본 720×440, 상태 IDLE(Shell)", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  await expect(page.getByTestId("console-name")).toHaveText("Otto");
  await expect(status(page)).toHaveText("IDLE");
  for (const t of ["console-badge", "console-restart", "console-duplicate", "console-close"]) await expect(page.getByTestId(t)).toHaveCount(1);
  await expect(page.getByTestId("console-yolo")).toHaveCount(0);
  expect(size((await nodeBox(page))!)).toEqual([720, 440]);
  await expect(page.locator(".xterm")).toHaveCount(1);
});

test("S-064 에이전트 콘솔은 STARTING → 출력 WORKING → 1.5초 뒤 RUNNING, Shell 은 Enter 뒤 RUNNING", async ({ page }) => {
  await page.goto("/?console=1&agent=claude");
  await expect(status(page)).toHaveText("STARTING");
  const [a] = await ids(page);
  await emit(page, a, "hello\r\n");
  await expect(status(page)).toHaveText("WORKING");
  await expect(status(page)).toHaveText("RUNNING", { timeout: 4000 });
  await page.goto("/?console=1&agent=shell");
  await expect(status(page)).toHaveText("IDLE");
  await page.locator(".xterm").click();
  await page.keyboard.type("ls");
  await expect(status(page)).toHaveText("IDLE");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("RUNNING");
});

test("S-063 크기 끌기: 모서리로 늘리면 가짜 PTY 에 resize 기록, 최소 360×200", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  const [id] = await ids(page);
  const before = await page.evaluate((i) => (window as any).__fakePty.resizes(i).length as number, id);
  const h = (await page.locator('[data-handle="se"]').boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 120, h.y + h.height / 2 + 80, { steps: 8 });
  await page.mouse.up();
  expect(size((await nodeBox(page))!)).toEqual([840, 520]);
  const r = await page.evaluate((i) => (window as any).__fakePty.resizes(i) as [number, number][], id);
  expect(r.length).toBeGreaterThan(before);
  const t = await page.evaluate((i) => { const x = (window as any).__terms.get(i); return [x.cols, x.rows]; }, id);
  expect(r[r.length - 1]).toEqual(t);
  // 최소 크기
  const h2 = (await page.locator('[data-handle="se"]').boundingBox())!;
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(h2.x - 900, h2.y - 700, { steps: 6 });
  await page.mouse.up();
  expect(size((await nodeBox(page))!)).toEqual([360, 200]);
});

test("S-063 8방향 손잡이가 있다", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  for (const d of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]) await expect(page.locator(`[data-handle="${d}"]`)).toHaveCount(1);
});

test("S-068/S-241 실행 중 Close: 확인창 문구, Cancel 은 유지, 확인하면 PTY 끝내고 노드 삭제", async ({ page }) => {
  await page.goto("/?console=1&agent=claude");
  await page.getByTestId("console-close").click();
  const d = page.getByTestId("confirm-close");
  await expect(d).toContainText("Close running agents?");
  await expect(d).toContainText("Otto is running. Closing ends its session.");
  await d.getByRole("button", { name: "Cancel" }).click();
  await expect(d).toHaveCount(0);
  await expect(page.locator("[data-node-id]")).toHaveCount(1);
  expect(await ids(page)).toHaveLength(1);
  await page.getByTestId("console-close").click();
  await d.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("[data-node-id]")).toHaveCount(0);
  expect(await ids(page)).toHaveLength(0);
});

test("S-070/S-071 에이전트가 끝나면 셸로 떨어져 RUNNING, 셸이 끝나면 종료 코드 줄과 DONE, 끝난 콘솔은 확인 없이 Close", async ({ page }) => {
  await page.goto("/?console=1&agent=claude");
  const [a] = await ids(page);
  await emit(page, a, "agent output\r\n");
  await exit(page, a, 0);
  await expect.poll(async () => (await ids(page)).filter((i) => i !== a).length).toBe(1);
  const [s] = await ids(page);
  await expect(status(page)).toHaveText("RUNNING");
  await expect.poll(() => text(page, s).catch(() => "")).toContain("agent output"); // 같은 화면 이어쓰기
  await exit(page, s, 3);
  await expect(status(page)).toHaveText("DONE");
  await expect.poll(() => text(page, s)).toContain("[exited with code 3]");
  await page.getByTestId("console-close").click();
  await expect(page.getByTestId("confirm-close")).toHaveCount(0);
  await expect(page.locator("[data-node-id]")).toHaveCount(0);
});

test("S-066 Restart: 실행 중이면 확인 먼저, 확인하면 비우고 새 PTY", async ({ page }) => {
  await page.goto("/?console=1&agent=claude");
  const [a] = await ids(page);
  await emit(page, a, "old-screen\r\n");
  await page.getByTestId("console-restart").click();
  await expect(page.getByTestId("confirm-close")).toBeVisible();
  await page.getByTestId("confirm-close").getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(async () => (await ids(page)).filter((i) => i !== a).length).toBe(1);
  const [b] = await ids(page);
  expect(await text(page, b)).not.toContain("old-screen");
  await expect(status(page)).toHaveText("STARTING");
});

test("S-165 못 찾은 에이전트: 셸을 열고 흐린 글씨로 안내", async ({ page }) => {
  await page.goto("/?console=1&agent=codex");
  await expect.poll(async () => (await ids(page)).length).toBe(1);
  const [id] = await ids(page);
  await expect.poll(() => text(page, id)).toContain("codex not found on PATH. Opening a shell in this lane");
});

test("S-067/S-030 Duplicate: 같은 에이전트의 새 콘솔이 원본 오른쪽 빈 자리(간격 24)에 생기고 이름은 Dax", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  await page.getByTestId("console-duplicate").click();
  await expect(page.locator("[data-node-id]")).toHaveCount(2);
  const a = (await nodeBox(page, 0))!, b = (await nodeBox(page, 1))!;
  expect(Math.round(b.x - (a.x + a.width))).toBe(24);
  expect(Math.round(b.y)).toBe(Math.round(a.y));
  await expect(page.getByTestId("console-name").nth(1)).toHaveText("Dax");
  expect(await ids(page)).toHaveLength(2);
});

test("S-062 이름 더블클릭 편집: Enter 저장, Esc 취소, 중복은 ' 2'", async ({ page }) => {
  await page.goto("/?console=2&agent=shell");
  const n0 = page.getByTestId("console-name").nth(0);
  await n0.dblclick();
  const inp = page.getByTestId("console-name-input");
  await expect(inp).toHaveAttribute("maxlength", "23");
  await inp.fill("Zed");
  await inp.press("Escape");
  await expect(n0).toHaveText("Otto");
  await n0.dblclick();
  await page.getByTestId("console-name-input").fill("Dax");
  await page.getByTestId("console-name-input").press("Enter");
  await expect(n0).toHaveText("Dax 2");
});

test("S-011 본문 위 휠은 보드를 안 움직이고(스크롤백), Ctrl+휠은 보드 줌", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  const [id] = await ids(page);
  await emit(page, id, Array.from({ length: 120 }, (_, i) => `row-${i}`).join("\r\n") + "\r\n");
  await expect.poll(() => page.evaluate((i) => (window as any).__terms.get(i).buffer.active.baseY as number, id)).toBeGreaterThan(50);
  const body = (await page.locator(".xterm-screen").boundingBox())!;
  await page.mouse.move(body.x + 100, body.y + 100);
  const v0 = await view(page);
  await page.mouse.wheel(0, -300);
  expect(await view(page)).toEqual(v0);
  const b = await page.evaluate((i) => { const a = (window as any).__terms.get(i).buffer.active; return [a.viewportY, a.baseY] as number[]; }, id);
  expect(b[0]).toBeLessThan(b[1]); // 스크롤백이 움직였다
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Control");
  expect((await view(page)).zoom).toBeGreaterThan(1);
});

test("S-010 콘솔 본문 더블클릭 = 화면에 맞춤 + 키보드가 그 콘솔로", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  const v0 = await view(page);
  const body = (await page.locator(".xterm-screen").boundingBox())!;
  await page.mouse.dblclick(body.x + 200, body.y + 150);
  expect((await view(page)).zoom).not.toBeCloseTo(v0.zoom, 3);
  await page.keyboard.type("zz");
  const [id] = await ids(page);
  await expect.poll(() => text(page, id)).toContain("zz");
});

test("S-107 줌 50%·100%·200%에서 끌기 선택이 같은 글자를 잡는다", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  const [id] = await ids(page);
  await emit(page, id, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\r\n");
  const sel = async () => {
    const r = (await page.locator(".xterm-screen").boundingBox())!;
    const dim = await page.evaluate((i) => { const x = (window as any).__terms.get(i); return [x.cols, x.rows]; }, id);
    const cw = r.width / dim[0], ch = r.height / dim[1];
    await page.mouse.click(r.x + 30 * cw, r.y + 10 * ch); // 선택 해제
    await page.mouse.move(r.x + 2.3 * cw, r.y + 0.5 * ch);
    await page.mouse.down();
    await page.mouse.move(r.x + 9.3 * cw, r.y + 0.5 * ch, { steps: 6 });
    await page.mouse.up();
    return page.evaluate((i) => (window as any).__terms.get(i).getSelection() as string, id);
  };
  const s100 = await sel();
  expect(s100.length).toBeGreaterThanOrEqual(6);
  expect(s100.startsWith("C")).toBe(true);
  const zoomBy = async (factor: number) => {
    const r = (await page.locator(".xterm-screen").boundingBox())!;
    await page.mouse.move(r.x + 5, r.y + 5);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -Math.log(factor) / 0.0025);
    await page.keyboard.up("Control");
  };
  await zoomBy(2);
  expect((await view(page)).zoom).toBeGreaterThan(1.8);
  expect(await sel()).toBe(s100);
  await zoomBy(0.25);
  expect((await view(page)).zoom).toBeLessThan(0.6);
  expect(await sel()).toBe(s100);
});

test("S-074 화면 안 콘솔만 WebGL(최대 12), 화면 밖이면 해제", async ({ page }) => {
  await page.goto("/?console=14&agent=shell");
  await expect.poll(() => page.evaluate(() => (window as any).__webglActive() as number)).toBeGreaterThan(0);
  const some = await page.evaluate(() => (window as any).__webglActive() as number);
  expect(some).toBeLessThan(14); // 100% 에서는 일부만 화면 안
  await page.mouse.move(700, 450);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 500); // 줌 아웃: 14개 모두 화면 안
  await page.keyboard.up("Control");
  await expect.poll(() => page.evaluate(() => (window as any).__webglActive() as number)).toBe(12); // 보이는 14개 중 최대 12
  // 가운데 버튼 끌기로 보드를 멀리 민다(콘솔 본문 위 휠은 터미널이 받으므로 팬에 못 쓴다)
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(700, 450);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(1390, 450, { steps: 4 });
    await page.mouse.up({ button: "middle" });
  }
  await expect.poll(() => page.evaluate(() => (window as any).__webglActive() as number), { timeout: 20_000 }).toBe(0); // P2: 안 보인 지 10초 뒤에 뗀다
});

test("S-108 링크 안 눌림·창 제목 무시·OSC 52 무시", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  const [id] = await ids(page);
  const title = await page.title();
  await emit(page, id, "\x1b]0;evil title\x07\x1b]52;c;aGk=\x07see https://example.com/x\r\n");
  await expect.poll(() => text(page, id)).toContain("https://example.com/x");
  expect(await page.title()).toBe(title);
  const r = (await page.locator(".xterm-screen").boundingBox())!;
  await page.mouse.move(r.x + 20, r.y + 6);
  await page.mouse.move(r.x + 60, r.y + 6);
  await expect(page.locator(".xterm-cursor-pointer")).toHaveCount(0); // 링크 위에서 손가락 커서가 안 된다
  expect(await page.evaluate(() => (window as any).__oscClipboard ?? null)).toBeNull();
});

test("S-108 OSC 8 하이퍼링크도 눌리지 않는다(대화상자·손가락 커서 없음)", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  const [id] = await ids(page);
  let dialogs = 0;
  page.on("dialog", (d) => { dialogs++; void d.dismiss(); });
  await page.evaluate(() => ((window as any).__opened = 0, (window as any).open = () => { (window as any).__opened++; return null; }));
  await emit(page, id, "\x1b]8;;https://example.com/osc8\x07LINKTEXT\x1b]8;;\x07 done\r\n");
  await expect.poll(() => text(page, id)).toContain("LINKTEXT");
  const r = (await page.locator(".xterm-screen").boundingBox())!;
  await page.mouse.move(r.x + 20, r.y + 6);
  await page.mouse.move(r.x + 40, r.y + 6);
  await expect(page.locator(".xterm-cursor-pointer")).toHaveCount(0);
  await page.mouse.click(r.x + 40, r.y + 6);
  await page.waitForTimeout(300);
  expect(dialogs).toBe(0);
  expect(await page.evaluate(() => (window as any).__opened)).toBe(0);
});
