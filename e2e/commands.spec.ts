import { expect, test, type Page } from "@playwright/test";

// B12: 명령 실행기·주문 전달·보고(S-600~S-618). 가짜 IPC·가짜 PTY만 쓴다(실제 에이전트에 입력하지 않는다).
// 콘솔 이름은 Otto, Dax, Bex… 순(console/names.ts).
const input = (p: Page) => p.getByTestId("bar-input");
const msgs = (p: Page) => p.getByTestId("thread-msg");
const cons = (p: Page) => p.getByTestId("console");
const status = (p: Page, n: number) => p.getByTestId("console-status").nth(n);
const ids = (p: Page) => p.evaluate(() => (window as any).__fakePty.ids() as number[]);
const writes = (p: Page, id: number) => p.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);
const ctl = (p: Page) => p.evaluate(() => (window as any).__fakePty.ctl() as { id: number; op: string }[]);
const emit = (p: Page, id: number, t: string) => p.evaluate(([i, s]) => (window as any).__fakePty.emit(i, s), [id, t] as const);

const say = async (p: Page, t: string) => {
  await input(p).fill(t);
  await input(p).press("Enter");
};
const lastMsg = (p: Page) => msgs(p).last();

/** n 개의 Claude 콘솔로 시작. 스레드를 열어 둔다 */
const open = async (p: Page, n = 2) => {
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto(n ? `/?console=${n}&agent=claude` : "/");
  await expect(p.getByTestId("command-bar")).toBeVisible();
  if (n) await expect(cons(p)).toHaveCount(n);
  await p.getByTestId("thread-toggle").click();
  await expect(p.getByTestId("thread-panel")).toBeVisible();
};
/** Shell 콘솔 하나를 더한다(명령 "spawn 1 shell") */
const addShell = (p: Page) => say(p, "spawn 1 shell");
/** 모든 가짜 PTY 가 첫 출력을 낸 것으로 만든다(시작 중인 콘솔에는 보내지 않는다, S-606) */
const warm = async (p: Page) => {
  for (const id of await ids(p)) await emit(p, id, "Welcome\r\n> ");
};

test("S-600 spawn 3 codex -> 콘솔 3개, make a group of two claude -> 그룹", async ({ page }) => {
  await open(page, 0);
  await say(page, "spawn 3 codex");
  await expect(cons(page)).toHaveCount(3);
  await expect(page.getByTestId("console-badge")).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(page.getByTestId("console-badge").nth(i)).toHaveAttribute("title", "codex");
  await expect(lastMsg(page)).toContainText("3");
  await expect(page.getByTestId("group-halo")).toHaveCount(0);
  await say(page, "make a group of two claude");
  await expect(cons(page)).toHaveCount(5);
  await expect(page.getByTestId("group-halo")).toHaveCount(1);
});

test("S-533 12 를 넘는 요청은 12 로 줄이고 알린다", async ({ page }) => {
  await open(page, 0);
  await say(page, "spawn 20 claude");
  await expect(cons(page)).toHaveCount(12);
  await expect(lastMsg(page)).toContainText("12");
});

test("S-603 pause Otto -> PAUSED, resume -> 되돌아옴(확인 없음)", async ({ page }) => {
  await open(page);
  await say(page, "pause Otto");
  await expect(status(page, 0)).toHaveText("PAUSED");
  await expect(status(page, 1)).not.toHaveText("PAUSED");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await ctl(page)).filter((c) => c.op === "pause")).toHaveLength(1);
  await say(page, "resume");
  await expect(status(page, 0)).not.toHaveText("PAUSED");
  expect((await ctl(page)).filter((c) => c.op === "resume")).toHaveLength(1);
});

test("S-601 kill Otto -> 확인 질문 -> yes 로 닫힘", async ({ page }) => {
  await open(page);
  await say(page, "kill Otto");
  await expect(lastMsg(page)).toContainText("Close Otto? Say yes or click Confirm");
  await expect(cons(page)).toHaveCount(2);
  await say(page, "yes");
  await expect(cons(page)).toHaveCount(1);
  await expect(page.getByTestId("console-name")).toHaveText("Dax");
});

