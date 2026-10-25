import { expect, test, type Page } from "@playwright/test";

// A6 보드 선택·편집 시험. 가짜 PTY(Tauri 밖). ?demo = 빈 상자 n1(-300,-200 400×300), n2(500,300 400×300). 1400×900 이면 월드 원점 = 화면 (700,450)
// n1 화면 x 400..800 y 250..550 (위쪽에 <input> 이 있음), n2 화면 x 1200..1600 y 750..1050
const box = (page: Page, sel: string) => page.locator(sel).first().boundingBox().then((b) => b!);
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const isSel = async (page: Page, id: string) => (await node(page, id).getAttribute("data-selected")) === "true";
const selected = (page: Page) => page.locator('[data-node-id][data-selected="true"]').count();
const ids = (page: Page) => page.evaluate(() => (window as any).__fakePty.ids() as number[]);
const termText = (page: Page, id: number) =>
  page.evaluate((i) => {
    const b = (window as any).__terms.get(i).buffer.active;
    let s = "";
    for (let r = 0; r < b.length; r++) s += (b.getLine(r)?.translateToString(true) ?? "") + "\n";
    return s;
  }, id);
async function drag(page: Page, from: [number, number], to: [number, number], opts: { up?: boolean } = {}) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 12 });
  if (opts.up !== false) await page.mouse.up();
}
const header = (page: Page, n: number) => page.locator("[data-node-handle]").nth(n);
const clickHeader = (page: Page, n: number) => header(page, n).click({ position: { x: 300, y: 16 } });

// 보드가 떠서 키 처리기가 붙은 뒤에 시작한다(goto 직후엔 React 가 아직일 수 있음)
const open = async (page: Page, url: string) => {
  await page.goto(url);
  await expect(page.locator("[data-node-id]").first()).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test("S-021 빈 캔버스를 Shift+끌면 상자가 그려지고 걸친 노드만 선택된다", async ({ page }) => {
  await open(page, "/?demo");
  await page.keyboard.down("Shift");
  await drag(page, [100, 100], [500, 300], { up: false });
  await expect(page.getByTestId("selection-box")).toBeVisible();
  const sb = await box(page, '[data-testid="selection-box"]');
  expect([Math.round(sb.x), Math.round(sb.y), Math.round(sb.width), Math.round(sb.height)]).toEqual([100, 100, 400, 200]);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("selection-box")).toHaveCount(0);
  expect(await isSel(page, "n1")).toBe(true);
  expect(await isSel(page, "n2")).toBe(false);
  // 빈 곳을 한 번 클릭하면 선택이 풀린다
  await page.mouse.click(100, 800);
  expect(await selected(page)).toBe(0);
});

test("S-020/S-021 클릭 = 선택, Shift+클릭 = 더하기·빼기", async ({ page }) => {
  await open(page, "/?demo");
  await page.mouse.click(500, 500); // n1 아래쪽(입력란 밖)
  expect([await isSel(page, "n1"), await isSel(page, "n2")]).toEqual([true, false]);
  await page.keyboard.down("Shift");
  await page.mouse.click(1250, 800);
  expect([await isSel(page, "n1"), await isSel(page, "n2")]).toEqual([true, true]);
  await page.mouse.click(500, 500);
  await page.keyboard.up("Shift");
  expect([await isSel(page, "n1"), await isSel(page, "n2")]).toEqual([false, true]);
});

test("S-022 Ctrl+A 는 모든 노드를 선택한다", async ({ page }) => {
  await open(page, "/?demo");
  await page.keyboard.press("Control+a");
  await expect(page.locator('[data-node-id][data-selected="true"]')).toHaveCount(2);
});

