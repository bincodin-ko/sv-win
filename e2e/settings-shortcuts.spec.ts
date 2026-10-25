import { expect, test, type Page } from "@playwright/test";

// B6 Shortcuts·Connections 설정 창 (S-364~S-366, S-384~S-388). 가짜 IPC: 설정 "symvibe.fakeSettings", 가짜 gh = window.__fakeGh {installed,user}, 로그아웃 기록 = window.__fakeGhLog
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}") as Record<string, any>);
const dlg = (page: Page) => page.getByRole("dialog", { name: "Settings" });
const openPane = async (page: Page, name: "Shortcuts" | "Connections") => {
  await page.keyboard.press("Control+,");
  await dlg(page).getByRole("tab", { name }).click();
  await expect(page.getByTestId(`settings-pane-${name.toLowerCase()}`)).toBeVisible();
};
const close = (page: Page) => page.getByTestId("settings-close").click();
const gh = (page: Page, v: { installed: boolean; user?: string | null }) => page.addInitScript((x) => ((window as any).__fakeGh = x), v);
const start = async (page: Page) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
};

test.describe("Shortcuts", () => {
  test.beforeEach(({ page }) => start(page));

  test("S-364 Select(V)·Spawn agent(T) 줄이 있고 누르면 Press a new key", async ({ page }) => {
    await openPane(page, "Shortcuts");
    await expect(page.getByTestId("shortcut-select")).toHaveText("V");
    await expect(page.getByTestId("shortcut-spawn")).toHaveText("T");
    await page.getByTestId("shortcut-spawn").click();
    await expect(page.getByTestId("shortcut-spawn")).toHaveText("Press a new key");
  });

  test("S-364·S-366 T 를 b 로 바꾸면 보드에서 b 가 Spawn 도구이고 툴팁도 B", async ({ page }) => {
    await openPane(page, "Shortcuts");
    await page.getByTestId("shortcut-spawn").click();
    await page.keyboard.press("b");
    await expect(page.getByTestId("shortcut-spawn")).toHaveText("B");
    await expect.poll(async () => (await saved(page)).keymap).toEqual({ spawn: "b" });
    await close(page);
    await expect(page.getByTestId("rail-spawn")).toHaveAttribute("title", "Spawn agent (B)");
    await page.mouse.click(1250, 850);
    await page.keyboard.press("v");
    await expect(page.getByTestId("rail-select")).toHaveAttribute("data-active", "true");
    await page.keyboard.press("t");
    await expect(page.getByTestId("rail-select")).toHaveAttribute("data-active", "true"); // 옛 T 는 더 이상 Spawn 이 아니다
    await page.keyboard.press("b");
    await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-active", "true");
  });

  test("S-365 V 와 겹치면 받지 않고 어느 키와 겹치는지 보인다", async ({ page }) => {
    await openPane(page, "Shortcuts");
    await page.getByTestId("shortcut-spawn").click();
    await page.keyboard.press("v");
    await expect(page.getByTestId("shortcut-error")).toContainText("Select");
    await expect(page.getByTestId("shortcut-spawn")).toHaveText("T");
    expect((await saved(page)).keymap ?? {}).toEqual({});
  });

  test("C1 S-805 Pen(P)·Eraser(E)·Git panel(G) 줄이 생기고, P 를 다른 줄에 주면 Pen 과 겹친다고 한다", async ({ page }) => {
    await openPane(page, "Shortcuts");
    await expect(page.getByTestId("shortcut-pen")).toHaveText("P");
    await expect(page.getByTestId("shortcut-eraser")).toHaveText("E");
    await expect(page.getByTestId("shortcut-git")).toHaveText("G");
    await expect(page.getByTestId("settings-pane-shortcuts")).toContainText("Git panel");
    await page.getByTestId("shortcut-spawn").click();
    await page.keyboard.press("p");
    await expect(page.getByTestId("shortcut-error")).toContainText("Pen");
    await expect(page.getByTestId("shortcut-spawn")).toHaveText("T");
  });

  test("D1 S-1228 Memory(M)·Loops(L) 줄이 생기고, M 을 다른 줄에 주면 Memory 와 겹친다고 한다. X 는 못 씀", async ({ page }) => {
    await openPane(page, "Shortcuts");
    await expect(page.getByTestId("shortcut-memory")).toHaveText("M");
    await expect(page.getByTestId("shortcut-loops")).toHaveText("L");
    await expect(page.getByTestId("settings-pane-shortcuts")).toContainText("Memory");
    await page.getByTestId("shortcut-spawn").click();
    await page.keyboard.press("m");
    await expect(page.getByTestId("shortcut-error")).toContainText("Memory");
    await expect(page.getByTestId("shortcut-spawn")).toHaveText("T");
    await page.getByTestId("shortcut-loops").click();
    await page.keyboard.press("x");
    await expect(page.getByTestId("shortcut-error")).toBeVisible();
    await expect(page.getByTestId("shortcut-loops")).toHaveText("L");
  });

  test("S-365 X 와 Space 는 받지 않는다", async ({ page }) => {
    await openPane(page, "Shortcuts");
    await page.getByTestId("shortcut-spawn").click();
    await page.keyboard.press("x");
    await expect(page.getByTestId("shortcut-error")).toBeVisible();
    await expect(page.getByTestId("shortcut-spawn")).toHaveText("T");
    await page.getByTestId("shortcut-spawn").click();
    await page.keyboard.press("Space");
    await expect(page.getByTestId("shortcut-error")).toBeVisible();
    await expect(page.getByTestId("shortcut-spawn")).toHaveText("T");
  });

  test("S-364 Esc 는 예전 키 유지(창은 안 닫힘), Delete 는 기본값 복원", async ({ page }) => {
    await openPane(page, "Shortcuts");
    await page.getByTestId("shortcut-spawn").click();
    await page.keyboard.press("b");
    await page.getByTestId("shortcut-spawn").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shortcut-spawn")).toHaveText("B");
    await expect(dlg(page)).toBeVisible();
    await page.getByTestId("shortcut-spawn").click();
    await page.keyboard.press("Delete");
    await expect(page.getByTestId("shortcut-spawn")).toHaveText("T");
    await expect.poll(async () => (await saved(page)).keymap).toEqual({});
  });
});

