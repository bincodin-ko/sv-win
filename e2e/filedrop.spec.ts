import { expect, test, type Page } from "@playwright/test";

// C15 파일 드롭·위치 선택창·파일 카드 (S-950~S-956). 가짜 창 드롭 window.__dropFiles(paths, {x,y}) (x,y = 창 물리 픽셀),
// 가짜 파일 window.__fakeFiles, 기록 window.__fakeFsLog. 약속한 이름(data-testid):
//   파일 카드  file-card · file-badge(확장자 글자, 폴더는 "DIR") · file-name · file-meta(크기·수정일) · file-path · file-missing("Missing")
//   선택창     role=dialog name "Add files" · 버튼 "Copy into repo" / "Keep original location"
//   시험 읽기  window.__fileNodes(wsId) = 보드의 모든 노드
test.use({ actionTimeout: 5000 });
const REPO = "C:/fake/repo";
const WS = "ws-fake";
const PNG = Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
type Files = Record<string, { text?: string; bytes?: number[]; stat?: { isDir?: boolean; size?: number; mtime?: number } }>;
const FILES = (): Files => ({
  [`${REPO}/src`]: { stat: { isDir: true } },
  [`${REPO}/src/a.ts`]: { text: "const a = 1;" },
  [`${REPO}/empty`]: { stat: { isDir: true } },
  [`${REPO}/README.md`]: { text: "# hi" },
  [`${REPO}/logo.png`]: { bytes: PNG },
  [`${REPO}/tool.exe`]: { bytes: [77, 90, 0, 1, 2], stat: { size: 2048, mtime: new Date(2026, 5, 3, 12, 0).getTime() } },
  [`${REPO}/big.log`]: { text: "x", stat: { size: 900 * 1024 } },
  "D:/ext/note.txt": { text: "outside note" },
  "D:/ext/doc.md": { text: "# outside md" },
  "D:/ext/pic.png": { bytes: PNG },
  "D:/ext/dir": { stat: { isDir: true } },
  "D:/ext/dir2": { stat: { isDir: true } },
});
const boardJson = (nodes: unknown[] = [], viewport = { x: 0, y: 0, zoom: 1 }) => JSON.stringify({
  formatVersion: 1, savedBy: "symvibe-win", workspace: { id: WS, name: "Workspace 1", repoPath: REPO }, viewport, nodes, groups: [],
});
const init = ([b, f]: readonly [string, Files]) => { (window as any).__symSeed = { boards: { "ws-fake": b } }; (window as any).__fakeFiles = f; };
const open = async (page: Page, o: { files?: Files; nodes?: unknown[]; view?: { x: number; y: number; zoom: number } } = {}) => {
  await page.addInitScript(init, [boardJson(o.nodes, o.view), o.files ?? FILES()] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
};
type N = Record<string, any>;
const nodes = (page: Page): Promise<N[]> => page.evaluate((ws) => (window as any).__fileNodes(ws), WS);
const drop = (page: Page, paths: string[], at: { x: number; y: number } = { x: 800, y: 500 }) =>
  page.evaluate(([p, a]) => (window as any).__dropFiles(p, a), [paths, at] as const);
const fsLog = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__fakeFsLog ?? []);
const dialog = (page: Page) => page.getByRole("dialog", { name: "Add files" });
const t = (page: Page, id: string) => page.getByTestId(id);