test("S-023/S-028 선택 전체가 같이 움직이고, 끌기 1번은 Ctrl+Z 한 번으로 원위치", async ({ page }) => {
  await open(page, "/?demo");
  const a0 = await box(page, '[data-node-id="n1"]'), b0 = await box(page, '[data-node-id="n2"]');
  await page.keyboard.press("Control+a");
  await drag(page, [500, 500], [560, 540]);
  const a1 = await box(page, '[data-node-id="n1"]'), b1 = await box(page, '[data-node-id="n2"]');
  expect([a1.x - a0.x, a1.y - a0.y]).toEqual([60, 40]);
  expect([b1.x - b0.x, b1.y - b0.y]).toEqual([60, 40]);
  await page.keyboard.press("Control+z");
  const a2 = await box(page, '[data-node-id="n1"]'), b2 = await box(page, '[data-node-id="n2"]');
  expect([a2.x, a2.y, b2.x, b2.y]).toEqual([a0.x, a0.y, b0.x, b0.y]);
  await page.keyboard.press("Control+Shift+z"); // 다시 하기
  expect((await box(page, '[data-node-id="n1"]')).x).toBe(a1.x);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+y"); // Ctrl+Y 도 다시 하기
  expect((await box(page, '[data-node-id="n1"]')).x).toBe(a1.x);
});

test("S-023 선택 안 된 노드를 끌면 그 노드만 선택되어 움직인다", async ({ page }) => {
  await open(page, "/?demo");
  await page.mouse.click(500, 500);
  const b0 = await box(page, '[data-node-id="n2"]');
  await drag(page, [1250, 800], [1210, 780]);
  expect(await isSel(page, "n2")).toBe(true);
  expect(await isSel(page, "n1")).toBe(false);
  const b1 = await box(page, '[data-node-id="n2"]');
  expect([b1.x - b0.x, b1.y - b0.y]).toEqual([-40, -20]);
});

test("S-024 화살표 1단위, Shift+화살표 10단위", async ({ page }) => {
  await open(page, "/?demo");
  await page.mouse.click(500, 500);
  const a0 = await box(page, '[data-node-id="n1"]');
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowUp");
  const a1 = await box(page, '[data-node-id="n1"]');
  expect([a1.x - a0.x, a1.y - a0.y]).toEqual([11, -9]);
  const b = await box(page, '[data-node-id="n2"]');
  expect([b.x, b.y]).toEqual([1200, 750]); // 선택 안 된 건 그대로
});

test("S-025 끄는 동안 정렬 가이드가 보이고, 놓아도 달라붙지 않는다", async ({ page }) => {
  await open(page, "/?demo");
  // n2 의 왼쪽(화면 1200)을 n1 의 왼쪽(400)보다 2 오른쪽(402)에 둔다
  await drag(page, [1250, 800], [452, 800], { up: false });
  await expect(page.locator('[data-testid="guide"][data-kind="align"]').first()).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId("guide")).toHaveCount(0);
  const a = await box(page, '[data-node-id="n1"]'), b = await box(page, '[data-node-id="n2"]');
  expect(b.x - a.x).toBe(2); // 400 에 붙지 않고 놓은 자리 그대로
});

test("S-025 가이드는 4단위 밖이면 안 보인다", async ({ page }) => {
  await open(page, "/?demo");
  await drag(page, [1250, 800], [455, 800], { up: false }); // 왼쪽이 n1 보다 5 오른쪽
  await expect(page.locator('[data-testid="guide"][data-kind="align"]')).toHaveCount(0);
  await page.mouse.up();
});

test("S-020 콘솔은 헤더로만 선택된다(본문 클릭은 터미널 몫)", async ({ page }) => {
  await open(page, "/?console=1&agent=shell");
  await page.locator(".xterm").click({ position: { x: 100, y: 100 } });
  expect(await selected(page)).toBe(0);
  await clickHeader(page, 0);
  expect(await selected(page)).toBe(1);
});

test("S-020 콘솔 헤더를 끌면 콘솔이 움직인다", async ({ page }) => {
  await open(page, "/?console=1&agent=shell");
  const b0 = await box(page, "[data-node-id]");
  const h = (await header(page, 0).boundingBox())!;
  await drag(page, [h.x + 300, h.y + 16], [h.x + 300 + 70, h.y + 16 + 30]);
  const b1 = await box(page, "[data-node-id]");
  expect([b1.x - b0.x, b1.y - b0.y]).toEqual([70, 30]);
  await page.keyboard.press("Control+z");
  expect((await box(page, "[data-node-id]")).x).toBe(b0.x);
});

