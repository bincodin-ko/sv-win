import { expect, test, type Page } from "@playwright/test";

// D8 Memory 패널·카드·Push (S-1360~S-1377). 가짜 IPC: window.__fakeMemory[repo | "_all"], 가짜 PTY: __fakePty. 저장소 = C:/fake/repo ("repo").
// 줌 0.5, 뷰포트 1400×900. 콘솔 둘(claude) c1·c2 를 시드하고, 카드는 패널의 Place card on board 로 놓는다.
test.use({ actionTimeout: 5000 });
const REPO = "C:/fake/repo";
type F = { id: string; kind: string; title: string; body: string; scope: "repo" | "all"; at: string };
const fact = (id: string, scope: "repo" | "all" = "repo", p: Partial<F> = {}): F => ({ id, kind: "Commands", title: `Title ${id}`, body: `Body ${id}\nsecond line`, scope, at: "2026-01-01T00:00:00Z", ...p });
const con = (id: string, x: number, y: number) => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name: `Con ${id}`, agentId: "claude", textSize: null, yolo: false });
const C1 = con("c1", -760, -400), C2 = con("c2", 40, -400);

const seed = async (page: Page, opts: { facts?: Record<string, F[]>; nodes?: Record<string, unknown>[] } = {}) => {
  const nodes = opts.nodes ?? [C1, C2];
  const board = JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: REPO }, viewport: { x: 0, y: 0, zoom: 0.5 }, nodes, groups: [] });
  await page.addInitScript(([b, m]) => { (window as any).__symSeed = { boards: { "ws-fake": b } }; (window as any).__fakeMemory = m; }, [board, opts.facts ?? {}] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await expect(page.getByTestId("console")).toHaveCount(nodes.filter((n) => n.kind === "console").length);
};
const blank = (page: Page) => page.mouse.click(1300, 100);
const openPanel = async (page: Page) => { await blank(page); await page.keyboard.press("m"); await expect(page.getByTestId("memory-panel")).toBeVisible(); };
const stored = (page: Page, k: string) => page.evaluate((key) => ((window as any).__fakeMemory?.[key] ?? []) as F[], k);
const nodes = (page: Page) => page.evaluate(() => (window as any).__kt.st().nodes as Record<string, any>[]);
const cards = (page: Page) => page.getByTestId("memory-card");
const head = (page: Page, id: string) => page.locator(`[data-node-id="${id}"] [data-node-handle]`);
const emit = (page: Page, id: number, text: string) => page.evaluate(([i, t]) => (window as any).__fakePty.emit(i, t), [id, text] as const);
const writes = (page: Page, id: number) => page.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);
const newMemory = async (page: Page, title: string, body = "") => {
  await page.getByTestId("memory-new").click();
  await page.getByTestId("memory-title").fill(title);
  if (body) await page.getByTestId("memory-body").fill(body);
  await page.getByTestId("memory-save").click();
};

