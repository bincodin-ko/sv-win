import { expect, test, type Page } from "@playwright/test";

// 5묶음 E5: Markdown 스튜디오 (S-1920~S-1940, S-1939 카드 버튼). 가짜 vault = window.__fakeStudio(경로 → 글, mtimes, memoryDir), 카드·PDF = __fakeFiles·__fakeSavePath·__fakePdf.
// 약속한 이름(data-testid): md-tree · md-row(data-path) · md-search · md-filename · md-tab-reading|source|graph · md-reading · md-source · md-status · md-banner
//   md-add-board · md-export-pdf · md-graph · gnode(data-path) · md-spacing · 카드 md-open-studio · md-pdf
test.use({ actionTimeout: 5000 });
const R = "C:/fake/repo";
const MEM = "C:/fake/mem";
const README = `${R}/README.md`;
const GUIDE = `${R}/docs/guide.md`;
const seed = () => {
  const w = window as any;
  w.__fakeStudio = {
    memoryDir: "C:/fake/mem",
    files: {
      "C:/fake/repo/README.md": "# Hello\n\nSee [guide](docs/guide.md) and [[wiki]].\n",
      "C:/fake/repo/docs/guide.md": "# Guide\n\nback to [home](../README.md)\n",
      "C:/fake/repo/10-last/z.md": "# Z\n",
      "C:/fake/repo/00-overview/intro.md": "# Intro\n",
      "C:/fake/mem/note.md": "# Mem\n",
    },
    mtimes: {},
  };
  w.__fakeFiles = { "C:/fake/repo/README.md": { text: "# Hello\n\nSee [guide](docs/guide.md) and [[wiki]].\n" } };
  w.__fakeSavePath = "C:/fake/out.pdf";
};
const boot = async (p: Page) => {
  await p.addInitScript(seed);
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto("/");
  await expect(p.getByTestId("command-bar")).toBeVisible();
};
const t = (p: Page, id: string) => p.getByTestId(id);
const row = (p: Page, path: string) => p.locator(`[data-testid="md-row"][data-path="${path}"]`);
const openStudio = async (p: Page) => { await t(p, "tools-btn").click(); await p.getByRole("menuitem", { name: "Markdown", exact: true }).click(); await expect(t(p, "studio-frame")).toBeVisible(); };
const disk = (p: Page, path: string, text: string) => p.evaluate(([path, text]) => { const s = (window as any).__fakeStudio; s.files[path] = text; s.mtimes[path] = Math.max(Date.now(), s.mtimes[path] ?? 0) + 5000; }, [path, text] as const);
const diskText = (p: Page, path: string) => p.evaluate((path) => (window as any).__fakeStudio.files[path] as string, path);

test("S-1920~S-1926 열면 제목·Agent memory 먼저·번호 순서·검색·탭", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await expect(t(page, "studio-title")).toHaveText("Markdown — repo");
  const rows = await t(page, "md-row").evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  expect(rows[0]).toContain("Agent memory");
  expect(rows.findIndex((r) => r.includes("00-overview"))).toBeLessThan(rows.findIndex((r) => r.includes("10-last")));
  await expect(t(page, "md-tab-reading")).toHaveAttribute("aria-selected", "true");
  await expect(t(page, "md-export-pdf")).toHaveText("Export PDF");
  await t(page, "md-search").fill("GUIDE");
  await expect(t(page, "md-row")).toHaveCount(1);
  await expect(row(page, GUIDE)).toBeVisible();
  await t(page, "md-search").fill("");
  await expect(row(page, README)).toBeVisible();
  await t(page, "md-tab-graph").click(); // 파일 없이도 그래프가 된다
  await expect(t(page, "md-graph")).toBeVisible();
});

test("S-1922 Agent memory 의 글도 열린다", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await row(page, `${MEM}/note.md`).click();
  await expect(t(page, "md-reading")).toContainText("Mem");
});

test("S-1927 Reading: 상대 링크는 스튜디오 안에서 열고, 위키 링크는 눌리지 않는다", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await row(page, README).click();
  await expect(t(page, "md-filename")).toHaveText("README.md");
  await expect(t(page, "md-reading").locator("h1")).toHaveText("Hello");
  await expect(t(page, "md-reading")).toContainText("[[wiki]]");
  await expect(t(page, "md-reading").locator("a")).toHaveCount(1);
  await t(page, "md-reading").getByRole("link", { name: "guide" }).click();
  await expect(t(page, "md-filename")).toHaveText("guide.md");
  await expect(t(page, "md-reading").locator("h1")).toHaveText("Guide");
});

