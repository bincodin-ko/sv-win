import { expect, test, type Page } from "@playwright/test";

// D6 Orchestrator 카드 (S-1250~S-1266). 가짜 PTY(Tauri 밖), ?kindsTest 로 상태 읽기 창구(window.__kt) 사용.
// 구현이 맞출 약속(이름): 카드 data-testid="orch-card", 이름 orch-name, 머리 토글 orch-toggle(글자 Connect/Done), 보조줄 orch-sub, 카운터 orch-count,
//   빈 본문 orch-empty("No agents wired") · orch-empty-connect("+ Connect") · orch-spawn("Spawn agent"),
//   행 orch-row(data-id=콘솔 id) · 뱃지 orch-badge, 그룹 구역 헤더 orch-group-<그룹 id>, 행 아이콘 orch-<focus|pause|resume|restart|kill>-<콘솔 id>,
//   우클릭 메뉴 orch-menu-restart · orch-menu-disconnect · orch-menu-disconnect-group, 입력 orch-input, 마지막 답 한 줄 orch-reply, 본문 orch-rows.
// 줌 0.5, 뷰포트 1400×900, 보드 이동 0 이면 월드 (x,y) = 화면 (700 + x/2, 450 + y/2). 콘솔 720×440 = 화면 360×220.
test.use({ actionTimeout: 5000 });
type N = Record<string, unknown> & { id: string };
const con = (id: string, x: number, y: number, name: string, g?: string): N => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name, agentId: "claude", textSize: null, yolo: false, ...(g ? { groupId: g } : {}) });
const card = (wired: string[], extra: Record<string, unknown> = {}): N => ({ id: "o1", kind: "orchestrator", x: 800, y: -300, w: 380, h: 520, z: 5, name: "Orchestrator", wired, collapsed: [], ...extra });
const C1 = con("c1", -760, -400, "Otto"), C2 = con("c2", 40, -400, "Ivy"), C3 = con("c3", -760, 300, "Max", "g1"), C4 = con("c4", 40, 300, "Zed", "g1");
const GROUPS = [{ id: "g1", name: "Team", role: "general" }];

const seed = async (page: Page, nodes: N[], waitPty = true) => {
  const board = JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 0.5 }, nodes, groups: GROUPS });
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), board);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  const cons = nodes.filter((n) => n.kind === "console").length;
  await expect(page.getByTestId("console")).toHaveCount(cons);
  if (cons && waitPty) await expect.poll(() => page.evaluate(() => (window as any).__fakePty.ids().length as number)).toBe(cons);
};
type Snap = { selection: string[]; nodes: (N & { wired?: string[]; collapsed?: string[]; lastOrder?: { text: string } })[] };
const st = (page: Page) => page.evaluate(() => (window as any).__kt.st() as Snap);
const nodeOf = async (page: Page, id: string) => (await st(page)).nodes.find((n) => n.id === id);
const wiredOf = async (page: Page, id = "o1") => ((await nodeOf(page, id))?.wired ?? []) as string[];
const ctl = (page: Page) => page.evaluate(() => (window as any).__fakePty.ctl() as { id: number; op: string }[]);
const writes = (page: Page) => page.evaluate(() => { const f = (window as any).__fakePty; return (f.ids() as number[]).map((i) => [i, (f.writes(i) as string[]).join("")] as const); });
const emitAll = (page: Page) => page.evaluate(() => { const f = (window as any).__fakePty; (f.ids() as number[]).forEach((i) => f.emit(i, "hi")); });
const T = (page: Page, id: string) => page.getByTestId(id);
const row = (page: Page, id: string) => page.locator(`[data-testid="orch-row"][data-id="${id}"]`);
const wire = (page: Page, to: string) => page.locator(`[data-testid="wire"][data-from="o1"][data-to="${to}"]`);

