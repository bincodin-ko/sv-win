import { expect, test, type Page } from "@playwright/test";

// K8 S-2490~S-2523: 한국어 명령 해석 + 답 문구가 화면 언어를 따른다. PW_PORT=1608. 가짜 IPC·가짜 PTY만 쓴다.
const input = (p: Page) => p.getByTestId("bar-input");
const msgs = (p: Page) => p.getByTestId("thread-msg");
const cons = (p: Page) => p.getByTestId("console");
const ids = (p: Page) => p.evaluate(() => (window as any).__fakePty.ids() as number[]);
const writes = (p: Page, id: number) => p.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);
const emit = (p: Page, id: number, t: string) => p.evaluate(([i, s]) => (window as any).__fakePty.emit(i, s), [id, t] as const);
const say = async (p: Page, t: string) => {
  await input(p).fill(t);
  await input(p).press("Enter");
};
const warm = async (p: Page) => {
  for (const id of await ids(p)) await emit(p, id, "Welcome\r\n> ");
};
const allWrites = async (p: Page) => (await Promise.all((await ids(p)).map((id) => writes(p, id)))).filter((w) => w.length);

const open = async (page: Page, lang: "ko" | "en", n = 0) => {
  await page.addInitScript((l) => localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ firstRunDone: true, language: l })), lang);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(n ? `/?console=${n}&agent=claude` : "/");
  await expect(page.getByTestId("command-bar")).toBeVisible();
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  if (n) await expect(cons(page)).toHaveCount(n);
  await page.getByTestId("thread-toggle").click();
  await expect(page.getByTestId("thread-panel")).toBeVisible();
};

test("S-2490·S-2520 '클로드 두 개 띄워' → 콘솔 2개, 답이 한국어", async ({ page }) => {
  await open(page, "ko");
  await say(page, "클로드 두 개 띄워");
  await expect(cons(page)).toHaveCount(2);
  await expect(msgs(page).last()).toContainText("콘솔 2개");
  await expect(msgs(page).last()).not.toContainText("Placed");
});

test("S-2491·S-2492 그룹 만들기 → '그룹 1에 테스트 돌려': 한국어 계획 문구 + 원문 전달", async ({ page }) => {
  await open(page, "ko");
  await say(page, "클로드 두 개로 그룹 만들어");
  await expect(cons(page)).toHaveCount(2);
  await expect(page.getByTestId("group-halo")).toHaveCount(1);
  await warm(page);
  await say(page, "그룹 1에 테스트 돌려");
  await expect(msgs(page).filter({ hasText: "계획" }).last()).toContainText("테스트 돌려");
  await expect.poll(() => allWrites(page)).toEqual([["테스트 돌려", "\r"]]); // 한국어 원문 그대로, 한 콘솔에만
});

test("S-2495·S-2521 '상태' → '콘솔 N개: …'", async ({ page }) => {
  await open(page, "ko", 2);
  await say(page, "상태");
  await expect(msgs(page).last()).toHaveText(/^콘솔 2개: .+/);
});

test("S-2501 '@Otto 테스트 돌려' 멘션 → 콘솔에 원문 전달", async ({ page }) => {
  await open(page, "ko", 2);
  await warm(page);
  await say(page, "@Otto 테스트 돌려");
  await expect.poll(() => allWrites(page)).toEqual([["테스트 돌려", "\r"]]);
});

test("S-2520 영어 화면: 'spawn two claude' 답은 영어 그대로", async ({ page }) => {
  await open(page, "en");
  await say(page, "spawn two claude");
  await expect(cons(page)).toHaveCount(2);
  await expect(msgs(page).last()).toHaveText("Placed 2 claude consoles.");
});
