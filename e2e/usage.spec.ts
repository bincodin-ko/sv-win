import { expect, test, type Page } from "@playwright/test";

// D10 Usage pill·popover·리셋 chime. 근거 S-1510~S-1533.
// 가짜: window.__fakeUsage = { screens: {에이전트: 화면 글자}, blocked: [에이전트], fail: [에이전트], calls: [] } — 실제 claude/codex 는 띄우지 않는다.
// 가짜 통계: window.__fakeTokens.stats[agent] (D4). 소리: window.__chimeLog 에 이름이 쌓인다.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const claudeScreen = (pct = 14, week = "Oct 28, 6pm") =>
  [
    " Current session",
    ` ███████                                            ${pct}% used`,
    " Resets 4:09pm (Asia/Seoul)",
    "",
    " Current week (all models)",
    "                                                    9% used",
    ` Resets ${week} (Asia/Seoul)`,
    "",
    " Current week (Fable)",
    "                                                    17% used",
    ` Resets ${week} (Asia/Seoul)`,
  ].join("\n");
const CODEX = "  Monthly limit  [██████░░░░░░░░░░░░░░] 27% used\n                 Resets 08:37 on 14 Sep";
const GEMINI = "Session stats: 12 requests, 3 tool calls";

async function setup(page: Page, o: { pct?: number; installed?: string[]; url?: string } = {}) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(
    ({ screens, installed }) => {
      localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(installed));
      const w = window as any;
      w.__chimeLog = [];
      w.__fakeUsage = { screens, blocked: [], fail: [], calls: [] };
      // Rust usage_stats 계약: 활동 있는 날만(level 1~4), 3일에 하루
      const days = Array.from({ length: 122 }, (_, i) => {
        const d = new Date(Date.now() - (364 - i * 3) * 86400000);
        return { date: d.toISOString().slice(0, 10), level: (i % 4) + 1 };
      });
      const st = (x: object) => ({ favoriteModel: "fable", totalTokens: 1234567, sessions: 42, activeDays: 30, spanDays: 90, mostActiveDay: "2026-10-01", longestStreak: 7, lifetime: 9876543, peak: 555000, streakCurrent: 3, streakBest: 12, longestTaskSecs: 4320, heat: days, ...x });
      w.__fakeTokens = { stats: { claude: st({}), codex: st({}) } };
    },
    {
      screens: { claude: claudeScreen(o.pct ?? 14, `${MON[(new Date().getMonth() + 3) % 12]} 15, 6pm`), codex: CODEX, gemini: GEMINI },
      installed: o.installed ?? ["codex", "gemini"],
    },
  );
  await page.goto(o.url ?? "/");
  await expect(page.getByTestId("usage-pill")).toBeVisible();
}
const panel = (p: Page) => p.getByTestId("usage-panel");
const calls = (p: Page) => p.evaluate(() => (window as any).__fakeUsage.calls as string[]);
const fake = (p: Page, fn: string) => p.evaluate(`(() => { const f = window.__fakeUsage; ${fn} })()`);

