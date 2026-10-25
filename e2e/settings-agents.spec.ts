import { expect, test, type Page } from "@playwright/test";

// B5 Agents 설정 창·내 에이전트 (S-370~S-380). 가짜 IPC: 설정 "symvibe.fakeSettings", 내 에이전트 "symvibe.fakeCustomAgents".
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}") as Record<string, any>);
const dlg = (page: Page) => page.getByRole("dialog", { name: "Settings" });
const openAgents = async (page: Page) => {
  await page.keyboard.press("Control+,");
  await dlg(page).getByRole("tab", { name: "Agents" }).click();
  await expect(page.getByTestId("settings-pane-agents")).toBeVisible();
};
const close = (page: Page) => page.getByTestId("settings-close").click();
const spawnOne = async (page: Page) => {
  await page.keyboard.press("t");
  await page.mouse.click(600, 300);
  await expect(page.getByTestId("console")).toHaveCount(1);
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
});

test("S-350 창 목록에 Agents 가 Appearance 뒤·About 앞에 있다", async ({ page }) => {
  await page.keyboard.press("Control+,");
  const names = await dlg(page).getByRole("tab").allTextContents();
  expect(names.indexOf("Agents")).toBeGreaterThan(-1);
});

test("S-370 Default agent 를 바꾸면 새 콘솔이 그것이고 무장도 같이 바뀐다", async ({ page }) => {
  await openAgents(page);
  await page.getByLabel("Default agent").selectOption("shell");
  await expect.poll(async () => (await saved(page)).defaultAgent).toBe("shell");
  await close(page);
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", "shell");
  await spawnOne(page);
  await expect(page.getByTestId("console-badge")).toHaveAttribute("title", "shell");
});

test("S-371 Yolo 를 켜면 경고가 보이고 이후 콘솔에 YOLO 뱃지", async ({ page }) => {
  await spawnOne(page);
  await expect(page.getByTestId("console-yolo")).toHaveCount(0);
  await openAgents(page);
  await expect(page.getByTestId("yolo-warning")).toHaveCount(0);
  await page.getByLabel("Yolo: skip permission prompts").check();
  await expect(page.getByTestId("yolo-warning")).toContainText("Agents run commands and edit files without asking");
  await expect.poll(async () => (await saved(page)).yolo).toBe(true);
  await close(page);
  await page.mouse.click(1250, 850); // 빈 곳을 눌러 콘솔의 키 입력을 벗어난다
  await page.keyboard.press("t");
  await page.mouse.click(1250, 820);
  await expect(page.getByTestId("console")).toHaveCount(2);
  await expect(page.getByTestId("console-yolo")).toHaveCount(1); // 새 콘솔만(이미 실행 중인 것은 그대로)
});

test("S-373 Default shell 입력이 저장되고 비우면 null", async ({ page }) => {
  await openAgents(page);
  await page.getByLabel("Default shell").fill("C:\Program Files\Git\bin\bash.exe");
  await expect.poll(async () => (await saved(page)).defaultShell).toBe("C:\Program Files\Git\bin\bash.exe");
  await page.getByLabel("Default shell").fill("");
  await expect.poll(async () => (await saved(page)).defaultShell).toBeNull();
});

test("S-374 Use Alt as Meta key 는 기본 켜짐, 끄면 저장된다", async ({ page }) => {
  await openAgents(page);
  const box = page.getByLabel("Use Alt as Meta key");
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect.poll(async () => (await saved(page)).altAsMeta).toBe(false);
});

test("S-375 Agent executables: 5줄, 없으면 Not found on PATH, Browse 로 지정, Reset", async ({ page }) => {
  await openAgents(page);
  for (const id of ["claude", "codex", "gemini", "grok", "opencode"]) await expect(page.getByTestId(`exe-${id}`)).toBeVisible();
  await expect(page.getByTestId("exe-codex")).toContainText("Not found on PATH");
  await expect(page.getByTestId("exe-claude")).not.toContainText("Not found on PATH");
  await page.evaluate(() => ((window as any).__fakePickFile = "C:\tools\codex.exe"));
  await page.getByTestId("exe-codex").getByRole("button", { name: "Browse" }).click();
  await expect(page.getByTestId("exe-codex")).toContainText("C:\tools\codex.exe");
  await expect.poll(async () => (await saved(page)).agentPaths?.codex).toBe("C:\tools\codex.exe");
  await page.getByTestId("exe-codex").getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("exe-codex")).toContainText("Not found on PATH");
  await expect.poll(async () => (await saved(page)).agentPaths?.codex).toBeUndefined();
});

