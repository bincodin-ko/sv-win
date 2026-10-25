import { expect, test, type Page } from "@playwright/test";

// C5 도형·선·화살표·스타일 인스펙터 (S-820~S-831). 가짜 PTY(Tauri 밖), 주소 ?kindsTest 로 상태 읽기 창구 window.__kt 를 쓴다.
// 약속(이름): 레일 rail-shapes → flyout data-testid="shapes-flyout" 항목 shape-<rectangle|ellipse|diamond|line|arrow>.
//   인스펙터 style-inspector · 절 insp-<lines|fill|shape|text|order> · 컨트롤 insp-stroke-<색> insp-width-<1|2|3> insp-style-<solid|dashed|dotted>
//   insp-rough-<0|1|2> insp-fill-<색|transparent> insp-fillstyle-<hachure|cross|solid> insp-edges-<sharp|round> insp-opacity(range)
//   insp-font(select) insp-size-<S|M|L|XL> insp-align-<left|center|right> insp-front insp-back insp-dup insp-del
//   도형 윤곽 shape-path(d 속성), 글 입력 shape-text-input, 선 노브 knob-0 knob-1 knob-mid
// 1400×900, 줌 1, 보드 이동 0 이면 월드 (x,y) = 화면 (700+x, 450+y).
test.use({ actionTimeout: 5000 });
type N = Record<string, unknown> & { id: string; kind: string; x: number; y: number; w: number; h: number };
const n = (id: string, kind: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): N => ({ id, kind, x, y, w, h, z: 1, ...extra });
const SH = (id: string, x: number, y: number, extra: Record<string, unknown> = {}, w = 160, h = 100) =>
  n(id, "shape", x, y, w, h, { shape: "rectangle", stroke: "default", strokeWidth: 1, strokeStyle: "solid", roughness: 0, fill: "transparent", fillStyle: "hachure", edges: "round", opacity: 100, seed: 5, text: "", ...extra });
const LN = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  n(id, "line", x, y, 200, 1, { points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], bend: null, head: false, stroke: "default", strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, seed: 5, ...extra });
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
const nodeOf = async (page: Page, id: string) => (await st(page)).nodes.find((x) => x.id === id)!;
const created = async (page: Page) => (await st(page)).nodes.filter((x) => x.id !== "d" && /^(shape|line)/.test(x.id));
const el = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const near = (a: number, b: number, tol = 1.5) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
async function drag(page: Page, x: number, y: number, dx: number, dy: number, shift = false) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}
const pick = async (page: Page, id: string) => {
  await page.getByTestId("rail-shapes").click();
  await expect(page.getByTestId("shapes-flyout")).toBeVisible();
  await page.getByTestId(`shape-${id}`).click();
};
const selectAt = (page: Page, x: number, y: number) => page.mouse.click(x, y);
const T = (page: Page, id: string) => page.getByTestId(id);

