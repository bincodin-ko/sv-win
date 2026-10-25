import { expect, test, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

// C12 이미지 노드·붙여넣기·Markup (S-880~S-891). 가짜 PTY·가짜 파일(Tauri 밖). 기대값은 spec/3묶음.md 문장에서만.
// 구현이 맞출 약속(이름): 레일 버튼 rail-image(이름 "Insert image") · 고리 항목 "Insert image"
//   노드 본문 image-body 안에 그림 image-img(<img>) 또는 "Image missing" 글 image-missing + 경로 글 image-missing-path
//   Markup pill image-markup(선택됐을 때만) · 편집창 role=dialog 이름 "Markup":
//   도구 mk-tool-<arrow|rectangle|ellipse|line|pen|highlight|text>(aria-pressed) · 색 mk-color-0..7 · 굵기 mk-width-0..3
//   mk-clear("Clear all") · mk-save("Save markup") · mk-cancel("Cancel") · 캔버스 mk-canvas(data-count = 그린 요소 수) · 글자 입력 mk-text-input
// 상태 읽기 창구: window.__img.nodes("ws-fake") → 이미지 노드들 · window.__fakeFiles · window.__fakeFsLog (C2 가짜 IPC)
// 1400×900, 줌 1, 이동 0 → 월드 (x,y) = 화면 (700+x, 450+y).
test.use({ actionTimeout: 5000 });

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
/** 단색 w×h PNG 바이트 */
function png(w: number, h: number, rgb: [number, number, number] = [60, 120, 200]): number[] {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return [...Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])];
}