test.describe("repo 안 경로는 바로 노드 (S-950·S-951·S-953)", () => {
  test("ts → 코드 카드", async ({ page }) => {
    await open(page);
    await drop(page, [`${REPO}/src/a.ts`]);
    await expect(t(page, "code-card")).toBeVisible();
    const [n] = await nodes(page);
    expect(n).toMatchObject({ kind: "code", path: `${REPO}/src/a.ts`, name: "a.ts", text: "const a = 1;" });
    await expect(dialog(page)).toHaveCount(0);
  });
  test("md → Markdown 카드", async ({ page }) => {
    await open(page);
    await drop(page, [`${REPO}/README.md`]);
    await expect(t(page, "md-card")).toBeVisible();
    expect((await nodes(page))[0]).toMatchObject({ kind: "markdown", path: `${REPO}/README.md` });
  });
  test("이미지 → 이미지 노드", async ({ page }) => {
    await open(page);
    await drop(page, [`${REPO}/logo.png`]);
    await expect(t(page, "image-body")).toBeVisible();
    expect((await nodes(page))[0]).toMatchObject({ kind: "image", path: `${REPO}/logo.png` });
  });
  test("바이너리 → 파일 카드(배지·이름·크기·수정일·경로)", async ({ page }) => {
    await open(page);
    await drop(page, [`${REPO}/tool.exe`]);
    await expect(t(page, "file-card")).toBeVisible();
    expect((await nodes(page))[0]).toMatchObject({ kind: "file", path: `${REPO}/tool.exe` });
    await expect(t(page, "file-badge")).toHaveText("EXE");
    await expect(t(page, "file-name")).toHaveText("tool.exe");
    await expect(t(page, "file-meta")).toContainText("2 KB");
    await expect(t(page, "file-meta")).toContainText("2026-06-03");
    await expect(t(page, "file-path")).toHaveText(`${REPO}/tool.exe`);
    const b = (await page.locator("[data-node-id]").first().boundingBox())!;
    expect([Math.round(b.width), Math.round(b.height)]).toEqual([240, 120]); // 기본 크기 = 추측
  });
  test("800KB 초과 글 파일 → 파일 카드", async ({ page }) => {
    await open(page);
    await drop(page, [`${REPO}/big.log`]);
    await expect.poll(async () => (await nodes(page))[0]?.kind).toBe("file");
  });
  test("폴더 → 탐색기 카드, 텍스트가 없는 폴더 → 파일 카드(폴더 배지)", async ({ page }) => {
    await open(page);
    await drop(page, [`${REPO}/src`], { x: 500, y: 300 });
    await expect(t(page, "explorer-card")).toBeVisible();
    expect((await nodes(page))[0]).toMatchObject({ kind: "explorer", dir: `${REPO}/src`, files: [`${REPO}/src/a.ts`] });
    await drop(page, [`${REPO}/empty`], { x: 1100, y: 700 });
    await expect(t(page, "file-card")).toBeVisible();
    expect((await nodes(page)).find((n) => n.kind === "file")).toMatchObject({ path: `${REPO}/empty`, isDir: true });
    await expect(t(page, "file-badge")).toHaveText("DIR");
  });
  test("경로의 \\ 와 대소문자가 달라도 repo 안으로 본다", async ({ page }) => {
    const f = FILES();
    f["c:\\FAKE\\repo\\src\\a.ts"] = { text: "const b = 2;" };
    await open(page, { files: f });
    await drop(page, ["c:\\FAKE\\repo\\src\\a.ts"]);
    await expect(t(page, "code-card")).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
  });
});