test("S-022 콘솔에 포커스가 있을 때 Ctrl+A 는 보드 선택을 바꾸지 않는다", async ({ page }) => {
  await open(page, "/?console=2&agent=shell");
  await clickHeader(page, 0);
  expect([await isSel(page, "c1"), await isSel(page, "c2")]).toEqual([true, false]);
  await page.locator(".xterm").nth(1).click({ position: { x: 100, y: 100 } });
  await page.keyboard.press("Control+a");
  expect([await isSel(page, "c1"), await isSel(page, "c2")]).toEqual([true, false]);
  // 빈 캔버스를 누르면 키보드가 보드로 돌아온다
  await page.mouse.click(20, 70); // 상단 바(B4) 아래 빈 캔버스
  await page.keyboard.press("Control+a");
  expect(await selected(page)).toBe(2);
});

test("S-026 Ctrl+D 복제: 원본 +24,+24, 새 이름, 새 가짜 PTY(같은 에이전트)", async ({ page }) => {
  await open(page, "/?console=1&agent=claude");
  const b0 = await box(page, "[data-node-id]");
  const [old] = await ids(page);
  await clickHeader(page, 0);
  await page.keyboard.press("Control+d");
  await expect(page.getByTestId("console")).toHaveCount(2);
  await expect(page.getByTestId("console-name")).toHaveText(["Otto", "Dax"]);
  const all = await ids(page);
  expect(all.length).toBe(2);
  expect(all.filter((i) => i !== old)[0]).toBeGreaterThan(old!);
  const b1 = await node(page, "c2").boundingBox();
  expect([b1!.x - b0.x, b1!.y - b0.y]).toEqual([24, 24]);
  await expect(page.getByTestId("console-badge")).toHaveText(["C", "C"]);
  await page.keyboard.press("Control+z"); // 복제 되돌리기 = 복제본 사라짐
  await expect(page.getByTestId("console")).toHaveCount(1);
});

test("S-026 Ctrl+C / Ctrl+V: 대화(스크롤백)는 복사되지 않는다, 반복 붙여넣기는 겹치지 않는 빈 자리", async ({ page }) => {
  await open(page, "/?console=1&agent=shell");
  const [a] = await ids(page);
  await page.evaluate((i) => (window as any).__fakePty.emit(i, "SECRET-OUTPUT\r\n"), a!);
  await expect.poll(() => termText(page, a!)).toContain("SECRET-OUTPUT");
  await clickHeader(page, 0);
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await page.keyboard.press("Control+v");
  await expect(page.getByTestId("console")).toHaveCount(3);
  const n = await page.locator("[data-node-id]").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  const first = n[1]!, second = n[2]!;
  expect([Math.round(first.x - n[0]!.x), Math.round(first.y - n[0]!.y)]).toEqual([24, 24]);
  const overlap = (p: typeof first, q: typeof first) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
  expect(overlap(first, second)).toBe(false);
  const fresh = (await ids(page)).filter((i) => i !== a);
  expect(fresh.length).toBe(2);
  for (const i of fresh) expect(await termText(page, i)).not.toContain("SECRET-OUTPUT");
});

test("S-026 Ctrl+X: 잘라내기 후 Ctrl+V 로 붙인다", async ({ page }) => {
  await open(page, "/?demo");
  await page.mouse.click(500, 500);
  await page.keyboard.press("Control+x");
  await expect(node(page, "n1")).toHaveCount(0);
  await page.keyboard.press("Control+v");
  await expect(page.locator("[data-node-id]")).toHaveCount(2);
  expect(await selected(page)).toBe(1);
});

