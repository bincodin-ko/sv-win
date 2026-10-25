import { expect, test, type Page } from "@playwright/test";

// D13 Memory Scan·Refresh (S-1380~S-1388). 가짜 숨은 세션: __fakePty(emit) + __fakeReply(transcript 답), 가짜 IPC: __fakeMemory.
// 가짜 설치: localStorage symvibe.fakeInstalled = ["codex"] (claude 는 늘 설치됨). __askQuietMs = 답이 나온 뒤 조용해야 하는 시간(기본 8초 → 1.5초)
test.use({ actionTimeout: 8000 });
test.setTimeout(60_000);
const REPO = "C:/fake/repo";
type F = { id: string; kind: string; title: string; body: string; scope: "repo" | "all"; at: string; refreshedAt?: string };
const fact = (id: string, p: Partial<F> = {}): F => ({ id, kind: "Commands", title: `Title ${id}`, body: `Body ${id}`, scope: "repo", at: "2026-01-01T00:00:00Z", ...p });
const con = (id: string, x: number, y: number) => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name: `Con ${id}`, agentId: "claude", textSize: null, yolo: false });
const REPLY = JSON.stringify([
  { kind: "Commands", title: "Build", body: "npm run build" },
  { kind: "Gotchas", title: "Windows paths", body: "Use forward slashes" },
  { kind: "Context", title: "Why Tauri", body: "Small installer" },
]);

const seed = async (page: Page, facts: Record<string, F[]> = {}) => {
  const board = JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: REPO }, viewport: { x: 0, y: 0, zoom: 0.5 }, nodes: [con("c1", -760, -400)], groups: [] });
  await page.addInitScript(([b, m]) => {
    (window as any).__symSeed = { boards: { "ws-fake": b } };
    (window as any).__fakeMemory = m;
    (window as any).__askQuietMs = 1500;
    localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(["codex"]));
  }, [board, facts] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await expect(page.getByTestId("console")).toHaveCount(1);
};
const openPanel = async (page: Page) => {
  await page.mouse.click(1300, 100);
  await page.keyboard.press("m");
  await expect(page.getByTestId("memory-panel")).toBeVisible();
};
const stored = (page: Page, k: string) => page.evaluate((key) => ((window as any).__fakeMemory?.[key] ?? []) as F[], k);
const spawnCount = (page: Page) => page.evaluate(() => (window as any).__fakePty.spawns().length as number);
const emit = (page: Page, id: number, text: string) => page.evaluate(([i, t]) => (window as any).__fakePty.emit(i, t), [id, text] as const);
const kills = (page: Page, id: number) => page.evaluate((i) => (window as any).__fakePty.ctl().filter((c: any) => c.id === i && c.op === "kill").length as number, id);
const phase = (page: Page, p: "launch" | "read" | "write") => page.getByTestId(`scan-phase-${p}`);
/** action 이 숨은 세션을 열 때까지 기다려 그 id 를 돌려준다 */
async function startedBy(page: Page, action: () => Promise<void>): Promise<number> {
  const before = await spawnCount(page);
  await action();
  await page.waitForFunction((n) => (window as any).__fakePty.spawns().length > n, before);
  return page.evaluate(() => { const s = (window as any).__fakePty.spawns(); return s[s.length - 1].id as number; });
}
/** 세션이 준비되고 질문이 나간 뒤(= Read 단계) reply 를 심는다 */
async function answer(page: Page, id: number, reply: string) {
  await emit(page, id, "ready\r\n");
  await page.waitForFunction((i) => (window as any).__fakePty.writes(i).at(-1) === "\r", id); // 질문이 나갔다
  await page.evaluate((r) => ((window as any).__fakeReply = r), reply);
}
const startScan = async (page: Page, reply: string) => {
  await page.getByTestId("memory-scan").click();
  const id = await startedBy(page, () => page.getByTestId("scan-go").click());
  await answer(page, id, reply);
  return id;
};
const hoverRefresh = async (page: Page, n = 0) => {
  const row = page.getByTestId("memory-row").nth(n);
  await row.hover();
  return row.getByTestId("memory-refresh");
};

