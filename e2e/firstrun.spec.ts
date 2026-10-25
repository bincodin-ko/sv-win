import { expect, test, type Page } from "@playwright/test";

// B17: 첫 실행 설정 카드. 근거 S-390~S-400. 가짜 IPC 에 repos 없음 + firstRunDone:false 를 심는다.
//   localStorage symvibe.fakeSettings / window.__symSeed.repos / window.__fakePickFolder
//   window.__fakeGit = { clone?: string(오류 줄, 없으면 성공), taken?: string[] } , window.__fakeGitLog (호출 기록)
const FIRST = "C:/fake/first";
const empty = { repos: [], lastRepo: null, lastWorkspace: {} };

// 새로고침해도 이미 저장된 설정(firstRunDone:true)은 덮지 않는다
const open = async (page: Page, o: { repos?: unknown; settings?: Record<string, unknown> } = {}) => {
  await page.addInitScript(
    ([seed, settings]) => {
      (window as any).__symSeed = { repos: seed };
      if (!localStorage.getItem("symvibe.fakeSettings")) localStorage.setItem("symvibe.fakeSettings", JSON.stringify(settings));
    },
    [o.repos ?? empty, { reopenLastRepo: false, firstRunDone: false, ...(o.settings ?? {}) }] as const,
  );
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
};
const card = (page: Page) => page.getByTestId("firstrun");
const step = (page: Page) => page.getByTestId("fr-step");
const next = (page: Page) => page.getByTestId("fr-next").click();
const toRepo = (page: Page) => next(page); // ①→②(repo)
const settings = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}"));
const pick = (page: Page, p: string) => page.evaluate((x) => ((window as any).__fakePickFolder = x), p);
const git = (page: Page, v: unknown) => page.evaluate((x) => ((window as any).__fakeGit = x), v as never);
const gitLog = (page: Page) => page.evaluate(() => (window as any).__fakeGitLog ?? []);

test("S-390·S-391·S-392: 홈 위에 카드, 머리 Step 1 of 3, 테마는 고르면 즉시 적용", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(card(page)).toBeVisible();
  await expect(step(page)).toHaveText("Step 1 of 3");
  await expect(card(page)).toContainText("How should Symvibe look?");
  await expect(page.getByRole("radio")).toHaveCount(3);
  await card(page).getByLabel("Light").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect((await settings(page)).theme).toBe("light");
  await card(page).getByLabel("OG").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "og");
});

test("S-393·S-396·S-400: Open a folder 는 repo 로 등록되고, 뒤로/다음에도 입력이 남는다", async ({ page }) => {
  await open(page);
  await toRepo(page);
  await expect(step(page)).toHaveText("Step 2 of 3");
  await expect(card(page)).toContainText("Your first repo");
  await pick(page, FIRST);
  await card(page).getByRole("button", { name: "Open a folder" }).click();
  await expect(page.getByTestId("fr-added")).toContainText("first");
  const r = await page.evaluate(() => (window as any).__shell.repos());
  expect(r.repos.map((x: any) => x.path)).toEqual([FIRST]);
  await expect(page.getByTestId("repo-row")).toHaveCount(1); // 뒤의 홈 목록에도 보인다
  // 입력 유지(S-400)
  await card(page).getByRole("button", { name: "Clone a repository" }).click();
  await page.getByTestId("fr-clone-url").fill("https://github.com/foo/keepme.git");
  await next(page);
  await expect(step(page)).toHaveText("Step 3 of 3");
  await page.getByTestId("fr-back").click();
  await expect(page.getByTestId("fr-clone-url")).toHaveValue("https://github.com/foo/keepme.git");
  await page.getByTestId("fr-back").click();
  await expect(step(page)).toHaveText("Step 1 of 3");
  await expect(page.getByTestId("fr-back")).toBeHidden();
});

test("S-394·S-395: Clone — 기본 위치 미리보기, Change, 성공/실패 문구", async ({ page }) => {
  await open(page);
  await toRepo(page);
  await card(page).getByRole("button", { name: "Clone a repository" }).click();
  await page.getByTestId("fr-clone-url").fill("git@github.com:foo/bar.git");
  await expect(page.getByTestId("fr-dest")).toHaveText(/symvibe[\\/]bar$/); // 가짜 home 에 hypervibe 없음
  await pick(page, "C:/elsewhere");
  await page.getByTestId("fr-change").click();
  await expect(page.getByTestId("fr-dest")).toHaveText("C:/elsewhere/bar");
  // 실패: git 의 마지막 오류 줄을 그대로
  await git(page, { clone: "fatal: repository 'x' not found" });
  await page.getByTestId("fr-clone-go").click();
  await expect(page.getByTestId("fr-status")).toHaveText("fatal: repository 'x' not found");
  await expect(page.getByTestId("fr-added")).toHaveCount(0);
  // git 없음
  await git(page, { clone: "git not found" });
  await page.getByTestId("fr-clone-go").click();
  await expect(page.getByTestId("fr-status")).toHaveText("git not found");
  // 성공: repo 로 등록
  await git(page, {});
  await page.getByTestId("fr-clone-go").click();
  await expect(page.getByTestId("fr-added")).toContainText("bar");
  expect(await gitLog(page)).toContain("clone git@github.com:foo/bar.git C:/elsewhere/bar");
  const r = await page.evaluate(() => (window as any).__shell.repos());
  expect(r.repos.map((x: any) => x.path)).toEqual(["C:/elsewhere/bar"]);
});