const SHOTS = "C:/fake/AppData/com.symvibe.win/Screenshots"; // 가짜 앱 데이터 폴더(ipc.ts 가짜와 같은 값)
const WIDE = "C:/fake/pics/wide.png"; // 400×200
const TALL = "C:/fake/pics/tall.png"; // 100×300
const files = () => ({ [WIDE]: { bytes: png(400, 200) }, [TALL]: { bytes: png(100, 300, [200, 80, 60]) } });
const NODE = (extra: Record<string, unknown> = {}) => ({ id: "image1", kind: "image", x: -230, y: -115, w: 460, h: 230, z: 1, path: WIDE, nw: 400, nh: 200, ...extra });
const boardJson = (nodes: unknown[]) => JSON.stringify({
  formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 1 }, nodes, groups: [],
});
async function seed(page: Page, nodes: unknown[] = [], extraFiles: Record<string, unknown> = {}, pick?: string) {
  await page.addInitScript(([b, f, p]) => {
    const w = window as any;
    w.__symSeed = { boards: { "ws-fake": b } };
    w.__fakeFiles = f;
    if (p) w.__fakePickFile = p;
  }, [boardJson(nodes), { ...files(), ...extraFiles }, pick ?? ""] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
}
type Img = { id: string; x: number; y: number; w: number; h: number; path?: string; shot?: string; nw: number; nh: number };
const imgs = (page: Page) => page.evaluate(() => (window as any).__img.nodes("ws-fake") as Img[]);
const fsLog = (page: Page) => page.evaluate(() => ((window as any).__fakeFsLog ?? []) as string[]);
const fileBytes = (page: Page, p: string) => page.evaluate((q) => ((window as any).__fakeFiles[q]?.bytes ?? null) as number[] | null, p);
const nodeEls = (page: Page) => page.locator("[data-node-id]");
const box = async (page: Page) => (await nodeEls(page).first().boundingBox())!;
const activeTool = (page: Page) => page.locator('[data-testid^="rail-"][data-active="true"]');

test("S-880·S-881 레일 Insert image → 캔버스 클릭 → 선택창 → 고른 파일이 누른 자리에 긴 변 460 으로", async ({ page }) => {
  await seed(page, [], {}, WIDE);
  await page.getByTestId("rail-image").click();
  await expect(page.getByTestId("rail-image")).toHaveAttribute("data-active", "true");
  await page.mouse.click(800, 300);
  await expect(nodeEls(page)).toHaveCount(1);
  const [n] = await imgs(page);
  expect(n).toMatchObject({ path: WIDE, nw: 400, nh: 200, w: 460, h: 230 });
  const b = await box(page);
  expect(Math.round(b.x)).toBe(800); expect(Math.round(b.y)).toBe(300); // 클릭한 자리가 노드 왼쪽 위
  expect(Math.round(b.width)).toBe(460);
  await expect(page.getByTestId("image-img")).toBeVisible();
  await expect(activeTool(page)).toHaveAttribute("data-testid", "rail-select"); // 도구는 Select 로
  await expect(nodeEls(page).first()).toHaveAttribute("data-selected", "true");
});

test("S-881 세로로 긴 그림은 h=460, 비율 유지", async ({ page }) => {
  await seed(page, [], {}, TALL);
  await page.getByTestId("rail-image").click();
  await page.mouse.click(300, 100);
  await expect(nodeEls(page)).toHaveCount(1);
  const [n] = await imgs(page);
  expect(n!.h).toBe(460);
  expect(n!.w / n!.h).toBeCloseTo(100 / 300, 3);
  expect(n).toMatchObject({ nw: 100, nh: 300 });
});

test("S-880 선택창에서 취소하면 아무것도 안 놓이고 Select 로 돌아온다", async ({ page }) => {
  await seed(page);
  await page.getByTestId("rail-image").click();
  await page.mouse.click(800, 300); // __fakePickFile 없음 = 취소
  await expect(activeTool(page)).toHaveAttribute("data-testid", "rail-select");
  await expect(nodeEls(page)).toHaveCount(0);
  expect(await imgs(page)).toEqual([]);
});

test("S-880 고리 Insert image 는 바로 선택창, 고리를 연 자리에 놓는다", async ({ page }) => {
  await seed(page, [], {}, WIDE);
  await page.mouse.click(900, 500, { button: "right" });
  await expect(page.getByTestId("ring-menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Insert image" }).click();
  await expect(nodeEls(page)).toHaveCount(1);
  const b = await box(page);
  expect(Math.round(b.x)).toBe(900); expect(Math.round(b.y)).toBe(500);
  const [n] = await imgs(page);
  expect(n).toMatchObject({ path: WIDE, w: 460, h: 230 });
});

test("S-882 파일이 없으면 'Image missing' 과 경로(오류 아님). 삭제는 노드만 지우고 파일은 그대로", async ({ page }) => {
  await seed(page, [NODE({ id: "image1", path: "C:/fake/pics/gone.png" }), NODE({ id: "image2", x: 300, path: TALL, nw: 100, nh: 300, w: 153, h: 460 })]);
  const missing = nodeEls(page).nth(0).getByTestId("image-missing");
  await expect(missing).toContainText("Image missing");
  await expect(nodeEls(page).nth(0).getByTestId("image-missing-path")).toContainText("C:/fake/pics/gone.png");
  await expect(nodeEls(page).nth(1).getByTestId("image-img")).toBeVisible();
  await nodeEls(page).nth(1).click({ position: { x: 20, y: 200 } });
  await page.keyboard.press("Delete");
  await expect(nodeEls(page)).toHaveCount(1);
  expect(await fileBytes(page, TALL)).not.toBeNull(); // 파일은 안 건드린다
  expect((await fsLog(page)).filter((l) => /trash|save|copy/.test(l))).toEqual([]);
});

test("S-889 같은 경로는 한 번만 읽는다(두 노드가 같은 Blob 주소)", async ({ page }) => {
  await seed(page, [NODE()]);
  await expect(page.getByTestId("image-img")).toBeVisible();
  await nodeEls(page).first().click();
  await page.keyboard.press("Control+d");
  await expect(nodeEls(page)).toHaveCount(2);
  const src = await page.getByTestId("image-img").evaluateAll((a) => a.map((i) => (i as HTMLImageElement).src));
  expect(src).toHaveLength(2);
  expect(src[0]).toMatch(/^blob:/);
  expect(src[1]).toBe(src[0]);
  const nat = await page.getByTestId("image-img").first().evaluate((i) => (i as HTMLImageElement).naturalWidth);
  expect(nat).toBe(400);
});

test("S-890 크기 조절은 비율 고정", async ({ page }) => {
  await seed(page, [NODE()]);
  await nodeEls(page).first().click({ position: { x: 100, y: 100 } });
  const se = nodeEls(page).first().locator('[data-handle="se"]');
  await expect(se).toBeVisible();
  const h = (await se.boundingBox())!;
  const x = h.x + h.width / 2, y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 5 });
  await page.mouse.move(x + 120, y + 7, { steps: 5 });
  await page.mouse.up();
  const [n] = await imgs(page);
  expect(n!.w).toBeGreaterThan(520);
  expect(n!.w / n!.h).toBeCloseTo(2, 2);
});

