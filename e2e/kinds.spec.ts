import { expect, test, type Page } from "@playwright/test";

// C1 노드 종류 바탕 (S-800~S-818). 가짜 PTY(Tauri 밖). 주소에 ?kindsTest 를 주면 src/board/kinds/testKinds.tsx 의 가짜 종류가 등록된다:
//   tk-card  = 머리줄(data-node-handle)만 끌림 · 8핸들 · 최소 200×120 · 기본 300×200 · 본문에 입력란(tk-input)·글자(tk-text)
//             고리/More/Insert to-do 에 "Test card"/"Test more"/"Test todo", 좌측 레일 도구 rail-tk-card(놓기 도구)
//   tk-plain = 본문 어디나 끌림 · 크기 고정 · 지우개 대상
//   tk-link  = 본문 끌림 · wire 색 cyan        tk-insp = tk-link + deleteWithTarget
// 구현이 맞출 약속(이름): 점선 상자 data-testid="unsupported-node", 선 층 data-testid="wires"(월드 안, 노드보다 앞선 DOM),
//   선 하나 data-testid="wire" data-from=<wireTo 를 가진 노드> data-to=<대상> data-wire-color="cyan", 크기 핸들 data-handle(콘솔과 같은 8개),
//   Insert to-do 버튼 data-testid="rail-insert-todo" → 팝오버 role="menu" data-testid="insert-todo-menu".
// 1400×900, 줌 1, 보드 이동 0 이면 월드 (x,y) = 화면 (700+x, 450+y). 상태 읽기 창구: window.__kt.st() · __kt.ui()
test.use({ actionTimeout: 5000 }); // 없는 요소를 기다리며 60초를 쓰지 않는다
type N = Record<string, unknown> & { id: string; kind: string; x: number; y: number; w: number; h: number };
const n = (id: string, kind: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): N => ({ id, kind, x, y, w, h, z: 1, ...extra });
const A = n("a", "tk-plain", -300, -60, 200, 120); // 화면 400..600 × 390..510
const CARD = n("a", "tk-card", -150, -100, 300, 200); // 화면 550..850 × 350..550, 머리줄 높이 28

const boardJson = (nodes: N[], viewport = { x: 0, y: 0, zoom: 1 }) => JSON.stringify({
  formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport, nodes, groups: [],
});
const seed = async (page: Page, nodes: N[], url = "/?kindsTest", json?: string) => {
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), json ?? boardJson(nodes));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(url);
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
};
type Snap = { tool: string; selection: string[]; nodes: (N & { wireTo?: string })[] };
const st = (page: Page) => page.evaluate(() => (window as any).__kt.st() as Snap);
const nodeOf = async (page: Page, id: string) => (await st(page)).nodes.find((x) => x.id === id);
const el = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const box = async (loc: ReturnType<Page["locator"]>) => (await loc.boundingBox())!;
const blank = (page: Page) => page.mouse.click(1300, 100); // 빈 캔버스: 선택 해제 + 보드가 키보드를 되찾음
async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}
const clickTool = async (page: Page) => { await expect(page.getByTestId("rail-tk-card")).toBeVisible(); await page.getByTestId("rail-tk-card").click(); };
const near = (a: number, b: number, tol = 1.5) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const savedNodes = (page: Page) => page.evaluate(async () => JSON.parse((await (window as any).__shell.saved("ws-fake")) ?? "{}").nodes as N[] | undefined);

