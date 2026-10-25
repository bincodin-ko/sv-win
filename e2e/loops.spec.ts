import { expect, test, type Page } from "@playwright/test";

// D9 Loops 패널 (S-1450~S-1458). 가짜 PTY, 가짜 저장 window.__fakeLoops[repo], 시계 window.__loopNow, 엔진 창구 window.__loops.tick().
// 약속(이름): 열림 loops-panel(폭 860, 가운데 모달 — 영상 node-loops.jpg, 검사 S-1458), 닫기 loops-close, 우측 레일 rail-loops + 배지 rail-loops-badge(0이면 없음),
//   빈 상태 loops-empty, 템플릿 카드 loops-template-<0..6>, loops-scratch,
//   폼 loops-form: lf-chip-<0..6>(TEMPLATES 칩) lf-name lf-instruction lf-when-<schedule|idle|output> lf-every-<분>(칩, aria-pressed) lf-every-n(스피너)
//     lf-output lf-output-error lf-target-all lf-target-pick lf-target-card-<id> lf-pick-<콘솔 id>
//     lf-stop-<runs|minutes|goal>(체크, 켜면 lf-runs lf-minutes lf-goal 입력) lf-goal-mode-<command|agent> lf-goal-agent lf-keep
//     lf-summary lf-live-hint lf-notes lf-cancel lf-create
//   목록 loop-row[data-loop-id] 안에 loop-name loop-countdown loop-toggle loop-run loop-edit loop-delete, loops-new, history-entry
test.use({ actionTimeout: 5000 });
const T0 = 1_800_000_000_000;
type N = Record<string, unknown> & { id: string };
const con = (id: string, x: number, y: number): N => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name: `Claude ${id}`, agentId: "claude", textSize: null, yolo: false });
const C1 = con("c1", -760, -400), C2 = con("c2", 40, -400);
const ORCH: N = { id: "o1", kind: "orchestrator", x: -120, y: 60, w: 240, h: 120, z: 2, wired: [] };

const MEM: N = { id: "m1", kind: "tk-mem", x: 200, y: 60, w: 240, h: 120, z: 2, wired: [] };
const seed = async (page: Page, fake?: Record<string, unknown[]>, live = false) => {
  const board = JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 0.5 }, nodes: [C1, C2, ORCH, MEM], groups: [] });
  if (live) await page.addInitScript(() => localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ liveStatus: true })));
  await page.addInitScript(([b, t, f]) => {
    (window as any).__symSeed = { boards: { "ws-fake": b } };
    (window as any).__loopNow = t;
    if (f) (window as any).__fakeLoops = f;
  }, [board, T0, fake ?? null] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await expect.poll(() => page.evaluate(() => (window as any).__fakePty.ids().length as number)).toBe(2);
  // 엔진이 repo 의 저장된 정의를 처음 불러오는 tick 을 먼저 돌려 둔다(불러오기가 만든 loop 를 덮어쓰지 않게)
  await page.evaluate(async () => { await (window as any).__loops.tick(); });
  await page.waitForTimeout(100);
};
const panel = (p: Page) => p.getByTestId("loops-panel");
const openRail = async (p: Page) => {
  await p.getByTestId("rail-loops").click();
  await expect(panel(p)).toBeVisible();
};
const advance = (p: Page, ms: number) =>
  p.evaluate(async (d) => {
    (window as any).__loopNow += d;
    await (window as any).__loops.tick();
  }, ms);
const writes = (p: Page, id: number) => p.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);
const create = async (p: Page, instr = "check status") => {
  await p.getByTestId("loops-scratch").click();
  await p.getByTestId("lf-instruction").fill(instr);
  await p.getByTestId("lf-create").click();
};

test("S-1450 열기: 우측 레일 · L 키 · Tools › Loops, 닫기 × · Esc", async ({ page }) => {
  await seed(page);
  await expect(panel(page)).toHaveCount(0);
  await openRail(page);
  await page.getByTestId("loops-close").click();
  await expect(panel(page)).toHaveCount(0);
  await page.mouse.click(1300, 100);
  await page.keyboard.press("l");
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await page.getByTestId("tools-btn").click();
  await page.getByRole("menuitem", { name: "Loops" }).click();
  await expect(panel(page)).toBeVisible();
});

test("S-1450 레일 Loops 버튼은 맨 아래, 켜진 loop 가 없으면 배지 없음", async ({ page }) => {
  await seed(page);
  const y = async (id: string) => (await page.getByTestId(id).boundingBox())!.y;
  const [a, b, c] = [await y("rail-presets"), await y("rail-insert-todo"), await y("rail-loops")];
  expect(a < b && b < c).toBe(true);
  await expect(page.getByTestId("rail-loops-badge")).toHaveCount(0);
});

