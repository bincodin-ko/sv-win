import { expect, test, type Page } from "@playwright/test";

// B4 상단 바·탭·repo 전환. 근거 S-330~S-342. 가짜 IPC: 기본 repo C:/fake/repo 의 Workspace 1(ws-fake).
// 후크: window.__shell(view/list/spawn/running), window.__archived(boardArchive 가짜 기록), window.__fakePickFolder(폴더 선택창 대신 쓸 경로)
const tabs = (p: Page) => p.getByTestId("tab");
const names = (p: Page) => p.getByTestId("tab-name");
const dlg = (p: Page) => p.getByRole("dialog");
// U1 S-2605: 단추 순서가 [주 동작, Cancel] 로 바뀌어 위치 대신 이름으로 고른다
const confirm = (p: Page) => dlg(p).getByRole("button").filter({ hasNotText: /^Cancel$/ });
const cancel = (p: Page) => dlg(p).getByRole("button", { name: "Cancel" });
const view = (p: Page) => p.evaluate(() => (window as any).__shell.view() as string);
const wsList = (p: Page) => p.evaluate(() => (window as any).__shell.list() as { id: string; visible: boolean }[]);
const running = (p: Page) => p.evaluate(() => (window as any).__shell.running() as number);
const ptyIds = (p: Page) => p.evaluate(() => (window as any).__fakePty.ids() as number[]);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(tabs(page)).toHaveCount(1);
});

test("S-330 위쪽 왼쪽·오른쪽 요소가 있고 왼쪽 요소가 오른쪽보다 앞에 있다", async ({ page }) => {
  const x = async (id: string) => (await page.getByTestId(id).boundingBox())!.x;
  for (const id of ["back-home", "repo-chip", "tab-add", "close-repo", "usage-pill", "tools-btn", "gear", "topbar-avatar"]) await expect(page.getByTestId(id)).toBeVisible();
  const order = [await x("back-home"), await x("repo-chip"), await x("tab-add"), await x("close-repo"), await x("usage-pill"), await x("tools-btn"), await x("gear"), await x("topbar-avatar")];
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

test("S-335·S-337 +로 탭을 더하고, 하나뿐이면 탭 닫기가 없다", async ({ page }) => {
  await expect(page.getByTestId("tab-close")).toHaveCount(0);
  await page.getByTestId("tab-add").click();
  await expect(names(page)).toHaveText(["Workspace 1", "Workspace 2"]);
  await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("tab-close")).toHaveCount(2);
  await tabs(page).first().click();
  await expect(tabs(page).first()).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("tab-add").click();
  await expect(names(page).nth(2)).toHaveText("Workspace 3");
});

test("S-335 더블클릭 이름 바꾸기: 24자, Enter 저장, Esc 취소", async ({ page }) => {
  await tabs(page).first().dblclick();
  const input = page.getByTestId("tab-rename");
  await input.fill("");
  await input.pressSequentially("abcdefghijklmnopqrstuvwxyz0123"); // 30자 → 24자
  await expect(input).toHaveValue("abcdefghijklmnopqrstuvwx");
  await input.press("Enter");
  await expect(names(page).first()).toHaveText("abcdefghijklmnopqrstuvwx");
  await tabs(page).first().dblclick();
  await page.getByTestId("tab-rename").fill("zzz");
  await page.getByTestId("tab-rename").press("Escape");
  await expect(names(page).first()).toHaveText("abcdefghijklmnopqrstuvwx");
});

test("S-343 탭을 바꿔도 이전 탭 콘솔의 PTY 는 끝나지 않는다", async ({ page }) => {
  await page.evaluate(() => (window as any).__shell.spawn("ws-fake", "shell"));
  await expect.poll(() => running(page)).toBe(1);
  const before = await ptyIds(page);
  await page.getByTestId("tab-add").click();
  await expect.poll(async () => (await wsList(page)).filter((w) => w.visible).map((w) => w.id)).not.toContain("ws-fake");
  expect(await running(page)).toBe(1);
  expect(await ptyIds(page)).toEqual(before);
  await tabs(page).first().click();
  expect(await running(page)).toBe(1);
});

test("S-336 탭 닫기: 확인 → 콘솔 종료·Archive·탭 사라짐, 취소하면 그대로", async ({ page }) => {
  await page.getByTestId("tab-add").click();
  await expect(tabs(page)).toHaveCount(2);
  const ws2 = (await wsList(page)).find((w) => w.visible)!.id;
  await page.evaluate((id) => (window as any).__shell.spawn(id, "shell"), ws2);
  await expect.poll(() => running(page)).toBe(1);
  await tabs(page).nth(1).getByTestId("tab-close").click();
  await expect(dlg(page)).toBeVisible();
  await cancel(page).click();
  await expect(tabs(page)).toHaveCount(2);
  expect(await running(page)).toBe(1);
  await tabs(page).nth(1).getByTestId("tab-close").click();
  await confirm(page).click();
  await expect(tabs(page)).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__archived as string[])).toEqual([ws2]);
  await expect.poll(() => running(page)).toBe(0);
  await expect(page.getByTestId("tab-close")).toHaveCount(0);
});