test.describe("S-1250·S-1252 레일로 놓기·빈 카드", () => {
  test("우측 레일 Insert orchestrator → 이름 Orchestrator, 빈 카드(글자·두 버튼), 최소 크기·지우개 대상 아님", async ({ page }) => {
    await seed(page, [C1, C2]);
    await T(page, "rail-insert-orchestrator").click();
    await expect(T(page, "orch-card")).toBeVisible();
    await expect(T(page, "orch-name")).toHaveText("Orchestrator");
    await expect(T(page, "orch-empty")).toContainText("No agents wired");
    await expect(T(page, "orch-empty-connect")).toHaveText("+ Connect");
    await expect(T(page, "orch-spawn")).toHaveText("Spawn agent");
    const n = (await st(page)).nodes.find((x) => x.kind === "orchestrator")!;
    expect([n.w, n.h]).toEqual([380, 520]);
    expect(n.wired).toEqual([]);
    expect(await T(page, "orch-input").isDisabled()).toBe(true);
    expect(await T(page, "orch-input").getAttribute("placeholder")).toBe("Wire an agent to give orders");
  });
  test("Spawn agent 는 새 콘솔을 만들고 카드에 이미 연결(주황 선)", async ({ page }) => {
    await seed(page, [C1, C2, card([])]);
    await T(page, "orch-spawn").click();
    await expect(T(page, "console")).toHaveCount(3);
    const w = await wiredOf(page);
    expect(w).toHaveLength(1);
    expect(["c1", "c2"]).not.toContain(w[0]);
    await expect(row(page, w[0]!)).toHaveCount(1);
    await expect(wire(page, w[0]!)).toHaveAttribute("data-wire-color", "orange");
    await expect(T(page, "orch-empty")).toHaveCount(0);
  });
});

test.describe("S-1253~S-1255 연결 후 머리·행", () => {
  test("Connect → 콘솔 클릭 → Done: 보조줄 1 agent, 행(이름 · 에이전트)·뱃지, 곡선", async ({ page }) => {
    await seed(page, [C1, C2, card([])]);
    await expect(T(page, "orch-toggle")).toHaveText("Connect");
    await T(page, "orch-toggle").click();
    await expect(T(page, "orch-toggle")).toHaveText("Done");
    await page.locator('[data-node-id="c1"]').click({ position: { x: 100, y: 100 } });
    await T(page, "orch-toggle").click();
    await expect(T(page, "orch-toggle")).toHaveText("Connect");
    expect(await wiredOf(page)).toEqual(["c1"]);
    await expect(T(page, "orch-sub")).toHaveText("1 agent");
    await expect(row(page, "c1")).toContainText("Otto · Claude");
    await expect(wire(page, "c1")).toHaveCount(1);
    await expect(T(page, "orch-count")).toHaveText(/^\d+\/1$/);
    await expect(T(page, "orch-input")).toHaveAttribute("placeholder", "Command 1 agent · @ to direct…");
  });
  test("그룹 연결: 보조줄에 그룹 이름, 구역 헤더 TEAM w/n, 접기 상태 저장, 낱개+그룹 중복은 한 행", async ({ page }) => {
    await seed(page, [C1, C3, C4, card(["c1", "g1", "c3"])]);
    await expect(T(page, "orch-sub")).toHaveText("3 agents · Team");
    await expect(page.locator('[data-testid="orch-row"]')).toHaveCount(3);
    await expect(T(page, "orch-group-g1")).toContainText(/TEAM \d\/2/);
    await T(page, "orch-group-g1").click();
    await expect(page.locator('[data-testid="orch-row"]')).toHaveCount(1); // 그룹 밖 c1 만 남는다
    expect((await nodeOf(page, "o1"))!.collapsed).toEqual(["g1"]);
    await T(page, "orch-group-g1").click();
    await expect(page.locator('[data-testid="orch-row"]')).toHaveCount(3);
  });
  test("뱃지가 0.5초 안에 바뀐다: 출력 후 running", async ({ page }) => {
    await seed(page, [C1, card(["c1"])]);
    await emitAll(page);
    await expect(row(page, "c1").getByTestId("orch-badge")).toHaveText("running", { timeout: 1000 });
  });
});