test.describe("패널 S-1360~S-1367", () => {
  test("S-1360 M 키로 열고 제목·부제, Esc·× 로 닫는다 / Tools 로도 열린다", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    const p = page.getByTestId("memory-panel");
    await expect(p).toContainText("Memory");
    await expect(p).toContainText("What your agents should know — pushed from a memory card when you say so");
    await page.keyboard.press("Escape");
    await expect(p).toHaveCount(0);
    await page.getByTestId("memory-panel").count();
    await blank(page); await page.keyboard.press("m");
    await expect(p).toBeVisible();
    await page.getByTestId("memory-close").click();
    await expect(p).toHaveCount(0);
    await page.getByTestId("tools-btn").click();
    await page.getByRole("menuitem", { name: "Memory" }).click();
    await expect(p).toBeVisible();
  });

  test("S-1361·S-1362 탭 둘(폴더 이름 (n) · All repos (n))과 빈 상태", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await expect(page.getByTestId("memory-tab-repo")).toHaveText("repo (0)");
    await expect(page.getByTestId("memory-tab-all")).toHaveText("All repos (0)");
    await expect(page.getByTestId("memory-scan")).toHaveText("Scan repo");
    await expect(page.getByTestId("memory-new")).toHaveText("New memory");
    await expect(page.getByTestId("memory-empty")).toContainText("No memory yet");
    await expect(page.getByTestId("memory-empty-scan")).toHaveText("Scan repo");
    await expect(page.getByTestId("memory-empty-write")).toHaveText("Write memory");
    await page.getByTestId("memory-empty-write").click();
    await expect(page.getByTestId("memory-form")).toBeVisible();
  });

  test("S-1363·S-1367 열 때 파일을 읽어 목록: 종류 라벨·제목·본문 첫 줄 100자", async ({ page }) => {
    const long = "x".repeat(130);
    await seed(page, { facts: { [REPO]: [fact("1"), fact("2", "repo", { kind: "Gotchas", body: long })], _all: [fact("9", "all", { kind: "Context" })] } });
    await openPanel(page);
    await expect(page.getByTestId("memory-tab-repo")).toHaveText("repo (2)");
    await expect(page.getByTestId("memory-tab-all")).toHaveText("All repos (1)");
    const rows = page.getByTestId("memory-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Commands");
    await expect(rows.nth(0)).toContainText("Title 1");
    await expect(rows.nth(0)).toContainText("Body 1");
    await expect(rows.nth(0)).not.toContainText("second line");
    expect(await rows.nth(1).innerText()).toContain("x".repeat(100));
    expect(await rows.nth(1).innerText()).not.toContain("x".repeat(101));
    expect(await rows.nth(0).getByTestId("memory-kind").evaluate((e) => getComputedStyle(e).color)).not.toBe(await rows.nth(1).getByTestId("memory-kind").evaluate((e) => getComputedStyle(e).color));
    await page.getByTestId("memory-tab-all").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("Title 9");
    await rows.nth(0).hover();
    await expect(rows.nth(0).getByTestId("memory-refresh")).toBeVisible(); // 호버하면 Refresh
  });

  test("S-1364·S-1366 New memory: 종류 6칩·기본 Context·제목이 비면 Save 비활성 → 저장하면 목록과 탭 개수·파일", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await page.getByTestId("memory-new").click();
    for (const k of ["Architecture", "Structure", "Commands", "Conventions", "Gotchas", "Context"]) await expect(page.getByTestId(`memory-kind-${k}`)).toBeVisible();
    await expect(page.getByTestId("memory-kind-Context")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("memory-scope-repo")).toHaveAttribute("aria-pressed", "true"); // 선택한 탭이 기본 범위
    await expect(page.getByTestId("memory-save")).toBeDisabled();
    await page.getByTestId("memory-title").fill("   ");
    await expect(page.getByTestId("memory-save")).toBeDisabled();
    await page.getByTestId("memory-title").fill("Build");
    await page.getByTestId("memory-kind-Commands").click();
    await page.getByTestId("memory-body").fill("npm run build\nthen test");
    await expect(page.getByTestId("memory-save")).toBeEnabled();
    await page.getByTestId("memory-save").click();
    await expect(page.getByTestId("memory-row")).toHaveCount(1);
    await expect(page.getByTestId("memory-tab-repo")).toHaveText("repo (1)");
    const saved = await stored(page, REPO);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ kind: "Commands", title: "Build", body: "npm run build\nthen test", scope: "repo" });
    // All repos 탭에서 만들면 기본 범위가 All
    await page.getByTestId("memory-tab-all").click();
    await page.getByTestId("memory-new").click();
    await expect(page.getByTestId("memory-scope-all")).toHaveAttribute("aria-pressed", "true");
  });

  test("S-1366 범위를 바꿔 저장하면 repo 파일에서 _all 로 옮겨 간다 / 편집 중 닫으면 버림", async ({ page }) => {
    await seed(page, { facts: { [REPO]: [fact("1"), fact("2")] } });
    await openPanel(page);
    await page.getByTestId("memory-row").first().click();
    await page.getByTestId("memory-scope-all").click();
    await page.getByTestId("memory-save").click();
    await expect(page.getByTestId("memory-tab-repo")).toHaveText("repo (1)");
    await expect(page.getByTestId("memory-tab-all")).toHaveText("All repos (1)");
    expect((await stored(page, REPO)).map((f) => f.id)).toEqual(["2"]);
    expect((await stored(page, "_all")).map((f) => f.id)).toEqual(["1"]);
    // 편집 중 닫기 → 저장 안 됨, 다시 열면 폼이 아니라 목록
    await page.getByTestId("memory-row").first().click();
    await page.getByTestId("memory-title").fill("CHANGED");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("memory-panel")).toHaveCount(0);
    expect((await stored(page, REPO))[0]!.title).toBe("Title 2");
    await openPanel(page);
    await expect(page.getByTestId("memory-form")).toHaveCount(0);
  });

  test("S-1365 Delete 는 두 번: 첫 클릭 'Delete?', 3초 뒤 원래대로, 두 번째 클릭에 파일에서 바로 빠진다", async ({ page }) => {
    await seed(page, { facts: { [REPO]: [fact("1"), fact("2")] } });
    await openPanel(page);
    await page.getByTestId("memory-row").first().click();
    const del = page.getByTestId("memory-delete");
    await expect(del).toHaveText("Delete");
    await del.click();
    await expect(del).toHaveText("Delete?");
    expect(await stored(page, REPO)).toHaveLength(2);
    await expect(del).toHaveText("Delete", { timeout: 4500 });
    await del.click();
    await del.click();
    await expect(page.getByTestId("memory-form")).toHaveCount(0);
    expect((await stored(page, REPO)).map((f) => f.id)).toEqual(["2"]);
    await expect(page.getByTestId("memory-tab-repo")).toHaveText("repo (1)");
  });
});