test.describe("스캔 S-1380~S-1388", () => {
  test("S-1380·S-1387 시작 화면: 설치된 Claude·Codex 만, 품질 3종 기본 Balanced, 안내 문구, 고른 에이전트 기억", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await page.getByTestId("memory-scan").click();
    const flow = page.getByTestId("scan-flow");
    await expect(flow).toBeVisible();
    await expect(page.getByTestId("scan-agent-claude")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("scan-agent-codex")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('[data-testid^="scan-agent-"]')).toHaveCount(2); // gemini 등은 없다
    for (const q of ["quick", "balanced", "thorough"]) await expect(page.getByTestId(`scan-quality-${q}`)).toBeVisible();
    await expect(page.getByTestId("scan-quality-balanced")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("scan-hint")).toContainText("about 6 to 14 facts");
    await expect(page.getByTestId("scan-go")).toHaveText("Scan with Claude Code");
    await expect(flow).toContainText("Uses a turn on your Claude plan.");
    await page.getByTestId("scan-agent-codex").click();
    await expect(page.getByTestId("scan-go")).toHaveText("Scan with Codex");
    await expect(flow).toContainText("Uses a turn on your Codex plan.");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}").memoryAgent)).toBe("codex");
    await page.getByTestId("scan-quality-thorough").click();
    await expect(page.getByTestId("scan-quality-thorough")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("scan-back").click(); // 시작 화면 닫기 = 목록으로
    await expect(page.getByTestId("scan-flow")).toHaveCount(0);
  });

  test("S-1381~S-1384 진행 단계 → REVIEW PROPOSALS → Add N → 목록에 생김", async ({ page }) => {
    await seed(page, { [REPO]: [fact("x", { title: "Build" })] });
    await openPanel(page);
    await page.getByTestId("memory-scan").click();
    const id = await startedBy(page, () => page.getByTestId("scan-go").click());
    await expect(page.getByTestId("scan-flow")).toContainText("Scanning with Claude");
    await expect(phase(page, "launch")).toHaveAttribute("data-state", "active");
    await expect(phase(page, "read")).toHaveAttribute("data-state", "todo");
    await emit(page, id, "ready\r\n");
    await expect(phase(page, "launch")).toHaveAttribute("data-state", "done");
    await expect(phase(page, "read")).toHaveAttribute("data-state", "active");
    await page.evaluate((r) => ((window as any).__fakeReply = r), REPLY);
    await expect(phase(page, "write")).toHaveAttribute("data-state", "active");
    await expect(page.getByTestId("scan-flow")).toContainText("REVIEW PROPOSALS");
    const rows = page.getByTestId("scan-proposal");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Build");
    await expect(rows.nth(0)).toContainText("already in memory");
    await expect(rows.nth(0).getByTestId("scan-check")).not.toBeChecked();
    await expect(rows.nth(1).getByTestId("scan-check")).toBeChecked();
    await expect(rows.nth(1)).toContainText("Gotchas");
    await expect(rows.nth(1)).toContainText("Use forward slashes");
    expect((await stored(page, REPO)).length).toBe(1); // 저장 전에는 그대로
    await expect(page.getByTestId("scan-add")).toHaveText("Add 2 to memory");
    await rows.nth(2).getByTestId("scan-check").uncheck();
    await expect(page.getByTestId("scan-add")).toHaveText("Add 1 to memory");
    await rows.nth(2).getByTestId("scan-check").check();
    await page.getByTestId("scan-add").click();
    await expect(page.getByTestId("scan-flow")).toHaveCount(0);
    await expect(page.getByTestId("memory-row")).toHaveCount(3);
    await expect(page.getByTestId("memory-tab-repo")).toHaveText("repo (3)");
    const saved = await stored(page, REPO);
    expect(saved.map((f) => [f.title, f.scope])).toEqual([["Build", "repo"], ["Windows paths", "repo"], ["Why Tauri", "repo"]]);
    expect(await kills(page, id)).toBe(1);
  });

  test("S-1384 Discard 는 저장 없이 목록으로", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await startScan(page, REPLY);
    await expect(page.getByTestId("scan-proposal")).toHaveCount(3);
    await page.getByTestId("scan-discard").click();
    await expect(page.getByTestId("scan-flow")).toHaveCount(0);
    await expect(page.getByTestId("memory-empty")).toBeVisible();
    expect(await stored(page, REPO)).toEqual([]);
  });

  test("S-1382 취소하면 세션을 끄고 저장하지 않는다", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    const id = await startScan(page, REPLY);
    await page.getByTestId("scan-cancel").click();
    await expect(page.getByTestId("scan-flow")).toHaveCount(0);
    await expect.poll(() => kills(page, id)).toBe(1);
    await page.waitForTimeout(2500); // 취소한 뒤 답이 와도 결과 화면이 뜨지 않는다
    await expect(page.getByTestId("scan-flow")).toHaveCount(0);
    expect(await stored(page, REPO)).toEqual([]);
  });

  test("S-1385 막히면 안내와 Open console (콘솔이 하나 더 놓인다)", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await page.getByTestId("memory-scan").click();
    const id = await startedBy(page, () => page.getByTestId("scan-go").click());
    await emit(page, id, "Select login method\r\n");
    await expect(page.getByTestId("scan-error")).toHaveText("Claude needs an answer. Open a console of it, answer, and scan again.");
    await page.getByTestId("scan-open-console").click();
    await expect(page.getByTestId("memory-panel")).toHaveCount(0);
    await expect(page.getByTestId("console")).toHaveCount(2);
  });

  test("S-1383 답을 못 읽으면 오류 문구", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await startScan(page, "nothing useful here");
    await expect(page.getByTestId("scan-error")).toHaveText("No facts came back. Try again or pick another agent.");
  });

  test("S-1388 패널을 닫아도 스캔은 계속되고 다시 열면 진행 화면", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    const id = await startScan(page, REPLY);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("memory-panel")).toHaveCount(0);
    expect(await kills(page, id)).toBe(0); // Esc 는 창만 닫는다
    await page.mouse.click(1300, 100);
    await page.keyboard.press("m");
    await expect(page.getByTestId("scan-flow")).toBeVisible();
  });
});

