import { expect, test, type Page } from "@playwright/test";

// C9 Git 패널·GitHub pill (S-1020~S-1039). 가짜 IPC: window.__fakeGit = { repos: { [경로]: FakeRepo }, delay? }, 호출 기록 window.__fakeGitLog
// ("git_commit {...}" 꼴, repo 인자는 뺌), 가짜 gh = window.__fakeGh, 가짜 파일 기록 window.__fakeFsLog(Open on GitHub = "url …").
// 기본 repo 는 C:/fake/repo(Workspace 1). FakeRepo 기본값: main · origin/main · github remote · 변경 없음.
const REPO = "C:/fake/repo";
const F = (path: string, status: string, add: number, del: number, extra: object = {}) => ({ path, status, add, del, ...extra });
// 합계 +9 −4
const FILES = [F("src/a.ts", "M", 4, 1), F("src/b.ts", "M", 2, 1), F("c.ts", "A", 3, 0), F("d.ts", "D", 0, 2), F("e.ts", "?", 0, 0)];
const MB = 1024 * 1024;

const boot = async (page: Page, repo: object | null = {}, extra: object = {}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(([r, x]) => ((window as any).__fakeGit = { repos: r ? { "C:/fake/repo": r } : {}, ...(x as object) }), [repo, extra]);
  await page.goto("/");
  await expect(page.getByTestId("git-pill")).toBeVisible();
};
const gh = (page: Page, v: { installed: boolean; user?: string | null }) => page.addInitScript((x) => ((window as any).__fakeGh = x), v);
const log = (p: Page) => p.evaluate(() => ((window as any).__fakeGitLog ?? []) as string[]);
const fsLog = (p: Page) => p.evaluate(() => ((window as any).__fakeFsLog ?? []) as string[]);
const open = async (p: Page) => {
  await p.getByTestId("git-pill").click();
  await expect(p.getByTestId("git-panel")).toBeVisible();
};
const panel = (p: Page) => p.getByTestId("git-panel");
const t = (p: Page, id: string) => p.getByTestId(id);
const rows = (p: Page) => p.getByTestId("git-row");
const dlg = (p: Page) => p.getByRole("dialog");

test.describe("pill·열기·닫기 (S-1020·S-1021)", () => {
  test("pill 은 브랜치와 변경 파일 수를 보이고, 누르면 열렸다 닫힌다", async ({ page }) => {
    await boot(page, { files: FILES });
    await expect(t(page, "git-pill-branch")).toHaveText("main");
    await expect(t(page, "git-pill-count")).toHaveText("5");
    await expect(panel(page)).toHaveCount(0);
    await open(page);
    await t(page, "git-pill").click();
    await expect(panel(page)).toHaveCount(0);
  });
  test("G 키로 열고 다시 G 로 닫고, Esc 로도 닫힌다", async ({ page }) => {
    await boot(page, { files: FILES });
    await page.mouse.click(700, 400); // 보드에 포커스
    await page.keyboard.press("g");
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await page.keyboard.press("g");
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("g");
    await expect(panel(page)).toHaveCount(0);
  });
  test("Tools › GitHub 로 열린다", async ({ page }) => {
    await boot(page, { files: FILES });
    await t(page, "tools-btn").click();
    await expect(page.getByRole("menuitem")).toHaveText(["All conversations", "Presets", "GitHub", "Code", "Markdown", "Mission Map", "Memory", "Skills", "Loops", "Settings"]); // S-1231 순서 + E4·E5·E7 Code·Markdown·Skills (ToolsMenu.tsx)
    await page.getByRole("menuitem", { name: "GitHub" }).click();
    await expect(panel(page)).toBeVisible();
  });
  test("pill 은 명령줄과 겹치지 않고 패널은 너비 약 340", async ({ page }) => {
    await boot(page, { files: FILES });
    const a = (await t(page, "git-pill").boundingBox())!;
    const b = (await t(page, "command-bar").boundingBox())!;
    expect(a.x + a.width).toBeLessThan(b.x);
    await open(page);
    const p = (await panel(page).boundingBox())!;
    expect(p.width).toBeGreaterThan(320);
    expect(p.width).toBeLessThan(360);
  });
  test("저장소가 아니면 pill 은 Not a repo", async ({ page }) => {
    await boot(page, { notRepo: true });
    await expect(t(page, "git-pill-branch")).toHaveText("Not a repo");
  });
});