test.describe("S-820·S-821 Shapes 도구와 놓기", () => {
  test("S-820 flyout 에 6항목(Rectangle…Arrow 5개 + C10 Sticky), 하나를 고르면 닫히고 도구는 shapes", async ({ page }) => {
    await seed(page, []);
    await T(page, "rail-shapes").click();
    await expect(T(page, "shapes-flyout")).toBeVisible();
    const ids = await T(page, "shapes-flyout").locator('[data-testid^="shape-"]').evaluateAll((b) => b.map((x) => x.getAttribute("data-testid")));
    expect(ids).toEqual(["shape-rectangle", "shape-ellipse", "shape-diamond", "shape-line", "shape-arrow", "shape-sticky"]);
    await T(page, "shape-ellipse").click();
    await expect(T(page, "shapes-flyout")).toHaveCount(0);
    expect((await st(page)).tool).toBe("shapes");
  });

  for (const [id, shape] of [["rectangle", "rectangle"], ["ellipse", "ellipse"], ["diamond", "diamond"]] as const) {
    test(`S-821 ${id}: 클릭하면 기본 크기 160×100 로 놓고 Select 로 돌아오며 선택된다. Ctrl+Z 한 번에 사라진다`, async ({ page }) => {
      await seed(page, []);
      await pick(page, id);
      await page.mouse.click(900, 450);
      const [s] = await created(page);
      expect(s).toBeTruthy();
      expect(s!.kind).toBe("shape");
      expect(s!.shape).toBe(shape);
      expect([s!.w, s!.h]).toEqual([160, 100]);
      near(s!.x + 80, 200);
      near(s!.y + 50, 0);
      const snap = await st(page);
      expect(snap.tool).toBe("select");
      expect(snap.selection).toEqual([s!.id]);
      await page.mouse.click(1250, 150);
      expect(await created(page)).toHaveLength(1); // Select 로 돌아왔으니 더 놓이지 않는다
      await page.mouse.click(900, 450); // 선택하고
      await page.keyboard.press("Control+z");
      expect(await created(page)).toHaveLength(0);
    });
  }

  test("S-821 선·화살표: 클릭하면 길이 160, 화살표만 head:true", async ({ page }) => {
    await seed(page, []);
    await pick(page, "line");
    await page.mouse.click(900, 450);
    await pick(page, "arrow");
    await page.mouse.click(900, 600);
    const [a, b] = await created(page);
    expect(a!.kind).toBe("line");
    expect(!!a!.head).toBe(false);
    expect(b!.kind).toBe("line");
    expect(b!.head).toBe(true);
    for (const l of [a!, b!]) near(Math.hypot(l.points[1].x - l.points[0].x, l.points[1].y - l.points[0].y), 160);
  });

  test("S-821 드래그하면 누른 점에서 놓은 점까지 크기로 그린다(반대 방향도), 3px 미만은 클릭", async ({ page }) => {
    await seed(page, []);
    await pick(page, "rectangle");
    await drag(page, 900, 300, 200, 120);
    let [s] = await created(page);
    near(s!.x, 200); near(s!.y, -150); near(s!.w, 200); near(s!.h, 120);
    expect((await st(page)).tool).toBe("select");
    await pick(page, "ellipse");
    await drag(page, 1200, 700, -150, -90);
    s = (await created(page))[1];
    near(s!.x, 350); near(s!.y, 160); near(s!.w, 150); near(s!.h, 90);
    await pick(page, "diamond");
    await drag(page, 1000, 100, 2, 1); // 3px 미만 = 클릭
    s = (await created(page))[2];
    expect([s!.w, s!.h]).toEqual([160, 100]);
  });

  test("S-821 선을 드래그로 그리면 두 끝이 누른 점·놓은 점, Shift 면 15도 단위", async ({ page }) => {
    await seed(page, []);
    await pick(page, "line");
    await drag(page, 800, 300, 120, 80);
    let l = (await created(page))[0]!;
    near(l.x + l.points[0].x, 100); near(l.y + l.points[0].y, -150);
    near(l.x + l.points[1].x, 220); near(l.y + l.points[1].y, -70);
    await pick(page, "line");
    await drag(page, 800, 600, 100, 30, true);
    l = (await created(page))[1]!;
    const dx = l.points[1].x - l.points[0].x, dy = l.points[1].y - l.points[0].y;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    near(deg / 15, Math.round(deg / 15), 0.001);
  });
});