test("S-601 no 나 다른 말은 취소, 스레드의 Confirm 버튼은 실행", async ({ page }) => {
  await open(page);
  await say(page, "kill Otto");
  await say(page, "no");
  await expect(lastMsg(page)).toContainText("Cancelled");
  await expect(cons(page)).toHaveCount(2);
  await say(page, "kill Dax");
  await say(page, "thanks");
  await say(page, "yes"); // 이미 취소됨 -> 아무 일도 없다
  await expect(cons(page)).toHaveCount(2);
  await say(page, "kill Dax");
  await page.getByTestId("confirm-btn").click();
  await expect(cons(page)).toHaveCount(1);
  await expect(page.getByTestId("console-name")).toHaveText("Otto");
});

test("S-601 restart 도 확인 뒤에 한다", async ({ page }) => {
  await open(page);
  const before = (await ids(page)).length;
  await say(page, "restart Otto");
  await expect(lastMsg(page)).toContainText("Restart Otto?");
  expect((await ids(page)).length).toBe(before);
  await say(page, "go ahead");
  await expect.poll(async () => (await ids(page)).length).toBe(before); // 하나 끝나고 하나 새로 시작
  await expect.poll(async () => (await ctl(page)).filter((c) => c.op === "kill").length).toBe(1);
});

test("S-605·S-609 @Otto run the tests -> Otto 에 한 줄 + 150ms 뒤 Enter, Shell 에는 아무것도 안 간다", async ({ page }) => {
  await open(page);
  await addShell(page);
  await expect(cons(page)).toHaveCount(3);
  await warm(page);
  const [otto, dax, sh] = await ids(page);
  await say(page, "@Otto run the tests");
  await expect.poll(() => writes(page, otto!)).toEqual(["run the tests"]); // 먼저 붙여 넣기만
  await expect.poll(() => writes(page, otto!)).toEqual(["run the tests", "\r"]);
  expect(await writes(page, dax!)).toEqual([]);
  expect(await writes(page, sh!)).toEqual([]);
  await expect(page.getByTestId("thread-msg").filter({ hasText: "Plan – tell → Otto 1 ← run the tests" })).toHaveCount(1);
});

test("S-604 Shell 콘솔 이름으로 말하면 보내지 않고 알린다", async ({ page }) => {
  await open(page);
  await addShell(page);
  await expect(cons(page)).toHaveCount(3);
  await warm(page);
  const sh = (await ids(page))[2]!;
  const agents = await page.getByTestId("console-badge").evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  const name = (await page.getByTestId("console-name").allTextContents())[agents.indexOf("shell")]!;
  await say(page, `@${name} rm -rf x`);
  await expect(lastMsg(page)).toContainText("shell");
  await page.waitForTimeout(500);
  expect(await writes(page, sh)).toEqual([]);
});

test("S-609 ③ 에이전트가 둘 이상인데 이름이 없으면 보내지 않고 안내", async ({ page }) => {
  await open(page);
  await warm(page);
  await say(page, "run the tests");
  await expect(lastMsg(page)).toContainText("Say who it is for first");
  await page.waitForTimeout(500);
  for (const id of await ids(page)) expect(await writes(page, id)).toEqual([]);
});

test("S-609 ④ 에이전트가 하나뿐이면 이름 없이도 그에게", async ({ page }) => {
  await open(page, 1);
  await warm(page);
  await say(page, "run the tests");
  const id = (await ids(page))[0]!;
  await expect.poll(() => writes(page, id)).toEqual(["run the tests", "\r"]);
});

test("S-606 출력이 아직 없는 콘솔에는 보내지 않고 기다린다", async ({ page }) => {
  await open(page, 1);
  const id = (await ids(page))[0]!;
  await say(page, "@Otto hello");
  await page.waitForTimeout(800);
  expect(await writes(page, id)).toEqual([]);
  await emit(page, id, "Welcome\r\n> ");
  await expect.poll(() => writes(page, id)).toEqual(["hello", "\r"]);
});

