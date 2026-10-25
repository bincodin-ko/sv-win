import { expect, test, type Page } from "@playwright/test";

// D1 연결선(wired)·연결 모드·패널 열기 바탕 (S-1220~S-1237). 가짜 PTY(Tauri 밖), ?kindsTest 의 가짜 종류:
//   tk-orch = wired[] 카드(orchestrator 대역): wireColor orange, 우측 레일 rail:{label:"Test orch"}, 본문에 Connect(tw-connect)·Done(tw-done) 버튼
//   tk-mem  = wired[] 카드(memory 대역): wireColor violet, 지우개 대상     tk-link = wireTo 직선(cyan)     tk-plain = 아무 상자
// 구현이 맞출 약속(이름): 선 data-testid="wire" 는 곡선이라 <path d="M… C…">(wireTo 직선은 그대로 <line>), data-from=<카드 id> data-to=<콘솔 id | "g:<그룹 id>">, data-wire-color="orange|violet|cyan",
//   연결된 대상 콘솔 노드 상자([data-node-id]) 에 data-wired="true" + CSS outline 이 --accent(주황),
//   우측 레일 버튼 data-testid="rail-insert-<종류 id>" 글자 "Insert <label>",
//   패널 열림은 window.__kt.ui() = { connect, mission, memory, loops, usage }, 겹침 상태 만들기 __kt.setUi(patch), 되돌리기는 키보드 Ctrl+Z.
// 줌 0.5, 뷰포트 1400×900, 보드 이동 0 이면 월드 (x,y) = 화면 (700 + x/2, 450 + y/2). 콘솔 720×440 = 화면 360×220.
test.use({ actionTimeout: 5000 });
type N = Record<string, unknown> & { id: string };
const con = (id: string, x: number, y: number, g?: string): N => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name: `Con ${id}`, agentId: "shell", textSize: null, yolo: false, ...(g ? { groupId: g } : {}) });
const node = (id: string, kind: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): N => ({ id, kind, x, y, w, h, z: 2, ...extra });
const C1 = con("c1", -760, -400), C2 = con("c2", 40, -400); // 화면 x 320..680 / 720..1080, y 250..470
const C3 = con("c3", -760, 300, "g1"), C4 = con("c4", 40, 300, "g1"); // 그룹 g1 할로 화면 y 584.. (라벨 y ~586)
const ORCH = node("o1", "tk-orch", -120, 60, 240, 120, { wired: [] }); // 화면 640..760 × 480..540 (콘솔 사이)
const GROUPS = [{ id: "g1", name: "Group 1", role: "general" }];

const seed = async (page: Page, nodes: N[], zoom = 0.5, url = "/?kindsTest") => {
  const board = JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom }, nodes, groups: GROUPS });
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), board);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(url);
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  const cons = nodes.filter((n) => n.kind === "console").length;
  await expect(page.getByTestId("console")).toHaveCount(cons);
  if (cons) await expect.poll(() => page.evaluate(() => (window as any).__fakePty.ids().length as number)).toBe(cons);
};
type Snap = { selection: string[]; nodes: (N & { wired?: string[]; x: number; y: number })[] };
const st = (page: Page) => page.evaluate(() => (window as any).__kt.st() as Snap);
const wiredOf = async (page: Page, id = "o1") => ((await st(page)).nodes.find((n) => n.id === id)?.wired ?? []) as string[];
const ui = (page: Page) => page.evaluate(() => (window as any).__kt.ui() as { connect: { wsId: string; cardId: string } | null; mission: boolean; memory: boolean; loops: boolean; usage: { open: boolean } });
const setUi = (page: Page, p: Record<string, unknown>) => page.evaluate((x) => (window as any).__kt.setUi(x), p);
const wires = (page: Page) => page.getByTestId("wire");
const wire = (page: Page, from: string, to: string) => page.locator(`[data-testid="wire"][data-from="${from}"][data-to="${to}"]`);
const el = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const head = (page: Page, id: string) => page.locator(`[data-node-id="${id}"] [data-node-handle]`);
const clickHead = (page: Page, id: string) => head(page, id).click({ position: { x: 100, y: 8 } });
const blank = (page: Page) => page.mouse.click(1300, 100); // 빈 캔버스: 선택 해제 + 보드가 키보드를 되찾음
const bb = async (loc: ReturnType<Page["locator"]>) => (await loc.boundingBox())!;
const near = (a: number, b: number, tol = 4) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const startConnect = async (page: Page) => { await el(page, "o1").getByTestId("tw-connect").click(); await expect.poll(async () => (await ui(page)).connect).toEqual({ wsId: "ws-fake", cardId: "o1" }); };
const done = async (page: Page) => { await el(page, "o1").getByTestId("tw-done").click(); await expect.poll(async () => (await ui(page)).connect).toBeNull(); };