test("S-1458 모달: 폭 860, 가운데에 뜨고 뒤 보드는 그대로 조작된다", async ({ page }) => {
  await seed(page);
  await openRail(page);
  const b = (await panel(page).boundingBox())!;
  expect(Math.abs(b.width - 860)).toBeLessThanOrEqual(2);
  expect(Math.abs(b.x + b.width / 2 - 700)).toBeLessThanOrEqual(2); // 가운데
  await page.mouse.click(300, 700); // 모달 밖 빈 캔버스 클릭은 패널을 닫지 않는다
  await expect(panel(page)).toBeVisible();
  await page.getByTestId("rail-spawn").click(); // 보드 도구가 눌린다
});

test("S-1458 Memory 가 열리면 Loops 는 닫힌다", async ({ page }) => {
  await seed(page);
  await openRail(page);
  await page.evaluate(() => (window as any).__kt.setUi({ memory: { open: true }, loops: { open: false } }));
  await expect(panel(page)).toHaveCount(0);
});

test("S-1451·S-1457 빈 상태: 템플릿 카드 7개(이름) + Start from scratch, 다른 repo 의 loop 는 안 보인다", async ({ page }) => {
  await seed(page, { "C:/other/repo": [{ id: "x", name: "Other", instruction: "z", trigger: { kind: "idle" }, target: { kind: "all" }, stop: {}, keepBehind: true, enabled: false, wsId: "w", repo: "C:/other/repo" }] });
  await openRail(page);
  await expect(page.getByTestId("loops-empty")).toBeVisible();
  await expect(page.locator('[data-testid^="loops-template-"]')).toHaveCount(7);
  const names = ["Progress check", "Keep them moving", "Build rescue", "Test watchdog", "Commit checkpoint", "Review sweep", "Hourly standup"];
  for (const [i, n] of names.entries()) await expect(page.getByTestId(`loops-template-${i}`)).toContainText(n);
  await expect(page.getByTestId("loops-scratch")).toContainText("Start from scratch");
  await expect(page.getByTestId("loop-row")).toHaveCount(0);
});

