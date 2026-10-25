import { expect, test, type Page } from "@playwright/test";

// B15 S-660~S-667: 출력 viewer. 가짜 PTY + 가짜 lastReply(window.__fakeReply) + 가짜 클립보드
// 시험 후크: window.__fakeReply(문자열) = Claude/Codex transcript 의 마지막 답, window.__savedOutputs = Save .md 호출 기록
const LONG = "첫 문단입니다. 이 답은 여든 글자를 넘기기 위해 일부러 길게 쓴 글입니다. 끝까지 읽어 주세요.\n\n```ts\nconst x = 1;\n```\n\n마지막 문단.";
const ids = (page: Page) => page.evaluate(() => (window as any).__fakePty.ids() as number[]);
const emit = (page: Page, id: number, text: string) => page.evaluate(([i, t]) => (window as any).__fakePty.emit(i, t), [id, text] as const);
const status = (page: Page) => page.getByTestId("console-status").first();
const icon = (page: Page) => page.getByTestId("console-output");
const setReply = (page: Page, r: string | null) => page.evaluate((v) => ((window as any).__fakeReply = v), r);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__clip = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => void (window as any).__clip.push(t) }, configurable: true });
  });
  await page.setViewportSize({ width: 1400, height: 900 });
});

// 에이전트 콘솔이 일을 마친(RUNNING) 상태까지
async function finish(page: Page, reply: string | null) {
  await page.goto("/?console=1&agent=claude");
  const [id] = await ids(page);
  await setReply(page, reply);
  await emit(page, id, "working...\r\n");
  await expect(status(page)).toHaveText("WORKING");
  await expect(status(page)).toHaveText("RUNNING", { timeout: 4000 });
  return id;
}

test("S-660 짧은 답(<80자, 1문단)이면 See output 아이콘이 없다", async ({ page }) => {
  await finish(page, "짧은 답");
  await expect(icon(page)).toHaveCount(0);
});

test("S-660 긴 답이면 아이콘이 나타나고, 일하는 동안(WORKING)은 숨는다", async ({ page }) => {
  const id = await finish(page, LONG);
  await expect(icon(page)).toHaveCount(1);
  await expect(icon(page)).toHaveAttribute("title", "See output");
  await emit(page, id, "again\r\n");
  await expect(status(page)).toHaveText("WORKING");
  await expect(icon(page)).toHaveCount(0);
  await expect(status(page)).toHaveText("RUNNING", { timeout: 4000 });
  await expect(icon(page)).toHaveCount(1);
});

test("S-662 transcript 를 못 읽으면(null) 화면 방식으로 대신한다", async ({ page }) => {
  await finish(page, null);
  // 화면에 찍힌 'working...' 한 줄(<80자)이라 아이콘은 없지만, 긴 출력이면 나타난다
  await expect(icon(page)).toHaveCount(0);
  const [id] = await ids(page);
  await emit(page, id, "화면에 나온 아주 긴 답 ".repeat(8) + "\r\n");
  await expect(status(page)).toHaveText("WORKING");
  await expect(status(page)).toHaveText("RUNNING", { timeout: 4000 });
  await expect(icon(page)).toHaveCount(1);
});

test("S-661 그 밖 에이전트(Shell)는 화면의 마지막 입력 줄 뒤 출력을 답으로 본다", async ({ page }) => {
  await page.goto("/?console=1&agent=shell");
  const [id] = await ids(page);
  await page.locator(".xterm").click();
  await page.keyboard.type("echo");
  await page.keyboard.press("Enter");
  await emit(page, id, "셸이 낸 긴 출력 줄 ".repeat(8) + "\r\n");
  await expect(status(page)).toHaveText("RUNNING", { timeout: 4000 });
  await expect(icon(page)).toHaveCount(1);
  await icon(page).click();
  await expect(page.getByTestId("output-text")).toContainText("셸이 낸 긴 출력 줄");
  await expect(page.getByTestId("output-text")).not.toContainText("echo");
});