test.describe("repo 밖 경로는 선택창 (S-951·S-952)", () => {
  test("선택창이 뜨고 고르기 전에는 아무것도 놓이지 않는다", async ({ page }) => {
    await open(page);
    await drop(page, ["D:/ext/note.txt"]);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "Copy into repo" })).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "Keep original location" })).toBeVisible();
    expect(await nodes(page)).toHaveLength(0);
  });
  test("repo 안과 밖이 섞이면 선택창", async ({ page }) => {
    await open(page);
    await drop(page, [`${REPO}/src/a.ts`, "D:/ext/note.txt"]);
    await expect(dialog(page)).toBeVisible();
    expect(await nodes(page)).toHaveLength(0);
  });
  test("Copy into repo → repo 맨 위로 복사하고 그 경로로 노드", async ({ page }) => {
    await open(page);
    await drop(page, ["D:/ext/note.txt"]);
    await dialog(page).getByRole("button", { name: "Copy into repo" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(t(page, "code-card")).toBeVisible();
    expect(await fsLog(page)).toContain(`copy D:/ext/note.txt -> ${REPO}/note.txt`);
    expect((await nodes(page))[0]).toMatchObject({ kind: "code", path: `${REPO}/note.txt`, text: "outside note" });
  });
  test("이름이 있으면 -2, -3 (덮어쓰지 않음)", async ({ page }) => {
    const f = FILES();
    f[`${REPO}/pic.png`] = { bytes: PNG };
    f[`${REPO}/pic-2.png`] = { bytes: PNG };
    await open(page, { files: f });
    await drop(page, ["D:/ext/pic.png"]);
    await dialog(page).getByRole("button", { name: "Copy into repo" }).click();
    await expect(t(page, "image-body")).toBeVisible();
    expect((await nodes(page))[0]).toMatchObject({ kind: "image", path: `${REPO}/pic-3.png` });
  });
  test("복사한 .md 는 repo 안 파일이 되어 Markdown 카드", async ({ page }) => {
    await open(page);
    await drop(page, ["D:/ext/doc.md"]);
    await dialog(page).getByRole("button", { name: "Copy into repo" }).click();
    await expect(t(page, "md-card")).toBeVisible();
    expect((await nodes(page))[0]).toMatchObject({ kind: "markdown", path: `${REPO}/doc.md` });
  });
  test("Keep original location → 원래 경로, 복사 안 함, 밖의 .md 는 코드 카드", async ({ page }) => {
    await open(page);
    await drop(page, ["D:/ext/note.txt", "D:/ext/doc.md"]);
    await dialog(page).getByRole("button", { name: "Keep original location" }).click();
    await expect(t(page, "code-card")).toHaveCount(2);
    const ns = await nodes(page);
    expect(ns.map((n) => n.path).sort()).toEqual(["D:/ext/doc.md", "D:/ext/note.txt"]);
    expect(ns.every((n) => n.kind === "code")).toBe(true);
    expect((await fsLog(page)).filter((l) => l.startsWith("copy"))).toHaveLength(0);
  });
  test("폴더만 있으면 Copy 항목이 없다(위치 그대로)", async ({ page }) => {
    await open(page);
    await drop(page, ["D:/ext/dir", "D:/ext/dir2"]);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "Copy into repo" })).toHaveCount(0);
    await dialog(page).getByRole("button", { name: "Keep original location" }).click();
    await expect.poll(async () => (await nodes(page)).length).toBe(2);
    expect((await nodes(page)).map((n) => n.path ?? n.dir).sort()).toEqual(["D:/ext/dir", "D:/ext/dir2"]);
  });
  test("폴더가 섞인 Copy: 파일만 복사하고 폴더는 그 자리", async ({ page }) => {
    await open(page);
    await drop(page, ["D:/ext/note.txt", "D:/ext/dir"]);
    await dialog(page).getByRole("button", { name: "Copy into repo" }).click();
    await expect.poll(async () => (await nodes(page)).length).toBe(2);
    expect(await fsLog(page)).toEqual([`copy D:/ext/note.txt -> ${REPO}/note.txt`]);
    expect((await nodes(page)).map((n) => n.path).sort()).toEqual(["D:/ext/dir", `${REPO}/note.txt`].sort());
  });
  test("Esc 로 닫으면 아무것도 안 놓이고 복사도 안 한다", async ({ page }) => {
    await open(page);
    await drop(page, ["D:/ext/note.txt"]);
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    expect(await nodes(page)).toHaveLength(0);
    expect(await fsLog(page)).toHaveLength(0);
  });
  test("바깥 클릭으로 닫아도 같다", async ({ page }) => {
    await open(page);
    await drop(page, ["D:/ext/note.txt"]);
    await expect(dialog(page)).toBeVisible();
    await page.mouse.click(5, 450);
    await expect(dialog(page)).toHaveCount(0);
    expect(await nodes(page)).toHaveLength(0);
  });
});

