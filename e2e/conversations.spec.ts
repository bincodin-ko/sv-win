import { expect, test, type Page } from "@playwright/test";

// H2 'All conversations' 화면. 근거 S-2820~S-2833. PW_PORT=1752. 가짜: window.__fakeConvs · __fakeConvsError · __convCalls (H1 ipc.ts).
// 행 testid: conv-row(data-sid, data-selected) · conv-head · 화면 conversations · conv-scroll · conv-search · conv-cli-{all,claude,codex} · conv-group-{folder,date} · conv-place · conv-refresh · conv-close
test.use({ actionTimeout: 5000 });
const A = "C:/w/alpha", B = "C:/w/beta";
type C = { cli: "claude" | "codex"; sessionId: string; cwd: string | null; cwdExists: boolean; title: string; firstPrompt: string; lastAt: number; messages: number; profile: string | null };
const NOW = Date.now();
const mk = (id: string, cwd: string | null, ago: number, o: Partial<C> = {}): C => ({ cli: "claude", sessionId: id, cwd, cwdExists: cwd !== null, title: `title ${id}`, firstPrompt: `first ${id}`, lastAt: NOW - ago, messages: 4, profile: null, ...o });
const SMALL: C[] = [
  mk("s1", A, 1000, { title: "Fix login bug" }),
  mk("s2", B, 2000, { title: "Write docs", cli: "codex" }),
  mk("s3", A, 3000, { title: "Refactor" }),
  mk("s4", null, 4000, { title: "No cwd one" }),
  mk("s5", "C:/w/gone", 5000, { title: "Missing one", cwdExists: false }),
];
const screen = (p: Page) => p.getByTestId("conversations");
const rows = (p: Page) => p.getByTestId("conv-row");

async function homeWith(page: Page, convs: C[]) {
  await page.addInitScript((cv) => {
    (window as any).__symSeed = { repos: { repos: [{ path: "C:/fake/a", name: "alpha", workspaces: [] }], lastRepo: null, lastWorkspace: {} } };
    localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ reopenLastRepo: false }));
    (window as any).__fakeConvs = cv;
  }, convs);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await expect(page.getByTestId("home")).toBeVisible();
}
async function boardWith(page: Page, convs: C[], lang?: "ko") {
  await page.addInitScript(([cv, l]) => {
    (window as any).__fakeConvs = cv;
    if (l) localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ language: l }));
  }, [convs, lang ?? null] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=claude");
  await expect(page.getByTestId("command-bar")).toBeVisible();
  await expect(page.getByTestId("console")).toHaveCount(1);
}

