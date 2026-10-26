import { expect, test, type Page } from "@playwright/test";

// y8: Claude 가 콘솔에 그리는 한국어 박스 표. 가짜 PTY(Tauri 밖). 쿼리: ?console=1&agent=shell
// 근거(2026-10-26 실측, 실제 claude.exe 2.1.310 + portable-pty ConPTY + xterm 6):
//  - 이모지 ✅ 줄은 xterm 기본(Unicode 6, 1칸)에서 오른쪽 테두리가 1칸 왼쪽(93)으로 밀린다. Claude 는 2칸으로 센다. Unicode 11 이면 94 로 맞는다.
//  - ConPTY 줄 수가 xterm 보다 크면(크기 알림이 빠지면) 표가 잘리고 겹친다 → spawn 도중 바뀐 크기도 PTY 에 알려야 한다.
const ids = (page: Page) => page.evaluate(() => (window as any).__fakePty.ids() as number[]);
const emit = (page: Page, id: number, t: string) => page.evaluate(([i, s]) => (window as any).__fakePty.emit(i, s), [id, t] as const);
const resizes = (page: Page, id: number) => page.evaluate((i) => (window as any).__fakePty.resizes(i) as [number, number][], id);
const size = (page: Page, id: number) => page.evaluate((i) => { const t = (window as any).__terms.get(i); return [t.cols, t.rows] as [number, number]; }, id);
const cursorX = (page: Page, id: number) => page.evaluate((i) => (window as any).__terms.get(i).buffer.active.cursorX as number, id);

test("y8 글자 폭: 한글·가운뎃점·줄표·괄호·박스 문자·이모지가 Claude 와 같은 칸 수", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=shell");
  await expect.poll(async () => (await ids(page)).length).toBe(1);
  const [id] = await ids(page);
  const W: [string, number][] = [["가", 2], ["·", 1], ["—", 1], ["(", 1], ["/", 1], ["─", 1], ["│", 1], ["┌", 1], ["✅", 2], ["🚀", 2], ["❌", 2]];
  for (const [ch, w] of W) {
    await emit(page, id, "\x1b[2J\x1b[H" + ch);
    await expect.poll(() => cursorX(page, id), { message: `${ch} 폭` }).toBe(w);
  }
});

test("y8 spawn 도중 바뀐 크기도 PTY 에 알린다(id 를 받은 뒤 한 번 맞춘다)", async ({ page }) => {
  await page.addInitScript(() => ((window as any).__fakeSpawnMs = 600));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=shell");
  await page.waitForTimeout(150); // spawn 은 아직 id 를 못 받았다
  await page.evaluate(() => { const h = document.querySelector(".xterm")!.parentElement!; h.style.flex = "none"; h.style.width = "420px"; h.style.height = "260px"; }); // 이 사이 xterm 크기가 바뀐다
  await expect.poll(async () => (await ids(page)).length).toBe(1);
  const [id] = await ids(page);
  await page.waitForTimeout(800);
  const [cols, rows] = await size(page, id);
  expect(cols).toBeLessThan(80); // 크기가 실제로 바뀌었다
  const rs = await resizes(page, id);
  expect(rs.at(-1)).toEqual([cols, rows]); // PTY 가 마지막으로 받은 크기 == xterm 크기
});
