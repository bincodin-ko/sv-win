import { expect, test, type Page } from "@playwright/test";

// C10 스티커 노트·텍스트 상자 (S-840~S-849). 가짜 PTY(Tauri 밖), 주소 ?kindsTest 로 상태 읽기 창구 window.__kt 를 쓴다.
// 약속(이름): flyout 항목 shape-sticky · 레일 rail-text(Text 도구)
//   스티커: sticky-body(노드 안 몸통) sticky-input(편집 textarea) sticky-text(보이는 글) sticky-fold(접힌 모서리 버튼)
//   텍스트: text-body text-input(편집 textarea) text-text(보이는 글)
//   인스펙터는 C5 것: style-inspector insp-<절> insp-stroke-<색> insp-font insp-size-<S|M|L|XL> insp-align-<left|center|right>
// 1400×900, 줌 1, 보드 이동 0 이면 월드 (x,y) = 화면 (700+x, 450+y).
test.use({ actionTimeout: 5000 });
type N = Record<string, unknown> & { id: string; kind: string; x: number; y: number; w: number; h: number };
const n = (id: string, kind: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): N => ({ id, kind, x, y, w, h, z: 1, ...extra });
const STK = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => n(id, "sticky", x, y, 220, 220, { text: "note", color: "yellow", ...extra });
const TXT = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  n(id, "text", x, y, 240, 32, { text: "label", stroke: "default", font: "clean", size: "M", align: "left", opacity: 100, ...extra });
const DUMMY = n("d", "tk-plain", -600, -300, 100, 60); // 빈 보드 안내가 클릭을 가리지 않게

const boardJson = (nodes: N[]) => JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 1 }, nodes, groups: [] });
const seed = async (page: Page, nodes: N[]) => {
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), boardJson([DUMMY, ...nodes]));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
};
type Snap = { tool: string; selection: string[]; nodes: (N & Record<string, any>)[] };
const st = (page: Page) => page.evaluate(() => (window as any).__kt.st() as Snap);
const mine = async (page: Page, kind?: string) => (await st(page)).nodes.filter((x) => x.id !== "d" && (!kind || x.kind === kind));
const nodeOf = async (page: Page, id: string) => (await st(page)).nodes.find((x) => x.id === id)!;
const T = (page: Page, id: string) => page.getByTestId(id);
const world = (page: Page) => T(page, "world").evaluate((e) => (e as HTMLElement).style.transform);
const fontPx = (loc: ReturnType<Page["locator"]>) => loc.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
async function placeSticky(page: Page, x = 700, y = 450) {
  await T(page, "rail-shapes").click();
  await T(page, "shape-sticky").click();
  await page.mouse.click(x, y);
}
const blank = (page: Page) => page.mouse.click(1250, 800); // 빈 캔버스

test.describe("S-840 스티커 놓기", () => {
  test("Shapes flyout 에 Sticky 가 더해진다(앞 5개는 그대로)", async ({ page }) => {
    await seed(page, []);
    await T(page, "rail-shapes").click();
    const ids = await T(page, "shapes-flyout").locator('[data-testid^="shape-"]').evaluateAll((b) => b.map((x) => x.getAttribute("data-testid")));
    expect(ids).toEqual(["shape-rectangle", "shape-ellipse", "shape-diamond", "shape-line", "shape-arrow", "shape-sticky"]);
  });

  test("고르고 캔버스를 누르면 스티커 220×220 이 놓이고 바로 입력된다", async ({ page }) => {
    await seed(page, []);
    await placeSticky(page);
    const [s] = await mine(page, "sticky");
    expect(s).toMatchObject({ kind: "sticky", w: 220, h: 220, color: "yellow", text: "" });
    expect((await st(page)).tool).toBe("select");
    await expect(T(page, "sticky-input")).toBeFocused();
    await page.keyboard.type("ship it");
    await expect(T(page, "sticky-input")).toHaveValue("ship it");
  });

  test("Esc 가 확정한다: 글이 노드 text 에 들어가고 입력란이 닫힌다", async ({ page }) => {
    await seed(page, []);
    await placeSticky(page);
    await page.keyboard.type("hello");
    await page.keyboard.press("Escape");
    await expect(T(page, "sticky-input")).toHaveCount(0);
    await expect(T(page, "sticky-text")).toHaveText("hello");
    expect((await mine(page, "sticky"))[0]!.text).toBe("hello");
  });

  test("바깥 클릭도 확정한다", async ({ page }) => {
    await seed(page, []);
    await placeSticky(page);
    await page.keyboard.type("outside");
    await blank(page);
    await expect(T(page, "sticky-input")).toHaveCount(0);
    expect((await mine(page, "sticky"))[0]!.text).toBe("outside");
  });
});