test.describe("여러 개·되돌리기·홈·숨은 보드 (S-950·S-954)", () => {
  test("여러 개를 한 번에 놓으면 겹치지 않고, Ctrl+Z 한 번에 모두 사라진다", async ({ page }) => {
    await open(page);
    await drop(page, [`${REPO}/src/a.ts`, `${REPO}/README.md`, `${REPO}/logo.png`, `${REPO}/tool.exe`, `${REPO}/src`]);
    await expect.poll(async () => (await nodes(page)).length).toBe(5);
    const ns = await nodes(page);
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i]!, b = ns[j]!;
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${a.id}/${b.id}`).toBe(false);
    }
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await nodes(page)).length).toBe(0);
  });
  test("하나를 놓은 것도 Ctrl+Z 한 번에 사라진다", async ({ page }) => {
    await open(page);
    await drop(page, [`${REPO}/tool.exe`]);
    await expect(t(page, "file-card")).toBeVisible();
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await nodes(page)).length).toBe(0);
  });
  test("홈 화면에서의 드롭: 폴더 추가(회귀)는 그대로, 파일 드롭은 무시(숨은 보드)", async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__shell.showHome());
    await expect(page.getByTestId("home")).toBeVisible();
    await drop(page, [`${REPO}/src/a.ts`]);
    await page.evaluate(() => (window as any).__dropFolders(["D:/proj/hello"]));
    await expect(page.getByTestId("repo-row").filter({ hasText: "hello" })).toHaveCount(1);
    expect(await nodes(page)).toHaveLength(0);
    await expect(dialog(page)).toHaveCount(0);
    await drop(page, ["D:/ext/note.txt"]); // 밖 경로여도 선택창이 없다
    await expect(dialog(page)).toHaveCount(0);
  });
  test("보드가 보일 때의 파일 드롭은 폴더 추가를 만들지 않는다", async ({ page }) => {
    await open(page);
    await drop(page, [`${REPO}/src`]);
    await expect(t(page, "explorer-card")).toBeVisible();
    await page.evaluate(() => (window as any).__shell.showHome());
    await expect(page.getByTestId("repo-row").filter({ hasText: "src" })).toHaveCount(0);
  });
});

test.describe("놓은 위치 → 월드 좌표 (S-950)", () => {
  const worldOf = async (page: Page, px: number, py: number, v: { x: number; y: number; zoom: number }) => {
    const r = (await page.getByTestId("board").boundingBox())!;
    return { x: (px - (r.x + r.width / 2) - v.x) / v.zoom, y: (py - (r.y + r.height / 2) - v.y) / v.zoom };
  };
  for (const v of [{ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0, zoom: 2 }, { x: -120, y: 80, zoom: 1 }, { x: 150, y: -60, zoom: 2 }]) {
    test(`줌 ${v.zoom} 팬 (${v.x}, ${v.y}): 놓은 점이 노드 왼쪽 위`, async ({ page }) => {
      await open(page, { view: v });
      await drop(page, [`${REPO}/tool.exe`], { x: 800, y: 500 });
      await expect(t(page, "file-card")).toBeVisible();
      const want = await worldOf(page, 800, 500, v);
      const [n] = await nodes(page);
      expect(n!.x).toBeCloseTo(want.x, 0);
      expect(n!.y).toBeCloseTo(want.y, 0);
      const b = (await page.locator("[data-node-id]").first().boundingBox())!; // 화면에서도 그 점
      expect(b.x).toBeCloseTo(800, -1);
      expect(b.y).toBeCloseTo(500, -1);
    });
  }
  test("화면 배율 2: 물리 픽셀을 나눠 쓴다", async ({ browser }) => {
    const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await open(page);
    await drop(page, [`${REPO}/tool.exe`], { x: 1600, y: 1000 }); // 물리 → 창 (800, 500)
    await expect(t(page, "file-card")).toBeVisible();
    const b = (await page.locator("[data-node-id]").first().boundingBox())!;
    expect(b.x).toBeCloseTo(800, -1);
    expect(b.y).toBeCloseTo(500, -1);
    await ctx.close();
  });
});

test.describe("파일 카드 메뉴·Missing (S-955·S-956)", () => {
  const FILE = `${REPO}/tool.exe`;
  const card = (extra: Record<string, unknown> = {}) => ({ id: "file1", kind: "file", x: -120, y: -60, w: 240, h: 120, z: 1, path: FILE, isDir: false, name: "tool.exe", ...extra });
  const right = (page: Page) => page.locator('[data-node-id="file1"]').click({ button: "right", position: { x: 100, y: 60 } });
  test("우클릭에 Open file · Reveal in Explorer (노드 기본 3항목 + 2)", async ({ page }) => {
    await open(page, { nodes: [card()] });
    await right(page);
    const items = (await page.locator('[role="menu"]').getByRole("menuitem").allInnerTexts()).map((s) => s.trim());
    expect(items).toEqual(["Duplicate", "Bring to front", "Open file", "Reveal in Explorer", "Delete"]);
    await page.getByRole("menuitem", { name: "Open file" }).click();
    await right(page);
    await page.getByRole("menuitem", { name: "Reveal in Explorer" }).click();
    expect(await fsLog(page)).toEqual([`open ${FILE}`, `reveal ${FILE}`]);
  });
  test("처음부터 없는 파일은 Missing 과 경로", async ({ page }) => {
    await open(page, { nodes: [card({ path: `${REPO}/gone.bin`, name: "gone.bin" })] });
    await expect(t(page, "file-missing")).toHaveText("Missing");
    await expect(t(page, "file-path")).toHaveText(`${REPO}/gone.bin`);
  });
  test("파일이 사라지면 5초 안에 Missing, 돌아오면 다시 정상", async ({ page }) => {
    await open(page, { nodes: [card()] });
    await expect(t(page, "file-meta")).toContainText("KB");
    await expect(t(page, "file-missing")).toHaveCount(0);
    await page.evaluate((p) => { delete (window as any).__fakeFiles[p]; }, FILE);
    await expect(t(page, "file-missing")).toBeVisible({ timeout: 7000 });
    await page.evaluate((p) => { (window as any).__fakeFiles[p] = { bytes: [1, 2, 3] }; }, FILE);
    await expect(t(page, "file-missing")).toHaveCount(0, { timeout: 7000 });
  });
  test("우클릭하면 5초를 기다리지 않고 다시 확인한다", async ({ page }) => {
    await open(page, { nodes: [card()] });
    await expect(t(page, "file-meta")).toContainText("KB");
    await page.evaluate((p) => { delete (window as any).__fakeFiles[p]; }, FILE);
    await right(page);
    await expect(t(page, "file-missing")).toBeVisible({ timeout: 1500 });
  });
  test("폴더 카드는 DIR 배지, 본문 끌기가 된다", async ({ page }) => {
    await open(page, { nodes: [card({ path: `${REPO}/empty`, isDir: true, name: "empty" })] });
    await expect(t(page, "file-badge")).toHaveText("DIR");
    const el = page.locator('[data-node-id="file1"]');
    const b0 = (await el.boundingBox())!;
    await page.mouse.move(b0.x + 120, b0.y + 60);
    await page.mouse.down();
    await page.mouse.move(b0.x + 220, b0.y + 110, { steps: 5 });
    await page.mouse.up();
    const b1 = (await el.boundingBox())!;
    expect(Math.round(b1.x - b0.x)).toBe(100);
    expect(Math.round(b1.y - b0.y)).toBe(50);
  });
});