test.describe("Connections", () => {
  test("S-385 gh 가 없으면 GitHub CLI not found 와 설치 명령 복사", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gh(page, { installed: false });
    await start(page);
    await openPane(page, "Connections");
    await expect(page.getByTestId("settings-pane-connections")).toContainText("GitHub CLI not found");
    await page.getByTestId("gh-copy-install").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("winget install --id GitHub.cli");
  });

  test("S-386 로그인 전이면 Connect GitHub 가 gh auth login 콘솔 하나를 놓는다", async ({ page }) => {
    await gh(page, { installed: true, user: null });
    await start(page);
    await openPane(page, "Connections");
    await expect(page.getByTestId("gh-connect")).toBeEnabled();
    await page.getByTestId("gh-connect").click();
    await expect(dlg(page)).toHaveCount(0);
    await expect(page.getByTestId("console")).toHaveCount(1);
    await expect(page.getByTestId("console-badge")).toHaveAttribute("title", "gh-auth-login");
    expect(await page.evaluate(() => (window as any).__fakePty.ids().length)).toBe(1);
    expect(await page.evaluate(() => (window as any).__fakePty.writes((window as any).__fakePty.ids()[0]))).toEqual([]); // 앱이 대신 입력하는 것은 없다
  });

  test("S-386 홈에서 Connect GitHub 를 누르면 그 repo 의 보드로 전환되고 보이는 콘솔이 하나", async ({ page }) => {
    await gh(page, { installed: true, user: null });
    await start(page);
    await page.evaluate(() => (window as any).__shell.showHome());
    await expect(page.getByTestId("home")).toBeVisible();
    await page.getByTestId("home-settings").click();
    await dlg(page).getByRole("tab", { name: "Connections" }).click();
    await page.getByTestId("gh-connect").click();
    await expect(dlg(page)).toHaveCount(0);
    await expect(page.getByTestId("home")).toBeHidden();
    await expect(page.locator('[data-testid="console"]:visible')).toHaveCount(1);
  });

  test("S-388 Connect 콘솔이 닫히면 상태를 다시 읽는다", async ({ page }) => {
    await gh(page, { installed: true, user: null });
    await start(page);
    await openPane(page, "Connections");
    await page.getByTestId("gh-connect").click();
    await expect(page.getByTestId("console")).toHaveCount(1);
    await page.evaluate(() => ((window as any).__fakeGh = { installed: true, user: "octocat" })); // 콘솔에서 로그인을 마친 것처럼
    await page.locator("[data-node-handle]").first().click({ position: { x: 300, y: 16 } }); // 노드 선택 후 Delete 로 닫는다
    await page.keyboard.press("Delete");
    await page.getByTestId("confirm-close").getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("console")).toHaveCount(0);
    await openPane(page, "Connections");
    await expect(page.getByTestId("gh-user")).toHaveText("octocat");
  });

  test("S-387·S-388 로그인돼 있으면 이름과 Disconnect, 둘째 클릭에만 로그아웃, Refresh 로 다시 읽기", async ({ page }) => {
    await gh(page, { installed: true, user: "octocat" });
    await start(page);
    await openPane(page, "Connections");
    await expect(page.getByTestId("gh-user")).toHaveText("octocat");
    await page.getByTestId("gh-disconnect").click();
    await expect(page.getByTestId("gh-disconnect")).toContainText("Click again — this signs gh out everywhere");
    expect(await page.evaluate(() => (window as any).__fakeGhLog?.length ?? 0)).toBe(0);
    await page.getByTestId("gh-disconnect").click();
    await expect.poll(() => page.evaluate(() => (window as any).__fakeGhLog?.length ?? 0)).toBe(1);
    await expect(page.getByTestId("gh-connect")).toBeVisible();
    await page.evaluate(() => ((window as any).__fakeGh = { installed: true, user: "hubot" }));
    await page.getByTestId("gh-refresh").click();
    await expect(page.getByTestId("gh-user")).toHaveText("hubot");
  });

  test("S-388 설정 창을 열 때 상태를 읽는다", async ({ page }) => {
    await gh(page, { installed: true, user: "octocat" });
    await start(page);
    await openPane(page, "Connections");
    await expect(page.getByTestId("gh-user")).toHaveText("octocat");
    await close(page);
    await page.evaluate(() => ((window as any).__fakeGh = { installed: true, user: null }));
    await openPane(page, "Connections");
    await expect(page.getByTestId("gh-connect")).toBeVisible();
  });
});