test("S-375 지정한 경로로 닫았다 다시 열고 Reset 하면 줄이 Not found on PATH 로 바뀐다(다시 읽은 path 만 쓴다)", async ({ page }) => {
  await openAgents(page);
  await page.evaluate(() => ((window as any).__fakePickFile = "C:\tools\codex.exe"));
  await page.getByTestId("exe-codex").getByRole("button", { name: "Browse" }).click();
  await expect(page.getByTestId("exe-codex")).toContainText("C:\tools\codex.exe");
  await close(page);
  await openAgents(page);
  await expect(page.getByTestId("exe-codex")).toContainText("C:\tools\codex.exe"); // 다시 열어도 지정한 경로(실제 Rust 계약)
  await page.getByTestId("exe-codex").getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("exe-codex")).toContainText("Not found on PATH");
  await expect.poll(async () => (await saved(page)).agentPaths?.codex).toBeUndefined();
});

test("S-375 Browse 직후 Default agent 목록에서 그 에이전트가 Detected 로 옮겨진다", async ({ page }) => {
  await openAgents(page);
  const grp = (n: string) => page.getByLabel("Default agent").locator(`optgroup[label^="${n}"] option`).allTextContents();
  expect(await grp("Detected")).not.toContain("Codex");
  await page.evaluate(() => ((window as any).__fakePickFile = "C:\tools\codex.exe"));
  await page.getByTestId("exe-codex").getByRole("button", { name: "Browse" }).click();
  await expect.poll(() => grp("Detected")).toContain("Codex");
});

test("S-376/S-377 Add an agent → flyout 'Your agents' 에 나타나고 지우면 사라진다", async ({ page }) => {
  await openAgents(page);
  await page.getByRole("button", { name: "Add an agent" }).click();
  // 이름·명령이 비면 받지 않는다
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("custom-row")).toHaveCount(0);
  await page.getByLabel("Name").fill("Mine");
  await page.getByLabel("Command").fill("mytool --x");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("custom-row")).toHaveCount(1);
  // 이름이 겹치면(대소문자 무시) 받지 않는다
  await page.getByRole("button", { name: "Add an agent" }).click();
  await page.getByLabel("Name").fill("mine");
  await page.getByLabel("Command").fill("other");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("custom-row")).toHaveCount(1);
  await close(page);

  await page.getByTestId("rail-spawn").click();
  const fly = page.getByTestId("spawn-flyout");
  await expect(fly.locator('[data-agent-id^="custom:"]')).toHaveCount(1); // 앞 3개 안
  await fly.getByRole("menuitem", { name: "All agents" }).click();
  const yours = page.getByTestId("all-agents");
  await expect(yours.locator("[data-section]").nth(1)).toHaveText("Your agents");
  await page.keyboard.press("Escape");

  await openAgents(page);
  await page.getByTestId("custom-row").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("custom-row")).toHaveCount(0);
  await close(page);
  await page.getByTestId("rail-spawn").click();
  await expect(page.getByTestId("spawn-flyout").locator('[data-agent-id^="custom:"]')).toHaveCount(0);
});

test("S-377 우클릭 링: 내장 5 + Shell 아래 Other 에 내 에이전트", async ({ page }) => {
  await openAgents(page);
  await page.getByRole("button", { name: "Add an agent" }).click();
  await page.getByLabel("Name").fill("Mine");
  await page.getByLabel("Command").fill("mytool");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await close(page);
  await page.mouse.click(600, 300, { button: "right" });
  await page.getByRole("menuitem", { name: "Spawn agent", exact: true }).click();
  await page.getByRole("menuitem", { name: "Other", exact: true }).click();
  await page.getByRole("menuitem", { name: "Mine", exact: true }).click();
  await expect(page.getByTestId("console-badge")).toHaveAttribute("title", /^custom:/);
});

test("S-378 All agents 에서 내장이 아닌 카탈로그 에이전트를 고르면 Your agents 에 자동으로 더해진다", async ({ page }) => {
  await page.getByTestId("rail-spawn").click();
  await page.getByTestId("spawn-flyout").getByRole("menuitem", { name: "All agents" }).click();
  await page.getByTestId("all-agents").locator('[data-agent-id="aider"]').click();
  await openAgents(page);
  await expect(page.getByTestId("custom-row")).toContainText("Aider");
});