test.describe("S-1256·S-1257 행 아이콘·Kill session", () => {
  test("호버하면 Focus·Pause·Kill, Pause 후엔 Resume, Focus 는 선택", async ({ page }) => {
    await seed(page, [C1, C2, card(["c1", "c2"])]);
    await emitAll(page);
    await row(page, "c1").hover();
    await expect(T(page, "orch-focus-c1")).toBeVisible();
    await expect(T(page, "orch-pause-c1")).toBeVisible();
    await expect(T(page, "orch-kill-c1")).toBeVisible();
    await T(page, "orch-pause-c1").click();
    expect((await ctl(page)).filter((c) => c.op === "pause")).toHaveLength(1);
    await expect(row(page, "c1").getByTestId("orch-badge")).toHaveText("paused");
    await row(page, "c1").hover();
    await expect(T(page, "orch-resume-c1")).toBeVisible();
    await T(page, "orch-resume-c1").click();
    expect((await ctl(page)).filter((c) => c.op === "resume")).toHaveLength(1);
    await row(page, "c2").hover();
    await T(page, "orch-focus-c2").click();
    expect((await st(page)).selection).toEqual(["c2"]);
  });
  test("Kill session 은 두 번: Confirm? → 3초 안 누르면 원래대로 / 둘째 클릭 → 확인창 → Kill → 콘솔은 남고 done", async ({ page }) => {
    await seed(page, [C1, C2, card(["c1", "c2"])]);
    await emitAll(page);
    await row(page, "c1").hover();
    await T(page, "orch-kill-c1").click();
    await expect(T(page, "orch-kill-c1")).toHaveAttribute("title", "Confirm?");
    await page.waitForTimeout(3300);
    await row(page, "c1").hover();
    await expect(T(page, "orch-kill-c1")).not.toHaveAttribute("title", "Confirm?");
    await T(page, "orch-kill-c1").click();
    await T(page, "orch-kill-c1").click();
    const dlg = page.getByRole("dialog", { name: "Kill Otto's session?" });
    await expect(dlg).toBeVisible();
    await dlg.getByRole("button", { name: "Cancel" }).click();
    expect((await ctl(page)).filter((c) => c.op === "kill")).toHaveLength(0);
    await row(page, "c1").hover();
    await T(page, "orch-kill-c1").click();
    await T(page, "orch-kill-c1").click();
    await page.getByRole("dialog", { name: "Kill Otto's session?" }).getByRole("button", { name: "Kill" }).click();
    await expect.poll(async () => (await ctl(page)).filter((c) => c.op === "kill").length).toBe(1);
    await expect(row(page, "c1").getByTestId("orch-badge")).toHaveText("done");
    await expect(T(page, "console")).toHaveCount(2);
    expect(await wiredOf(page)).toEqual(["c1", "c2"]);
  });
});

test.describe("S-1258·S-1265 우클릭·빈 카드로 복귀", () => {
  test("행 우클릭: Restart session·Disconnect. 마지막을 빼면 빈 카드", async ({ page }) => {
    await seed(page, [C1, C2, card(["c1", "c2"])]);
    await row(page, "c1").click({ button: "right" });
    await expect(T(page, "orch-menu-restart")).toBeVisible();
    await T(page, "orch-menu-disconnect").click();
    expect(await wiredOf(page)).toEqual(["c2"]);
    await expect(row(page, "c1")).toHaveCount(0);
    await row(page, "c2").click({ button: "right" });
    await T(page, "orch-menu-disconnect").click();
    await expect(T(page, "orch-empty")).toContainText("No agents wired");
    await expect(T(page, "orch-input")).toBeDisabled();
  });
  test("그룹 헤더 우클릭: Disconnect group", async ({ page }) => {
    await seed(page, [C1, C3, C4, card(["c1", "g1"])]);
    await T(page, "orch-group-g1").click({ button: "right" });
    await T(page, "orch-menu-disconnect-group").click();
    expect(await wiredOf(page)).toEqual(["c1"]);
  });
});