test.describe("C1 레일·놓기 도구", () => {
  test("S-803 레일은 등록된 도구만 order 순으로 — ?kindsTest 에서만 rail-tk-card 가 Spawn 과 Fit 사이에 있다", async ({ page }) => {
    await seed(page, []);
    const ids = () => page.locator('[data-testid="rail"] button').evaluateAll((bs) => bs.map((b) => b.getAttribute("data-testid")));
    const withKinds = await ids();
    expect(withKinds.every((i) => i?.startsWith("rail-"))).toBe(true);
    const at = (i: string) => withKinds.indexOf(i);
    expect(at("rail-select")).toBe(0);
    expect(at("rail-spawn")).toBeGreaterThan(at("rail-select"));
    expect(at("rail-tk-card")).toBeGreaterThan(at("rail-spawn"));
    expect(at("rail-fit")).toBeGreaterThan(at("rail-tk-card"));
    await page.goto("/"); // 가짜 종류 없음 → 도구도 없음(눌러도 안 되는 UI를 그리지 않는다)
    await expect(page.getByTestId("rail-spawn")).toBeVisible();
    await expect(page.getByTestId("rail-tk-card")).toHaveCount(0);
    await expect(page.getByTestId("rail-fit")).toBeVisible();
  });

  test("FX4 S-803 레일 순서(영상 기준): Select, Spawn, Shapes, Diagrams, Text, Pen, Eraser, Web, Image, Fit", async ({ page }) => {
    await seed(page, [], "/");
    const ids = await page.locator('[data-testid="rail"] button').evaluateAll((bs) => bs.map((b) => b.getAttribute("data-testid")));
    expect(ids).toEqual(["rail-select", "rail-spawn", "rail-shapes", "rail-diagrams", "rail-text", "rail-pen", "rail-eraser", "rail-web", "rail-image", "rail-fit"]);
  });

  test("FX4 S-806 고리 순서: Spawn agent, Insert image, Insert web, Paste, Shapes, Spawn group, More", async ({ page }) => {
    await seed(page, [], "/");
    await page.mouse.click(700, 450, { button: "right" });
    const names = await page.getByTestId("ring-menu").getByRole("menuitem").allTextContents();
    expect(names).toEqual(["Spawn agent", "Insert image", "Insert web", "Paste", "Shapes", "Spawn group", "More"]);
  });

  test("FX4 S-806 고리 Shapes 하위 고리에서 도형을 고르면 누른 자리에 놓는다", async ({ page }) => {
    await seed(page, []);
    await page.mouse.click(600, 600, { button: "right" });
    const ring = page.getByTestId("ring-menu");
    await ring.getByRole("menuitem", { name: "Shapes", exact: true }).click();
    await expect(ring.getByRole("menuitem", { name: "Rectangle", exact: true })).toBeVisible();
    await ring.getByRole("menuitem", { name: "Rectangle", exact: true }).click();
    const s = await st(page);
    expect(s.nodes.map((x) => x.kind)).toEqual(["shape"]);
    near(s.nodes[0]!.x + s.nodes[0]!.w / 2, 600 - 700, 90);
    near(s.nodes[0]!.y + s.nodes[0]!.h / 2, 600 - 450, 60);
  });

  test("S-804 놓기 도구: 한 번 놓고 Select 로 돌아오고, 놓은 노드는 선택되며 Ctrl+Z 한 번에 사라진다", async ({ page }) => {
    await seed(page, []);
    await clickTool(page);
    await expect(page.getByTestId("rail-tk-card")).toHaveAttribute("data-active", "true");
    await page.mouse.click(600, 300);
    const s = await st(page);
    expect(s.nodes).toHaveLength(1);
    const placed = s.nodes[0]!;
    expect(placed.kind).toBe("tk-card");
    near(placed.x, 600 - 700);
    near(placed.y, 300 - 450);
    expect([placed.w, placed.h]).toEqual([300, 200]); // 기본 크기
    expect(s.selection).toEqual([placed.id]);
    await expect(el(page, placed.id)).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("rail-select")).toHaveAttribute("data-active", "true");
    await page.mouse.click(1250, 150); // Select 로 돌아왔으니 더 놓이지 않는다
    expect((await st(page)).nodes).toHaveLength(1);
    await page.keyboard.press("Control+z");
    expect((await st(page)).nodes).toHaveLength(0);
  });

  test("S-804 노드 위를 누르면 놓지 않는다", async ({ page }) => {
    await seed(page, [A]);
    await clickTool(page);
    await page.mouse.click(500, 450); // 노드 한가운데
    expect((await st(page)).nodes).toHaveLength(1);
  });

  test("S-806 빈 캔버스 우클릭 고리: 기존 항목 + registry 항목(Test card)이 오고, 누르면 누른 자리에 놓는다. More 에도 registry 항목", async ({ page }) => {
    await seed(page, []);
    await page.mouse.click(1300, 100, { button: "right" });
    const ring = page.getByTestId("ring-menu");
    for (const name of ["Spawn agent", "Spawn group", "Paste", "More", "Test card"]) await expect(ring.getByRole("menuitem", { name, exact: true })).toBeVisible();
    await ring.getByRole("menuitem", { name: "More", exact: true }).click();
    for (const name of ["Select all", "Fit to content", "Zoom to 100%", "Test more"]) await expect(ring.getByRole("menuitem", { name, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.click(600, 600, { button: "right" });
    await page.getByTestId("ring-menu").getByRole("menuitem", { name: "Test card", exact: true }).click();
    const s = await st(page);
    expect(s.nodes.map((x) => x.kind)).toEqual(["tk-card"]);
    near(s.nodes[0]!.x, 600 - 700);
    near(s.nodes[0]!.y, 600 - 450);
  });

  test("S-806 종류가 없으면 고리·More 에 그 항목이 없다", async ({ page }) => {
    await seed(page, [], "/");
    await page.mouse.click(1300, 100, { button: "right" });
    const ring = page.getByTestId("ring-menu");
    await expect(ring.getByRole("menuitem", { name: "Spawn agent", exact: true })).toBeVisible();
    await expect(ring.getByRole("menuitem", { name: "Test card", exact: true })).toHaveCount(0);
  });

  test("S-807 Insert to-do: 우측 레일 버튼 → 팝오버(Test todo) → 고르면 화면 가운데의 겹치지 않는 자리에 놓고 선택", async ({ page }) => {
    await seed(page, [n("mid", "tk-plain", -100, -60, 200, 120)]); // 화면 가운데를 차지한 노드
    const btn = page.getByTestId("rail-insert-todo");
    await expect(btn).toBeVisible();
    const presets = await box(page.getByTestId("rail-presets"));
    expect((await box(btn)).y).toBeGreaterThan(presets.y); // Presets 아래
    await btn.click();
    const menu = page.getByTestId("insert-todo-menu");
    await expect(menu).toHaveAttribute("role", "menu");
    await menu.getByRole("menuitem", { name: "Test todo", exact: true }).click();
    const s = await st(page);
    expect(s.nodes).toHaveLength(2);
    const made = s.nodes.find((x) => x.kind === "tk-card")!;
    const mid = s.nodes.find((x) => x.id === "mid")!;
    expect(made.x < mid.x + mid.w && mid.x < made.x + made.w && made.y < mid.y + mid.h && mid.y < made.y + made.h).toBe(false);
    expect(s.selection).toEqual([made.id]);
    await expect(menu).toHaveCount(0);
  });
});

test.describe("C1 크기 조절·끌기 영역", () => {
  test("S-808 크기 조절 종류는 선택하면 8핸들, 최소 크기에서 멈추고, 한 번에 되돌려진다. 고정 종류는 핸들이 없다", async ({ page }) => {
    await seed(page, [CARD, n("p", "tk-plain", 300, -100, 200, 120)]);
    await expect(el(page, "a").locator("[data-handle]")).toHaveCount(0); // 선택 전엔 없다
    await page.mouse.click(700, 364); // 머리줄
    await expect(el(page, "a").locator("[data-handle]")).toHaveCount(8);
    const se = await box(el(page, "a").locator('[data-handle="se"]'));
    await drag(page, se.x + se.width / 2, se.y + se.height / 2, 100, 60);
    let a = (await nodeOf(page, "a"))!;
    expect([a.w, a.h]).toEqual([400, 260]);
    const se2 = await box(el(page, "a").locator('[data-handle="se"]'));
    await drag(page, se2.x + se2.width / 2, se2.y + se2.height / 2, -700, -500);
    a = (await nodeOf(page, "a"))!;
    expect([a.w, a.h]).toEqual([200, 120]); // 종류별 최소 크기
    await page.keyboard.press("Control+z");
    a = (await nodeOf(page, "a"))!;
    expect([a.w, a.h]).toEqual([400, 260]); // 크기 조절 1번 = 1단계
    await page.mouse.click(1100, 410); // 고정 크기 종류 선택
    await expect(el(page, "p")).toHaveAttribute("data-selected", "true");
    await expect(el(page, "p").locator("[data-handle]")).toHaveCount(0);
  });

  test("S-809 머리줄만 끌리는 종류: 본문을 끌면 안 움직이고 머리줄을 끌면 움직인다. 본문 입력란은 글자를 받고 보드 키가 아니다", async ({ page }) => {
    await seed(page, [CARD]);
    await drag(page, 820, 520, 80, 40); // 본문
    let a = (await nodeOf(page, "a"))!;
    expect([a.x, a.y]).toEqual([-150, -100]);
    await drag(page, 700, 364, 80, 40); // 머리줄 [data-node-handle]
    a = (await nodeOf(page, "a"))!;
    near(a.x, -70);
    near(a.y, -60);
    await page.getByTestId("tk-input").click();
    await page.keyboard.type("tpe");
    await expect(page.getByTestId("tk-input")).toHaveValue("tpe");
    expect((await st(page)).tool).toBe("select");
  });

  test("S-809 본문 끌기 종류는 어디를 눌러도 끌리고, 선택 상자·복제·삭제는 모든 종류에 같다", async ({ page }) => {
    await seed(page, [n("p", "tk-plain", 300, -100, 200, 120), CARD]);
    await drag(page, 1100, 410, -60, 70); // tk-plain 가운데
    const p = (await nodeOf(page, "p"))!;
    near(p.x, 240);
    near(p.y, -30);
    await expect(el(page, "p")).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("Control+d");
    expect((await st(page)).nodes).toHaveLength(3);
    await page.keyboard.press("Delete"); // 복제본(선택됨)을 묻지 않고 지운다(S-814)
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    expect((await st(page)).nodes).toHaveLength(2);
    await page.keyboard.press("Control+z");
    expect((await st(page)).nodes).toHaveLength(3);
  });

  test("S-814 Delete: 콘솔이 아닌 노드는 묻지 않고 지우고 Ctrl+Z 로 돌아온다", async ({ page }) => {
    await seed(page, [CARD]);
    await page.mouse.click(700, 364);
    await page.keyboard.press("Delete");
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    expect((await st(page)).nodes).toHaveLength(0);
    await page.keyboard.press("Control+z");
    expect((await st(page)).nodes.map((x) => x.id)).toEqual(["a"]);
  });
});

test.describe("C1 Unsupported·저장 왕복", () => {
  const FUT = n("u", "future-thing", -100, -60, 200, 120, { payload: { a: [1, 2, { b: "c" }] }, label: "keep me" });

  test("S-801 모르는 종류는 점선 상자 'Unsupported node: <kind>' 로 그리고 이동·복제·삭제가 된다", async ({ page }) => {
    await seed(page, [FUT]);
    const u = page.getByTestId("unsupported-node");
    await expect(u).toHaveText("Unsupported node: future-thing");
    expect(await u.evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe("dashed");
    await drag(page, 700, 450, 50, 30);
    const moved = (await nodeOf(page, "u"))!;
    near(moved.x, -50);
    near(moved.y, -30);
    await page.keyboard.press("Control+d");
    expect((await st(page)).nodes).toHaveLength(2);
    await page.keyboard.press("Delete"); // 복제본(선택됨)
    expect((await st(page)).nodes.map((x) => x.id)).toEqual(["u"]);
  });

  test("S-801·S-815 모르는 종류 노드는 옮겨도 저장에서 필드가 그대로 남는다", async ({ page }) => {
    await seed(page, [FUT]);
    await drag(page, 700, 450, 50, 30);
    await expect.poll(async () => (await savedNodes(page))?.find((x) => x.id === "u")?.x, { timeout: 10_000 }).toBeGreaterThan(-100);
    const saved = (await savedNodes(page))!.find((x) => x.id === "u")!;
    expect(saved).toMatchObject({ kind: "future-thing", payload: { a: [1, 2, { b: "c" }] }, label: "keep me", w: 200, h: 120 });
  });

  test("S-815 놓기·크기 조절이 자동 저장되고 그 파일을 다시 열면 같은 노드가 같은 모양으로 돌아온다", async ({ page, context }) => {
    await seed(page, []);
    await clickTool(page);
    await page.mouse.click(600, 300);
    const se = await box(page.locator('[data-node-id] [data-handle="se"]'));
    await drag(page, se.x + se.width / 2, se.y + se.height / 2, 60, 40);
    const before = (await st(page)).nodes[0]!;
    expect([before.w, before.h]).toEqual([360, 240]);
    await expect.poll(async () => (await savedNodes(page))?.length, { timeout: 10_000 }).toBe(1);
    await expect.poll(async () => (await savedNodes(page))?.[0]?.w, { timeout: 10_000 }).toBe(360);
    const json = await page.evaluate(async () => (await (window as any).__shell.saved("ws-fake")) as string);
    const page2 = await context.newPage();
    await seed(page2, [], "/?kindsTest", json);
    const after = (await st(page2)).nodes;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: before.id, kind: "tk-card", x: before.x, y: before.y, w: 360, h: 240 });
    await expect(page2.getByTestId("tk-card")).toBeVisible();
    await page2.close();
  });
});

test.describe("C1 선(wire)·연쇄 삭제", () => {
  const LINK = n("l", "tk-link", 100, -60, 160, 100, { wireTo: "a" }); // 화면 800..960 × 390..490
  const wires = (page: Page) => page.getByTestId("wire");

  test("S-811 wireTo 가 있으면 두 노드 사이에 cyan 선, 노드 아래 층, 팬·줌과 같이 움직인다", async ({ page }) => {
    await seed(page, [A, LINK]);
    await expect(wires(page)).toHaveCount(1);
    await expect(wires(page)).toHaveAttribute("data-from", "l");
    await expect(wires(page)).toHaveAttribute("data-to", "a");
    await expect(wires(page)).toHaveAttribute("data-wire-color", "cyan");
    expect(await page.evaluate(() => {
      const layer = document.querySelector('[data-testid="wires"]')!, world = document.querySelector('[data-testid="world"]')!, firstNode = document.querySelector("[data-node-id]")!;
      return world.contains(layer) && !!(layer.compareDocumentPosition(firstNode) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    const a0 = await box(el(page, "a")), l0 = await box(el(page, "l")), w0 = await box(wires(page));
    expect(w0.x).toBeLessThanOrEqual(a0.x + a0.width + 1); // 두 노드 사이의 틈을 잇는다
    expect(w0.x + w0.width).toBeGreaterThanOrEqual(l0.x - 1);
    expect(w0.x).toBeGreaterThanOrEqual(a0.x - 1);
    expect(w0.x + w0.width).toBeLessThanOrEqual(l0.x + l0.width + 1);
    await page.mouse.move(700, 700);
    await page.mouse.wheel(0, 120); // 팬
    await expect.poll(async () => (await box(el(page, "a"))).y).not.toBe(a0.y);
    const a1 = await box(el(page, "a")), w1 = await box(wires(page));
    near(w1.y - w0.y, a1.y - a0.y);
    await page.getByTestId("zoom-in").click(); // 줌
    const a2 = await box(el(page, "a")), w2 = await box(wires(page));
    const ratio = a2.width / a1.width;
    expect(ratio).toBeGreaterThan(1.01);
    expect(Math.abs(w2.width / w1.width - ratio)).toBeLessThan(0.03);
  });

  test("S-811 대상을 지우면 선만 사라진다(노드와 wireTo 필드 정리)", async ({ page }) => {
    await seed(page, [A, LINK]);
    await page.mouse.click(500, 450);
    await page.keyboard.press("Delete");
    await expect(wires(page)).toHaveCount(0);
    const l = (await nodeOf(page, "l"))!;
    expect(l).toBeDefined();
    expect(l.wireTo).toBeUndefined();
    await page.keyboard.press("Control+z");
    await expect(wires(page)).toHaveCount(1);
  });

  test("S-812 deleteWithTarget 종류는 대상과 같이 지워지고 Ctrl+Z 한 번에 둘 다 돌아온다", async ({ page }) => {
    await seed(page, [A, n("i", "tk-insp", 100, -60, 160, 100, { wireTo: "a" })]);
    await page.mouse.click(500, 450);
    await page.keyboard.press("Delete");
    expect((await st(page)).nodes).toHaveLength(0);
    await expect(wires(page)).toHaveCount(0);
    await page.keyboard.press("Control+z");
    expect((await st(page)).nodes.map((x) => x.id).sort()).toEqual(["a", "i"]);
    await expect(wires(page)).toHaveCount(1);
  });

  test("S-813 대상과 같이 복제하면 복제본끼리 선이 이어지고, 연결 대상을 복제 안 하면 선이 끊긴다", async ({ page }) => {
    await seed(page, [A, LINK]);
    await page.mouse.click(500, 450);
    await page.keyboard.down("Shift");
    await page.mouse.click(880, 440);
    await page.keyboard.up("Shift");
    await page.keyboard.press("Control+d");
    await expect(wires(page)).toHaveCount(2);
    const s = await st(page);
    const copies = s.nodes.filter((x) => x.id !== "a" && x.id !== "l");
    expect(copies).toHaveLength(2);
    const link = copies.find((x) => x.wireTo)!;
    expect(link.wireTo).toBe(copies.find((x) => !x.wireTo)!.id);
    await blank(page);
    await page.mouse.click(880, 440); // 원본 l 만
    await page.keyboard.press("Control+d");
    await expect(wires(page)).toHaveCount(2); // 새 복제본은 선 없음
  });
});

test.describe("C1 키 P·E·G", () => {
  test("S-805 P = Pen, E = Eraser, V = Select, G = Git 패널 열기/닫기", async ({ page }) => {
    await seed(page, []);
    await blank(page);
    await page.keyboard.press("p");
    expect((await st(page)).tool).toBe("pen");
    await page.keyboard.press("e");
    expect((await st(page)).tool).toBe("eraser");
    await page.keyboard.press("v");
    expect((await st(page)).tool).toBe("select");
    expect(await page.evaluate(() => (window as any).__kt.ui().gitOpen)).toBe(false);
    await page.keyboard.press("g");
    expect(await page.evaluate(() => (window as any).__kt.ui().gitOpen)).toBe(true);
    await page.keyboard.press("g");
    expect(await page.evaluate(() => (window as any).__kt.ui().gitOpen)).toBe(false);
  });

  test("S-805·S-047 실행 중 콘솔 하나만 선택돼 있으면 P·E·G 글자는 콘솔로 간다", async ({ page }) => {
    await seed(page, []);
    await page.getByRole("button", { name: "Spawn an agent" }).click();
    await expect(page.getByTestId("console")).toHaveCount(1);
    const [id] = await page.evaluate(() => (window as any).__fakePty.ids() as number[]);
    await page.locator("[data-node-handle]").first().click({ position: { x: 300, y: 16 } });
    const writes = () => page.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id!);
    for (const k of ["p", "e", "g"]) {
      await page.keyboard.press(k);
      await expect.poll(writes).toContain(k);
    }
    expect((await st(page)).tool).toBe("select");
    expect(await page.evaluate(() => (window as any).__kt.ui().gitOpen)).toBe(false);
  });
});

test("S-817 노드 안 글자는 월드 크기: 줌과 같은 비율로 커진다", async ({ page }) => {
  await seed(page, [CARD]);
  await expect(page.getByTestId("tk-text")).toBeVisible();
  const t0 = await box(page.getByTestId("tk-text")), c0 = await box(el(page, "a"));
  await page.getByTestId("zoom-in").click();
  const t1 = await box(page.getByTestId("tk-text")), c1 = await box(el(page, "a"));
  const ratio = c1.width / c0.width;
  expect(ratio).toBeGreaterThan(1.01);
  expect(Math.abs(t1.height / t0.height - ratio)).toBeLessThan(0.03);
});