test.describe("S-1223·S-1224 선 그리기", () => {
  const wiredCard = node("o1", "tk-orch", -120, 60, 240, 120, { wired: ["c1", "c2", "g1"] });
  test("wired 항목마다 곡선(<path d=M…C…>) 하나, data-from/to(그룹은 g:id)·주황 색, 노드 아래 층", async ({ page }) => {
    await seed(page, [C1, C2, C3, C4, wiredCard]);
    await expect(wires(page)).toHaveCount(3);
    for (const to of ["c1", "c2", "g:g1"]) {
      const w = wire(page, "o1", to);
      await expect(w).toHaveCount(1);
      await expect(w).toHaveAttribute("data-wire-color", "orange");
      expect(await w.evaluate((e) => e.tagName.toLowerCase())).toBe("path");
      expect(await w.getAttribute("d")).toMatch(/^M[^C]*C/); // 3차 베지어
    }
    expect(await wire(page, "o1", "c1").evaluate((e) => getComputedStyle(e).stroke)).toBe("rgb(249, 115, 22)"); // --accent
    const z = await page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-testid="wires"]') as HTMLElement).zIndex));
    expect(z).toBeLessThan(0);
  });
  test("선은 카드 가장자리 → 콘솔 가장자리 사이에 걸치고, 줌·팬을 따라 움직인다", async ({ page }) => {
    await seed(page, [C1, C2, C3, C4, wiredCard]);
    const inside = async () => {
      const w = await bb(wire(page, "o1", "c1")), a = await bb(el(page, "o1")), b = await bb(el(page, "c1"));
      const x0 = Math.min(a.x, b.x) - 3, x1 = Math.max(a.x + a.width, b.x + b.width) + 3, y0 = Math.min(a.y, b.y) - 3, y1 = Math.max(a.y + a.height, b.y + b.height) + 3;
      expect(w.x).toBeGreaterThanOrEqual(x0); expect(w.x + w.width).toBeLessThanOrEqual(x1);
      expect(w.y).toBeGreaterThanOrEqual(y0); expect(w.y + w.height).toBeLessThanOrEqual(y1);
      expect(w.width + w.height).toBeGreaterThan(5);
      return w;
    };
    const w0 = await inside();
    await page.getByTestId("zoom-in").click();
    const w1 = await inside();
    expect(Math.abs(w1.width - w0.width) + Math.abs(w1.height - w0.height)).toBeGreaterThan(5); // 줌을 따라 크기가 바뀐다
    await blank(page);
    await page.mouse.wheel(60, -40); // 팬
    const w2 = await inside();
    expect(Math.abs(w2.x - w1.x) + Math.abs(w2.y - w1.y)).toBeGreaterThan(5);
  });
  test("S-1224 그룹 선은 할로 경계 상자 가장자리로 가고, 멤버를 끌면 따라간다", async ({ page }) => {
    await seed(page, [C1, C2, C3, C4, wiredCard]);
    const reach = async () => {
      const w = await bb(wire(page, "o1", "g:g1")), h = await bb(page.getByTestId("group-halo"));
      near(w.y + w.height, h.y, 4); // 카드가 할로 위에 있으니 끝이 할로 윗변
      expect(w.x + w.width).toBeGreaterThanOrEqual(h.x - 4);
      expect(w.x + w.width).toBeLessThanOrEqual(h.x + h.width + 4);
      return h;
    };
    const h0 = await reach();
    const b = await bb(head(page, "c3"));
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height / 2 + 60, { steps: 10 });
    await page.mouse.up();
    const h1 = await reach();
    expect(Math.abs(h1.height - h0.height)).toBeGreaterThan(5); // 멤버 하나를 아래로 끌면 할로 윗변은 그대로고 높이가 변한다 — 선 끝(reach)은 새 할로에 그대로 닿는다
  });
  test("기존 wireTo 직선(cyan)과 violet 카드 선은 그대로", async ({ page }) => {
    const mem = node("m1", "tk-mem", -120, 60, 240, 120, { wired: ["c2"] });
    await seed(page, [C1, C2, mem, node("p1", "tk-plain", -700, 100, 200, 120), node("l1", "tk-link", -700, 300, 160, 100, { wireTo: "p1" })]);
    await expect(wire(page, "m1", "c2")).toHaveAttribute("data-wire-color", "violet");
    await expect(wire(page, "l1", "p1")).toHaveAttribute("data-wire-color", "cyan");
    expect(await wire(page, "l1", "p1").evaluate((e) => e.tagName.toLowerCase())).toBe("line");
  });
  test("사라진 id 와 멤버 없는 그룹은 선을 안 긋는다", async ({ page }) => {
    await seed(page, [C1, node("o1", "tk-orch", -120, 60, 240, 120, { wired: ["ghost", "g1", "c1"] })]); // g1 은 멤버가 없다
    await expect(wires(page)).toHaveCount(1);
    await expect(wire(page, "o1", "c1")).toHaveCount(1);
  });
});