test("S-1928·S-1929 Source 편집 → 자동 저장 1.5초 → Reading 반영", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await row(page, README).click();
  await t(page, "md-tab-source").click();
  await expect(t(page, "md-source")).toHaveValue(/# Hello/);
  await t(page, "md-source").fill("# Hello 2\n");
  expect(await diskText(page, README)).toContain("# Hello\n"); // 아직 저장 전
  await expect(t(page, "md-status")).toHaveText("Saved", { timeout: 5000 });
  expect(await diskText(page, README)).toBe("# Hello 2\n");
  await t(page, "md-tab-reading").click();
  await expect(t(page, "md-reading").locator("h1")).toHaveText("Hello 2");
});

test("S-1928 Ctrl+S 는 바로 저장", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await row(page, README).click();
  await t(page, "md-tab-source").click();
  await t(page, "md-source").fill("# Now\n");
  await t(page, "md-source").press("Control+s");
  await expect(t(page, "md-status")).toHaveText("Saved", { timeout: 1000 });
  expect(await diskText(page, README)).toBe("# Now\n");
});

test("S-1930 디스크 변경: 고치지 않았으면 조용히 갱신, 고치는 중이면 띠(Reload / Keep mine)", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await row(page, README).click();
  await disk(page, README, "# From agent\n");
  await expect(t(page, "md-reading").locator("h1")).toHaveText("From agent", { timeout: 6000 });
  await expect(t(page, "md-banner")).toHaveCount(0);
  await t(page, "md-tab-source").click();
  await t(page, "md-source").fill("# Mine\n");
  await disk(page, README, "# Other\n");
  await expect(t(page, "md-banner")).toBeVisible({ timeout: 6000 });
  await expect(t(page, "md-status")).toHaveText("Found a change on disk");
  await t(page, "md-banner").getByRole("button", { name: "Reload" }).click();
  await expect(t(page, "md-banner")).toHaveCount(0);
  await expect(t(page, "md-source")).toHaveValue("# Other\n");
});

test("S-1930 Keep mine 은 내 글로 덮어쓴다", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await row(page, README).click();
  await t(page, "md-tab-source").click();
  await t(page, "md-source").fill("# Mine\n");
  await disk(page, README, "# Other\n");
  await expect(t(page, "md-banner")).toBeVisible({ timeout: 6000 });
  await t(page, "md-banner").getByRole("button", { name: "Keep mine" }).click();
  await expect(t(page, "md-status")).toHaveText("Saved", { timeout: 4000 });
  expect(await diskText(page, README)).toBe("# Mine\n");
});

test("S-1931 저장 안 한 초안이 있으면 열 때 복구하고 Recovered unsaved edits", async ({ page }) => {
  await page.addInitScript(() => {
    setTimeout(() => {
      const s = (window as any).__fakeStudio;
      s.drafts = { "c:/fake/repo/readme.md": { path: "C:/fake/repo/README.md", text: "# Draft\n", savedAt: 1, baseMtime: 0 } };
    }, 0);
  });
  await boot(page);
  await openStudio(page);
  await row(page, README).click();
  await expect(t(page, "md-status")).toHaveText("Recovered unsaved edits");
  await t(page, "md-tab-source").click();
  await expect(t(page, "md-source")).toHaveValue("# Draft\n");
});

test("S-1924·S-1925 새 글·이름 바꾸기·복제·휴지통, 지우면 열린 글이 닫힌다(S-1940)", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await t(page, "md-new").click();
  await page.getByRole("menuitem", { name: "Agent memory" }).click();
  await t(page, "md-new-name").fill("idea");
  await t(page, "md-new-name").press("Enter");
  await expect(t(page, "md-filename")).toHaveText("idea.md");
  await expect(t(page, "md-tab-source")).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => Object.keys((window as any).__fakeStudio.files))).toContain(`${MEM}/idea.md`);
  await row(page, GUIDE).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(row(page, `${R}/docs/guide copy.md`)).toBeVisible();
  await row(page, GUIDE).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await t(page, "md-rename").fill("manual");
  await t(page, "md-rename").press("Enter");
  await expect(row(page, `${R}/docs/manual.md`)).toBeVisible();
  await row(page, `${R}/docs/manual.md`).click();
  await expect(t(page, "md-filename")).toHaveText("manual.md");
  await row(page, `${R}/docs/manual.md`).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to Recycle Bin" }).click();
  await page.getByRole("button", { name: "Move to Recycle Bin" }).click(); // 확인창
  await expect(row(page, `${R}/docs/manual.md`)).toHaveCount(0);
  await expect(t(page, "md-filename")).toHaveText("");
});