test.describe("pill (S-1510)", () => {
  test("확인 전에는 'usage', 상단 바에서 needs you 다음·Tools 앞", async ({ page }) => {
    await setup(page);
    await expect(page.getByTestId("usage-pill")).toContainText("usage");
    const x = async (id: string) => (await page.getByTestId(id).boundingBox())!.x;
    const [a, b, c] = [await x("needs-you-slot"), await x("usage-pill"), await x("tools-btn")];
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(await calls(page)).toEqual([]); // 앱을 켜도 가짜 모드에선 저절로 확인하지 않는다
  });
  test("클릭하면 popover 가 열리고 확인 뒤 'resets 4:09pm' + CLI 첫 글자, 다시 클릭하면 닫힌다", async ({ page }) => {
    await setup(page);
    await page.getByTestId("usage-pill").click();
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId("usage-pill")).toContainText("resets 4:09pm");
    await expect(page.getByTestId("usage-pill-badge")).toHaveText("C");
    await page.getByTestId("usage-pill").click();
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByTestId("usage-pill")).toContainText("resets 4:09pm"); // 결과는 메모리에 남는다
  });
  test("75% 이상이면 amber 점, 90% 이상이면 red 점, 그 아래는 점 없음", async ({ page }) => {
    await setup(page, { pct: 74 });
    await page.getByTestId("usage-pill").click();
    await expect(page.getByTestId("usage-pill")).toContainText("resets");
    await expect(page.getByTestId("usage-pill-dot")).toHaveCount(0);
    await fake(page, `f.screens.claude = f.screens.claude.replace("74% used", "75% used")`);
    await page.getByTestId("usage-refresh").click();
    await expect(page.getByTestId("usage-pill-dot")).toHaveAttribute("data-level", "amber");
    await fake(page, `f.screens.claude = f.screens.claude.replace("75% used", "90% used")`);
    await page.getByTestId("usage-refresh").click();
    await expect(page.getByTestId("usage-pill-dot")).toHaveAttribute("data-level", "red");
  });
  test("홈 화면에서는 상단 바와 같이 안 보인다", async ({ page }) => {
    await setup(page);
    await page.evaluate(() => (window as any).__shell.home());
    await expect(page.getByTestId("usage-pill")).toHaveCount(0);
  });
});