test.describe("헤더·동기화 (S-1022·S-1023·S-1038)", () => {
  test("repo 이름·브랜치·아이콘 4개·In sync", async ({ page }) => {
    await boot(page, { files: FILES });
    await open(page);
    await expect(t(page, "git-repo")).toHaveText("repo");
    await expect(t(page, "git-branch")).toHaveText("main");
    for (const id of ["git-history-btn", "git-open-web", "git-refresh", "git-close"]) await expect(t(page, id)).toBeVisible();
    await expect(t(page, "git-sync")).toHaveText("In sync");
    await expect(t(page, "git-sync")).toHaveAttribute("title", /last fetch/);
  });
  test("앞/뒤가 다르면 ↑N ahead · ↓M behind", async ({ page }) => {
    await boot(page, { ahead: 2, behind: 1 });
    await open(page);
    await expect(t(page, "git-sync")).toHaveText("↑2 ahead · ↓1 behind");
  });
  test("Open on GitHub 는 https 로 연다. GitHub 가 아니면 숨김", async ({ page }) => {
    await boot(page, {});
    await open(page);
    await t(page, "git-open-web").click();
    await expect.poll(() => fsLog(page)).toContain("url https://github.com/fake/repo");
  });
  test("GitHub 가 아닌 remote 면 Open on GitHub 가 없다", async ({ page }) => {
    await boot(page, { remoteUrl: "https://example.com/x.git" });
    await open(page);
    await expect(t(page, "git-open-web")).toHaveCount(0);
  });
  test("패널은 스스로 fetch 하지 않고 Refresh 는 로컬 읽기만 한다", async ({ page }) => {
    await boot(page, { files: FILES, behind: 1 });
    await open(page);
    const before = (await log(page)).filter((l) => l.startsWith("git_status")).length;
    await t(page, "git-refresh").click();
    await expect.poll(async () => (await log(page)).filter((l) => l.startsWith("git_status")).length).toBeGreaterThan(before);
    const all = await log(page);
    expect(all.filter((l) => /fetch|pull|push/.test(l))).toEqual([]);
  });
  test("창이 다시 포커스를 얻으면 상태를 다시 읽는다 (S-1035)", async ({ page }) => {
    await boot(page, { files: FILES });
    const n = async () => (await log(page)).filter((l) => l.startsWith("git_status")).length;
    const before = await n();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(n).toBeGreaterThan(before);
  });
  test("pill 은 패널이 닫혀 있어도 10초마다 상태를 읽고 새 변경 수를 보인다", async ({ page }) => {
    await page.clock.install();
    await boot(page, { files: FILES });
    await expect(t(page, "git-pill-count")).toHaveText("5");
    await page.evaluate(() => {
      const r = (window as any).__fakeGit.repos["C:/fake/repo"];
      r.files.push({ path: "z.ts", status: "?", add: 0, del: 0 });
    });
    await page.clock.runFor(10_500);
    await expect(t(page, "git-pill-count")).toHaveText("6");
  });
});