test("S-393·S-394·S-396: New repo — 같은 이름 폴더는 거절, 아니면 만들고 git init -b main(체크 기본 켜짐)", async ({ page }) => {
  await open(page);
  await toRepo(page);
  await card(page).getByRole("button", { name: "Create a new repo" }).click();
  await expect(page.getByTestId("fr-new-main")).toBeChecked();
  await pick(page, "C:/work");
  await page.getByTestId("fr-change").click();
  await git(page, { taken: ["C:/work/dup"] });
  await page.getByTestId("fr-new-name").fill("dup");
  await page.getByTestId("fr-new-go").click();
  await expect(page.getByTestId("fr-new-error")).toContainText(/already exists/i);
  expect(await gitLog(page)).toEqual([]); // 덮지도 만들지도 않음
  await page.getByTestId("fr-new-name").fill("fresh");
  await page.getByTestId("fr-new-go").click();
  await expect(page.getByTestId("fr-added")).toContainText("fresh");
  expect(await gitLog(page)).toEqual(["init C:/work/fresh main"]);
  // 체크를 끄면 브랜치 지정 없이
  await page.getByTestId("fr-new-main").uncheck();
  await page.getByTestId("fr-new-name").fill("plain");
  await page.getByTestId("fr-new-go").click();
  await expect(page.getByTestId("fr-added")).toContainText("plain");
  expect(await gitLog(page)).toEqual(["init C:/work/fresh main", "init C:/work/plain plain"]);
});

test("S-397·S-398: 에이전트 고르고 Yolo → Start with …: 기본 에이전트·firstRunDone 저장, 처음 더한 repo 의 보드가 열린다", async ({ page }) => {
  await open(page);
  await toRepo(page);
  await pick(page, FIRST);
  await card(page).getByRole("button", { name: "Open a folder" }).click();
  await pick(page, "C:/fake/second");
  await card(page).getByRole("button", { name: "Open a folder" }).click();
  await next(page);
  await expect(step(page)).toHaveText("Step 3 of 3");
  await expect(card(page)).toContainText("Choose your default agent");
  // 찾은 에이전트(claude·shell)가 먼저, 안 깔린 것은 뒤
  const ids = await card(page).locator("[data-agent-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-agent-id")));
  expect(ids.slice(0, 2).sort()).toEqual(["claude", "shell"]);
  expect(ids.indexOf("codex")).toBeGreaterThan(1);
  await expect(page.getByTestId("fr-yolo")).not.toBeChecked();
  await expect(page.getByTestId("fr-start")).toHaveText("Start with Claude"); // S-167 처음 찾은 것
  await card(page).locator('[data-agent-id="shell"]').click();
  await expect(page.getByTestId("fr-start")).toHaveText("Start with Shell");
  await page.getByTestId("fr-yolo").check();
  await page.getByTestId("fr-start").click();
  await expect(card(page)).toBeHidden();
  await expect(page.getByTestId("home")).toBeHidden();
  await expect(page.locator("[data-ws]:visible")).toHaveCount(1);
  await expect(page.getByTestId("console")).toHaveCount(1); // S-2700: Start 가 고른 에이전트(shell) 1개를 띄운다
  expect(await page.evaluate(() => (window as any).__shell.activeRepo())).toBe(FIRST);
  const s = await settings(page);
  expect(s.defaultAgent).toBe("shell");
  expect(s.armedAgent).toBe("shell");
  expect(s.yolo).toBe(true);
  expect(s.firstRunDone).toBe(true);
});

test("S-399: 닫기 × 는 나머지를 건너뛰고, 이미 고른 것은 유지하며, 새로고침 뒤에도 안 뜬다", async ({ page }) => {
  await open(page);
  await card(page).getByLabel("Light").check();
  await page.getByTestId("fr-close").click();
  await expect(card(page)).toBeHidden();
  await expect(page.getByTestId("home")).toBeVisible(); // 보드로 가지 않는다
  const s = await settings(page);
  expect(s.firstRunDone).toBe(true);
  expect(s.theme).toBe("light"); // 고른 것 유지
  expect(s.defaultAgent ?? null).toBeNull(); // 기본 에이전트는 S-167 에 맡긴다
  await page.reload();
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("S-390: repo 가 이미 있으면 카드 없이 조용히 firstRunDone 을 true 로", async ({ page }) => {
  await open(page, { repos: { repos: [{ path: "C:/fake/a", name: "alpha", workspaces: [] }], lastRepo: "C:/fake/a", lastWorkspace: {} } });
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(page.getByTestId("repo-row")).toHaveCount(1);
  await expect(card(page)).toHaveCount(0);
  await expect.poll(async () => (await settings(page)).firstRunDone).toBe(true);
});

// S-2701: 마이크·소리 단계는 카드에서 뺐다(설정 창 Voice/General 에 같은 기능, 시험은 voice.spec·settings.spec)
test("S-2701: 카드는 3단계 — 마이크 단계가 없다", async ({ page }) => {
  await open(page);
  await next(page);
  await expect(step(page)).toHaveText("Step 2 of 3");
  await expect(card(page)).not.toContainText("Microphone and sounds");
  await expect(page.getByTestId("fr-mic-allow")).toHaveCount(0);
  await page.getByTestId("fr-close").click();
  await page.reload();
  await expect(card(page)).toHaveCount(0);
});