test("S-890 우클릭 노드 메뉴: 기본 3항목 + Open file · Reveal in Explorer", async ({ page }) => {
  await seed(page, [NODE()]);
  await nodeEls(page).first().click({ button: "right", position: { x: 100, y: 100 } });
  const items = await page.locator('[role="menu"]').getByRole("menuitem").allInnerTexts();
  expect(items.map((s) => s.trim())).toEqual(["Duplicate", "Bring to front", "Open file", "Reveal in Explorer", "Delete"]);
  await page.getByRole("menuitem", { name: "Open file" }).click();
  expect(await fsLog(page)).toContain(`open ${WIDE}`);
  await nodeEls(page).first().click({ button: "right", position: { x: 100, y: 100 } });
  await page.getByRole("menuitem", { name: "Reveal in Explorer" }).click();
  expect(await fsLog(page)).toContain(`reveal ${WIDE}`);
});

const pasteImage = (page: Page, bytes: number[], type = "image/png") =>
  page.evaluate(([b, t]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b as number[])], "clip.png", { type: t as string }));
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [bytes, type] as const);

test("S-883 Ctrl+V 에 이미지가 있으면 Screenshots 사본으로 저장하고 보이는 화면 가운데에 놓는다", async ({ page }) => {
  await seed(page);
  await page.mouse.click(1300, 100); // 빈 캔버스(보드 포커스)
  await pasteImage(page, png(200, 100));
  await expect(nodeEls(page)).toHaveCount(1);
  const log = await fsLog(page);
  const saved = log.filter((l) => new RegExp(`^save ${SHOTS}/shot-\\d{8}-\\d{6}\\.png$`).test(l)); // 명세 S-883: %APPDATA%/com.symvibe.win/Screenshots
  expect(saved).toHaveLength(1);
  const [n] = await imgs(page);
  expect(n!.path).toBeUndefined();
  expect(n!.shot).toMatch(/^shot-\d{8}-\d{6}\.png$/); // S-881: shot = 파일 이름
  expect(saved[0]).toBe(`save ${SHOTS}/${n!.shot}`);
  expect(n).toMatchObject({ nw: 200, nh: 100, w: 460, h: 230 });
  const b = await box(page);
  expect(Math.abs(b.x + b.width / 2 - 700)).toBeLessThan(2); // 가운데
  expect(Math.abs(b.y + b.height / 2 - 450)).toBeLessThan(2);
  await expect(page.getByTestId("image-img")).toBeVisible();
});

test("S-883 이미지 없는 paste 는 기존 노드 붙여넣기(S-026)", async ({ page }) => {
  await seed(page, [NODE()]);
  await nodeEls(page).first().click({ position: { x: 100, y: 100 } });
  await page.keyboard.press("Control+c");
  await page.evaluate(() => document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true })));
  await expect(nodeEls(page)).toHaveCount(2);
  await page.keyboard.press("Control+v"); // 진짜 키 입력(빈 시스템 클립보드)도 같다
  await expect(nodeEls(page)).toHaveCount(3);
  expect((await fsLog(page)).filter((l) => l.startsWith("save"))).toEqual([]);
});