test.describe("변경 목록 (S-1024·S-1025)", () => {
  test.beforeEach(async ({ page }) => {
    await boot(page, { files: FILES });
    await open(page);
  });
  test("CHANGES 5/5 +9 −4, 행 5개 전부 체크, 상태 글자와 경로", async ({ page }) => {
    await expect(t(page, "git-changes-head")).toHaveText("CHANGES 5/5 +9 −4");
    await expect(rows(page)).toHaveCount(5);
    await expect(page.getByTestId("git-check")).toHaveCount(5);
    for (const c of await page.getByTestId("git-check").all()) await expect(c).toBeChecked();
    await expect(rows(page).first().getByTestId("git-status")).toHaveText("M");
    await expect(rows(page).first().getByTestId("git-path")).toHaveText("src/a.ts");
  });
  test("체크를 빼면 합이 바뀌고 None/All 이 전부 끄고 켠다", async ({ page }) => {
    await rows(page).first().getByTestId("git-check").uncheck();
    await expect(t(page, "git-changes-head")).toHaveText("CHANGES 4/5 +5 −3");
    await t(page, "git-none").click();
    await expect(t(page, "git-changes-head")).toHaveText("CHANGES 0/5 +0 −0");
    await t(page, "git-all").click();
    await expect(t(page, "git-changes-head")).toHaveText("CHANGES 5/5 +9 −4");
  });
  test("hover 하면 줄 수가 보인다", async ({ page }) => {
    await expect(t(page, "git-lines")).toHaveCount(0);
    await rows(page).first().hover();
    await expect(t(page, "git-lines")).toHaveText("+4 −1");
  });
  test("✦ 는 변경 파일로 만든 제목을 채우고 사용자가 고칠 수 있다", async ({ page }) => {
    await t(page, "git-sparkle").click();
    await expect(t(page, "git-msg")).toHaveValue("Update 5 files");
    await t(page, "git-none").click();
    await rows(page).nth(2).getByTestId("git-check").check(); // c.ts (A)
    await t(page, "git-sparkle").click();
    await expect(t(page, "git-msg")).toHaveValue("Add c.ts");
    await t(page, "git-msg").fill("my own");
    await expect(t(page, "git-msg")).toHaveValue("my own");
  });
});

test("400개까지만 보이고 넘으면 +N more not shown (S-1024)", async ({ page }) => {
  await boot(page, { files: Array.from({ length: 450 }, (_, i) => F(`f${i}.ts`, "M", 1, 0)) });
  await open(page);
  await expect(rows(page)).toHaveCount(400);
  await expect(t(page, "git-more")).toHaveText("+50 more not shown");
});