test.describe("popover (S-1511~S-1516·S-1523)", () => {
  test("제목·탭(설치된 지원 CLI만)·아이콘·기본 에이전트 탭", async ({ page }) => {
    await setup(page);
    await page.getByTestId("usage-pill").click();
    await expect(page.getByTestId("usage-title")).toHaveText("usage");
    expect(await page.locator('[data-testid^="usage-tab-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).toEqual(["usage-tab-claude", "usage-tab-codex", "usage-tab-gemini"]); // shell·grok 은 지원 밖
    await expect(page.getByTestId("usage-tab-claude")).toHaveAttribute("aria-selected", "true");
    for (const id of ["usage-raw-toggle", "usage-view-tokens", "usage-view-accounts", "usage-refresh", "usage-close"]) await expect(page.getByTestId(id)).toBeVisible();
  });
  test("Claude 해석 뷰: 게이지 + 막대 + 히트맵 + 통계 줄", async ({ page }) => {
    await setup(page);
    await page.getByTestId("usage-pill").click();
    const g = page.getByTestId("usage-gauge");
    await expect(g).toContainText("14% used");
    await expect(g).toContainText("Current session");
    await expect(g).toContainText("Resets 4:09pm");
    const bars = page.getByTestId("usage-bar");
    await expect(bars).toHaveCount(2);
    await expect(bars.nth(0)).toContainText("Current week (all models)");
    await expect(bars.nth(0)).toContainText("9%");
    await expect(bars.nth(1)).toContainText("Current week (Fable)");
    await expect(bars.nth(1)).toContainText("17%");
    await expect(bars.nth(1)).toContainText("Resets");
    const last = await page.getByTestId("usage-heat-cell").last().getAttribute("title"); // 마지막 활동일 기준 52주 달력
    await expect(page.getByTestId("usage-heat-cell")).toHaveCount(51 * 7 + new Date(`${last}T00:00:00`).getDay() + 1);
    expect(await page.getByTestId("usage-heat-cell").evaluateAll((e) => [...new Set(e.map((x) => x.getAttribute("data-level")))].sort())).toEqual(["0", "1", "2", "3", "4"]);
    const stats = await page.getByTestId("usage-stat").allTextContents();
    await expect(page.getByTestId("usage-stat").filter({ hasText: "Longest streak" })).toContainText("7d"); // S-1564: 19d 형식
    for (const label of ["Favorite model", "Total tokens", "Sessions", "Active days", "Most active day", "Longest streak"]) expect(stats.some((s) => s.includes(label)), label).toBe(true);
    await expect(page.getByTestId("usage-stat").filter({ hasText: "Active days" })).toContainText("30/90");
    await expect(page.getByTestId("usage-stat").filter({ hasText: "Favorite model" })).toContainText("fable");
  });
  test("75%/90% 막대·게이지 색 단계(data-level)", async ({ page }) => {
    await setup(page, { pct: 92 });
    await page.getByTestId("usage-pill").click();
    await expect(page.getByTestId("usage-gauge")).toHaveAttribute("data-level", "red");
    await expect(page.getByTestId("usage-bar").first()).toHaveAttribute("data-level", "ok");
  });
  test("Codex 탭: 막대 Monthly limit 27% used + 리셋, 통계 Lifetime·Peak·Streak (best)·Longest task, 하단 라벨 /status /usage", async ({ page }) => {
    await setup(page);
    await page.getByTestId("usage-pill").click();
    await page.getByTestId("usage-tab-codex").click();
    const bar = page.getByTestId("usage-bar");
    await expect(bar).toHaveCount(1);
    await expect(bar).toContainText("Monthly limit");
    await expect(bar).toContainText("27% used");
    await expect(bar).toContainText("Resets 08:37 on 14 Sep");
    await expect(page.getByTestId("usage-gauge")).toHaveCount(0);
    for (const label of ["Lifetime", "Peak", "Streak (best)", "Longest task"]) await expect(page.getByTestId("usage-stat").filter({ hasText: label })).toHaveCount(1);
    await expect(page.getByTestId("usage-stat").filter({ hasText: "Streak (best)" })).toContainText("3 (12)");
    await expect(page.getByTestId("usage-stat").filter({ hasText: "Longest task" })).toContainText("1h 12m");
    await expect(page.getByTestId("usage-cmdlabel")).toHaveText("/status /usage");
    expect(await calls(page)).toContain("codex:manual");
  });
  test("터미널 아이콘: 원본 화면 ↔ 해석 뷰, Gemini 는 처음부터 원본 화면", async ({ page }) => {
    await setup(page);
    await page.getByTestId("usage-pill").click();
    await expect(page.getByTestId("usage-gauge")).toBeVisible();
    await page.getByTestId("usage-raw-toggle").click();
    await expect(page.getByTestId("usage-raw")).toContainText("Current week (Fable)");
    expect(await page.getByTestId("usage-raw").evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/mono|consolas|courier/i);
    await expect(page.getByTestId("usage-gauge")).toHaveCount(0);
    await page.getByTestId("usage-raw-toggle").click();
    await expect(page.getByTestId("usage-gauge")).toBeVisible();
    await page.getByTestId("usage-tab-gemini").click();
    await expect(page.getByTestId("usage-raw")).toContainText("12 requests");
    await expect(page.getByTestId("usage-heat-cell")).toHaveCount(0);
  });
  test("풋노트가 맨 아래에 있다", async ({ page }) => {
    await setup(page);
    await page.getByTestId("usage-pill").click();
    await expect(page.getByTestId("usage-footnote")).toHaveText("Snapshots from the CLI. Your provider's dashboard is the source of truth for billing and limits.");
  });
  test("Tokens·Accounts 아이콘은 빈 자리를 렌더하고 usage 로 돌아올 수 있다", async ({ page }) => {
    await setup(page);
    await page.getByTestId("usage-pill").click();
    await page.getByTestId("usage-view-tokens").click();
    await expect(page.getByTestId("usage-gauge")).toHaveCount(0);
    await page.getByTestId("usage-view-accounts").click();
    await expect(page.getByTestId("usage-gauge")).toHaveCount(0);
    await page.getByTestId("usage-view-accounts").click(); // 같은 아이콘을 다시 누르면 usage 로
    await expect(page.getByTestId("usage-gauge")).toBeVisible();
  });
});

test.describe("확인·막힘·닫기 (S-1512·S-1518·S-1519·S-1524)", () => {
  test("열 때 사용자 확인(manual), 30초 안에 다시 열면 확인 안 함, 새로고침은 바로", async ({ page }) => {
    await setup(page);
    await page.getByTestId("usage-pill").click();
    await expect(page.getByTestId("usage-gauge")).toBeVisible();
    expect(await calls(page)).toEqual(["claude:manual"]);
    await page.getByTestId("usage-close").click();
    await expect(panel(page)).toHaveCount(0);
    await page.getByTestId("usage-pill").click();
    await expect(page.getByTestId("usage-gauge")).toBeVisible();
    expect(await calls(page)).toEqual(["claude:manual"]);
    await page.getByTestId("usage-refresh").click();
    await expect.poll(() => calls(page)).toEqual(["claude:manual", "claude:manual"]);
  });
  test("blocked: 안내 문구 + Open console 이 그 CLI 콘솔을 보드에 놓는다", async ({ page }) => {
    await setup(page);
    await fake(page, `f.blocked.push("claude")`);
    await page.getByTestId("usage-pill").click();
    await expect(page.getByTestId("usage-msg")).toHaveText("Claude needs an answer. Open a console of it, answer, and ask again.");
    const before = await page.evaluate(() => (window as any).__fakePty.spawns().length);
    await page.getByTestId("usage-open-console").click();
    await expect.poll(() => page.evaluate(() => (window as any).__fakePty.spawns().length)).toBe(before + 1);
    await expect(page.getByTestId("usage-pill")).toContainText("usage"); // 막힌 결과로는 리셋 시각이 없다
  });
  test("읽기 실패: Couldn't read usage. + 원본 화면만", async ({ page }) => {
    await setup(page);
    await fake(page, `f.fail.push("claude")`);
    await page.getByTestId("usage-pill").click();
    await expect(page.getByTestId("usage-msg")).toHaveText("Couldn't read usage.");
    await expect(page.getByTestId("usage-gauge")).toHaveCount(0);
    await expect(page.getByTestId("usage-raw")).toBeVisible();
  });
  test("Esc(popover 안)·바깥 클릭·X 로 닫힌다", async ({ page }) => {
    await setup(page);
    await page.getByTestId("usage-pill").click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await page.getByTestId("usage-pill").click();
    await expect(panel(page)).toBeVisible();
    await page.mouse.click(300, 600);
    await expect(panel(page)).toHaveCount(0);
  });
  test("S-1524 상태(useUi.usage)가 열리면 popover 가 열리고 기본 에이전트 탭이 선택된다", async ({ page }) => {
    await setup(page, { url: "/?kindsTest" });
    await page.evaluate(() => (window as any).__kt.setUi({ usage: { open: true, view: "usage", agent: "codex" } }));
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId("usage-tab-codex")).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("Settings › General chime (S-1530)", () => {
  const open = async (page: Page) => {
    await page.keyboard.press("Control+,");
    await page.getByRole("tab", { name: "General" }).click();
  };
  test("세 줄: 체크(기본 켜짐)·Play(Only after 100%)·Sound(Glass), 소리 6개, 미리듣기", async ({ page }) => {
    await setup(page);
    await open(page);
    await expect(page.getByLabel("Chime when usage resets")).toBeChecked();
    await expect(page.getByTestId("chime-play")).toHaveValue("only100");
    expect(await page.getByTestId("chime-play").locator("option").allTextContents()).toEqual(["Only after 100%", "Always"]);
    await expect(page.getByTestId("chime-sound")).toHaveValue("Glass");
    expect(await page.getByTestId("chime-sound").locator("option").allTextContents()).toEqual(["Glass", "Ping", "Tink", "Pop", "Purr", "Submarine"]);
    await page.getByTestId("chime-sound").selectOption("Pop");
    await page.getByTestId("chime-preview").click();
    expect(await page.evaluate(() => (window as any).__chimeLog)).toEqual(["Pop"]);
  });
  test("바꾼 값이 저장되고 새로고침 뒤에도 유지된다", async ({ page }) => {
    await setup(page);
    await open(page);
    await page.getByLabel("Chime when usage resets").uncheck();
    await page.getByTestId("chime-play").selectOption("always");
    await page.getByTestId("chime-sound").selectOption("Submarine");
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}"));
    await expect.poll(saved).toMatchObject({ usageChime: false, chimePlay: "always", chimeSound: "Submarine" });
    await page.reload();
    await expect(page.getByTestId("usage-pill")).toBeVisible();
    await open(page);
    await expect(page.getByLabel("Chime when usage resets")).not.toBeChecked();
    await expect(page.getByTestId("chime-play")).toHaveValue("always");
    await expect(page.getByTestId("chime-sound")).toHaveValue("Submarine");
  });
});