test("S-885 이미지를 선택하면 위쪽 가운데에 Markup pill", async ({ page }) => {
  await seed(page, [NODE()]);
  await expect(page.getByTestId("image-markup")).toHaveCount(0); // 선택 전에는 없음
  await nodeEls(page).first().click({ position: { x: 100, y: 100 } });
  const pill = page.getByTestId("image-markup");
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText(/Markup/);
  const p = (await pill.boundingBox())!, b = await box(page);
  expect(p.y + p.height).toBeLessThanOrEqual(b.y + 1); // 이미지 위쪽
  expect(Math.abs(p.x + p.width / 2 - (b.x + b.width / 2))).toBeLessThan(3); // 가운데
  await page.mouse.click(1300, 100);
  await expect(pill).toHaveCount(0);
});

async function openMarkup(page: Page) {
  await nodeEls(page).first().click({ position: { x: 100, y: 100 } });
  await page.getByTestId("image-markup").click();
  const dlg = page.getByRole("dialog", { name: "Markup" });
  await expect(dlg).toBeVisible();
  return dlg;
}
async function drag(page: Page, a: [number, number], b: [number, number]) {
  const c = (await page.getByTestId("mk-canvas").boundingBox())!;
  await page.mouse.move(c.x + c.width * a[0], c.y + c.height * a[1]);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width * ((a[0] + b[0]) / 2), c.y + c.height * ((a[1] + b[1]) / 2), { steps: 4 });
  await page.mouse.move(c.x + c.width * b[0], c.y + c.height * b[1], { steps: 4 });
  await page.mouse.up();
}
const count = (page: Page) => page.getByTestId("mk-canvas").getAttribute("data-count");

test("S-886 편집창: 도구 7 · 색 8 · 굵기 4 · Clear all · Save markup · Cancel", async ({ page }) => {
  await seed(page, [NODE()]);
  const dlg = await openMarkup(page);
  for (const t of ["arrow", "rectangle", "ellipse", "line", "pen", "highlight", "text"]) await expect(dlg.getByTestId(`mk-tool-${t}`)).toBeVisible();
  await expect(dlg.locator('[data-testid^="mk-tool-"]')).toHaveCount(7);
  await expect(dlg.locator('[data-testid^="mk-color-"]')).toHaveCount(8);
  await expect(dlg.locator('[data-testid^="mk-width-"]')).toHaveCount(4);
  await expect(dlg.getByRole("button", { name: "Clear all" })).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Save markup" })).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Cancel" })).toBeVisible();
  // 원본 해상도 캔버스를 창에 맞춰 축소 표시
  const c = page.getByTestId("mk-canvas");
  expect(await c.evaluate((e) => [(e as HTMLCanvasElement).width, (e as HTMLCanvasElement).height])).toEqual([400, 200]);
  const bb = (await c.boundingBox())!;
  expect(bb.width / bb.height).toBeCloseTo(2, 1);
  expect(bb.width).toBeLessThanOrEqual(1400);
  await dlg.getByTestId("mk-tool-pen").click();
  await expect(dlg.getByTestId("mk-tool-pen")).toHaveAttribute("aria-pressed", "true");
  await expect(dlg.getByTestId("mk-tool-arrow")).toHaveAttribute("aria-pressed", "false");
});

test("S-887 Clear all 은 그린 것 전부, Ctrl+Z 는 마지막 하나", async ({ page }) => {
  await seed(page, [NODE()]);
  await openMarkup(page);
  await page.getByTestId("mk-tool-rectangle").click();
  await drag(page, [0.1, 0.1], [0.4, 0.4]);
  await page.getByTestId("mk-tool-highlight").click();
  await drag(page, [0.2, 0.7], [0.8, 0.72]);
  expect(await count(page)).toBe("2");
  await page.keyboard.press("Control+z");
  expect(await count(page)).toBe("1");
  await page.getByTestId("mk-tool-ellipse").click();
  await drag(page, [0.5, 0.2], [0.9, 0.5]);
  expect(await count(page)).toBe("2");
  await page.getByRole("button", { name: "Clear all" }).click();
  expect(await count(page)).toBe("0");
  expect(await imgs(page)).toHaveLength(1); // 이미지(노드)는 그대로
});

