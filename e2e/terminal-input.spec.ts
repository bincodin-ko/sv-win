import { expect, test, type Page } from "@playwright/test";

// S-130~S-135, S-073: 가짜 PTY(Tauri 밖)로 터미널 입력을 시험한다. 쿼리: ?console=1&agent=shell
const ids = (page: Page) => page.evaluate(() => (window as any).__fakePty.ids() as number[]);
const writes = (page: Page, id: number) => page.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);
const emit = (page: Page, id: number, t: string) => page.evaluate(([i, s]) => (window as any).__fakePty.emit(i, s), [id, t] as const);
const resizes = (page: Page, id: number) => page.evaluate((i) => (window as any).__fakePty.resizes(i) as [number, number][], id);
// 클립보드 권한 없이도 되게 paste 이벤트를 직접 일으킨다(Ctrl+V 가 브라우저에서 만드는 것과 같은 이벤트)
const paste = (page: Page, text: string) =>
  page.evaluate((t) => {
    const ta = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement;
    ta.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    ta.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
const open = async (page: Page) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=shell");
  const [id] = await ids(page);
  await page.locator(".xterm").click();
  return id;
};
const sent = async (page: Page, id: number) => (await writes(page, id)).join("");

test("S-133 여러 줄 붙여넣기: 대화상자 Cancel / One Line / Lines", async ({ page }) => {
  const id = await open(page);
  await paste(page, "ls\ncd x\npwd");
  await expect(page.getByText("Paste 3 lines as commands?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Paste 3 lines as commands?")).toHaveCount(0);
  expect(await sent(page, id)).toBe("");

  await paste(page, "ls\ncd x\npwd");
  await page.getByRole("button", { name: "Paste as One Line" }).click();
  await expect.poll(() => sent(page, id)).toBe("ls cd x pwd");

  await paste(page, "a\nb\n");
  await expect(page.getByText("Paste 2 lines as commands?")).toBeVisible();
  await page.getByRole("button", { name: "Paste Lines" }).click();
  await expect.poll(() => sent(page, id)).toBe("ls cd x pwda\rb\r"); // xterm paste 는 줄바꿈을 \r 로
});

test("S-133 한 줄(또는 끝 빈 줄뿐)은 질문 없이, 제어문자는 지움", async ({ page }) => {
  const id = await open(page);
  await paste(page, "echo hi\n\n");
  await expect.poll(() => sent(page, id)).toBe("echo hi\r\r"); // 끝 빈 줄만 있으면 1줄 → 질문 없음
  await expect(page.getByText(/lines as commands/)).toHaveCount(0);
  await paste(page, "x\x1by\x07z");
  await expect.poll(() => sent(page, id)).toBe("echo hi\r\rxyz");
});

test("S-133 bracketed paste 를 켠 프로그램은 질문 없이 붙는다", async ({ page }) => {
  const id = await open(page);
  await emit(page, id, "\x1b[?2004h");
  await expect.poll(() => page.evaluate((i) => (window as any).__terms.get(i).modes.bracketedPasteMode, id)).toBe(true);
  await paste(page, "l1\nl2\nl3");
  await expect(page.getByText(/lines as commands/)).toHaveCount(0);
  await expect.poll(() => sent(page, id)).toBe("\x1b[200~l1\rl2\rl3\x1b[201~");
});

test("S-131 Ctrl+Shift+Backspace 는 \x15, 선택 없는 Ctrl+C 는 ^C 그대로", async ({ page }) => {
  const id = await open(page);
  await page.keyboard.press("Control+Shift+Backspace");
  await expect.poll(() => sent(page, id)).toBe("\x15");
  await page.keyboard.press("Control+c");
  await expect.poll(() => sent(page, id)).toBe("\x15\x03");
});

test("S-131 선택이 있으면 Ctrl+C 는 복사(^C 안 감), Ctrl+Shift+A 는 전체 선택", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const id = await open(page);
  await emit(page, id, "HELLO-COPY\r\n");
  await page.keyboard.press("Control+Shift+A");
  await expect.poll(() => page.evaluate((i) => (window as any).__terms.get(i).getSelection() as string, id)).toContain("HELLO-COPY");
  await page.keyboard.press("Control+c");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("HELLO-COPY");
  expect(await sent(page, id)).toBe(""); // ^C 는 프로그램으로 안 갔다
});

test("S-131 Ctrl+Shift+K 는 스크롤백을 지운다", async ({ page }) => {
  const id = await open(page);
  await emit(page, id, Array.from({ length: 120 }, (_, i) => `row-${i}`).join("\r\n") + "\r\n");
  const base = () => page.evaluate((i) => (window as any).__terms.get(i).buffer.active.baseY as number, id);
  await expect.poll(base).toBeGreaterThan(50);
  await page.keyboard.press("Control+Shift+K");
  await expect.poll(base).toBe(0);
});

test("S-073/S-134 Text size: 200% 면 cols 가 줄어든 resize, Global 로 돌아오면 원래대로", async ({ page }) => {
  const id = await open(page);
  const nodeId = await page.locator("[data-node-id]").first().getAttribute("data-node-id");
  // 시작 직후 cols 는 글꼴이 자리잡기 전 값일 수 있어 100% 를 한 번 적용한 뒤를 기준으로 삼는다
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((n) => (window as any).__setTextSize(n, 100), nodeId);
  const cols0 = await page.evaluate((i) => (window as any).__terms.get(i).cols as number, id);
  await page.evaluate((n) => (window as any).__setTextSize(n, 200), nodeId);
  await expect.poll(async () => (await resizes(page, id)).at(-1)?.[0] ?? cols0).toBeLessThan(cols0 * 0.6);
  expect(await page.evaluate((i) => (window as any).__terms.get(i).options.fontSize as number, id)).toBe(25);
  await page.evaluate((n) => (window as any).__setTextSize(n, "global"), nodeId);
  await expect.poll(() => page.evaluate((i) => (window as any).__terms.get(i).cols as number, id)).toBe(cols0);
  expect((await resizes(page, id)).at(-1)?.[0]).toBe(cols0);
  expect(await page.evaluate((i) => (window as any).__terms.get(i).options.fontSize as number, id)).toBe(12.5);
});