test.describe("Refresh S-1386", () => {
  test("ok → Still accurate + refreshedAt 갱신", async ({ page }) => {
    await seed(page, { [REPO]: [fact("f1")] });
    await openPanel(page);
    const id = await startedBy(page, async () => void (await (await hoverRefresh(page)).click()));
    await expect(page.getByTestId("refresh-note")).toContainText("Title f1");
    await expect(page.getByTestId("refresh-running")).toBeVisible(); // 스피너
    await answer(page, id, '{"status":"ok"}');
    await expect(page.getByTestId("refresh-note")).toContainText("Still accurate");
    expect((await stored(page, REPO))[0]!.refreshedAt).toBeTruthy();
    expect(await kills(page, id)).toBe(1);
  });

  test("changed → 새 본문과 Update/Keep", async ({ page }) => {
    await seed(page, { [REPO]: [fact("f1")] });
    await openPanel(page);
    let id = await startedBy(page, async () => void (await (await hoverRefresh(page)).click()));
    await answer(page, id, '{"status":"changed","body":"New body"}');
    await expect(page.getByTestId("refresh-note")).toContainText("New body");
    await page.getByTestId("refresh-keep").click();
    await expect(page.getByTestId("refresh-note")).toHaveCount(0);
    expect((await stored(page, REPO))[0]!.body).toBe("Body f1");
    id = await startedBy(page, async () => void (await (await hoverRefresh(page)).click()));
    await answer(page, id, '{"status":"changed","body":"Newer body"}');
    await page.getByTestId("refresh-update").click();
    await expect.poll(async () => (await stored(page, REPO))[0]!.body).toBe("Newer body");
  });

  test("gone → No longer true, Delete 하면 지운다", async ({ page }) => {
    await seed(page, { [REPO]: [fact("f1")] });
    await openPanel(page);
    const id = await startedBy(page, async () => void (await (await hoverRefresh(page)).click()));
    await answer(page, id, '{"status":"gone"}');
    await expect(page.getByTestId("refresh-note")).toContainText("No longer true");
    await page.getByTestId("refresh-delete").click();
    await expect(page.getByTestId("memory-row")).toHaveCount(0);
    expect(await stored(page, REPO)).toEqual([]);
  });

  test("진행 중 취소", async ({ page }) => {
    await seed(page, { [REPO]: [fact("f1")] });
    await openPanel(page);
    const id = await startedBy(page, async () => void (await (await hoverRefresh(page)).click()));
    await page.getByTestId("refresh-cancel").click();
    await expect(page.getByTestId("refresh-note")).toHaveCount(0);
    await expect.poll(() => kills(page, id)).toBe(1);
    expect((await stored(page, REPO))[0]!.refreshedAt).toBeUndefined();
  });
});