test("S-607·S-608 권한 프롬프트가 떠 있으면 기다리고, cancel that 은 대기분을 버린다", async ({ page }) => {
  await open(page, 1);
  const id = (await ids(page))[0]!;
  await emit(page, id, "Bash command\r\n npm test\r\n Do you want to proceed?\r\n ❯ 1. Yes\r\n   2. No\r\n");
  await say(page, "@Otto run the tests");
  await page.waitForTimeout(800);
  expect(await writes(page, id)).toEqual([]);
  await say(page, "cancel that");
  await expect(lastMsg(page)).toContainText("Cancelled");
  await emit(page, id, "\x1b[2J\x1b[H> ");
  await page.waitForTimeout(800);
  expect(await writes(page, id)).toEqual([]);
  // 프롬프트가 사라지면 새 주문은 간다
  await say(page, "@Otto again");
  await expect.poll(() => writes(page, id)).toEqual(["again", "\r"]);
});

test("S-612 status 는 콘솔 수를 상태별로 센다", async ({ page }) => {
  await open(page);
  await say(page, "status");
  await expect(lastMsg(page)).toHaveText("2 consoles: 2 starting"); // 아직 출력이 없다
  await warm(page);
  await say(page, "status");
  await expect(lastMsg(page)).toHaveText(/^2 consoles: (2 working|1 working, 1 ready|2 ready)$/);
  await say(page, "pause Otto");
  await say(page, "status");
  await expect(lastMsg(page)).toContainText("1 paused");
});

test("S-615 zoom in / show me everything -> 뷰가 바뀐다", async ({ page }) => {
  await open(page);
  const pct = () => page.getByTestId("zoom-pct").innerText();
  const p0 = await pct();
  await say(page, "zoom in");
  await expect.poll(pct).not.toBe(p0);
  const p1 = await pct();
  await say(page, "zoom out");
  await expect.poll(pct).not.toBe(p1);
  await say(page, "show me everything");
  await expect(page.getByTestId("console").first()).toBeVisible();
});

test("S-616 new workspace called QA -> 탭이 늘고 QA", async ({ page }) => {
  await open(page);
  const tabs = page.getByTestId("tab");
  const n = await tabs.count();
  await say(page, "new workspace called QA");
  await expect(tabs).toHaveCount(n + 1);
  await expect(page.getByTestId("tab-name").last()).toHaveText("QA");
});

test("S-617 thanks 는 콘솔에 안 가고, 못 알아듣는 말·later 에는 정해진 답", async ({ page }) => {
  await open(page);
  await warm(page);
  await say(page, "thanks");
  await expect(msgs(page)).toHaveCount(2); // 내 말 + 답
  await say(page, "git status"); // S-1062: push 는 실행되고, 그 밖의 git … 만 later
  await expect(lastMsg(page)).toHaveText("That isn't available in this version yet.");
  await say(page, "make everything faster somehow");
  await expect(lastMsg(page)).toContainText("I couldn't read that without the planner");
  await page.waitForTimeout(500);
  for (const id of await ids(page)) expect(await writes(page, id)).toEqual([]);
});

test("S-614 help 는 쓸 수 있는 명령을 보여 준다", async ({ page }) => {
  await open(page);
  await say(page, "help");
  await expect(lastMsg(page)).toContainText("spawn");
});

test("S-611 보고: 주문을 받은 콘솔의 출력이 3초 멈추면 finished 행과 See output", async ({ page }) => {
  await open(page, 1);
  await warm(page);
  const id = (await ids(page))[0]!;
  await say(page, "@Otto run the tests");
  await expect.poll(() => writes(page, id)).toEqual(["run the tests", "\r"]);
  await emit(page, id, "All tests passed\r\n");
  const row = page.locator('[data-testid="thread-msg"][data-role="report"]');
  await expect(row).toHaveCount(0);
  await expect(row).toHaveCount(1, { timeout: 10_000 });
  await expect(row).toContainText("Otto");
  await expect(row).toContainText(/finished · \d+s/);
  await expect(row.getByTestId("see-output")).toBeVisible();
});
