import { expect, test, type Page } from "@playwright/test";

// 5묶음 E6: Documents 스튜디오 (S-1970~S-1995). 진짜 CLI 는 부르지 않는다 — window.__fakeStudioRun 이 studioRun 을 대신한다(Tauri 밖에서만).
// 가짜 실행: 단계(launching→thinking→writing)를 흘리고, window.__fakeGo 가 켜지면 끝낸다. Stop(signal)이면 지금까지의 글로 stopped.
test.use({ actionTimeout: 5000 });
const TEXT = "# Votelanding Architecture\n\nHello world.\n\n> **Note** keep this.";
type W = { __fakeStudioCalls?: { agentId: string; cwd: string; prompt: string; limitMs: number }[]; __fakeGo?: boolean; __fakePdf?: { calls?: { html: string }[] }; __fakeSavePath?: string | null };

const boot = async (p: Page) => {
  await p.addInitScript((text) => {
    const w = window as unknown as W & { __fakeStudioRun?: (o: Record<string, unknown>) => Promise<unknown> };
    w.__fakeStudioCalls = [];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    w.__fakeStudioRun = async (o) => {
      w.__fakeStudioCalls!.push({ agentId: o.agentId as string, cwd: o.cwd as string, prompt: o.prompt as string, limitMs: o.limitMs as number });
      const sig = o.signal as AbortSignal, st = o.onStatus as (s: string) => void, tx = o.onText as (t: string) => void;
      let shown = "";
      await sleep(300); st("thinking");
      await sleep(300); shown = text.slice(0, 30); tx(shown); st("writing");
      while (!w.__fakeGo && !sig.aborted) await sleep(50);
      if (sig.aborted) return { stopped: true, text: shown };
      tx(text);
      return { ok: true, text };
    };
  }, TEXT);
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto("/");
  await expect(p.getByTestId("command-bar")).toBeVisible();
};
const calls = (p: Page) => p.evaluate(() => (window as unknown as W).__fakeStudioCalls!.length);
const open = async (p: Page, item: string) => {
  await p.getByTestId("rail-pdf").click();
  await p.getByRole("menuitem", { name: item }).click();
  await expect(p.getByTestId("studio-title")).toHaveText("Documents — repo");
};

