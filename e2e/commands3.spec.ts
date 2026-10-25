import { expect, test, type Page } from "@playwright/test";

// C17: 명령줄 Git·노트·웹·그리기 (S-1060~S-1069). 가짜 git(window.__fakeGit, 기록 __fakeGitLog)만 쓴다 — 실제 원격에 push 하지 않는다.
// 기본 repo = C:/fake/repo (git.spec.ts 와 같음).
const input = (p: Page) => p.getByTestId("bar-input");
const msgs = (p: Page) => p.getByTestId("thread-msg");
const lastMsg = (p: Page) => msgs(p).last();
const log = (p: Page) => p.evaluate(() => ((window as any).__fakeGitLog ?? []) as string[]);
const F = (path: string, status = "M") => ({ path, status, add: 1, del: 0 });

const say = async (p: Page, t: string) => {
  await input(p).fill(t);
  await input(p).press("Enter");
};
const boot = async (page: Page, repo: object | null = { files: [F("a.ts"), F("b.ts")] }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript((r) => ((window as any).__fakeGit = { repos: r ? { "C:/fake/repo": r } : {} }), repo);
  await page.goto("/");
  await expect(page.getByTestId("command-bar")).toBeVisible();
  await page.getByTestId("thread-toggle").click();
  await expect(page.getByTestId("thread-panel")).toBeVisible();
};

test("S-1060 commit and push: 패널이 닫혀 있어도 commit → push 순서, 답 한 줄", async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId("git-panel")).toHaveCount(0);
  await say(page, "commit and push");
  await expect(lastMsg(page)).toHaveText("Committed 2 files · pushed");
  const l = await log(page);
  const ci = l.findIndex((x) => x.startsWith("git_commit")), pi = l.findIndex((x) => x.startsWith("git_push"));
  expect(ci).toBeGreaterThanOrEqual(0);
  expect(pi).toBeGreaterThan(ci);
});

test("S-1060 commit with the message … : 메시지가 그대로 전달, push 는 안 한다", async ({ page }) => {
  await boot(page);
  await say(page, "commit with the message fix login");
  await expect(lastMsg(page)).toHaveText("Committed 2 files");
  const l = await log(page);
  expect(l.some((x) => x.startsWith("git_commit") && x.includes('"message":"fix login"'))).toBe(true);
  expect(l.some((x) => x.startsWith("git_push"))).toBe(false);
});

test("S-1060 push·pull 답, pull 은 behind 0 이어도 실행", async ({ page }) => {
  await boot(page, { files: [] });
  await say(page, "push");
  await expect(lastMsg(page)).toHaveText("Pushed");
  await say(page, "pull");
  await expect(lastMsg(page)).toHaveText("Pulled");
  const l = await log(page);
  expect(l.some((x) => x.startsWith("git_push"))).toBe(true);
  expect(l.some((x) => x.startsWith("git_pull"))).toBe(true);
});

test("S-1060 push 실패는 'Couldn't push: …'", async ({ page }) => {
  await boot(page, { files: [], remoteUrl: null });
  await say(page, "push");
  await expect(lastMsg(page)).toHaveText("Couldn't push: No configured push destination");
});

test("S-1062 git 저장소가 아니면 'There's no git repository open.', 그 밖의 git … 은 later", async ({ page }) => {
  await boot(page, { notRepo: true });
  await say(page, "push");
  await expect(lastMsg(page)).toHaveText("There's no git repository open.");
  await say(page, "git status");
  await expect(lastMsg(page)).toHaveText("That isn't available in this version yet.");
});

test("S-1064 add a note that says … -> 스티커 노드와 글", async ({ page }) => {
  await boot(page);
  await say(page, "add a note that says ship the beta on Friday");
  await expect(page.getByTestId("sticky-body")).toHaveCount(1);
  await expect(page.getByTestId("sticky-text")).toContainText("ship the beta on Friday");
});

test("S-1065 add a kanban / calendar / checklist, add an orchestrator 는 카드 (S-1740)", async ({ page }) => {
  await boot(page);
  await say(page, "add a kanban");
  await say(page, "add a calendar");
  await say(page, "add a checklist");
  await expect(page.getByTestId("kb-root")).toHaveCount(1);
  await expect(page.getByTestId("calendar")).toHaveCount(1);
  await expect(page.getByTestId("checklist")).toHaveCount(1);
  await say(page, "add an orchestrator");
  await expect(lastMsg(page)).toHaveText("Orchestrator added.");
  await expect(page.getByTestId("orch-card")).toHaveCount(1);
});

test("S-1066 open localhost 3000 -> 웹 타일이 http://localhost:3000, ftp 는 거절", async ({ page }) => {
  await boot(page);
  await say(page, "open localhost 3000");
  await expect(page.getByTestId("web-tile")).toHaveCount(1);
  await expect(page.getByTestId("web-url")).toHaveValue("http://localhost:3000");
  await say(page, "open ftp://x");
  await expect(lastMsg(page)).toHaveText("I can only open http and https pages.");
  await expect(page.getByTestId("web-tile")).toHaveCount(1);
});

test("S-1067 eraser -> Eraser 도구, I want to draw -> Pen 도구", async ({ page }) => {
  await boot(page);
  await say(page, "eraser");
  await expect(page.getByTestId("rail-eraser")).toHaveAttribute("data-active", "true");
  await expect(lastMsg(page)).toHaveText("Eraser is on.");
  await say(page, "I want to draw");
  await expect(page.getByTestId("rail-pen")).toHaveAttribute("data-active", "true");
  await expect(lastMsg(page)).toHaveText("Pen is on.");
});