test("S-663 icon 클릭 → viewer 가 답 전체를 보이고 코드 블록은 고정폭", async ({ page }) => {
  await finish(page, LONG);
  await icon(page).click();
  const v = page.getByTestId("output-viewer");
  await expect(v).toBeVisible();
  await expect(page.getByTestId("output-text")).toContainText("첫 문단입니다");
  await expect(page.getByTestId("output-text")).toContainText("마지막 문단.");
  const code = page.getByTestId("output-code");
  await expect(code).toHaveText("const x = 1;");
  expect(await code.evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/mono|consolas|courier/i);
  expect(await page.getByTestId("output-text").evaluate((e) => getComputedStyle(e).whiteSpace)).toBe("pre-wrap"); // 줄바꿈 유지
});

test("S-664 Copy 는 답을 클립보드로", async ({ page }) => {
  await finish(page, LONG);
  await icon(page).click();
  await page.getByTestId("output-copy").click();
  expect(await page.evaluate(() => (window as any).__clip)).toEqual([LONG]);
});

test("S-665 Save .md 는 outputs/ 경로를 보이고, 날짜 줄이 첫 줄", async ({ page }) => {
  await finish(page, LONG);
  await icon(page).click();
  await page.getByTestId("output-save").click();
  const shown = page.getByTestId("output-saved");
  await expect(shown).toContainText("C:/fake/repo/outputs/Otto-");
  await expect(shown).toContainText(".md");
  const saved = await page.evaluate(() => (window as any).__savedOutputs as { repo: string; name: string; stamp: string; content: string }[]);
  expect(saved).toHaveLength(1);
  expect(saved[0].name).toBe("Otto");
  expect(saved[0].stamp).toMatch(/^\d{8}-\d{4}$/);
  const [first, ...rest] = saved[0].content.split("\n");
  expect(first).toMatch(/^Saved \d{4}-\d{2}-\d{2} \d{2}:\d{2} · Otto \(Claude\)$/);
  expect(rest.join("\n")).toContain(LONG);
});

test("S-666 Reply to Otto: 입력 후 보내면 그 콘솔에 한 줄 + Enter, 입력칸은 비고 viewer 는 열려 있다", async ({ page }) => {
  const id = await finish(page, LONG);
  await icon(page).click();
  const input = page.getByTestId("output-reply-input");
  await expect(page.getByTestId("output-reply-send")).toContainText("Reply to Otto");
  await input.fill("고마워요 계속 해 주세요");
  await input.press("Enter");
  await expect.poll(async () => (await page.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id)).slice(-2)).toEqual(["고마워요 계속 해 주세요", "\r"]);
  await expect(input).toHaveValue("");
  await expect(page.getByTestId("output-viewer")).toBeVisible();
});

test("S-667 Esc 로 닫는다", async ({ page }) => {
  await finish(page, LONG);
  await icon(page).click();
  await expect(page.getByTestId("output-viewer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("output-viewer")).toHaveCount(0);
});

test("S-660 라이브 상태가 켜진 에이전트가 READY 가 되면 See output 아이콘 (FX5 D4)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ liveStatus: true })));
  await page.goto("/?console=1&agent=claude");
  const id = await page.locator("[data-node-id]").first().getAttribute("data-node-id");
  const ev = (e: string, p?: object) => page.evaluate(([n, x, y]) => (window as any).__agentEvent(n, x, y), [id, e, p] as const);
  await ev("SessionStart");
  await ev("PreToolUse", { tool_name: "Bash", tool_input: { command: "npm test" } });
  await expect(status(page)).toHaveText("WORKING");
  await expect(icon(page)).toHaveCount(0);
  await ev("Stop", { last_assistant_message: LONG });
  await expect(status(page)).toHaveText("READY");
  await expect(icon(page)).toHaveCount(1);
});