test.describe("S-1225~S-1227 연결 모드", () => {
  test("Connect → useUi.connect, 콘솔을 누르면 wired 에 들어가고 다시 누르면 빠진다. 선택은 안 한다", async ({ page }) => {
    await seed(page, [C1, C2, C3, C4, ORCH]);
    await startConnect(page);
    await clickHead(page, "c1");
    expect(await wiredOf(page)).toEqual(["c1"]);
    expect((await st(page)).selection).toEqual([]); // 선택 대신
    await clickHead(page, "c2");
    expect(await wiredOf(page)).toEqual(["c1", "c2"]);
    await clickHead(page, "c1");
    expect(await wiredOf(page)).toEqual(["c2"]);
    await expect(wire(page, "o1", "c2")).toHaveCount(1);
    await expect(wire(page, "o1", "c1")).toHaveCount(0);
  });
  test("연결된 콘솔은 주황 외곽선(--accent) + data-wired, 빠지면 사라진다", async ({ page }) => {
    await seed(page, [C1, C2, ORCH]);
    await startConnect(page);
    await clickHead(page, "c1");
    await expect(el(page, "c1")).toHaveAttribute("data-wired", "true");
    const o = await el(page, "c1").evaluate((e) => { const c = getComputedStyle(e); return { color: c.outlineColor, style: c.outlineStyle, width: parseFloat(c.outlineWidth) }; });
    expect(o.color).toBe("rgb(249, 115, 22)");
    expect(o.style).not.toBe("none");
    expect(o.width).toBeGreaterThan(0);
    await expect(el(page, "c2")).not.toHaveAttribute("data-wired", "true");
    await clickHead(page, "c1");
    await expect(el(page, "c1")).not.toHaveAttribute("data-wired", "true");
  });
  test("그룹은 할로 헤더 라벨을 누르면 그룹 id 가 들어가고/빠진다 — 선은 g:g1", async ({ page }) => {
    await seed(page, [C1, C3, C4, ORCH]);
    await startConnect(page);
    await page.getByTestId("group-label").click();
    expect(await wiredOf(page)).toEqual(["g1"]);
    await expect(wire(page, "o1", "g:g1")).toHaveCount(1);
    await page.getByTestId("group-label").click();
    expect(await wiredOf(page)).toEqual([]);
  });
  test("다른 노드는 눌러도 아무 일이 없고, 팬·줌은 된다", async ({ page }) => {
    await seed(page, [C1, ORCH, node("p1", "tk-plain", 400, 200, 200, 120)]);
    await startConnect(page);
    await el(page, "p1").click();
    expect(await wiredOf(page)).toEqual([]);
    expect((await st(page)).selection).toEqual([]);
    const before = await bb(el(page, "c1"));
    await page.mouse.wheel(60, 0);
    await expect.poll(async () => Math.abs((await bb(el(page, "c1"))).x - before.x)).toBeGreaterThan(5);
    const z = await page.getByTestId("zoom-pct").innerText();
    await page.getByTestId("zoom-in").click();
    expect(await page.getByTestId("zoom-pct").innerText()).not.toBe(z);
  });
  test("S-1227 Done 뒤 되돌리기 1번에 연결 모드의 변경이 전부 사라진다", async ({ page }) => {
    await seed(page, [C1, C2, C3, C4, ORCH]);
    await startConnect(page);
    await clickHead(page, "c1");
    await clickHead(page, "c2");
    await page.getByTestId("group-label").click();
    expect(await wiredOf(page)).toEqual(["c1", "c2", "g1"]);
    await done(page);
    await expect(wires(page)).toHaveCount(3);
    await blank(page);
    await page.keyboard.press("Control+z");
    expect(await wiredOf(page)).toEqual([]);
    await expect(wires(page)).toHaveCount(0);
  });
  test("S-1227 변경이 없으면 되돌리기 단계도 없다 — Ctrl+Z 는 그 전의 일을 되돌린다", async ({ page }) => {
    await seed(page, [C1, ORCH, node("p1", "tk-plain", 400, 200, 200, 120)]);
    await el(page, "p1").click();
    await page.keyboard.press("Delete"); // 되돌릴 수 있는 일 하나
    await expect(el(page, "p1")).toHaveCount(0);
    await startConnect(page);
    await done(page);
    await blank(page);
    await page.keyboard.press("Control+z");
    await expect(el(page, "p1")).toHaveCount(1);
  });
  test("S-1225·S-1229 Esc 는 연결 모드를 끝낸다 — 열린 패널보다 먼저", async ({ page }) => {
    await seed(page, [C1, ORCH]);
    await startConnect(page);
    await setUi(page, { memory: { open: true } });
    await page.keyboard.press("Escape");
    expect((await ui(page)).connect).toBeNull();
    expect((await ui(page)).memory).toBe(true);
    await page.keyboard.press("Escape");
    expect((await ui(page)).memory).toBe(false);
  });
  test("S-1225·S-1237 탭을 바꾸면 연결 모드가 끝나고, 숨은 워크스페이스는 입력을 받지 않는다(inert)", async ({ page }) => {
    await seed(page, [C1, ORCH]);
    await startConnect(page);
    await page.getByTestId("tab-add").click();
    await expect.poll(async () => (await ui(page)).connect).toBeNull();
    await expect(page.locator('[data-ws="ws-fake"]')).toHaveAttribute("inert", "");
  });
  test("S-1225·S-1236 카드를 지우면(Delete) 묻지 않고 지워지고 연결 모드도 끝난다. 콘솔은 그대로, 되돌리면 카드와 wired 가 같이", async ({ page }) => {
    await seed(page, [C1, C2, ORCH]);
    await startConnect(page);
    await clickHead(page, "c1");
    await clickHead(page, "c2");
    await done(page);
    await el(page, "o1").click({ position: { x: 100, y: 50 } }); // 버튼이 아닌 본문(화면 120×60 상자의 오른쪽 아래) — 카드 선택
    await startConnect(page); // 버튼을 눌러도 카드는 선택된 채
    expect((await st(page)).selection).toEqual(["o1"]);
    await page.keyboard.press("Delete");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(el(page, "o1")).toHaveCount(0);
    expect((await ui(page)).connect).toBeNull(); // 카드가 사라지면 연결 모드 끝
    await expect(page.getByTestId("console")).toHaveCount(2);
    await expect(wires(page)).toHaveCount(0);
    await blank(page);
    await page.keyboard.press("Control+z");
    await expect(el(page, "o1")).toHaveCount(1);
    expect(await wiredOf(page)).toEqual(["c1", "c2"]);
    await expect(wires(page)).toHaveCount(2);
  });
  test("S-1225 한 번에 한 카드만: 두 번째 카드의 Connect 가 첫 카드의 연결 모드를 대신한다", async ({ page }) => {
    await seed(page, [C1, ORCH, node("m1", "tk-mem", -120, -100, 240, 120, { wired: [] })]);
    await startConnect(page);
    await el(page, "m1").getByTestId("tw-connect").click();
    await expect.poll(async () => (await ui(page)).connect).toEqual({ wsId: "ws-fake", cardId: "m1" });
    await clickHead(page, "c1");
    expect(await wiredOf(page, "m1")).toEqual(["c1"]);
    expect(await wiredOf(page, "o1")).toEqual([]);
  });
});