test("S-1970·S-1971·S-1974·S-1972·S-1973 열기=선택만, 왼쪽 구성, 빈 화면, 에이전트·노력", async ({ page }) => {
  await boot(page);
  await open(page, "Architecture");
  await expect(page.getByTestId("doc-item-architecture")).toHaveAttribute("aria-selected", "true");
  expect(await calls(page)).toBe(0);
  await expect(page.getByTestId("doc-progress")).toHaveCount(0);
  await expect(page.getByTestId("doc-list").getByRole("option")).toHaveCount(9);
  await expect(page.getByTestId("doc-blank-title")).toHaveText("Architecture");
  await expect(page.getByTestId("doc-generate")).toHaveText("Generate with Claude Code");
  await expect(page.getByTestId("doc-plan-note")).toHaveText("Uses one turn of your Claude Code plan.");
  // 에이전트: Claude Code 만 설치(가짜 환경), Codex 는 흐림 + 툴팁, Gemini 는 없음
  await expect(page.getByTestId("doc-agent-claude")).toBeEnabled();
  await expect(page.getByTestId("doc-agent-codex")).toBeDisabled();
  await expect(page.getByTestId("doc-agent-codex")).toHaveAttribute("title", "not found on PATH");
  await expect(page.getByTestId("doc-agent-gemini")).toHaveCount(0);
  // 노력 칩 셋, 기록이 없으니 모두 not timed
  for (const e of ["quick", "balanced", "thorough"]) await expect(page.getByTestId(`doc-effort-time-${e}`)).toHaveText("not timed");
  await expect(page.getByTestId("doc-effort-balanced")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("doc-effort-thorough").click();
  await expect(page.getByTestId("doc-effort-thorough")).toHaveAttribute("aria-pressed", "true");
  // 다른 항목 고르기 = 선택만
  await page.getByTestId("doc-item-readme").click();
  await expect(page.getByTestId("doc-blank-title")).toHaveText("README");
  expect(await calls(page)).toBe(0);
});

test("S-1975 Ask for anything: 비어 있으면 못 고르고, Enter 로 고른다", async ({ page }) => {
  await boot(page);
  await open(page, "Ask for anything");
  await expect(page.getByTestId("doc-ask-go")).toBeDisabled();
  await page.getByTestId("doc-ask-input").fill("a migration plan from REST to GraphQL");
  await page.getByTestId("doc-ask-input").press("Enter");
  await expect(page.getByTestId("doc-blank-title")).toHaveText("a migration plan from REST to GraphQL");
  expect(await calls(page)).toBe(0);
});

test("S-1977·S-1980·S-1981·S-1986·S-1988·S-1991·S-1992 Generate → 진행 줄 → 글 → 버전 저장 → Pages", async ({ page }) => {
  await boot(page);
  await open(page, "Architecture");
  await page.getByTestId("doc-generate").click();
  await expect(page.getByTestId("doc-progress")).toContainText("Claude Code · launching");
  await expect(page.getByTestId("doc-skeleton")).toBeVisible(); // 첫 글 전 회색 뼈대
  await expect(page.getByTestId("doc-progress")).toContainText("Claude Code · thinking");
  await expect(page.getByTestId("doc-progress")).toContainText("Claude Code · writing");
  await expect(page.getByTestId("doc-flow")).toContainText("# Votelanding Archi".slice(2)); // 스트리밍 글이 종이에
  // 만드는 중: 위 줄 + Stop. 다른 항목을 고르면 Generate 는 비활성 + 안내(S-1977)
  await expect(page.getByTestId("doc-writing")).toContainText("Writing with Claude Code");
  await expect(page.getByTestId("doc-stop")).toBeVisible();
  await page.getByTestId("doc-item-readme").click();
  await expect(page.getByTestId("doc-generate")).toBeDisabled();
  await expect(page.getByTestId("doc-busy")).toHaveText("A document is being written.");
  await page.getByTestId("doc-item-architecture").click();
  await expect(page.getByTestId("doc-flow")).toBeVisible();
  expect(await calls(page)).toBe(1);
  const c = await page.evaluate(() => (window as unknown as W).__fakeStudioCalls![0]!);
  expect(c.agentId).toBe("claude");
  expect(c.limitMs).toBe(12 * 60000);
  await page.evaluate(() => void ((window as unknown as W).__fakeGo = true));
  await expect(page.getByTestId("doc-progress")).toHaveCount(0);
  await expect(page.getByTestId("doc-flow")).toContainText("Hello world.");
  await expect(page.getByTestId("doc-flow").locator("h1")).toHaveText("Votelanding Architecture");
  await expect(page.getByTestId("doc-flow").getByTestId("doc-callout")).toContainText("keep this.");
  // 버전 한 개 + 항목 옆 점
  await expect(page.getByTestId("doc-version")).toHaveCount(1);
  await expect(page.getByTestId("doc-version")).toHaveText(/^[A-Z][a-z]{2} \d{1,2}, \d\d:\d\d · Claude Code · Balanced$/);
  await expect(page.getByTestId("doc-dot-architecture")).toBeVisible();
  // 도구줄(글이 있을 때)
  for (const id of ["doc-mode-flow", "doc-mode-pages", "doc-again", "doc-add-board", "doc-more", "doc-export-pdf"]) await expect(page.getByTestId(id)).toBeVisible();
  // Pages: 가짜 PDF 를 iframe 으로
  await page.getByTestId("doc-mode-pages").click();
  await expect(page.getByTestId("doc-pages")).toHaveAttribute("src", /^blob:/);
  await page.getByTestId("doc-mode-flow").click();
  await expect(page.getByTestId("doc-flow")).toBeVisible();
  // 칩에 이제 시간이 보인다
  await expect(page.getByTestId("doc-effort-time-balanced")).toHaveText(/^~\d+s$|^~\d+m/);
});

test("S-1982·S-1989·S-1990 Stop → Incomplete 띠 → Export draft PDF → Remove from library", async ({ page }) => {
  await boot(page);
  await open(page, "Architecture");
  await page.getByTestId("doc-generate").click();
  await expect(page.getByTestId("doc-progress")).toContainText("writing");
  await page.getByTestId("doc-stop").click();
  await expect(page.getByTestId("doc-progress")).toHaveCount(0);
  await expect(page.getByTestId("doc-incomplete")).toBeVisible();
  await expect(page.getByTestId("doc-version")).toHaveCount(1);
  await expect(page.getByTestId("doc-version-badge")).toHaveText("Incomplete");
  await expect(page.getByTestId("doc-export-draft")).toBeVisible();
  await page.evaluate(() => void ((window as unknown as W).__fakeSavePath = "C:/out/draft.pdf"));
  await page.getByTestId("doc-export-draft").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__fakePdf?.calls?.at(-1)?.html ?? "")).toContain("Draft — incomplete");
  // Regenerate(= ↻)는 지금 고른 에이전트로 다시 묻는다
  await page.evaluate(() => void ((window as unknown as W).__fakeGo = true));
  await page.getByTestId("doc-again").click();
  await expect(page.getByTestId("doc-version")).toHaveCount(2);
  expect(await calls(page)).toBe(2);
  // Remove from library: 확인창 → 영구 삭제
  await page.getByTestId("doc-version-menu").click();
  await page.getByRole("menuitem", { name: "Remove from library" }).click();
  await expect(page.getByRole("dialog", { name: /Remove/ })).toContainText("Remove this version for good? It does not go to the Recycle Bin.");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("doc-version")).toHaveCount(1);
});