test("S-027 실행 중 콘솔 Delete → 확인창 → 취소하면 그대로, 확인하면 지워지고 Ctrl+Z 로 같은 자리 새 세션", async ({ page }) => {
  await open(page, "/?console=1&agent=claude");
  const b0 = await box(page, "[data-node-id]");
  const [old] = await ids(page);
  await page.evaluate((i) => (window as any).__fakePty.emit(i, "OLD-SCROLLBACK\r\n"), old!);
  await clickHeader(page, 0);
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("confirm-close")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("console")).toHaveCount(1);
  await page.keyboard.press("Backspace"); // Backspace 도 같다
  await expect(page.getByTestId("confirm-close")).toBeVisible();
  await page.getByTestId("confirm-close").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("console")).toHaveCount(0);
  expect(await ids(page)).toEqual([]);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("console")).toHaveCount(1);
  await expect(page.getByTestId("console-name")).toHaveText("Otto");
  const b1 = await box(page, "[data-node-id]");
  expect([b1.x, b1.y, b1.width, b1.height]).toEqual([b0.x, b0.y, b0.width, b0.height]);
  const now = await ids(page);
  expect(now.length).toBe(1);
  expect(now[0]).toBeGreaterThan(old!); // 새 세션
  expect((await termText(page, now[0]!)).trim()).toBe(""); // 옛 스크롤백 없음
  await expect(page.getByTestId("console-status")).toHaveText("STARTING");
});

test("S-027 여러 개를 지우면 복수 문구", async ({ page }) => {
  await open(page, "/?console=2&agent=claude");
  await expect.poll(async () => (await ids(page)).length).toBe(2); // 세션이 시작된 뒤(실행 중)
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("confirm-close")).toContainText("2 consoles are running");
  await page.getByTestId("confirm-close").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("console")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("console")).toHaveCount(2); // 한 번에 둘 다
});

test("S-027 실행 중이 아닌 노드는 확인 없이 지워진다", async ({ page }) => {
  await open(page, "/?demo");
  await page.mouse.click(500, 500);
  await page.keyboard.press("Delete");
  await expect(node(page, "n1")).toHaveCount(0);
  await expect(page.getByTestId("confirm-close")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(node(page, "n1")).toHaveCount(1);
});

test("S-028 이름 바꾸기·크기 조절도 각각 1단계로 되돌려진다", async ({ page }) => {
  await open(page, "/?console=1&agent=shell");
  await page.getByTestId("console-name").dblclick();
  await page.getByTestId("console-name-input").fill("Zed");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("console-name")).toHaveText("Zed");
  const h = (await page.locator('[data-handle="se"]').boundingBox())!;
  await drag(page, [h.x + h.width / 2, h.y + h.height / 2], [h.x + h.width / 2 + 100, h.y + h.height / 2 + 60]);
  const big = await box(page, "[data-node-id]");
  expect([big.width, big.height]).toEqual([820, 500]);
  await clickHeader(page, 0);
  await page.keyboard.press("Control+z");
  expect((await box(page, "[data-node-id]")).width).toBe(720);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("console-name")).toHaveText("Otto");
});

test("S-029 클릭으로 선택만 해서는 맨 위로 오지 않는다", async ({ page }) => {
  await open(page, "/?demo");
  const z = () => page.evaluate(() => ["n1", "n2"].map((id) => (document.querySelector(`[data-node-id="${id}"]`) as HTMLElement).style.zIndex));
  const before = await z();
  await page.mouse.click(500, 500);
  await page.mouse.click(1250, 800);
  expect(await z()).toEqual(before);
});

test("S-031 Esc: 대화상자 닫기 → 선택 해제 순서로 하나만", async ({ page }) => {
  await open(page, "/?console=1&agent=claude");
  await clickHeader(page, 0);
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("confirm-close")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("confirm-close")).toHaveCount(0);
  expect(await selected(page)).toBe(1); // 이번 Esc 는 대화상자만 닫았다
  await page.keyboard.press("Escape");
  expect(await selected(page)).toBe(0);
});
