import { expect, test, type Page } from "@playwright/test";

// D11 Tokens 화면. 근거 S-1570~S-1576. 가짜: window.__fakeTokens.scan (D4 tokensApi). 실제 로그는 읽지 않는다.
const ymd = (back: number) => {
  const d = new Date(Date.now() - back * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const row = (back: number, agent: string, total: number, output = total / 10) => ({ date: ymd(back), agent, input: total / 4, output, cacheRead: total / 2, cacheWrite: 0, total, inOut: total / 4 + total / 10 });
const rows = [row(3, "claude", 3000000), row(5, "claude", 1000000, 400000), row(5, "codex", 1000000), row(60, "codex", 5000000)];
const stats = { claude: { models: {}, sessions: 1, activeDates: [], longestSessionSecs: 0 } };

async function open(page: Page, scan: unknown) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript((s) => {
    localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(["codex", "gemini"]));
    (window as any).__fakeUsage = { screens: { claude: " Current session\n 14% used\n Resets 4:09pm (Asia/Seoul)" }, blocked: [], fail: [], calls: [] };
    const scan = s === "pending" ? new Promise(() => {}) : s === "reject" ? Promise.reject(new Error("read failed")) : s;
    if (s === "reject") (scan as Promise<unknown>).catch(() => {});
    (window as any).__fakeTokens = { scan };
  }, scan);
  await page.goto("/");
  await page.getByTestId("usage-pill").click();
  await page.getByTestId("usage-view-tokens").click();
}
const heights = (p: Page) => p.getByTestId("tokens-bar").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));

test("차트 아이콘 -> tokens 제목, 읽는 동안 문구, 뒤로 가면 usage (S-1570)", async ({ page }) => {
  await open(page, "pending"); // 끝나지 않는 읽기
  await expect(page.getByTestId("tokens-title")).toHaveText("tokens");
  await expect(page.getByTestId("tokens-loading")).toHaveText("Reading local session logs…");
  await page.getByTestId("tokens-back").click();
  await expect(page.getByTestId("tokens-view")).toHaveCount(0);
  await expect(page.getByTestId("usage-view-tokens")).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("usage-view-tokens").click();
  await page.getByTestId("usage-view-tokens").click(); // 아이콘 다시 -> usage
  await expect(page.getByTestId("tokens-title")).toHaveCount(0);
});

test("타일 3개·막대 30개·탭 3종·BY AGENT 토글 (S-1571~S-1573)", async ({ page }) => {
  await open(page, { days: rows, stats, partial: false });
  await expect(page.getByTestId("tile-total")).toContainText("5.0M");
  await expect(page.getByTestId("tile-busiest")).toContainText(new Date(Date.now() - 3 * 86400000).toLocaleString("en-US", { month: "short", day: "numeric" }));
  await expect(page.getByTestId("tile-top")).toContainText("Claude · 80%");
  await expect(page.getByTestId("tokens-bar")).toHaveCount(30);
  const all = await heights(page);
  await page.getByTestId("tokens-mode-output").click();
  await expect(page.getByTestId("tile-total")).toContainText("800K");
  const out = await heights(page);
  expect(out).not.toEqual(all);
  await page.getByTestId("tokens-mode-inOut").click();
  await expect(page.getByTestId("tile-total")).toContainText("1.8M");
  await page.getByTestId("tokens-mode-all").click();
  await expect(page.getByTestId("tokens-agent-claude")).toContainText("4.0M");
  await expect(page.getByTestId("tokens-agent-codex")).toContainText("1.0M");
  await page.getByTestId("tokens-range-all").click();
  await expect(page.getByTestId("tokens-agent-codex")).toContainText("6.0M");
  await expect(page.getByTestId("tokens-agent-bar")).toHaveCount(2);
  await expect(page.getByTestId("tokens-footnote")).toContainText("Not a bill");
  await expect(page.getByTestId("tokens-footnote")).toContainText("Account profiles are not included.");
});

test("로그 없음·partial 문구 (S-1575)", async ({ page }) => {
  await open(page, { days: [], stats: {}, partial: false });
  await expect(page.getByTestId("tokens-empty")).toHaveText("No session logs found.");
  await expect(page.getByTestId("tokens-partial")).toHaveCount(0);
});
test("partial 이면 안내 (S-1575)", async ({ page }) => {
  await open(page, { days: rows, stats, partial: true });
  await expect(page.getByTestId("tokens-partial")).toHaveText("Showing what could be read in 30 s.");
});

test("읽기가 거절되면 영원히 읽는 중이 아니라 오류 문구 (S-1575)", async ({ page }) => {
  await open(page, "reject");
  await expect(page.getByTestId("tokens-error")).toHaveText("Couldn't read local session logs.");
  await expect(page.getByTestId("tokens-loading")).toHaveCount(0);
});