test.describe("커밋·푸시·풀 (S-1026·S-1028·S-1030·S-1037)", () => {
  test("Commit & Push 5 files → Pushing… → Working tree clean · Committed 5 files · pushed", async ({ page }) => {
    await boot(page, { files: FILES }, { delay: 500 });
    await open(page);
    await expect(t(page, "git-commit-push")).toHaveText("Commit & Push 5 files");
    await expect(t(page, "git-commit-push")).toBeDisabled(); // 메시지가 비어 있다
    await t(page, "git-msg").fill("ship it");
    await t(page, "git-commit-push").click();
    await expect(t(page, "git-commit-push")).toHaveText("Pushing…");
    await expect(t(page, "git-commit-push")).toBeDisabled();
    await expect(t(page, "git-clean")).toHaveText("Working tree clean");
    await expect(t(page, "git-done")).toHaveText("Committed 5 files · pushed");
    const l = await log(page);
    expect(l.some((x) => x.startsWith("git_commit") && x.includes("ship it") && x.includes("src/a.ts"))).toBe(true);
    expect(l.some((x) => x.startsWith("git_push"))).toBe(true);
  });
  test("체크한 파일만 커밋한다. 체크 0개면 버튼 비활성", async ({ page }) => {
    await boot(page, { files: FILES });
    await open(page);
    await t(page, "git-msg").fill("m");
    await t(page, "git-none").click();
    await expect(t(page, "git-commit-push")).toBeDisabled();
    await rows(page).nth(1).getByTestId("git-check").check();
    await expect(t(page, "git-commit-push")).toHaveText("Commit & Push 1 file");
    await t(page, "git-commit-push").click();
    await expect(t(page, "git-done")).toHaveText("Committed 1 file · pushed");
    await expect(rows(page)).toHaveCount(4);
    const c = (await log(page)).find((x) => x.startsWith("git_commit"))!;
    expect(c).toContain("src/b.ts");
    expect(c).not.toContain("src/a.ts");
  });
  test("분리 HEAD 면 Commit N files 이고 푸시가 없다", async ({ page }) => {
    await boot(page, { files: FILES, detached: true, branch: "abc1234", upstream: null });
    await open(page);
    await expect(t(page, "git-commit-push")).toHaveText("Commit 5 files");
    await t(page, "git-msg").fill("m");
    await t(page, "git-commit-push").click();
    await expect(t(page, "git-done")).toHaveText("Committed 5 files");
    expect((await log(page)).some((x) => x.startsWith("git_push"))).toBe(false);
  });
  test("upstream 이 있으면 Commit only 가 보이고 푸시하지 않는다. upstream 이 없으면 없다", async ({ page }) => {
    await boot(page, { files: FILES });
    await open(page);
    await t(page, "git-msg").fill("m");
    await t(page, "git-commit-only").click();
    await expect(t(page, "git-done")).toHaveText("Committed 5 files");
    expect((await log(page)).some((x) => x.startsWith("git_push"))).toBe(false);
  });
  test("upstream 이 없으면 Commit only 가 없다", async ({ page }) => {
    await boot(page, { files: FILES, upstream: null });
    await open(page);
    await expect(t(page, "git-commit-only")).toHaveCount(0);
  });
  test("merge 충돌이면 커밋 버튼이 비활성이고 이유가 보인다", async ({ page }) => {
    await boot(page, { files: FILES, conflict: true });
    await open(page);
    await t(page, "git-msg").fill("m");
    await expect(t(page, "git-commit-push")).toBeDisabled();
    await expect(panel(page)).toContainText("Resolve the merge conflicts first");
  });
  test("Pull 은 behind≥1 일 때만, Push 는 ahead≥1 일 때만", async ({ page }) => {
    await boot(page, { behind: 2, ahead: 0 });
    await open(page);
    await expect(t(page, "git-pull")).toBeVisible();
    await expect(t(page, "git-push")).toHaveCount(0);
    await t(page, "git-pull").click();
    await expect(t(page, "git-pull")).toHaveCount(0);
    expect((await log(page)).some((x) => x.startsWith("git_pull"))).toBe(true);
  });
  test("Push 를 누르면 ahead 가 0 이 되고 버튼이 사라진다", async ({ page }) => {
    await boot(page, { ahead: 1 });
    await open(page);
    await expect(t(page, "git-push")).toHaveText("Push");
    await expect(t(page, "git-pull")).toHaveCount(0);
    await t(page, "git-push").click();
    await expect(t(page, "git-push")).toHaveCount(0);
    await expect(t(page, "git-sync")).toHaveText("In sync");
  });
  test("upstream 이 없는 브랜치는 Publish branch", async ({ page }) => {
    await boot(page, { upstream: null, ahead: 0, branch: "feat" });
    await open(page);
    await expect(t(page, "git-push")).toHaveText("Publish branch");
    await t(page, "git-push").click();
    await expect(t(page, "git-push")).toHaveCount(0);
  });
  test("Pull 이 diverged 로 실패하면 붉은 한 줄, 다음 동작에서 지워진다", async ({ page }) => {
    await boot(page, { behind: 1, ahead: 1, diverged: true });
    await open(page);
    await t(page, "git-pull").click();
    await expect(t(page, "git-error")).toHaveText("Your branch and the remote have diverged. Merge in a console.");
    await t(page, "git-push").click();
    await expect(t(page, "git-error")).toHaveCount(0);
  });
});

