import { expect, test, type Page } from "@playwright/test";

// C14 Git 브랜치 카드 (S-1050~S-1056). 가짜 IPC: window.__fakeGit.repos[경로] (src/git/fake.ts, C9). 기대값은 spec/3묶음-3.md 문장에서만.
// FakeRepo 에 이 시험이 더 쓰는 필드: dirtyBlock(이 브랜치로 전환하면 git 이 덮어쓰기라며 거절), unmerged(이 브랜치 삭제는 병합 안 됨으로 거절).
// 구현이 맞출 약속(이름): 카드 본문 br-root(머리줄 data-node-handle) · 현재 브랜치 br-current · ahead/behind br-sync("↑2 ↓1") · 편집 파일 수 br-edited("3 files edited")
//   목록 br-list > 행 br-row(data-name, data-current="true|false") · 행 휴지통 br-delete(현재 브랜치 행에는 없음) · br-new(버튼) · br-new-input(입력) · br-panel(버튼)
//   오류 한 줄 br-error · 저장소 아님 br-notgit(Not a git repository)
// 1400×900, 줌 1, 이동 0 → 월드 (x,y) = 화면 (700+x, 450+y).
test.use({ actionTimeout: 5000 });
const REPO = "C:/fake/repo";
const NODE = (extra: Record<string, unknown> = {}) => ({ id: "br1", kind: "branches", x: -150, y: -180, w: 300, h: 360, z: 1, ...extra });
const boardJson = (nodes: unknown[]) => JSON.stringify({
  formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: REPO }, viewport: { x: 0, y: 0, zoom: 1 }, nodes, groups: [],
});
const F = (path: string) => ({ path, status: "M", add: 1, del: 0 });
const boot = async (page: Page, repo: object | null = {}, nodes: unknown[] = [NODE()], json?: string) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(([r, b]) => {
    (window as any).__symSeed = { boards: { "ws-fake": b } };
    (window as any).__fakeGit = { repos: r ? { "C:/fake/repo": r } : {} };
  }, [repo, json ?? boardJson(nodes)] as const);
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
};
const t = (p: Page, id: string) => p.getByTestId(id);
const row = (p: Page, name: string) => p.locator(`[data-testid="br-row"][data-name="${name}"]`);
const log = (p: Page) => p.evaluate(() => ((window as any).__fakeGitLog ?? []) as string[]);
const fake = (p: Page) => p.evaluate((r) => JSON.parse(JSON.stringify((window as any).__fakeGit.repos[r])), REPO);
const names = (p: Page) => t(p, "br-row").evaluateAll((es) => es.map((e) => e.getAttribute("data-name")));
const R = (extra: object = {}) => ({ branch: "main", branches: ["main", "dev", "feat/x"], ahead: 2, behind: 1, files: [F("a.ts"), F("b.ts"), F("c.ts")], ...extra });

test.describe("S-1050 놓기", () => {
  test("고리 More › Git branches 로 놓는다(기본 300×360), 항목은 저장소가 아니어도 보인다", async ({ page }) => {
    await boot(page, { notRepo: true }, []);
    await page.mouse.click(1300, 100, { button: "right" });
    const ring = page.getByTestId("ring-menu");
    await ring.getByRole("menuitem", { name: "More", exact: true }).click();
    await ring.getByRole("menuitem", { name: "Git branches", exact: true }).click();
    await expect(t(page, "br-root")).toBeVisible();
    const b = (await page.locator("[data-node-id]").first().boundingBox())!;
    expect([Math.round(b.width), Math.round(b.height)]).toEqual([300, 360]);
    await page.keyboard.press("Control+z");
    await expect(t(page, "br-root")).toHaveCount(0);
  });
  test("저장소가 아니면 Not a git repository 만 보인다", async ({ page }) => {
    await boot(page, { notRepo: true });
    await expect(t(page, "br-notgit")).toHaveText("Not a git repository");
    await expect(t(page, "br-row")).toHaveCount(0);
    await expect(t(page, "br-new")).toHaveCount(0);
  });
});