test.describe("S-825 인스펙터", () => {
  test("도형을 선택하면 5절이 열리고 선택이 풀리면 닫힌다. fill style 줄은 색을 고른 뒤에만", async ({ page }) => {
    await seed(page, [SH("s1", 100, -50)]);
    await expect(T(page, "style-inspector")).toHaveCount(0);
    await selectAt(page, 880, 450);
    await expect(T(page, "style-inspector")).toBeVisible();
    for (const s of ["lines", "fill", "shape", "text", "order"]) await expect(T(page, `insp-${s}`)).toBeVisible();
    await expect(T(page, "insp-fillstyle-cross")).toHaveCount(0);
    await T(page, "insp-fill-red").click();
    await expect(T(page, "insp-fillstyle-cross")).toBeVisible();
    await T(page, "insp-fill-transparent").click();
    await expect(T(page, "insp-fillstyle-cross")).toHaveCount(0);
    await page.mouse.click(1250, 150);
    await expect(T(page, "style-inspector")).toHaveCount(0);
  });

  test("S-822·S-825 값을 바꾸면 노드 속성이 바뀌고 한 번 바꾼 것은 Ctrl+Z 한 번에 돌아온다", async ({ page }) => {
    await seed(page, [SH("s1", 100, -50)]);
    await selectAt(page, 880, 450);
    const v = async (k: string) => (await nodeOf(page, "s1"))[k];
    await T(page, "insp-width-2").click(); expect(await v("strokeWidth")).toBe(2);
    await T(page, "insp-width-3").click(); expect(await v("strokeWidth")).toBe(3);
    await T(page, "insp-style-dashed").click(); expect(await v("strokeStyle")).toBe("dashed");
    await T(page, "insp-style-dotted").click(); expect(await v("strokeStyle")).toBe("dotted");
    await T(page, "insp-rough-2").click(); expect(await v("roughness")).toBe(2);
    await T(page, "insp-stroke-blue").click(); expect(await v("stroke")).toBe("blue");
    await T(page, "insp-fill-green").click(); expect(await v("fill")).toBe("green");
    await T(page, "insp-fillstyle-cross").click(); expect(await v("fillStyle")).toBe("cross");
    await T(page, "insp-fillstyle-solid").click(); expect(await v("fillStyle")).toBe("solid");
    await T(page, "insp-edges-sharp").click(); expect(await v("edges")).toBe("sharp");
    await T(page, "insp-opacity").fill("40"); expect(await v("opacity")).toBe(40);
    await page.mouse.click(1250, 150); await selectAt(page, 880, 450); // 키보드를 보드로
    await page.keyboard.press("Control+z"); expect(await v("opacity")).toBe(100);
    await page.keyboard.press("Control+z"); expect(await v("edges")).toBe("round");
    await page.keyboard.press("Control+z"); expect(await v("fillStyle")).toBe("cross");
  });

  test("S-825 선·화살표에는 Fill·Edges 절이 없고 Opacity 는 있다", async ({ page }) => {
    await seed(page, [LN("l1", 100, 100)]);
    await selectAt(page, 900, 550);
    await expect(T(page, "style-inspector")).toBeVisible();
    await expect(T(page, "insp-lines")).toBeVisible();
    await expect(T(page, "insp-order")).toBeVisible();
    await expect(T(page, "insp-fill")).toHaveCount(0);
    await expect(T(page, "insp-text")).toHaveCount(0);
    await expect(T(page, "insp-edges-sharp")).toHaveCount(0);
    await expect(T(page, "insp-opacity")).toBeVisible();
  });

  test("S-825 여럿을 선택하면 같은 필드를 한꺼번에 바꾼다(1단계)", async ({ page }) => {
    await seed(page, [SH("s1", 100, -200), SH("s2", 100, 100)]);
    await selectAt(page, 880, 300);
    await page.keyboard.down("Shift");
    await page.mouse.click(880, 600);
    await page.keyboard.up("Shift");
    expect((await st(page)).selection).toHaveLength(2);
    await T(page, "insp-stroke-red").click();
    expect((await nodeOf(page, "s1")).stroke).toBe("red");
    expect((await nodeOf(page, "s2")).stroke).toBe("red");
    await selectAt(page, 880, 600);
    await page.keyboard.press("Control+z");
    expect((await nodeOf(page, "s1")).stroke).toBe("default");
    expect((await nodeOf(page, "s2")).stroke).toBe("default");
  });

  test("S-825·S-831 Order: Bring to front · Send to back · Duplicate · Delete(묻지 않음)", async ({ page }) => {
    await seed(page, [SH("s1", 100, -200, { z: 2 }), SH("s2", 100, 0, { z: 3 }), SH("s3", 100, 200, { z: 4 })]);
    const z = async (id: string) => (await nodeOf(page, id)).z as number;
    await selectAt(page, 880, 250);
    await T(page, "insp-front").click();
    expect(await z("s1")).toBeGreaterThan(Math.max(await z("s2"), await z("s3")));
    await T(page, "insp-back").click();
    expect(await z("s1")).toBeLessThan(Math.min(await z("s2"), await z("s3")));
    const before = (await created(page)).length;
    await T(page, "insp-dup").click();
    expect((await created(page)).length).toBe(before + 1);
    await T(page, "insp-del").click(); // 복제본이 선택돼 있으니 복제본이 지워진다. 묻는 대화상자 없음
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await created(page)).length).toBe(before);
    expect(await nodeOf(page, "s1")).toBeTruthy();
    await selectAt(page, 880, 250);
    await T(page, "insp-del").click();
    expect(await nodeOf(page, "s1")).toBeUndefined();
  });
});

test.describe("S-823 선 노브", () => {
  test("선택하면 노브 3개, 끝 노브를 끌면 그 끝만 움직인다", async ({ page }) => {
    await seed(page, [LN("l1", 100, 100)]); // 화면 800..1000 × 550
    await selectAt(page, 900, 550);
    for (const k of ["knob-0", "knob-1", "knob-mid"]) await expect(T(page, k)).toBeVisible();
    const abs = async () => { const l = await nodeOf(page, "l1"); return l.points.map((p: { x: number; y: number }) => ({ x: l.x + p.x, y: l.y + p.y })); };
    await T(page, "knob-1").hover();
    const b = (await T(page, "knob-1").boundingBox())!;
    await drag(page, b.x + b.width / 2, b.y + b.height / 2, 0, 100);
    const [p0, p1] = await abs();
    near(p0.x, 100); near(p0.y, 100);
    near(p1.x, 300); near(p1.y, 200);
  });

  test("Shift 를 누르고 끌면 다른 끝 기준 15도 단위", async ({ page }) => {
    await seed(page, [LN("l1", 100, 100)]);
    await selectAt(page, 900, 550);
    const b = (await T(page, "knob-1").boundingBox())!;
    await drag(page, b.x + b.width / 2, b.y + b.height / 2, -60, 40, true);
    const l = await nodeOf(page, "l1");
    const dx = l.points[1].x - l.points[0].x, dy = l.points[1].y - l.points[0].y;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    near(deg / 15, Math.round(deg / 15), 0.001);
  });

  test("가운데 노브를 끌면 곡선(bend), 더블클릭하면 곧게", async ({ page }) => {
    await seed(page, [LN("l1", 100, 100)]);
    await selectAt(page, 900, 550);
    expect((await nodeOf(page, "l1")).bend).toBeNull();
    const b = (await T(page, "knob-mid").boundingBox())!;
    await drag(page, b.x + b.width / 2, b.y + b.height / 2, 0, -80);
    expect((await nodeOf(page, "l1")).bend).not.toBeNull();
    await T(page, "knob-mid").dblclick();
    expect((await nodeOf(page, "l1")).bend).toBeNull();
  });

  test("화살표는 끝에 머리를 그린다(data-testid=arrow-head)", async ({ page }) => {
    await seed(page, [LN("l1", 100, 100, { head: true }), LN("l2", 100, 300)]);
    await expect(el(page, "l1").getByTestId("arrow-head")).toHaveCount(1);
    await expect(el(page, "l2").getByTestId("arrow-head")).toHaveCount(0);
  });
});

