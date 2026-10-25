import { expect, test, type Page } from "@playwright/test";

// C6 펜·지우개·잉크 노드 (S-860~S-869). 가짜 PTY(Tauri 밖), 주소 ?kindsTest 로 시험용 가짜 종류(tk-plain=지우개 대상, tk-insp=붙은 인스펙터)를 쓴다.
// 1400×900, 줌 1, 이동 0 이면 월드 (x,y) = 화면 (700+x, 450+y). 상태 읽기: window.__kt.st()
test.use({ actionTimeout: 5000 });
type N = Record<string, unknown> & { id: string; kind: string; x: number; y: number; w: number; h: number };
const n = (id: string, kind: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): N => ({ id, kind, x, y, w, h, z: 1, ...extra });
const CON = n("con", "console", -300, -150, 400, 300, { name: "claude-1", agentId: "claude", textSize: null, yolo: false }); // 화면 400..800 × 300..600
const boardJson = (nodes: N[]) => JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 1 }, nodes, groups: [] });
const seed = async (page: Page, nodes: N[], json?: string) => {
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), json ?? boardJson(nodes));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
};
type Snap = { tool: string; selection: string[]; nodes: (N & { points?: [number, number][]; color?: string; width?: number })[] };
const st = (page: Page) => page.evaluate(() => (window as any).__kt.st() as Snap);
const inks = async (page: Page) => (await st(page)).nodes.filter((x) => x.kind === "ink");
const ids = async (page: Page) => (await st(page)).nodes.map((x) => x.id).sort();
const blank = (page: Page) => page.mouse.click(1300, 100);
const zoomOf = (page: Page) => page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('[data-testid="world"]')!).transform).a);
const savedJson = (page: Page) => page.evaluate(async () => (await (window as any).__shell.saved("ws-fake")) as string);
async function drag(page: Page, from: [number, number], to: [number, number], steps = 12) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps });
  await page.mouse.up();
}
const pen = async (page: Page) => { await blank(page); await page.keyboard.press("p"); await expect(page.getByTestId("rail-pen")).toHaveAttribute("data-active", "true"); };
const eraser = async (page: Page) => { await blank(page); await page.keyboard.press("e"); await expect(page.getByTestId("rail-eraser")).toHaveAttribute("data-active", "true"); };