test.describe("S-1051 내용", () => {
  test("현재 브랜치·ahead/behind·편집 파일 수·목록(이름순, 현재 표시)·New branch·Panel", async ({ page }) => {
    await boot(page, R());
    await expect(t(page, "br-current")).toHaveText("main");
    await expect(t(page, "br-sync")).toHaveText("↑2 ↓1");
    await expect(t(page, "br-edited")).toHaveText("3 files edited");
    expect(await names(page)).toEqual(["dev", "feat/x", "main"]);
    await expect(row(page, "main")).toHaveAttribute("data-current", "true");
    await expect(row(page, "dev")).toHaveAttribute("data-current", "false");
    await expect(t(page, "br-new")).toHaveText("New branch");
    await expect(t(page, "br-panel")).toHaveText("Panel");
  });
  test("목록은 최대 200개", async ({ page }) => {
    const many = ["main", ...Array.from({ length: 249 }, (_, i) => "t" + String(i).padStart(3, "0"))];
    await boot(page, R({ branches: many }));
    await expect(t(page, "br-row")).toHaveCount(200);
  });
  test("편집 파일 1개는 1 file edited", async ({ page }) => {
    await boot(page, R({ files: [F("a.ts")] }));
    await expect(t(page, "br-edited")).toHaveText("1 file edited");
  });
});

test.describe("S-1052 전환", () => {
  test("브랜치를 누르면 확인창 없이 바로 전환되고 현재 표시와 머리 정보가 바뀐다", async ({ page }) => {
    await boot(page, R());
    await row(page, "dev").getByRole("button").first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row(page, "dev")).toHaveAttribute("data-current", "true");
    await expect(row(page, "main")).toHaveAttribute("data-current", "false");
    await expect(t(page, "br-current")).toHaveText("dev");
    expect((await log(page)).some((l) => l.startsWith("git_switch") && l.includes('"name":"dev"'))).toBe(true);
    expect((await fake(page)).branch).toBe("dev");
  });
  test("git 이 덮어쓰기라며 거절하면 그 문구가 카드에 한 줄로 보이고 전환은 안 된다", async ({ page }) => {
    await boot(page, R({ dirtyBlock: ["dev"] }));
    await row(page, "dev").getByRole("button").first().click();
    await expect(t(page, "br-error")).toContainText("would be overwritten");
    await expect(t(page, "br-current")).toHaveText("main");
    await expect(row(page, "main")).toHaveAttribute("data-current", "true");
    const h = (await t(page, "br-error").boundingBox())!.height;
    expect(h).toBeLessThan(30); // 한 줄
  });
});

test.describe("S-1053 New branch", () => {
  test("New branch → 이름 → Enter 로 만들고 전환한다", async ({ page }) => {
    await boot(page, R());
    await expect(t(page, "br-new-input")).toHaveCount(0);
    await t(page, "br-new").click();
    await t(page, "br-new-input").fill("topic");
    await t(page, "br-new-input").press("Enter");
    await expect(t(page, "br-current")).toHaveText("topic");
    await expect(row(page, "topic")).toHaveAttribute("data-current", "true");
    await expect(t(page, "br-new-input")).toHaveCount(0);
    expect((await log(page)).some((l) => l.startsWith("git_branch_new") && l.includes('"name":"topic"'))).toBe(true);
  });
  test("빈 이름은 아무것도 보내지 않는다", async ({ page }) => {
    await boot(page, R());
    await t(page, "br-new").click();
    await t(page, "br-new-input").fill("   ");
    await t(page, "br-new-input").press("Enter");
    expect((await log(page)).filter((l) => l.startsWith("git_branch_new"))).toHaveLength(0);
  });
  test("잘못된 이름·이미 있는 이름은 오류 한 줄, 브랜치는 그대로", async ({ page }) => {
    await boot(page, R());
    await t(page, "br-new").click();
    await t(page, "br-new-input").fill("bad name");
    await t(page, "br-new-input").press("Enter");
    await expect(t(page, "br-error")).toContainText("not a valid branch name");
    await expect(t(page, "br-current")).toHaveText("main");
    await t(page, "br-new-input").fill("dev");
    await t(page, "br-new-input").press("Enter");
    await expect(t(page, "br-error")).toContainText("already exists");
    await expect(t(page, "br-current")).toHaveText("main");
    expect(await names(page)).toEqual(["dev", "feat/x", "main"]);
  });
  test("Esc 로 입력 줄이 닫힌다", async ({ page }) => {
    await boot(page, R());
    await t(page, "br-new").click();
    await t(page, "br-new-input").press("Escape");
    await expect(t(page, "br-new-input")).toHaveCount(0);
  });
});

test.describe("S-1054 삭제", () => {
  test("휴지통은 현재 브랜치에는 없고, 누르면 확인창 없이 지운다", async ({ page }) => {
    await boot(page, R());
    await expect(row(page, "main").getByTestId("br-delete")).toHaveCount(0);
    await expect(row(page, "dev").getByTestId("br-delete")).toHaveCount(1);
    await row(page, "dev").getByTestId("br-delete").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row(page, "dev")).toHaveCount(0);
    expect((await log(page)).some((l) => l.startsWith("git_branch_delete") && l.includes('"name":"dev"'))).toBe(true);
  });
  test("병합 안 된 브랜치는 git 이 거절하고 그 문구가 카드에 보인다", async ({ page }) => {
    await boot(page, R({ unmerged: ["dev"] }));
    await row(page, "dev").getByTestId("br-delete").click();
    await expect(t(page, "br-error")).toContainText("not fully merged");
    await expect(row(page, "dev")).toHaveCount(1);
  });
});