test.describe("S-1228·S-1229 키·Esc 순서", () => {
  test("M = Memory, L = Loops, X = Mission Map 토글. 하나만 열린다", async ({ page }) => {
    await seed(page, [C1]);
    await blank(page);
    await page.keyboard.press("m");
    expect(await ui(page)).toMatchObject({ memory: true, loops: false, mission: false });
    await page.keyboard.press("m");
    expect((await ui(page)).memory).toBe(false);
    await page.keyboard.press("l");
    expect(await ui(page)).toMatchObject({ memory: false, loops: true, mission: false });
    await page.keyboard.press("x");
    expect(await ui(page)).toMatchObject({ memory: false, loops: false, mission: true });
    await page.keyboard.press("x");
    expect((await ui(page)).mission).toBe(false);
  });
  test("S-047 실행 중 콘솔 하나만 선택돼 있으면 M·L·X 글자는 콘솔로 가고 패널은 안 열린다", async ({ page }) => {
    await seed(page, [C1]);
    await clickHead(page, "c1");
    for (const k of ["m", "l", "x"]) await page.keyboard.press(k);
    expect(await ui(page)).toMatchObject({ memory: false, loops: false, mission: false });
  });
  test("S-1229 Esc 는 가장 위에 열린 것부터 하나씩: Mission Map → Memory → Loops → Usage", async ({ page }) => {
    await seed(page, [C1]);
    await blank(page);
    await setUi(page, { mission: { open: true }, memory: { open: true }, loops: { open: true }, usage: { open: true, view: "usage" } });
    const open = async () => { const u = await ui(page); return [u.mission, u.memory, u.loops, u.usage.open]; };
    expect(await open()).toEqual([true, true, true, true]);
    await page.keyboard.press("Escape");
    expect(await open()).toEqual([false, true, true, true]);
    await page.keyboard.press("Escape");
    expect(await open()).toEqual([false, false, true, true]);
    await page.keyboard.press("Escape");
    expect(await open()).toEqual([false, false, false, true]);
    await page.keyboard.press("Escape");
    expect(await open()).toEqual([false, false, false, false]);
  });
});