test("S-1933~S-1936 Graph: 점 = 글, 점을 누르면 Reading 으로 열린다, 간격 슬라이더·키", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await t(page, "md-tab-graph").click();
  await expect(t(page, "gnode")).toHaveCount(4); // README·guide·00-overview/intro·10-last/z (Agent memory 제외)
  const a = await page.locator(`[data-testid="gnode"][data-path="${README}"]`).evaluate((e) => (e as SVGGraphicsElement).getBoundingClientRect().x);
  await t(page, "md-spacing").fill("2");
  await expect.poll(async () => page.locator(`[data-testid="gnode"][data-path="${README}"]`).evaluate((e) => (e as SVGGraphicsElement).getBoundingClientRect().x)).not.toBe(a);
  await page.locator(`[data-testid="gnode"][data-path="${GUIDE}"]`).click();
  await expect(t(page, "md-tab-reading")).toHaveAttribute("aria-selected", "true");
  await expect(t(page, "md-filename")).toHaveText("guide.md");
});

test("S-1936 그래프 키: + 로 확대, 0 으로 맞춤, 다른 탭에서는 안 먹는다", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await t(page, "md-tab-graph").click();
  const scale = () => t(page, "md-graph").getAttribute("data-scale").then(Number);
  await expect.poll(scale).not.toBe(1); // 배치가 끝나 모두 보이게 맞춰질 때까지(시작은 1)
  const s0 = await scale();
  await t(page, "md-graph").focus();
  await page.keyboard.press("+");
  expect(await scale()).toBeGreaterThan(s0);
  await page.keyboard.press("0");
  expect(await scale()).toBeCloseTo(s0, 1);
  await t(page, "md-tab-reading").click();
  await page.keyboard.press("+");
  await t(page, "md-tab-graph").click();
  await expect.poll(scale).toBeCloseTo(s0, 1); // 다시 그리면 맞춤 크기(+ 가 누적되지 않았다)
});

test("S-1937 Export PDF: 현재 글(고친 것 포함)로 exportPdf", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await row(page, README).click();
  await t(page, "md-tab-source").click();
  await t(page, "md-source").fill("# Title Edited\n\nbody\n");
  await t(page, "md-export-pdf").click();
  await expect.poll(() => page.evaluate(() => (window as any).__fakePdf?.calls?.length ?? 0)).toBe(1);
  const html = await page.evaluate(() => (window as any).__fakePdf.calls[0].html as string);
  expect(html).toContain("Title Edited");
});

test("S-1938·S-1939 Add to Board: Markdown 카드가 놓이고 스튜디오가 닫힌다 → 카드의 Open in Studio·PDF", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await row(page, README).click();
  await t(page, "md-add-board").click();
  await expect(t(page, "studio-frame")).toHaveCount(0);
  await expect(t(page, "md-card")).toBeVisible();
  await expect(t(page, "md-title")).toHaveText("README.md");
  await t(page, "md-open-studio").click();
  await expect(t(page, "studio-frame")).toBeVisible();
  await expect(t(page, "md-filename")).toHaveText("README.md");
  await t(page, "studio-close").click();
  await t(page, "md-pdf").click();
  await expect.poll(() => page.evaluate(() => (window as any).__fakePdf?.calls?.length ?? 0)).toBe(1);
});

test("S-1932 닫을 때 저장 중이면 기다렸다 닫고, 닫은 뒤 디스크에 반영돼 있다", async ({ page }) => {
  await boot(page);
  await openStudio(page);
  await row(page, README).click();
  await t(page, "md-tab-source").click();
  await t(page, "md-source").fill("# Closing\n");
  await t(page, "studio-close").click();
  await expect(t(page, "studio-frame")).toHaveCount(0, { timeout: 5000 });
  expect(await diskText(page, README)).toBe("# Closing\n");
});

test("FX7 S-1925 Claude 를 한 번도 안 띄운 repo 에서도 Agent memory 새 글이 만들어진다", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { (window as any).__fakeStudio.memoryDir = "C:/fake/cfg/projects/never-ran/memory"; });
  await openStudio(page);
  await t(page, "md-new").click();
  await page.getByRole("menuitem", { name: "Agent memory" }).click();
  await t(page, "md-new-name").fill("first");
  await t(page, "md-new-name").press("Enter");
  await expect(t(page, "md-filename")).toHaveText("first.md");
  expect(await page.evaluate(() => Object.keys((window as any).__fakeStudio.files))).toContain("C:/fake/cfg/projects/never-ran/memory/first.md");
});

test("FX7 S-1884 줄 끝이 섞인 글을 열면 띠가 뜬다", async ({ page }) => {
  await boot(page);
  await page.evaluate((p) => ((window as any).__fakeStudio.meta = { [p]: { crlf: false, mixedEol: true } }), README);
  await openStudio(page);
  await row(page, README).click();
  await expect(t(page, "eol-mixed")).toContainText("Line endings were mixed");
  await expect(t(page, "eol-mixed")).toContainText("LF");
  await row(page, GUIDE).click();
  await expect(t(page, "eol-mixed")).toHaveCount(0);
});