test.describe("S-1055 Panel", () => {
  test("Panel 버튼이 Git 패널을 연다", async ({ page }) => {
    await boot(page, R());
    await expect(t(page, "git-panel")).toHaveCount(0);
    await t(page, "br-panel").click();
    await expect(t(page, "git-panel")).toBeVisible();
  });
});

test.describe("S-1056 갱신·저장·모양", () => {
  test("패널을 열어 상태를 다시 읽으면 카드의 현재 표시도 따라 바뀐다(같은 useGit)", async ({ page }) => {
    await boot(page, R());
    await page.evaluate((r) => { (window as any).__fakeGit.repos[r].branch = "dev"; }, REPO);
    await t(page, "br-panel").click(); // 패널을 열면 상태를 다시 읽는다
    await expect(t(page, "br-current")).toHaveText("dev");
    await expect(row(page, "dev")).toHaveAttribute("data-current", "true");
  });
  test("보드가 보이는 동안 10초마다 갱신된다", async ({ page }) => {
    await page.clock.install();
    await boot(page, R());
    await expect(t(page, "br-sync")).toHaveText("↑2 ↓1");
    await page.evaluate((r) => { const x = (window as any).__fakeGit.repos[r]; x.ahead = 5; x.files.push({ path: "d.ts", status: "M", add: 1, del: 0 }); x.branches.push("late"); }, REPO);
    await page.clock.fastForward(10_500);
    await expect(t(page, "br-sync")).toHaveText("↑5 ↓1");
    await expect(t(page, "br-edited")).toHaveText("4 files edited");
    await expect(row(page, "late")).toHaveCount(1);
  });
  test("저장·복원 왕복: 필드는 kind 뿐이고 복원하면 살아 있는 내용이 다시 보인다", async ({ page, context }) => {
    await boot(page, R());
    const hd = (await page.locator("[data-node-handle]").first().boundingBox())!;
    await page.mouse.move(hd.x + hd.width - 20, hd.y + 10);
    await page.mouse.down();
    await page.mouse.move(hd.x + hd.width + 60, hd.y + 50, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => page.evaluate(async () => { const s = await (window as any).__shell.saved("ws-fake"); return JSON.parse(s ?? "{}").nodes?.[0]?.x; }), { timeout: 10_000 }).not.toBe(-150);
    const json = await page.evaluate(async () => (await (window as any).__shell.saved("ws-fake")) as string);
    const n = JSON.parse(json).nodes[0];
    expect(Object.keys(n).sort()).toEqual(["h", "id", "kind", "w", "x", "y", "z"]);
    expect(n.kind).toBe("branches");
    const page2 = await context.newPage();
    await boot(page2, R(), [], json);
    await expect(t(page2, "br-current")).toHaveText("main");
    expect(await names(page2)).toEqual(["dev", "feat/x", "main"]);
  });
  test("머리줄만 끌린다(목록 빈 곳을 끌어도 노드는 안 움직인다)", async ({ page }) => {
    await boot(page, R());
    const before = (await t(page, "br-root").boundingBox())!;
    await page.mouse.move(before.x + 60, before.y + 330);
    await page.mouse.down();
    await page.mouse.move(before.x + 200, before.y + 300, { steps: 5 });
    await page.mouse.up();
    const after = (await t(page, "br-root").boundingBox())!;
    expect([after.x, after.y]).toEqual([before.x, before.y]);
    const hd = (await page.locator("[data-node-handle]").first().boundingBox())!;
    await page.mouse.move(hd.x + hd.width - 20, hd.y + 10);
    await page.mouse.down();
    await page.mouse.move(hd.x + hd.width + 80, hd.y + 70, { steps: 5 });
    await page.mouse.up();
    const moved = (await t(page, "br-root").boundingBox())!;
    expect(moved.x).toBeGreaterThan(before.x + 50);
  });
  test("크기 조절은 최소 240×200 까지", async ({ page }) => {
    await boot(page, R());
    await page.locator("[data-node-handle]").first().click({ position: { x: 150, y: 10 } });
    const b = (await page.locator('[data-handle="se"]').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x - 300, b.y - 300, { steps: 6 });
    await page.mouse.up();
    const nb = (await page.locator("[data-node-id]").first().boundingBox())!;
    expect([Math.round(nb.width), Math.round(nb.height)]).toEqual([240, 200]);
  });
});