test("S-1451·S-1453 템플릿 카드를 누르면 폼이 그 템플릿으로 채워진다", async ({ page }) => {
  await seed(page);
  await openRail(page);
  await page.getByTestId("loops-template-3").click();
  await expect(page.getByTestId("lf-name")).toHaveValue("Test watchdog");
  await expect(page.getByTestId("lf-instruction")).toHaveValue("Run the tests. If anything fails, fix it.");
  await expect(page.getByTestId("lf-every-15")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("lf-chip-2").click(); // TEMPLATES 칩 줄: Build rescue = output "error"
  await expect(page.getByTestId("lf-when-output")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("lf-output")).toHaveValue("error");
});

test("S-1453·S-1454 WHEN 카드 3개 전환: 주기 칩(15 min 기본)·스피너 / idle / output 입력, output 2자 미만 오류", async ({ page }) => {
  await seed(page);
  await openRail(page);
  await page.getByTestId("loops-scratch").click();
  await expect(page.getByTestId("lf-when-schedule")).toHaveAttribute("aria-checked", "true");
  for (const m of [5, 10, 15, 30, 60, 120]) await expect(page.getByTestId(`lf-every-${m}`)).toBeVisible();
  await expect(page.getByTestId("lf-every-15")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("lf-every-30").click();
  await expect(page.getByTestId("lf-every-n")).toHaveValue("30");
  await page.getByTestId("lf-when-idle").click();
  await expect(page.getByTestId("lf-every-15")).toHaveCount(0);
  await expect(page.getByTestId("lf-output")).toHaveCount(0);
  await page.getByTestId("lf-when-output").click();
  await page.getByTestId("lf-instruction").fill("fix it");
  await page.getByTestId("lf-output").fill("e");
  await expect(page.getByTestId("lf-output-error")).toHaveText("At least two characters");
  await expect(page.getByTestId("lf-create")).toBeDisabled();
  await page.getByTestId("lf-output").fill("er");
  await expect(page.getByTestId("lf-output-error")).toHaveCount(0);
  await expect(page.getByTestId("lf-create")).toBeEnabled();
});

test("S-1454 지시가 비면 Create 비활성, 목표를 켰는데 입력이 비면 비활성, 범위 밖 횟수는 고치고 알린다", async ({ page }) => {
  await seed(page);
  await openRail(page);
  await page.getByTestId("loops-scratch").click();
  await expect(page.getByTestId("lf-create")).toBeDisabled();
  await page.getByTestId("lf-instruction").fill("go");
  await expect(page.getByTestId("lf-create")).toBeEnabled();
  await page.getByTestId("lf-stop-goal").check();
  await expect(page.getByTestId("lf-create")).toBeDisabled();
  await page.getByTestId("lf-goal").fill("npm test");
  await expect(page.getByTestId("lf-create")).toBeEnabled();
  await page.getByTestId("lf-stop-runs").check();
  await page.getByTestId("lf-runs").fill("500");
  await page.getByTestId("lf-runs").blur();
  await expect(page.getByTestId("lf-runs")).toHaveValue("200");
  await expect(page.getByTestId("lf-notes")).toContainText("200");
});

test("S-1453 TARGET: All · Pick(콘솔 체크) · orchestrator 카드마다 한 줄, STOP 토글 3개, 목표 모드, 요약문", async ({ page }) => {
  await seed(page);
  await openRail(page);
  await page.getByTestId("loops-scratch").click();
  await expect(page.getByTestId("lf-target-all")).toBeChecked();
  await expect(page.getByTestId("lf-target-card-o1")).toBeVisible();
  await expect(page.getByTestId("lf-target-card-m1")).toHaveCount(0); // S-1453: Memory 카드는 대상이 아니다
  await page.getByTestId("lf-target-pick").check();
  await expect(page.getByTestId("lf-pick-c1")).toBeVisible();
  await expect(page.getByTestId("lf-pick-c2")).toBeVisible();
  await page.getByTestId("lf-target-all").check();
  for (const s of ["runs", "minutes", "goal"]) await expect(page.getByTestId(`lf-stop-${s}`)).not.toBeChecked();
  await page.getByTestId("lf-stop-goal").check();
  await page.getByTestId("lf-goal-mode-agent").check();
  await expect(page.getByTestId("lf-goal-agent")).toBeVisible();
  const sum = page.getByTestId("lf-summary");
  await expect(sum).toContainText("Every 15 min, the instruction is sent to every console on the board");
  await expect(sum).toContainText("until Claude judges the goal met");
  await expect(sum).toContainText("≈ 8 prompts/hour across 2 consoles");
  await expect(page.getByTestId("lf-keep")).toBeChecked();
});

test("S-1456 idle 트리거 + live status 꺼짐이면 안내 문구와 Settings 링크", async ({ page }) => {
  await seed(page);
  await openRail(page);
  await page.getByTestId("loops-scratch").click();
  await expect(page.getByTestId("lf-live-hint")).toHaveCount(0);
  await page.getByTestId("lf-when-idle").click();
  const hint = page.getByTestId("lf-live-hint");
  await expect(hint).toContainText("Needs live agent status — turn it on in Settings › Agents.");
  await hint.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
});

test("S-1456 live status 는 켜졌어도 hook 이 아직 없는 대상 콘솔이 있으면 idle 안내가 보인다", async ({ page }) => {
  await seed(page, undefined, true);
  await openRail(page);
  await page.getByTestId("loops-scratch").click();
  await page.getByTestId("lf-when-idle").click();
  await expect(page.getByTestId("lf-live-hint")).toContainText("Needs live agent status");
});

test("S-1452·S-1455·S-1457 Create loop → 목록 행(이름·카운트다운·토글·▶·삭제 두 번), 배지, ▶ 한 줄 입력, 기록", async ({ page }) => {
  await seed(page);
  await openRail(page);
  await create(page, "check status");
  await expect(page.getByTestId("lf-create")).toHaveCount(0); // 폼은 닫히고 목록으로
  const row = page.getByTestId("loop-row");
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId("loop-name")).toHaveText("Loop 1");
  await expect(row.getByTestId("loop-countdown")).toHaveText("in 15:00");
  await expect(row.getByTestId("loop-toggle")).toBeChecked();
  await expect(page.getByTestId("rail-loops-badge")).toHaveText("1");
  await advance(page, 60_000);
  await expect(row.getByTestId("loop-countdown")).toHaveText("in 14:00");
  const id = await page.evaluate(() => (window as any).__fakePty.ids()[0] as number);
  await row.getByTestId("loop-run").click();
  await expect.poll(async () => (await writes(page, id)).slice(-2)).toEqual(["check status", "\r"]);
  await expect(page.getByTestId("history-entry").first()).toBeVisible();
  await row.getByTestId("loop-toggle").uncheck();
  await expect(row.getByTestId("loop-countdown")).toHaveText("off");
  await expect(page.getByTestId("rail-loops-badge")).toHaveCount(0);
  await page.getByTestId("loops-new").click();
  await expect(page.getByTestId("loops-form")).toBeVisible();
  await page.getByTestId("lf-cancel").click();
  await row.getByTestId("loop-delete").click();
  await expect(row).toHaveCount(1); // 한 번 누르면 아직 있다
  await row.getByTestId("loop-delete").click();
  await expect(row).toHaveCount(0);
  await expect(page.getByTestId("loops-empty")).toBeVisible();
});

test("S-1452 편집(연필) → Save 로 이름 바꾸기", async ({ page }) => {
  await seed(page);
  await openRail(page);
  await create(page);
  await page.getByTestId("loop-edit").click();
  await expect(page.getByTestId("lf-create")).toHaveText("Save");
  await page.getByTestId("lf-name").fill("Renamed");
  await page.getByTestId("lf-create").click();
  await expect(page.getByTestId("loop-name")).toHaveText("Renamed");
});