test("S-887·S-888 그리기(화살표·사각형·펜·Text) 후 Save markup → 새 PNG, 노드가 새 그림을 가리킨다, 원본은 그대로, 되돌리기 1단계", async ({ page }) => {
  await seed(page, [NODE()]);
  const before = await fileBytes(page, WIDE);
  const srcBefore = await page.getByTestId("image-img").evaluate((i) => (i as HTMLImageElement).src);
  await openMarkup(page);
  await page.getByTestId("mk-tool-arrow").click();
  await drag(page, [0.1, 0.1], [0.5, 0.5]);
  await page.getByTestId("mk-tool-rectangle").click();
  await drag(page, [0.55, 0.15], [0.9, 0.45]);
  await page.getByTestId("mk-tool-pen").click();
  await drag(page, [0.1, 0.8], [0.6, 0.9]);
  await page.getByTestId("mk-tool-text").click();
  const c = (await page.getByTestId("mk-canvas").boundingBox())!;
  await page.mouse.click(c.x + c.width * 0.7, c.y + c.height * 0.7);
  await page.getByTestId("mk-text-input").fill("6");
  await page.keyboard.press("Enter");
  expect(await count(page)).toBe("4");
  await page.getByRole("button", { name: "Save markup" }).click();
  await expect(page.getByRole("dialog", { name: "Markup" })).toHaveCount(0);
  const [n] = await imgs(page);
  expect(n!.shot).toBe("wide-markup-1.png");
  expect(n!.path).toBeUndefined();
  expect(await fsLog(page)).toContain(`save ${SHOTS}/${n!.shot}`);
  expect((await fileBytes(page, `${SHOTS}/${n!.shot}`))!.length).toBeGreaterThan(50);
  expect(await fileBytes(page, WIDE)).toEqual(before); // 원본 파일 불변
  expect((await fsLog(page)).filter((l) => l.includes(WIDE) && /^(save|copy|trash)/.test(l))).toEqual([]);
  await expect.poll(() => page.getByTestId("image-img").evaluate((i) => (i as HTMLImageElement).src)).not.toBe(srcBefore);
  // 새 그림은 원본 해상도 PNG (400×200)
  const dim = await page.getByTestId("image-img").evaluate((i) => [(i as HTMLImageElement).naturalWidth, (i as HTMLImageElement).naturalHeight]);
  expect(dim).toEqual([400, 200]);
  // 되돌리기 1단계 → 원래 파일을 다시 가리킨다
  await page.mouse.click(1300, 100);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await imgs(page))[0]!.path).toBe(WIDE);
  expect((await imgs(page))[0]!.shot).toBeUndefined();
});

test("S-888 Cancel 과 Esc 는 아무것도 저장하지 않는다", async ({ page }) => {
  await seed(page, [NODE()]);
  await openMarkup(page);
  await page.getByTestId("mk-tool-line").click();
  await drag(page, [0.1, 0.1], [0.8, 0.6]);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Markup" })).toHaveCount(0);
  expect((await imgs(page))[0]).toMatchObject({ path: WIDE });
  await page.getByTestId("image-markup").click(); // 노드는 아직 선택돼 있다
  await page.getByTestId("mk-tool-line").click();
  await drag(page, [0.1, 0.1], [0.8, 0.6]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Markup" })).toHaveCount(0);
  expect((await imgs(page))[0]).toMatchObject({ path: WIDE });
  expect((await imgs(page))[0]!.shot).toBeUndefined();
  expect((await fsLog(page)).filter((l) => l.startsWith("save"))).toEqual([]);
});

test("S-883 옛 보드의 shot 전체 경로도 그대로 읽는다(호환)", async ({ page }) => {
  const OLD = "C:/fake/Pictures/Screenshots/old.png";
  await seed(page, [NODE({ path: undefined, shot: OLD })], { [OLD]: { bytes: png(100, 50) } });
  await expect(page.getByTestId("image-img")).toBeVisible();
});

test("S-883 shot 이 파일 이름이면 앱 데이터 Screenshots 에서 읽는다", async ({ page }) => {
  await seed(page, [NODE({ path: undefined, shot: "shot-20261024-010203.png" })], { [`${SHOTS}/shot-20261024-010203.png`]: { bytes: png(100, 50) } });
  await expect(page.getByTestId("image-img")).toBeVisible();
});