test.describe("Discard (S-1029)", () => {
  test("↩ 는 확인창을 먼저 띄우고 취소하면 그대로, 확인하면 사라진다", async ({ page }) => {
    await boot(page, { files: FILES });
    await open(page);
    await rows(page).first().hover();
    await rows(page).first().getByTestId("git-discard").click();
    await expect(dlg(page)).toContainText("Discard changes to src/a.ts?");
    await dlg(page).getByRole("button", { name: "Cancel" }).click();
    await expect(rows(page)).toHaveCount(5);
    expect((await log(page)).some((x) => x.startsWith("git_discard"))).toBe(false);
    await rows(page).first().hover();
    await rows(page).first().getByTestId("git-discard").click();
    await dlg(page).getByRole("button", { name: "Discard" }).click(); // U1 S-2605: 순서 [Discard, Cancel]
    await expect(rows(page)).toHaveCount(4);
    expect((await log(page)).find((x) => x.startsWith("git_discard"))).toContain('"tracked":true');
  });
  test("우클릭도 같은 확인창, 추적 안 하는 파일은 tracked:false", async ({ page }) => {
    await boot(page, { files: FILES });
    await open(page);
    await rows(page).nth(4).click({ button: "right" });
    await expect(dlg(page)).toContainText("Discard changes to e.ts?");
    await dlg(page).getByRole("button", { name: "Discard" }).click(); // U1 S-2605: 순서 [Discard, Cancel]
    await expect(rows(page)).toHaveCount(4);
    expect((await log(page)).find((x) => x.startsWith("git_discard"))).toContain('"tracked":false');
  });
});

test.describe("Publish to GitHub·Create repository (S-1027·S-1031·S-1032)", () => {
  test("remote 가 없으면 변경 목록 대신 Publish 절. gh 가 없으면 설치 명령 복사", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gh(page, { installed: false });
    await boot(page, { upstream: null, remoteUrl: null, files: FILES });
    await open(page);
    await expect(t(page, "git-publish")).toBeVisible();
    await expect(t(page, "git-changes-head")).toHaveCount(0);
    await expect(t(page, "git-publish")).toContainText("Install gh");
    await t(page, "git-install-copy").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("winget install --id GitHub.cli");
  });
  test("gh 는 있고 로그인 전이면 Connect account 가 gh auth login 콘솔을 놓는다", async ({ page }) => {
    await gh(page, { installed: true, user: null });
    await boot(page, { upstream: null, remoteUrl: null });
    await open(page);
    await t(page, "git-connect").click();
    await expect(t(page, "console")).toHaveCount(1);
    await expect(t(page, "console-badge")).toHaveAttribute("title", "gh-auth-login");
    expect(await page.evaluate(() => (window as any).__fakePty.writes((window as any).__fakePty.ids()[0]))).toEqual([]);
  });
  test("로그인됨 → 이름(기본 폴더 이름)·Private 기본·Create repo & push everything", async ({ page }) => {
    await gh(page, { installed: true, user: "octocat" });
    await boot(page, { upstream: null, remoteUrl: null, files: FILES });
    await open(page);
    await expect(t(page, "git-pub-name")).toHaveValue("repo");
    await expect(t(page, "git-pub-private")).toBeChecked();
    await t(page, "git-pub-public").check();
    await t(page, "git-pub-name").fill("my-repo");
    await t(page, "git-pub-go").click();
    await expect(t(page, "git-publish")).toHaveCount(0);
    await expect(t(page, "git-sync")).toHaveText("In sync");
    expect((await log(page)).find((x) => x.startsWith("git_publish"))).toBe('git_publish {"name":"my-repo","private":false}');
  });
  test("저장소가 아니면 Create repository 하나, 누르면 git init 후 새 상태", async ({ page }) => {
    await gh(page, { installed: true, user: "octocat" });
    await boot(page, { notRepo: true });
    await open(page);
    await expect(t(page, "git-create-repo")).toBeVisible();
    await expect(t(page, "git-changes-head")).toHaveCount(0);
    await t(page, "git-create-repo").click();
    await expect(t(page, "git-create-repo")).toHaveCount(0);
    await expect(t(page, "git-branch")).toHaveText("main");
    await expect(t(page, "git-publish")).toBeVisible(); // 새 저장소엔 remote 가 없다
    expect((await log(page)).some((x) => x.startsWith("init ") && x.endsWith(" main"))).toBe(true);
  });
  test("S-1009 열린 폴더는 이미 있다: 가짜가 실제 계약(기존 폴더 필요)을 따를 때 Create repository 가 성공", async ({ page }) => {
    await gh(page, { installed: true, user: "octocat" });
    await boot(page, { notRepo: true }); // notRepo 항목 = 폴더는 있고 저장소만 아님
    await open(page);
    await t(page, "git-create-repo").click();
    await expect(t(page, "git-branch")).toHaveText("main");
    expect((await log(page)).some((x) => /^init .+ main$/.test(x))).toBe(true);
    await expect(t(page, "git-create-repo")).toHaveCount(0);
    await expect(page.getByText("already exists")).toHaveCount(0);
  });
});

