import { expect, test } from "@playwright/test";

// 바깥 Claude 가져오기: Symvibe 밖에서 돌고 있는 Claude 를 위 막대 칩에서 골라, 묻고 끈 뒤 지금 보드에 같은 대화(--resume)로 연다
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => ((window as any).__fakeOutside = [{ pid: 4242, sessionId: "out-1", cwd: "C:/fake/repo", startedAt: 1, last: "표 그려줘" }]));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("tab")).toHaveCount(1);
});

test("칩·목록이 뜨고, 취소하면 아무것도 안 바뀜", async ({ page }) => {
  await expect(page.getByTestId("outside-chip")).toHaveText("1 outside");
  await page.getByTestId("outside-chip").click();
  await expect(page.getByTestId("outside-row")).toContainText("repo");
  await expect(page.getByTestId("outside-row")).toContainText("표 그려줘");
  await page.getByTestId("outside-bring").click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  expect(await page.evaluate(() => (window as any).__fakeOutsideStops ?? [])).toEqual([]);
  await expect(page.getByTestId("console")).toHaveCount(0);
});

test("가져오기 → 바깥 Claude 를 끄고 지금 보드에 같은 대화(--resume)로 연다, 칩은 사라짐", async ({ page }) => {
  await page.getByTestId("outside-chip").click();
  await page.getByTestId("outside-bring").click();
  await page.getByRole("dialog").getByRole("button", { name: "Bring in" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__fakeOutsideStops)).toEqual([4242]);
  await expect(page.getByTestId("console")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => ((window as any).__fakePty.spawns() as { args: string[] }[]).map((s) => s.args.join(" ")))).toContain("--resume out-1");
  await expect(page.getByTestId("outside-chip")).toHaveCount(0);
});

test("오른쪽 끝 칩이어도 목록·가져오기 단추가 창 안에 보임(긴 말이어도)", async ({ page }) => {
  await page.addInitScript(() => ((window as any).__fakeOutside = [{ pid: 7, sessionId: "o2", cwd: "C:/x/long", startedAt: 2, last: "아주 긴 말 ".repeat(30) }]));
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.reload();
  await page.getByTestId("outside-chip").click();
  const vw = 1680;
  for (const b of await page.getByTestId("outside-bring").all()) {
    const r = (await b.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(vw);
  }
});