test.describe("S-824·S-830 도형 글·크기·모양", () => {
  test("더블클릭하면 글 입력(프레임 맞추기보다 우선), Esc 로 확정", async ({ page }) => {
    await seed(page, [SH("s1", 100, -50)]);
    const before = (await el(page, "s1").boundingBox())!;
    await page.mouse.dblclick(880, 450);
    await expect(T(page, "shape-text-input")).toBeVisible();
    await T(page, "shape-text-input").fill("hello");
    await page.keyboard.press("Escape");
    await expect(T(page, "shape-text-input")).toHaveCount(0);
    expect((await nodeOf(page, "s1")).text).toBe("hello");
    const after = (await el(page, "s1").boundingBox())!;
    near(after.x, before.x); near(after.width, before.width); // 줌이 바뀌지 않았다
    await expect(el(page, "s1")).toContainText("hello");
  });

  test("S-830 선택하면 8핸들로 크기 조절(최소 24×24)", async ({ page }) => {
    await seed(page, [SH("s1", 100, -50)]);
    await selectAt(page, 880, 450);
    await expect(el(page, "s1").locator("[data-handle]")).toHaveCount(8);
    const h = (await el(page, "s1").locator('[data-handle="se"]').boundingBox())!;
    await drag(page, h.x + h.width / 2, h.y + h.height / 2, 40, 30);
    near((await nodeOf(page, "s1")).w, 200); near((await nodeOf(page, "s1")).h, 130);
    const h2 = (await el(page, "s1").locator('[data-handle="se"]').boundingBox())!;
    await drag(page, h2.x + h2.width / 2, h2.y + h2.height / 2, -500, -500);
    expect([(await nodeOf(page, "s1")).w, (await nodeOf(page, "s1")).h]).toEqual([24, 24]);
  });

  test("S-830 투명 채움 도형도 안쪽을 눌러 선택된다", async ({ page }) => {
    await seed(page, [SH("s1", 100, -50)]);
    await selectAt(page, 880, 450);
    expect((await st(page)).selection).toEqual(["s1"]);
  });

  test("S-827 같은 seed 는 새로 불러도 같은 모양, seed 가 다르면 다른 모양", async ({ page }) => {
    const d = async (extra: Record<string, unknown>) => {
      await seed(page, [SH("s1", 100, -50, { roughness: 2, ...extra })]);
      return await el(page, "s1").getByTestId("shape-path").getAttribute("d");
    };
    const a1 = await d({ seed: 7 }), a2 = await d({ seed: 7 }), b = await d({ seed: 8 });
    expect(a1).toBeTruthy();
    expect(a1).toBe(a2);
    expect(b).not.toBe(a1);
  });

  test("S-829 Opacity 는 노드 전체에, Edges Round 는 사각형 모서리(반지름 12)에만", async ({ page }) => {
    await seed(page, [SH("s1", 100, -50, { opacity: 50, edges: "round" }), SH("s2", 100, 150, { shape: "ellipse", edges: "round" })]);
    expect(await el(page, "s1").getByTestId("shape-body").evaluate((e) => getComputedStyle(e).opacity)).toBe("0.5");
    expect(await el(page, "s1").getByTestId("shape-path").getAttribute("d")).toContain("A12 12");
    expect(await el(page, "s2").getByTestId("shape-path").getAttribute("d")).not.toContain("A12 12");
  });

  test("S-826 색은 이름으로 저장하고 값은 --ink-<이름> 변수를 따른다", async ({ page }) => {
    await seed(page, [SH("s1", 100, -50, { stroke: "red" })]);
    const stroke = await el(page, "s1").getByTestId("shape-path").getAttribute("stroke");
    expect(stroke).toBe("var(--ink-red)");
    const v = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ink-red").trim());
    expect(v).not.toBe("");
  });
});