test.describe("S-1259~S-1262 카드 입력", () => {
  test("지휘 밖 멘션은 콘솔에 안 가고 답이 나온다", async ({ page }) => {
    await seed(page, [C1, C2, card(["c1"])]);
    await emitAll(page);
    await T(page, "orch-input").fill("@Ivy run the tests");
    await T(page, "orch-input").press("Enter");
    await expect(T(page, "orch-reply")).toHaveText("That mention is not connected to this orchestrator");
    expect((await writes(page)).filter(([, w]) => w.length)).toEqual([]);
  });
  test("@everyone 은 연결된 콘솔에만 간다, lastOrder 저장, Esc 는 입력을 비운다", async ({ page }) => {
    await seed(page, [C1, C2, card(["c1"])]);
    await emitAll(page);
    await T(page, "orch-input").fill("@everyone run the tests");
    await T(page, "orch-input").press("Enter");
    await expect.poll(async () => (await writes(page)).filter(([, w]) => w.includes("run the tests")).map(([i]) => i), { timeout: 8000 }).toEqual([1]);
    expect((await nodeOf(page, "o1"))!.lastOrder?.text).toBe("@everyone run the tests");
    await expect(T(page, "orch-input")).toHaveValue("");
    await T(page, "orch-input").fill("draft");
    await T(page, "orch-input").press("Escape");
    await expect(T(page, "orch-input")).toHaveValue("");
  });
  test("카드에서 undo / workspace 는 실행하지 않고 안내", async ({ page }) => {
    await seed(page, [C1, card(["c1"])]);
    await T(page, "orch-input").fill("undo");
    await T(page, "orch-input").press("Enter");
    await expect(T(page, "orch-reply")).toHaveText("Undo, redo and workspace commands work from the main command bar.");
    expect(await nodeOf(page, "o1")).toBeTruthy();
  });
  test("입력 포커스 중 한 글자 키는 입력으로 간다(보드 도구가 안 바뀜)", async ({ page }) => {
    await seed(page, [C1, card(["c1"])]);
    await T(page, "orch-input").click();
    await page.keyboard.type("pv");
    await expect(T(page, "orch-input")).toHaveValue("pv");
    expect((await st(page)).tool).not.toBe("pen");
  });
});

test.describe("S-1266 모양 · 삭제", () => {
  test("모서리 14px, Connect 주황 테두리, Done 주황 채움, 행 간격 6px", async ({ page }) => {
    await seed(page, [C1, C2, card(["c1", "c2"])]);
    expect(await T(page, "orch-card").evaluate((e) => getComputedStyle(e).borderRadius)).toBe("14px");
    expect(await T(page, "orch-toggle").evaluate((e) => getComputedStyle(e).borderTopColor)).toBe("rgb(249, 115, 22)");
    expect(await T(page, "orch-rows").evaluate((e) => getComputedStyle(e).rowGap)).toBe("6px");
    await T(page, "orch-toggle").click();
    expect(await T(page, "orch-toggle").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(249, 115, 22)");
  });
  test("카드를 지워도 콘솔은 그대로", async ({ page }) => {
    await seed(page, [C1, C2, card(["c1", "c2"])]);
    await page.locator('[data-node-id="o1"] [data-node-handle]').click({ position: { x: 60, y: 8 } });
    expect((await st(page)).selection).toEqual(["o1"]);
    await page.keyboard.press("Delete");
    await expect(T(page, "orch-card")).toHaveCount(0);
    await expect(T(page, "console")).toHaveCount(2);
  });
});