test("S-2820·S-2822: 홈 단추로 열리고 Esc 로 닫히면 홈으로 돌아온다, 상단 바 아래를 덮는다", async ({ page }) => {
  await homeWith(page, SMALL);
  await page.getByTestId("home-conversations").click();
  await expect(screen(page)).toBeVisible();
  const b = (await screen(page).boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(44); // BAR_H
  expect(b.width).toBeGreaterThan(1150);
  await expect(page.getByTestId("conv-search")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(screen(page)).toHaveCount(0);
  await expect(page.getByTestId("home")).toBeVisible();
  await page.getByTestId("home-conversations").click();
  await page.getByTestId("conv-close").click();
  await expect(screen(page)).toHaveCount(0);
});

test("S-2821·S-2822: Tools 메뉴 맨 위 항목과 명령줄 두 가지 말로 열리고, 콘솔은 그대로 돈다", async ({ page }) => {
  await boardWith(page, SMALL);
  await page.getByTestId("tools-btn").click();
  await expect(page.getByRole("menuitem").first()).toHaveText("All conversations");
  await page.getByRole("menuitem", { name: "All conversations", exact: true }).click();
  await expect(screen(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(screen(page)).toHaveCount(0);
  await expect(page.getByTestId("console")).toHaveCount(1);
  for (const phrase of ["conversations", "open all conversations"]) {
    const input = page.getByTestId("bar-input");
    await input.fill(phrase);
    await input.press("Enter");
    await expect(screen(page)).toBeVisible();
    await page.getByTestId("conv-close").click();
    await expect(screen(page)).toHaveCount(0);
  }
});

test("S-2823·S-2831: 목록이 뜨고 다시 열면 지난 목록이 바로 보이며 새로 받는다, 검색 결과가 없으면 안내 글", async ({ page }) => {
  await homeWith(page, SMALL);
  await page.getByTestId("home-conversations").click();
  await expect(rows(page)).toHaveCount(5);
  const n1 = await page.evaluate(() => (window as any).__convCalls);
  await page.keyboard.press("Escape");
  await page.getByTestId("home-conversations").click();
  await expect(rows(page)).toHaveCount(5);
  await expect.poll(() => page.evaluate(() => (window as any).__convCalls)).toBeGreaterThan(n1);
  await page.getByTestId("conv-search").fill("zzzz-nothing");
  await expect(page.getByText("No conversations match")).toBeVisible();
});

test("S-2831: 전체 0개면 No conversations yet", async ({ page }) => {
  await homeWith(page, []);
  await page.getByTestId("home-conversations").click();
  await expect(page.getByText("No conversations yet")).toBeVisible();
});

test("S-2831·S-2823: 읽기 실패면 오류 글 + Refresh 가 다시 부른다", async ({ page }) => {
  await homeWith(page, SMALL);
  await page.evaluate(() => { (window as any).__fakeConvsError = "boom"; });
  await page.getByTestId("home-conversations").click();
  await expect(page.getByText("Couldn't read conversations: boom")).toBeVisible();
  const n = await page.evaluate(() => (window as any).__convCalls);
  await page.evaluate(() => { delete (window as any).__fakeConvsError; });
  await page.getByTestId("conv-refresh").click();
  await expect.poll(() => page.evaluate(() => (window as any).__convCalls)).toBeGreaterThan(n);
  await expect(rows(page)).toHaveCount(5);
});

test("S-2824·S-2825·S-2826: 검색, CLI 칩 개수, 묶기 전환이 다시 열어도 유지", async ({ page }) => {
  await homeWith(page, SMALL);
  await page.getByTestId("home-conversations").click();
  await expect(page.getByTestId("conv-cli-all")).toContainText("5");
  await expect(page.getByTestId("conv-cli-claude")).toContainText("4");
  await expect(page.getByTestId("conv-cli-codex")).toContainText("1");
  await expect(page.getByTestId("conv-head")).toHaveCount(4); // alpha · beta · gone · No folder
  await expect(page.getByTestId("conv-head").last()).toContainText("No folder");
  await page.getByTestId("conv-search").fill("LOGIN");
  await expect(rows(page)).toHaveCount(1);
  await page.getByTestId("conv-search").fill("");
  await page.getByTestId("conv-cli-codex").click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByTestId("conv-cli-all").click();
  await page.getByTestId("conv-group-date").click();
  await expect(page.getByTestId("conv-head")).toHaveCount(1);
  await expect(page.getByTestId("conv-head")).toContainText("Today");
  expect(await page.evaluate(() => localStorage.getItem("symvibe.convGroup"))).toBe("date");
  await page.keyboard.press("Escape");
  await page.getByTestId("home-conversations").click();
  await expect(page.getByTestId("conv-head")).toContainText("Today");
});

test("S-2828: 행에 제목·첫 메시지·CLI·메시지 수가 보이고 없는 폴더는 Folder missing", async ({ page }) => {
  await homeWith(page, SMALL);
  await page.getByTestId("home-conversations").click();
  const r = rows(page).filter({ hasText: "Write docs" });
  await expect(r).toContainText("first s2");
  await expect(r).toContainText("Codex");
  await expect(r).toContainText("4 messages");
  await expect(rows(page).filter({ hasText: "Missing one" })).toContainText("Folder missing");
});

test("S-2829: 가짜 2000개여도 DOM 행은 60 아래이고 끝까지 내리면 마지막 대화가 보인다", async ({ page }) => {
  const many = Array.from({ length: 2000 }, (_, i) => mk(`m${i}`, A, 1000 * (i + 1), { title: `conv number ${i}` }));
  await homeWith(page, many);
  await page.getByTestId("home-conversations").click();
  await expect(rows(page).first()).toBeVisible();
  const dom = () => page.locator('[data-testid="conv-row"], [data-testid="conv-head"]').count();
  expect(await dom()).toBeLessThan(60);
  await page.getByTestId("conv-scroll").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(page.getByText("conv number 1999", { exact: true })).toBeVisible();
  expect(await dom()).toBeLessThan(60);
});

test("S-2830·S-2832: 위아래 키와 Enter 는 고른 대화로 놓기 연결점을 부른다, 폴더 없는 행은 단추 비활성", async ({ page }) => {
  await homeWith(page, SMALL);
  await page.evaluate(async () => {
    const m = await import("/src/conversations/ConversationsScreen.tsx");
    (window as any).__placed = [];
    m.setPlaceHandler((c: any) => (window as any).__placed.push(c.sessionId));
  });
  await page.getByTestId("home-conversations").click();
  await page.keyboard.press("ArrowDown"); // 검색란에서 ↓ = 첫 행 (By folder 첫 묶음 alpha 의 s1)
  await expect(rows(page).first()).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("ArrowDown"); // 같은 묶음 다음 행 s3
  const sel = page.locator('[data-testid="conv-row"][data-selected="true"]');
  await expect(sel).toHaveAttribute("data-sid", "s3");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => (window as any).__placed)).toEqual(["s3"]);
  await page.keyboard.press("ArrowUp");
  await expect(sel).toHaveAttribute("data-sid", "s1");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown"); // 머리줄(beta)을 건너 뛰어 s2
  await expect(sel).toHaveAttribute("data-sid", "s2");
  await rows(page).filter({ hasText: "Write docs" }).dblclick();
  expect(await page.evaluate(() => (window as any).__placed)).toEqual(["s3", "s2"]);
  await page.getByTestId("conv-place").click();
  expect(await page.evaluate(() => (window as any).__placed)).toEqual(["s3", "s2", "s2"]);
  await rows(page).filter({ hasText: "No cwd one" }).click();
  await expect(page.getByTestId("conv-place")).toBeDisabled();
  await expect(page.getByTestId("conv-place")).toHaveAttribute("title", "This conversation has no folder");
  await page.keyboard.press("Enter");
  await rows(page).filter({ hasText: "Missing one" }).click();
  await expect(page.getByTestId("conv-place")).toBeDisabled();
  await expect(page.getByTestId("conv-place")).toHaveAttribute("title", "The original folder is missing, so this conversation can't be resumed");
  expect(await page.evaluate(() => (window as any).__placed)).toEqual(["s3", "s2", "s2"]); // 비활성이면 부르지 않는다
});

test("S-2821·S-2833: 한국어 — 모든 대화·폴더별·날짜별·보드에 놓기, 명령줄 '대화 목록'", async ({ page }) => {
  await boardWith(page, SMALL, "ko");
  await page.getByTestId("tools-btn").click();
  await expect(page.getByRole("menuitem").first()).toHaveText("모든 대화");
  await page.keyboard.press("Escape");
  const input = page.getByTestId("bar-input");
  await input.fill("대화 목록");
  await input.press("Enter");
  await expect(screen(page)).toBeVisible();
  await expect(page.getByTestId("conv-group-folder")).toHaveText("폴더별");
  await expect(page.getByTestId("conv-group-date")).toHaveText("날짜별");
  await rows(page).first().click();
  await expect(page.getByTestId("conv-place")).toHaveText("보드에 놓기");
});