test.describe("카드 S-1368~S-1376", () => {
  test("S-1368 Place card on board: 카드가 놓이고 패널이 닫힌다 / 두 번째는 새로 놓지 않고 그 카드를 선택", async ({ page }) => {
    await seed(page, { facts: { [REPO]: [fact("1")] } });
    await openPanel(page);
    await page.getByTestId("memory-place").click();
    await expect(page.getByTestId("memory-panel")).toHaveCount(0);
    await expect(cards(page)).toHaveCount(1);
    const first = (await nodes(page)).find((n) => n.kind === "memory")!;
    expect(first).toMatchObject({ w: 300, h: 200 });
    await blank(page); // 선택 해제
    await openPanel(page);
    await page.getByTestId("memory-place").click();
    await expect(cards(page)).toHaveCount(1);
    expect((await nodes(page)).filter((n) => n.kind === "memory")).toHaveLength(1);
    expect(await page.evaluate(() => (window as any).__kt.st().selection)).toEqual([first.id]);
  });

  test("S-1369·S-1370 카드 모양과 숫자: 머리줄·보조줄·버튼·wired to 0, 사실을 바꾸면 숫자가 바로 바뀐다 / More › Memory card", async ({ page }) => {
    await seed(page, { facts: { [REPO]: [fact("1")], _all: [fact("9", "all")] } });
    await blank(page);
    await page.mouse.click(100, 120, { button: "right" });
    await page.getByRole("menuitem", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Memory card" }).click();
    await expect(cards(page)).toHaveCount(1);
    const c = cards(page);
    await expect(c.getByTestId("memory-card-title")).toHaveText("Project memory");
    await expect(c.getByTestId("memory-card-sub")).toHaveText("repo · 2 facts");
    await expect(c.getByTestId("memory-card-wire")).toHaveText("Wire");
    await expect(c.getByTestId("memory-card-push")).toHaveText("Push");
    await expect(c.getByTestId("memory-card-open")).toHaveText("Open memory");
    await expect(c.getByTestId("memory-card-wired")).toHaveText("wired to 0");
    await c.getByTestId("memory-card-open").click();
    await expect(page.getByTestId("memory-panel")).toBeVisible();
    await newMemory(page, "More");
    await page.keyboard.press("Escape");
    await expect(c.getByTestId("memory-card-sub")).toHaveText("repo · 3 facts");
  });

  test("S-1370·S-1375 Wire → 콘솔 클릭 → Done: 보라 곡선, wired to N", async ({ page }) => {
    await seed(page, { facts: { [REPO]: [fact("1")] } });
    await openPanel(page);
    await page.getByTestId("memory-place").click();
    const c = cards(page);
    await c.getByTestId("memory-card-wire").click();
    await expect(c.getByTestId("memory-card-wire")).toHaveText("Done");
    await head(page, "c1").click({ position: { x: 100, y: 8 } });
    await head(page, "c2").click({ position: { x: 100, y: 8 } });
    await c.getByTestId("memory-card-wire").click();
    await expect(c.getByTestId("memory-card-wire")).toHaveText("Wire");
    await expect(c.getByTestId("memory-card-wired")).toHaveText("wired to 2");
    const w = page.locator('[data-testid="wire"][data-wire-color="violet"]');
    await expect(w).toHaveCount(2);
    expect(await w.first().evaluate((e) => getComputedStyle(e).stroke)).toBe("rgb(167, 139, 250)"); // --violet
    expect(await w.first().evaluate((e) => e.tagName.toLowerCase())).toBe("path");
  });

  test("S-1371~S-1374 Push: 에이전트 콘솔에만 한 줄, 시작 중은 busy, 결과 줄·lastPush 저장, 새 콘솔은 자동으로 안 받는다", async ({ page }) => {
    await seed(page, { facts: { [REPO]: [fact("1", "repo", { title: "Build", body: "npm run build" })], _all: [fact("9", "all", { kind: "Context", title: "Style", body: "terse" })] } });
    await openPanel(page);
    await page.getByTestId("memory-place").click();
    const c = cards(page);
    await c.getByTestId("memory-card-wire").click();
    await head(page, "c1").click({ position: { x: 100, y: 8 } });
    await head(page, "c2").click({ position: { x: 100, y: 8 } });
    await c.getByTestId("memory-card-wire").click();
    // c1 은 출력이 나와 RUNNING, c2 는 STARTING 그대로(busy)
    await emit(page, 1, "hi");
    await expect(page.getByTestId("console-status").nth(0)).toHaveText("RUNNING", { timeout: 4000 });
    await expect(page.getByTestId("console-status").nth(1)).toHaveText("STARTING");
    await expect(c.getByTestId("memory-card-push")).toHaveAttribute("title", "Push again when you add agents.");
    await c.getByTestId("memory-card-push").click();
    await expect(c.getByTestId("memory-card-result")).toHaveText("Sent to 1 · 1 busy");
    const w1 = await writes(page, 1);
    const line = w1.find((x) => x.startsWith("Background context"))!;
    expect(line).toBe("Background context for this project (not a task). Reply OK when you have read it. - [Commands] Build: npm run build - [Context] Style: terse");
    expect(w1.at(-1)).toBe("\r");
    expect((await writes(page, 2)).some((x) => x.includes("Background context"))).toBe(false);
    const lp = (await nodes(page)).find((n) => n.kind === "memory")!.lastPush;
    expect(lp).toMatchObject({ sent: 1, busy: 1, omitted: 0 });
    // 새 콘솔은 자동 입력 없음
    const before = (await writes(page, 1)).length;
    await page.getByTestId("rail-spawn").click();
    await page.mouse.click(1000, 700);
    await page.waitForTimeout(400);
    expect((await writes(page, 1)).length).toBe(before);
    for (const id of await page.evaluate(() => (window as any).__fakePty.ids() as number[])) if (id > 2) expect((await writes(page, id)).some((x) => x.includes("Background context"))).toBe(false);
  });

  test("S-1372·S-1373 사실이 3,400자를 넘으면 들어가는 만큼만 + '(N more facts not included)' · ' · K left out' / 사실 0개면 Push 비활성", async ({ page }) => {
    const big = fact("1", "repo", { kind: "Context", title: "A", body: "x".repeat(3400 - "- [Context] A: ".length) });
    await seed(page, { facts: { [REPO]: [big, fact("2"), fact("3")] } });
    await openPanel(page);
    await page.getByTestId("memory-place").click();
    const c = cards(page);
    await c.getByTestId("memory-card-wire").click();
    await head(page, "c1").click({ position: { x: 100, y: 8 } });
    await c.getByTestId("memory-card-wire").click();
    await emit(page, 1, "hi");
    await expect(page.getByTestId("console-status").nth(0)).toHaveText("RUNNING", { timeout: 4000 });
    await c.getByTestId("memory-card-push").click();
    await expect(c.getByTestId("memory-card-result")).toHaveText("Sent to 1 · 2 left out");
    const line = (await writes(page, 1)).find((x) => x.startsWith("Background context"))!;
    expect(line.endsWith(" (2 more facts not included)")).toBe(true);
    expect(line).not.toContain("Title 2");
  });

  test("S-1373 대상이 없으면 'Nothing sent'; 사실이 없으면 Push 비활성", async ({ page }) => {
    await seed(page, { facts: {} });
    await openPanel(page);
    await page.getByTestId("memory-place").click();
    await expect(cards(page).getByTestId("memory-card-push")).toBeDisabled();
    await cards(page).getByTestId("memory-card-open").click();
    await newMemory(page, "One");
    await page.keyboard.press("Escape");
    await expect(cards(page).getByTestId("memory-card-push")).toBeEnabled();
    await cards(page).getByTestId("memory-card-push").click();
    await expect(cards(page).getByTestId("memory-card-result")).toHaveText("Nothing sent");
  });

  test("S-1369 지우개 대상: 카드가 지워지고, 되돌리면 돌아온다", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await page.getByTestId("memory-place").click();
    await expect(cards(page)).toHaveCount(1);
    const b = (await cards(page).boundingBox())!;
    await blank(page);
    await page.keyboard.press("e");
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 6, b.y + b.height / 2 + 6);
    await page.mouse.up();
    await expect(cards(page)).toHaveCount(0);
  });

  test("S-1376 복제해도 사실이 카드에 복사되지 않는다(파일이 원본, 카드는 wired·lastPush 만)", async ({ page }) => {
    await seed(page, { facts: { [REPO]: [fact("1")] } });
    await openPanel(page);
    await page.getByTestId("memory-place").click();
    const n = (await nodes(page)).find((x) => x.kind === "memory")!;
    expect(Object.keys(n).sort()).toEqual(["h", "id", "kind", "w", "wired", "x", "y", "z"]);
  });
});

test("S-1353 201개째 저장은 거절되고 목록이 되돌아가며 오류 한 줄이 보인다", async ({ page }) => {
  const many = Array.from({ length: 200 }, (_, i) => fact(`f${i}`, "repo", { title: `T${i}` }));
  await seed(page, { facts: { [REPO]: many } });
  await openPanel(page);
  await newMemory(page, "One too many");
  await expect(page.getByTestId("memory-error")).toContainText("Could not save memory:");
  await expect(page.getByTestId("memory-tab-repo")).toContainText("(200)");
  expect((await stored(page, REPO)).length).toBe(200);
});
