import { expect, test, type Page } from "@playwright/test";

// K2 S-2420~S-2426. PW_PORT=1602. 가짜 설정 localStorage "symvibe.fakeSettings", 가짜 repos window.__symSeed.
// 같은 시나리오를 한국어/영어로 돌려 영어 기본이 그대로임을 본다. 스튜디오 항목 이름은 K6 몫이라 Tools 메뉴는 항목 존재만 본다.
const A = "C:/fake/repo";
const repos = { repos: [{ path: A, name: "alpha", workspaces: [{ id: "ws-a", name: "Workspace 1" }] }], lastRepo: A, lastWorkspace: {} };

const seed = (page: Page, settings: object, seedRepos: object | null = repos) =>
  page.addInitScript(([r, s]) => {
    if (r) (window as any).__symSeed = { repos: r };
    localStorage.setItem("symvibe.fakeSettings", JSON.stringify(s));
  }, [seedRepos, settings] as const);

const L = {
  en: { settings: { reopenLastRepo: false }, greet: /^Good (morning|afternoon|evening)/, add: "Add a repo", back: "← Back to home", dispatch: "Dispatch", step: "Step 1 of 3", lib: "Presets", devhq: "Dev HQ", sync: "In sync", hist: "History", tools: "Tools" },
  ko: { settings: { reopenLastRepo: false, language: "ko" }, greet: /좋은 (아침이에요|오후예요|저녁이에요)/, add: "repo 추가", back: "← 홈으로", dispatch: "실행", step: "3단계 중 1단계", lib: "프리셋", devhq: "개발 본부", sync: "동기화됨", hist: "기록", tools: "도구" },
} as const;

for (const lang of ["ko", "en"] as const) {
  const x = L[lang];
  test.describe(`화면 언어 ${lang}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1400, height: 900 });
    });

    test("① 홈: 인사말·Add repo 카드·Dispatch 버튼", async ({ page }) => {
      await seed(page, x.settings);
      await page.goto("/");
      await expect(page.getByTestId("greeting")).toHaveText(x.greet);
      await expect(page.getByText(x.add, { exact: false }).first()).toBeVisible();
      await expect(page.getByTestId("dispatch")).toHaveText(x.dispatch);
    });

    test("② 상단 바와 Tools 메뉴", async ({ page }) => {
      await seed(page, { reopenLastRepo: true, ...(lang === "ko" ? { language: "ko" } : {}) });
      await page.goto("/");
      await expect(page.getByTestId("back-home")).toHaveText(x.back);
      await expect(page.getByTestId("tools-btn")).toContainText(x.tools);
      await page.getByTestId("tools-btn").click();
      expect(await page.getByRole("menuitem").count()).toBeGreaterThanOrEqual(8); // 스튜디오 항목은 존재만
      if (lang === "ko") await expect(page.getByRole("menuitem", { name: "프리셋", exact: true })).toBeVisible();
      else await expect(page.getByRole("menuitem", { name: "Presets", exact: true })).toBeVisible();
    });

    test("③ 첫 실행 카드 1단계", async ({ page }) => {
      await seed(page, { reopenLastRepo: false, firstRunDone: false, ...(lang === "ko" ? { language: "ko" } : {}) }, { repos: [], lastRepo: null, lastWorkspace: {} });
      await page.goto("/");
      await expect(page.getByTestId("fr-step")).toHaveText(x.step);
      if (lang === "ko") await expect(page.getByTestId("firstrun")).toContainText(/[가-힣]/);
      else await expect(page.getByTestId("firstrun")).toContainText("How should Symvibe look?");
    });

    test("④ Presets 라이브러리 이름", async ({ page }) => {
      await seed(page, { reopenLastRepo: true, ...(lang === "ko" ? { language: "ko" } : {}) });
      await page.goto("/");
      await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
      await page.getByTestId("rail-presets").click();
      await page.getByRole("menuitem").first().click();
      await expect(page.getByTestId("preset-library")).toHaveAttribute("aria-label", x.lib);
      const card = page.locator('[data-testid="preset-card"][data-name="Dev HQ"]'); // data-name 은 저장 이름이라 영어 그대로
      await expect(card).toContainText(x.devhq);
    });

    test("⑤ Git 패널 머리 글", async ({ page }) => {
      await seed(page, { reopenLastRepo: true, ...(lang === "ko" ? { language: "ko" } : {}) });
      await page.addInitScript(() => ((window as any).__fakeGit = { repos: { "C:/fake/repo": {} } }));
      await page.goto("/");
      await page.getByTestId("git-pill").click();
      await expect(page.getByTestId("git-panel")).toBeVisible();
      await expect(page.getByTestId("git-history-btn")).toHaveAttribute("aria-label", x.hist);
      await expect(page.getByTestId("git-sync")).toHaveText(x.sync);
    });
  });
}