test("S-1993·S-1994 Add to board: 카드가 놓이고 스튜디오가 닫힌다, 카드에 자체 Export PDF", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => void ((window as unknown as W).__fakeGo = true));
  await open(page, "Architecture");
  await page.getByTestId("doc-generate").click();
  await expect(page.getByTestId("doc-version")).toHaveCount(1);
  await page.getByTestId("doc-add-board").click();
  await expect(page.getByTestId("studio-frame")).toHaveCount(0);
  const card = page.getByTestId("document-card");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("document-card-title")).toHaveText("Repo Architecture");
  await expect(card).toContainText("Hello world.");
  const box = (await card.boundingBox())!;
  expect(Math.round(box.width)).toBe(460);
  expect(Math.round(box.height)).toBe(520);
  await page.evaluate(() => void ((window as unknown as W).__fakeSavePath = "C:/out/card.pdf"));
  await card.getByTestId("document-card-export").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__fakePdf?.calls?.length ?? 0)).toBeGreaterThan(0);
});

test("S-1994 스튜디오를 닫아도 실행이 계속되고, 다시 열면 진행 줄이 이어진다", async ({ page }) => {
  await boot(page);
  await open(page, "Architecture");
  await page.getByTestId("doc-generate").click();
  await expect(page.getByTestId("doc-progress")).toContainText("writing");
  await page.getByTestId("studio-close").click();
  await expect(page.getByTestId("studio-frame")).toHaveCount(0);
  await page.evaluate(() => void ((window as unknown as W).__fakeGo = true));
  await page.getByTestId("rail-pdf").click();
  await page.getByRole("menuitem", { name: "Architecture" }).click();
  await expect(page.getByTestId("doc-version")).toHaveCount(1); // 닫힌 동안 끝나 저장됐다
  expect(await calls(page)).toBe(1);
});