test.describe("S-841 글자 크기", () => {
  test("새 노트는 18, 글을 늘리면 줄어들고 11 아래로 안 간다", async ({ page }) => {
    await seed(page, []);
    await placeSticky(page);
    await page.keyboard.type("hi");
    expect(await fontPx(T(page, "sticky-input"))).toBe(18);
    await page.keyboard.insertText(" lorem ipsum dolor sit amet".repeat(12));
    const mid = await fontPx(T(page, "sticky-input"));
    expect(mid).toBeLessThan(18);
    expect(mid).toBeGreaterThanOrEqual(11);
    await page.keyboard.insertText(" lorem ipsum dolor sit amet".repeat(300));
    expect(await fontPx(T(page, "sticky-input"))).toBe(11);
    await page.keyboard.press("Escape");
    expect(await fontPx(T(page, "sticky-text"))).toBe(11); // 확정 뒤에도 같은 크기
  });
  test("11에서도 넘치면 노트 안에서 세로 스크롤", async ({ page }) => {
    await seed(page, [STK("s1", -110, -110, { text: "word ".repeat(1500) })]);
    const ov = await T(page, "sticky-text").evaluate((e) => getComputedStyle(e).overflowY);
    expect(["auto", "scroll"]).toContain(ov);
  });
});

test.describe("S-842 접힌 모서리 색 순환", () => {
  test("모서리를 누르면 다음 색, 되돌리기 1단계로 돌아온다", async ({ page }) => {
    await seed(page, [STK("s1", -110, -110)]);
    const colors: string[] = [];
    for (let i = 0; i < 2; i++) {
      await T(page, "sticky-fold").click();
      colors.push((await nodeOf(page, "s1")).color);
    }
    expect(colors[0]).not.toBe("yellow");
    expect(colors[1]).not.toBe(colors[0]);
    await page.keyboard.press("Control+z");
    expect((await nodeOf(page, "s1")).color).toBe(colors[0]);
  });
  test("6번 누르면 한 바퀴 돌아 처음 색", async ({ page }) => {
    await seed(page, [STK("s1", -110, -110)]);
    const seen = new Set<string>(["yellow"]);
    for (let i = 0; i < 5; i++) { await T(page, "sticky-fold").click(); seen.add((await nodeOf(page, "s1")).color); }
    expect(seen.size).toBe(6);
    await T(page, "sticky-fold").click();
    expect((await nodeOf(page, "s1")).color).toBe("yellow");
  });
  test("종이 색은 --paper-* 토큰", async ({ page }) => {
    await seed(page, [STK("s1", -110, -110)]);
    const bg = await T(page, "sticky-body").evaluate((e) => getComputedStyle(e).backgroundColor);
    const tok = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--paper-yellow").trim());
    expect(tok).not.toBe("");
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("S-843·S-847 더블클릭은 편집", () => {
  test("스티커 더블클릭 = 재편집, 프레임 맞추기(보드 이동·확대) 없음", async ({ page }) => {
    await seed(page, [STK("s1", -110, -110, { text: "again" })]);
    const w0 = await world(page);
    await page.mouse.dblclick(700, 400);
    await expect(T(page, "sticky-input")).toBeVisible();
    await expect(T(page, "sticky-input")).toHaveValue("again");
    expect(await world(page)).toBe(w0);
    await page.keyboard.type("!");
    await page.keyboard.press("Escape");
    expect((await nodeOf(page, "s1")).text).toBe("again!");
  });
  test("편집 중 Delete 는 노드가 아니라 글자를 지운다", async ({ page }) => {
    await seed(page, [STK("s1", -110, -110, { text: "" })]);
    await page.mouse.dblclick(700, 400);
    await page.keyboard.type("abc");
    await page.keyboard.press("Home");
    await page.keyboard.press("Delete");
    await expect(T(page, "sticky-input")).toHaveValue("bc");
    expect(await mine(page, "sticky")).toHaveLength(1);
  });
  test("글이 없는 스티커는 확정해도 남는다", async ({ page }) => {
    await seed(page, []);
    await placeSticky(page);
    await blank(page);
    expect(await mine(page, "sticky")).toHaveLength(1);
  });
  test("그 밖 종류(안 편집)는 더블클릭이 기존대로 프레임 맞추기", async ({ page }) => {
    await seed(page, [n("p", "tk-plain", 300, 100, 200, 120)]);
    const w0 = await world(page);
    await page.mouse.dblclick(1100, 560);
    await expect.poll(() => world(page)).not.toBe(w0);
  });
});

test.describe("S-844 Text 도구", () => {
  test("레일 Text → 캔버스 클릭 → 바로 입력, 글이 있으면 바깥 클릭 뒤에도 남는다", async ({ page }) => {
    await seed(page, []);
    await T(page, "rail-text").click();
    await page.mouse.click(700, 450);
    await expect(T(page, "text-input")).toBeFocused();
    expect((await st(page)).tool).toBe("select");
    await page.keyboard.type("Hello");
    await blank(page);
    await expect(T(page, "text-input")).toHaveCount(0);
    await expect(T(page, "text-text")).toHaveText("Hello");
    const [t] = await mine(page, "text");
    expect(t).toMatchObject({ kind: "text", text: "Hello" });
  });
  test("비운 채 바깥 클릭 → 상자가 사라지고, 되돌리기 기록도 안 남는다", async ({ page }) => {
    await seed(page, []);
    await placeSticky(page, 400, 300); // 되돌릴 수 있는 앞 단계 하나
    await blank(page);
    expect(await mine(page)).toHaveLength(1);
    await T(page, "rail-text").click();
    await page.mouse.click(900, 600);
    await expect(T(page, "text-input")).toBeFocused();
    expect(await mine(page)).toHaveLength(2);
    await page.mouse.click(1250, 150);
    await expect(T(page, "text-input")).toHaveCount(0);
    expect(await mine(page)).toHaveLength(1);
    await page.keyboard.press("Control+z"); // 사라진 텍스트가 한 단계를 먹었다면 스티커가 안 지워진다
    expect(await mine(page)).toHaveLength(0);
  });
  test("공백만 쓰고 떠나도 사라진다", async ({ page }) => {
    await seed(page, []);
    await T(page, "rail-text").click();
    await page.mouse.click(700, 450);
    await page.keyboard.type("   ");
    await blank(page);
    expect(await mine(page, "text")).toHaveLength(0);
  });
  test("더블클릭으로 다시 편집, 글을 모두 지우고 떠나면 사라진다", async ({ page }) => {
    await seed(page, [TXT("t1", -100, -100)]);
    const w0 = await world(page);
    await page.mouse.dblclick(720, 366);
    await expect(T(page, "text-input")).toHaveValue("label");
    expect(await world(page)).toBe(w0);
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
    await blank(page);
    expect(await mine(page, "text")).toHaveLength(0);
  });
});

test.describe("S-845·S-846 인스펙터", () => {
  test("텍스트를 고르면 인스펙터: 글꼴 8·크기 4·정렬 3, Lines 는 글자색만, Fill 없음", async ({ page }) => {
    await seed(page, [TXT("t1", -100, -100)]);
    await page.mouse.click(720, 366);
    await expect(T(page, "style-inspector")).toBeVisible();
    expect(await T(page, "insp-font").locator("option:not([disabled])").count()).toBe(8);
    for (const s of ["S", "M", "L", "XL"]) await expect(T(page, `insp-size-${s}`)).toHaveCount(1);
    for (const a of ["left", "center", "right"]) await expect(T(page, `insp-align-${a}`)).toHaveCount(1);
    await expect(T(page, "insp-lines")).toBeVisible();
    await expect(T(page, "insp-stroke-red")).toBeVisible();
    for (const g of ["insp-width-1", "insp-style-solid", "insp-rough-1"]) await expect(T(page, g)).toHaveCount(0);
    await expect(T(page, "insp-fill")).toHaveCount(0);
    await expect(T(page, "insp-order")).toBeVisible();
  });
  test("글자색·크기·정렬·글꼴을 바꾸면 보이는 글에 반영된다", async ({ page }) => {
    await seed(page, [TXT("t1", -100, -100)]);
    await page.mouse.click(720, 366);
    await T(page, "insp-stroke-red").click();
    await T(page, "insp-size-XL").click();
    await T(page, "insp-align-right").click();
    await T(page, "insp-font").selectOption("mono");
    expect(await nodeOf(page, "t1")).toMatchObject({ stroke: "red", size: "XL", align: "right", font: "mono" });
    expect(await fontPx(T(page, "text-text"))).toBe(52);
    const css = await T(page, "text-text").evaluate((e) => { const c = getComputedStyle(e); return [c.textAlign, c.fontFamily]; });
    expect(css[0]).toBe("right");
    expect(css[1]).toContain("Cascadia Mono");
  });
  test("스티커를 골라도 인스펙터는 안 열린다", async ({ page }) => {
    await seed(page, [STK("s1", -110, -110)]);
    await page.mouse.click(700, 400); // 선택
    expect((await st(page)).selection).toEqual(["s1"]);
    await expect(T(page, "style-inspector")).toHaveCount(0);
  });
});

test.describe("S-848 끌기·크기", () => {
  test("스티커 본문을 끌면 움직인다", async ({ page }) => {
    await seed(page, [STK("s1", -110, -110)]);
    await page.mouse.move(700, 450);
    await page.mouse.down();
    await page.mouse.move(800, 500, { steps: 8 });
    await page.mouse.up();
    const s = await nodeOf(page, "s1");
    expect(Math.round(s.x)).toBe(-10);
    expect(Math.round(s.y)).toBe(-60);
  });
  test("편집 중에는 끌어도 노드가 안 움직인다(글자 선택)", async ({ page }) => {
    await seed(page, [STK("s1", -110, -110, { text: "some words to select" })]);
    await page.mouse.dblclick(700, 400);
    await page.mouse.move(690, 360);
    await page.mouse.down();
    await page.mouse.move(800, 420, { steps: 8 });
    await page.mouse.up();
    const s = await nodeOf(page, "s1");
    expect([s.x, s.y]).toEqual([-110, -110]);
  });
  test("텍스트 상자는 좌우 핸들 두 개뿐: 너비만 바뀌고 높이는 글에 맞는다", async ({ page }) => {
    await seed(page, [TXT("t1", -100, -100)]);
    await page.mouse.click(720, 366);
    const hs = await page.locator('[data-node-id="t1"] [data-handle]').evaluateAll((h) => h.map((x) => x.getAttribute("data-handle")).sort());
    expect(hs).toEqual(["e", "w"]);
    const box = await page.locator('[data-node-id="t1"] [data-handle="e"]').boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + 160, box!.y + 4, { steps: 6 });
    await page.mouse.up();
    const t = await nodeOf(page, "t1");
    expect(t.w).toBeGreaterThan(300);
    expect(t.h).toBeLessThan(60);
  });
  test("긴 글을 쓰면 상자 높이가 글에 맞게 늘어난다", async ({ page }) => {
    await seed(page, [TXT("t1", -100, -100, { w: 120 })]);
    const h0 = (await nodeOf(page, "t1")).h;
    await page.mouse.dblclick(650, 366);
    await page.keyboard.insertText(" many many words that must wrap onto several lines".repeat(3));
    await expect.poll(async () => (await nodeOf(page, "t1")).h).toBeGreaterThan(h0 + 30);
  });
});