test.describe("펜", () => {
  test("S-860 P 를 누르면 펜이 켜지고 팔레트에 색 8·굵기 5 가 있다, 기본은 빨강·가운데 굵기", async ({ page }) => {
    await seed(page, []);
    await expect(page.getByTestId("ink-color-0")).toHaveCount(0); // 펜이 아니면 팔레트 없음
    await pen(page);
    await expect(page.locator('[data-testid^="ink-color-"]')).toHaveCount(8);
    await expect(page.locator('[data-testid^="ink-width-"]')).toHaveCount(5);
    await expect(page.getByTestId("ink-color-0")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("ink-width-2")).toHaveAttribute("data-active", "true");
    await page.keyboard.press("v");
    await expect(page.getByTestId("ink-color-0")).toHaveCount(0);
  });

  test("S-860 레일의 Pen 버튼으로도 켜진다", async ({ page }) => {
    await seed(page, []);
    await page.getByTestId("rail-pen").click();
    await expect(page.getByTestId("ink-color-3")).toBeVisible();
  });

  test("S-861 드래그 = ink 노드 하나, 펜은 Select 로 돌아가지 않는다, 점은 상자 안 상대 좌표", async ({ page }) => {
    await seed(page, []);
    await pen(page);
    await drag(page, [800, 300], [900, 360]);
    const list = await inks(page);
    expect(list).toHaveLength(1);
    const s = list[0]!;
    expect(s).toMatchObject({ kind: "ink", color: "red", width: 6 });
    expect(s.points!.length).toBeGreaterThan(2);
    expect(s.x).toBeCloseTo(100 - 3, 0); expect(s.y).toBeCloseTo(-150 - 3, 0);
    expect(s.w).toBeCloseTo(100 + 6, 0); expect(s.h).toBeCloseTo(60 + 6, 0);
    for (const [px, py] of s.points!) { expect(px).toBeGreaterThanOrEqual(0); expect(px).toBeLessThanOrEqual(s.w); expect(py).toBeGreaterThanOrEqual(0); expect(py).toBeLessThanOrEqual(s.h); }
    expect((await st(page)).tool).toBe("pen");
    await drag(page, [800, 500], [900, 520]);
    expect(await inks(page)).toHaveLength(2);
  });

  test("S-861 콘솔 위에서 그려도 콘솔은 선택·이동되지 않는다", async ({ page }) => {
    await seed(page, [CON]);
    await pen(page);
    await drag(page, [450, 350], [650, 450]);
    const s = await st(page);
    expect(s.nodes.find((x) => x.id === "con")).toMatchObject({ x: -300, y: -150 });
    expect(s.selection).not.toContain("con");
    expect(await inks(page)).toHaveLength(1);
  });

  test("S-862 한 획 = 되돌리기 1단계, 점 하나도 획, Esc 는 그리던 획 버리기", async ({ page }) => {
    await seed(page, []);
    await pen(page);
    await drag(page, [800, 300], [900, 360]);
    await page.mouse.click(1000, 400); // 움직임 없는 클릭 = 점 획
    expect(await inks(page)).toHaveLength(2);
    const dot = (await inks(page)).at(-1)!;
    expect(dot.points!.length).toBe(1);
    expect(dot.w).toBeCloseTo(6, 0); expect(dot.h).toBeCloseTo(6, 0);
    await page.keyboard.press("Control+z");
    expect(await inks(page)).toHaveLength(1);
    await page.keyboard.press("Control+z");
    expect(await inks(page)).toHaveLength(0);
    // 마우스를 누른 채 Esc → 획 없음, 펜은 그대로
    await page.mouse.move(800, 300); await page.mouse.down(); await page.mouse.move(900, 360, { steps: 8 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await inks(page)).toHaveLength(0);
    expect((await st(page)).tool).toBe("pen");
  });

  test("S-863 점 수 상한 10,000 이내, 저장된 점 사이 간격은 2px 이상", async ({ page }) => {
    await seed(page, []);
    await pen(page);
    await page.mouse.move(720, 100); await page.mouse.down();
    await page.mouse.move(1380, 800, { steps: 400 });
    await page.mouse.up();
    const s = (await inks(page))[0]!;
    expect(s.points!.length).toBeGreaterThan(50);
    expect(s.points!.length).toBeLessThanOrEqual(10000);
    for (let i = 1; i < s.points!.length; i++) expect(Math.hypot(s.points![i]![0] - s.points![i - 1]![0], s.points![i]![1] - s.points![i - 1]![1])).toBeGreaterThanOrEqual(1.9);
  });

  test("S-865 색·굵기를 바꾸면 다음 획에 적용된다", async ({ page }) => {
    await seed(page, []);
    await pen(page);
    await page.getByTestId("ink-color-4").click();
    await page.getByTestId("ink-width-4").click();
    await expect(page.getByTestId("ink-color-4")).toHaveAttribute("data-active", "true");
    await drag(page, [800, 300], [900, 360]);
    expect((await inks(page))[0]).toMatchObject({ color: "blue", width: 14 });
    await page.getByTestId("ink-color-1").click();
    await page.getByTestId("ink-width-0").click();
    await drag(page, [800, 500], [900, 560]);
    expect((await inks(page))[1]).toMatchObject({ color: "orange", width: 2 });
    expect((await inks(page))[0]).toMatchObject({ color: "blue", width: 14 }); // 이미 그린 획은 그대로
  });

  test("S-865 색 8개 이름은 red,orange,yellow,green,blue,violet,white,black, 값은 --ink-* 변수", async ({ page }) => {
    await seed(page, []);
    await pen(page);
    const names = ["red", "orange", "yellow", "green", "blue", "violet", "white", "black"];
    for (let i = 0; i < 8; i++) {
      await page.getByTestId(`ink-color-${i}`).click();
      await drag(page, [800, 100 + i * 20], [860, 110 + i * 20]);
    }
    expect((await inks(page)).map((x) => x.color)).toEqual(names);
    expect(await page.locator("[data-node-id] path").first().getAttribute("stroke")).toBe("var(--ink-red)");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ink-red").trim())).not.toBe("");
  });

  test("S-864 ink 노드: 획 가까이 클릭하면 선택·끌면 이동, 크기 핸들 없음, 상자 밖 빈 곳은 선택 안 됨", async ({ page }) => {
    await seed(page, []);
    await pen(page);
    await drag(page, [800, 300], [900, 300]); // 가로선 월드 y=-150
    await page.keyboard.press("v");
    await page.mouse.click(850, 320); // 획에서 20px 아래: 빈 캔버스
    expect((await st(page)).selection).toHaveLength(0);
    await page.mouse.click(850, 300);
    const id = (await inks(page))[0]!.id;
    expect((await st(page)).selection).toEqual([id]);
    await expect(page.locator("[data-handle]")).toHaveCount(0);
    await drag(page, [850, 300], [850, 400]);
    expect((await inks(page))[0]!.y).toBeCloseTo(-153 + 100, 0);
    await blank(page);
    await page.keyboard.down("Shift");
    await drag(page, [700, 100], [1000, 700]); // 선택 상자(Shift+드래그)
    await page.keyboard.up("Shift");
    expect((await st(page)).selection).toEqual([id]);
    await page.keyboard.press("Control+d");
    expect(await inks(page)).toHaveLength(2);
    await page.keyboard.press("Delete");
    expect(await inks(page)).toHaveLength(1);
  });

  test("S-868 펜 중에는 휠 팬·줌이 되고 우클릭 메뉴는 없다", async ({ page }) => {
    await seed(page, [CON]);
    await pen(page);
    await page.mouse.move(500, 350);
    await page.mouse.wheel(0, 100);
    const t = () => page.evaluate(() => { const m = new DOMMatrix(getComputedStyle(document.querySelector('[data-testid="world"]')!).transform); return { x: m.e, y: m.f, zoom: m.a }; });
    expect(await t()).toMatchObject({ y: -100, zoom: 1 });
    await page.keyboard.down("Control"); await page.mouse.wheel(0, -200); await page.keyboard.up("Control");
    expect(await zoomOf(page)).toBeGreaterThan(1);
    await page.mouse.click(1000, 600, { button: "right" });
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
    expect((await st(page)).tool).toBe("pen");
  });

  test("S-863 줌 2 에서는 화면 100px = 월드 50 으로 저장된다", async ({ page }) => {
    await seed(page, []);
    await page.mouse.move(700, 450);
    await page.keyboard.down("Control"); await page.mouse.wheel(0, -277); await page.keyboard.up("Control"); // exp(0.6925) = 2
    const z = await zoomOf(page);
    expect(z).toBeGreaterThan(1.5);
    await pen(page);
    await drag(page, [600, 400], [700, 400]);
    const s = (await inks(page))[0]!;
    expect(s.w).toBeCloseTo(100 / z + 6, 0);
  });
});

test.describe("지우개", () => {
  const P = (id: string, y: number) => n(id, "ink", -100, y, 204, 14, { points: [[7, 7], [197, 7]], color: "red", width: 14 }); // 가로선 월드 y+7
  test("S-866 E 로 켜고 드래그하면 지나는 ink 를 여러 개 지운다, 그 아래 콘솔은 남는다", async ({ page }) => {
    await seed(page, [CON, P("a", -100), P("b", 0), P("c", 300)]);
    await eraser(page);
    await drag(page, [700, 450 - 100 + 7], [700, 450 + 7 + 10]); // a, b 를 지난다
    expect(await ids(page)).toEqual(["c", "con"]);
  });

  test("S-866 ink 가 아닌 노드는 묻지 않고 가장 위 1개만 지우고, 인스펙터 짝도 같이 지우며, 되돌리기 1번에 다 돌아온다", async ({ page }) => {
    const A = n("a", "tk-plain", -300, -60, 200, 120);
    const B = n("b", "tk-plain", -250, -40, 200, 120, { z: 2 });
    const I = n("i", "tk-insp", 100, -60, 160, 100, { wireTo: "b" });
    await seed(page, [A, B, I]);
    await eraser(page);
    await page.mouse.click(500, 450); // 월드 (-200,0): A 와 B 가 겹친 자리 → 가장 위 B 만
    expect(await ids(page)).toEqual(["a"]); // b 가 지워지며 인스펙터 i 도 같이
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await page.keyboard.press("Control+z");
    expect(await ids(page)).toEqual(["a", "b", "i"]);
  });

  test("FX4 S-866 도형·체크리스트·캘린더도 지우개로 지워진다(가장 위 1개), 콘솔은 그대로", async ({ page }) => {
    await seed(page, [CON, n("s", "shape", 300, -300, 160, 100, { shape: "rectangle" }), n("c", "checklist", 300, -150, 300, 260), n("k", "calendar", -700, 100, 520, 440)]);
    await eraser(page);
    await page.mouse.click(700 + 380, 450 - 250);
    await page.mouse.click(700 + 450, 450 - 20);
    await page.mouse.click(700 - 440, 450 + 300);
    await drag(page, [420, 320], [780, 580]);
    expect(await ids(page)).toEqual(["con"]);
  });

  test("S-866 콘솔은 위에서 끌어도 안 지워진다", async ({ page }) => {
    await seed(page, [CON]);
    await eraser(page);
    await drag(page, [420, 320], [780, 580]);
    expect(await ids(page)).toEqual(["con"]);
  });

  test("S-867 지우개 드래그 1번 = 되돌리기 1단계, 지운 게 없으면 기록 안 남김", async ({ page }) => {
    await seed(page, [P("a", -100), P("b", 0), P("c", 100)]);
    await eraser(page);
    await drag(page, [1200, 800], [1300, 850]); // 아무것도 안 지남
    await drag(page, [700, 357], [700, 557], 30); // 셋 다 지움
    expect(await ids(page)).toEqual([]);
    await page.keyboard.press("Control+z");
    expect(await ids(page)).toEqual(["a", "b", "c"]);
    await page.keyboard.press("Control+z"); // 지운 게 없던 드래그는 기록이 없으니 되돌릴 게 더 없다
    expect(await ids(page)).toEqual(["a", "b", "c"]);
  });

  test("S-868 지우개 중에도 고리 메뉴가 없고 휠 줌은 된다", async ({ page }) => {
    await seed(page, [n("a", "tk-plain", -300, -60, 200, 120)]);
    await eraser(page);
    await page.mouse.click(1000, 700, { button: "right" });
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
    await page.mouse.move(1000, 700);
    await page.keyboard.down("Control"); await page.mouse.wheel(0, -200); await page.keyboard.up("Control");
    expect(await zoomOf(page)).toBeGreaterThan(1);
  });
});

test.describe("저장", () => {
  test("S-869 저장하고 다시 열어도 획이 같은 모양으로 돌아온다", async ({ page, context }) => {
    await seed(page, []);
    await pen(page);
    await page.getByTestId("ink-color-5").click();
    await drag(page, [800, 300], [900, 360]);
    const before = (await inks(page))[0]!;
    await expect.poll(async () => JSON.parse(await savedJson(page)).nodes.length, { timeout: 10_000 }).toBe(1);
    const json = await savedJson(page);
    const page2 = await context.newPage();
    await seed(page2, [], json);
    const after = (await inks(page2))[0]!;
    expect(after).toMatchObject({ id: before.id, kind: "ink", x: before.x, y: before.y, w: before.w, h: before.h, color: "violet", width: 6 });
    expect(after.points).toEqual(before.points);
    await expect(page2.locator("[data-node-id] path").first()).toBeVisible();
    await page2.close();
  });

  test("S-869 점 20,000개(획 2개)짜리 보드: 열어서 한 획 더 그려도 점이 그대로이고 저장이 끝난다", async ({ page }) => {
    const pts = (k: number) => Array.from({ length: 10000 }, (_, i) => [Math.round((i % 500) * 0.4 * 10) / 10 + k, Math.floor(i / 500) * 5] as [number, number]);
    const big = (id: string, y: number, k: number) => n(id, "ink", -100, y, 206, 106, { points: pts(k), color: "green", width: 4 });
    await seed(page, [big("a", -300, 0), big("b", 100, 1)]);
    expect((await inks(page)).reduce((s, x) => s + x.points!.length, 0)).toBe(20000);
    await pen(page);
    const t0 = Date.now();
    await drag(page, [1200, 800], [1300, 850]); // 변경 1번 → 자동 저장
    await expect.poll(async () => JSON.parse(await savedJson(page)).nodes.length, { timeout: 12_000 }).toBe(3);
    expect(Date.now() - t0).toBeLessThan(12_000); // 자동 저장 조용 시간 2초 포함
    const saved = JSON.parse(await savedJson(page));
    expect(saved.nodes.filter((x: any) => x.kind === "ink" && x.points.length === 10000)).toHaveLength(2);
  });
});