test.describe("100MB (S-1033)", () => {
  test("큰 파일이 체크돼 있으면 경고와 Keep off GitHub", async ({ page }) => {
    await boot(page, { files: [...FILES, F("big.bin", "?", -1, -1, { size: 150 * MB })] });
    await open(page);
    await expect(t(page, "git-big-warn")).toHaveText(/1 files over 100 MB/);
    await t(page, "git-keep-off").click();
    await expect(t(page, "git-big-warn")).toHaveCount(0);
    await expect(rows(page)).toHaveCount(5);
    expect((await log(page)).find((x) => x.startsWith("git_keep_off"))).toContain("big.bin");
  });
  test("체크를 빼면 경고가 사라진다", async ({ page }) => {
    await boot(page, { files: [F("big.bin", "?", -1, -1, { size: 150 * MB })] });
    await open(page);
    await expect(t(page, "git-big-warn")).toBeVisible();
    await t(page, "git-none").click();
    await expect(t(page, "git-big-warn")).toHaveCount(0);
  });
  test("푸시가 100MB 로 거절되면 Remove from commits & push 가 두 번 눌러야 실행된다", async ({ page }) => {
    await boot(page, { files: [F("a.ts", "M", 1, 0)], pushOversize: true });
    await open(page);
    await t(page, "git-msg").fill("m");
    await t(page, "git-commit-push").click();
    await expect(t(page, "git-remove-oversize")).toBeVisible();
    await t(page, "git-remove-oversize").click();
    await expect(t(page, "git-remove-oversize")).toHaveText("Click again — keeps the old history on hv-oversize-backup");
    expect((await log(page)).some((x) => x.startsWith("git_remove_oversize"))).toBe(false);
    await t(page, "git-remove-oversize").click();
    await expect(t(page, "git-remove-oversize")).toHaveCount(0);
    expect((await log(page)).some((x) => x.startsWith("git_remove_oversize"))).toBe(true);
  });
});

test.describe("이력 (S-1034)", () => {
  const commits = Array.from({ length: 8 }, (_, i) => ({ hash: `abc123${i}`, subject: `commit ${i}`, author: "kim", time: new Date(Date.now() - i * 3600_000).toISOString() }));
  test("변경 목록 아래 RECENT 5개, History 아이콘은 HISTORY 목록으로 바꾼다", async ({ page }) => {
    await boot(page, { files: FILES, log: commits });
    await open(page);
    await expect(t(page, "git-recent-head")).toHaveText("RECENT");
    await expect(t(page, "git-recent-item")).toHaveCount(5);
    await t(page, "git-history-btn").click();
    await expect(t(page, "git-history-head")).toHaveText("HISTORY");
    await expect(t(page, "git-history-item")).toHaveCount(8);
    await expect(t(page, "git-history-item").first()).toContainText("abc1230");
    await expect(t(page, "git-history-item").first()).toContainText("commit 0");
    await expect(t(page, "git-history-item").first()).toContainText("kim");
    await expect(t(page, "git-changes-head")).toHaveCount(0);
    await t(page, "git-history-btn").click();
    await expect(t(page, "git-changes-head")).toBeVisible();
  });
});