test("S-332 repo chip 메뉴: 열린 repo·최근 repo·Open repo", async ({ page }) => {
  await page.evaluate(() => ((window as any).__fakePickFolder = "C:/fake/other"));
  await page.getByTestId("repo-chip").click();
  await expect(page.getByRole("menuitem", { name: "repo", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Open repo" }).click();
  await expect(page.getByTestId("repo-chip")).toHaveText(/other/);
  await expect(names(page)).toHaveText(["Workspace 1"]);
  await page.getByTestId("repo-chip").click();
  await expect(page.getByRole("menuitem", { name: "repo", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "other", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "repo", exact: true }).click(); // 전환
  await expect(page.getByTestId("repo-chip")).toHaveText(/repo/);
  expect((await wsList(page)).length).toBe(2); // 둘 다 열린 채
});

test("S-333·S-334 Close: 항상 확인 → 홈, repo 가 열린 목록에서 빠지고 콘솔 종료", async ({ page }) => {
  await page.evaluate(() => (window as any).__shell.spawn("ws-fake", "shell"));
  await expect.poll(() => running(page)).toBe(1);
  await page.getByTestId("close-repo").click();
  await expect(dlg(page)).toBeVisible();
  await cancel(page).click();
  expect(await view(page)).toBe("board");
  await page.getByTestId("close-repo").click();
  await confirm(page).click();
  await expect.poll(() => view(page)).toBe("home");
  expect(await wsList(page)).toEqual([]);
  expect(await running(page)).toBe(0);
});

test("S-333 Ctrl+Shift+W: 실행 중이 있으면 묻는다", async ({ page }) => {
  await page.evaluate(() => (window as any).__shell.spawn("ws-fake", "shell"));
  await expect.poll(() => running(page)).toBe(1);
  await page.keyboard.press("Control+Shift+W");
  await expect(dlg(page)).toBeVisible();
  await cancel(page).click();
  expect(await running(page)).toBe(1);
});

test("S-333 Ctrl+Shift+W: 실행 중이 없으면 묻지 않고 바로 닫는다", async ({ page }) => {
  await page.keyboard.press("Control+Shift+W");
  await expect.poll(() => view(page)).toBe("home");
  await expect(dlg(page)).toHaveCount(0);
  expect(await wsList(page)).toEqual([]);
});

test("S-331·S-342 Ctrl+Shift+L: 홈으로, repo 와 콘솔은 열린 채", async ({ page }) => {
  await page.evaluate(() => (window as any).__shell.spawn("ws-fake", "shell"));
  await expect.poll(() => running(page)).toBe(1);
  await page.keyboard.press("Control+Shift+L");
  await expect.poll(() => view(page)).toBe("home");
  expect((await wsList(page)).length).toBe(1);
  expect(await running(page)).toBe(1);
});

test("S-331 Back to home 버튼", async ({ page }) => {
  await page.getByTestId("back-home").click();
  expect(await view(page)).toBe("home");
});

test("S-338 live chip: 실행 중 콘솔 수와 같고 0이면 숨김", async ({ page }) => {
  await expect(page.getByTestId("live-chip")).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__shell.spawn("ws-fake", "shell");
    (window as any).__shell.spawn("ws-fake", "shell");
  });
  await expect(page.getByTestId("live-chip")).toHaveText("2 live");
  await page.getByTestId("tab-add").click();
  await expect(page.getByTestId("live-chip")).toHaveText("2 live"); // 다른 탭의 것도 합친다
});

test("S-340·S-341 Tools 메뉴에 Presets·GitHub·Mission Map·Memory·Loops·Settings(S-1231 순서), Settings 는 설정을 연다. 톱니도 같다", async ({ page }) => {
  await page.getByTestId("tools-btn").click();
  // 5묶음 E1: 스튜디오 항목(Code·Markdown·Skills)은 등록된 것만 끼므로 기본 항목만 걸러 순서를 본다(항목 존재는 각 스튜디오 spec)
  const base = ["Presets", "GitHub", "Mission Map", "Memory", "Loops", "Settings"];
  expect((await page.getByRole("menuitem").allTextContents()).filter((t) => base.includes(t))).toEqual(base);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("gear").click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
});

test("S-341 아바타는 이름 이니셜", async ({ page }) => {
  await page.getByTestId("gear").click();
  await page.getByLabel("Name").fill("jane doe");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("topbar-avatar")).toHaveText("JD");
});

test("S-342 Ctrl+O: 콘솔이 키보드를 가지면 무시, 아니면 폴더 선택", async ({ page }) => {
  await page.evaluate(() => {
    (window as any).__fakePickFolder = "C:/fake/third";
    (window as any).__shell.spawn("ws-fake", "shell");
  });
  await expect.poll(() => running(page)).toBe(1);
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Control+O");
  await page.waitForTimeout(300);
  await expect(page.getByTestId("repo-chip")).toHaveText(/repo/);
  await page.getByTestId("tab-add").focus(); // 콘솔 밖
  await page.keyboard.press("Control+O");
  await expect(page.getByTestId("repo-chip")).toHaveText(/third/);
});

test("167번 live chip 누르면 실행 중 CLI 목록 — 끄기(칸 남음)·닫기(칸 지움)·모두 끄기", async ({ page }) => {
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) (window as any).__shell.spawn("ws-fake", "shell");
  });
  await expect(page.getByTestId("live-chip")).toHaveText("3 live");
  const consoles = page.getByTestId("console");
  const total = await consoles.count();
  await page.getByTestId("live-chip").click();
  await expect(page.getByTestId("live-row")).toHaveCount(3);
  // 끄기: 수가 줄고 콘솔 칸은 그대로
  await page.getByTestId("live-stop").first().click();
  await expect(page.getByTestId("live-chip")).toHaveText("2 live");
  await expect(page.getByTestId("live-row")).toHaveCount(2);
  expect(await consoles.count()).toBe(total);
  await expect(page.getByTestId("resume-banner")).toHaveCount(0); // 431번: 셸은 이어갈 대화가 없어 배너 없음
  // 닫기: 확인창 → 확인하면 칸도 지움
  await page.getByTestId("live-close").first().click();
  await page.getByTestId("confirm-close").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("live-chip")).toHaveText("1 live");
  await expect(consoles).toHaveCount(total - 1);
  // 모두 끄기: 확인 → 칩이 사라짐, 칸은 남음
  await page.getByTestId("live-chip").click();
  await page.getByTestId("live-stop-all").click();
  await page.getByTestId("confirm-close").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("live-chip")).toHaveCount(0);
  await expect(consoles).toHaveCount(total - 1);
});