test.describe("S-1231·S-1232 Tools 메뉴·More", () => {
  test("Tools 메뉴의 Mission Map·Memory·Loops 가 각 패널을 연다 (하나만)", async ({ page }) => {
    await seed(page, [C1]);
    for (const [name, key] of [["Mission Map", "mission"], ["Memory", "memory"], ["Loops", "loops"]] as const) {
      await page.getByTestId("tools-btn").click();
      await page.getByRole("menuitem", { name, exact: true }).click();
      expect((await ui(page))[key]).toBe(true);
      if (key === "memory") await page.getByTestId("memory-close").click(); // D8: 진짜 Memory 패널의 덮개가 톱바를 가린다 → 닫고 다음으로
    }
    expect(await ui(page)).toMatchObject({ mission: false, memory: false, loops: true });
  });
  test("우클릭 고리 More 에 Mission Map(고정)이 있고 누르면 연다. Memory card 항목도 있다(D8)", async ({ page }) => {
    await seed(page, [], 1);
    await page.mouse.click(700, 450, { button: "right" });
    await page.getByRole("menuitem", { name: "More", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Memory card", exact: true })).toHaveCount(1);
    await page.getByRole("menuitem", { name: "Mission Map", exact: true }).click();
    expect((await ui(page)).mission).toBe(true);
  });
});

test.describe("S-1233 우측 레일 Insert <종류>", () => {
  test("rail 슬롯 종류의 버튼이 Insert to-do 아래에 생기고, 누르면 화면 가운데에 겹치지 않게 놓고 선택한다 (되돌리기 1단계)", async ({ page }) => {
    await seed(page, [node("mid", "tk-plain", -100, -60, 200, 120)], 1);
    const btn = page.getByTestId("rail-insert-tk-orch");
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText("Insert Test orch");
    expect((await bb(btn)).y).toBeGreaterThan((await bb(page.getByTestId("rail-insert-todo"))).y);
    await btn.click();
    const s = await st(page);
    const made = s.nodes.find((n) => n.kind === "tk-orch")!;
    expect(s.selection).toEqual([made.id]);
    const mid = s.nodes.find((n) => n.id === "mid")!;
    expect(made.x < mid.x + 200 && made.x + 240 > mid.x && made.y < mid.y + 120 && made.y + 120 > mid.y).toBe(false);
    expect(Math.hypot(made.x + 120, made.y + 60)).toBeLessThan(600); // 가운데 근처
    await blank(page);
    await page.keyboard.press("Control+z");
    expect((await st(page)).nodes.some((n) => n.kind === "tk-orch")).toBe(false);
  });
  test("등록된 종류만 rail 버튼을 그린다 (시험 종류가 없으면 실제 등록된 orchestrator 하나만, S-1251)", async ({ page }) => {
    await seed(page, [], 1, "/");
    await expect(page.getByTestId("rail-presets")).toBeVisible();
    const ids = page.locator('[data-testid^="rail-insert-"]:not([data-testid="rail-insert-todo"])');
    await expect(ids).toHaveCount(1);
    await expect(ids).toHaveAttribute("data-testid", "rail-insert-orchestrator");
  });
});

test.describe("S-1235 지우개", () => {
  test("eraserTarget:false 인 orchestrator 대역 카드는 지워지지 않고, memory 대역 카드는 지워진다", async ({ page }) => {
    await seed(page, [node("o1", "tk-orch", -300, -60, 240, 120, { wired: [] }), node("m1", "tk-mem", 60, -60, 240, 120, { wired: [] })], 1);
    await blank(page);
    await page.keyboard.press("e");
    await expect(page.getByTestId("rail-eraser")).toHaveAttribute("data-active", "true");
    await page.mouse.move(700 - 340, 450 + 5);
    await page.mouse.down();
    await page.mouse.move(700 + 340, 450 + 5, { steps: 20 });
    await page.mouse.up();
    await expect(el(page, "m1")).toHaveCount(0);
    await expect(el(page, "o1")).toHaveCount(1);
  });
});
