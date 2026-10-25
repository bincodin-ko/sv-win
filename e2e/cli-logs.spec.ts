import { expect, test, type Page } from "@playwright/test";

// Q3 S-3149·S-3151·S-3153: 고르는 곳에서 Gemini·OpenCode 는 읽는 CLI, 설치된 못 읽는 CLI(Grok)는 회색+이유. PW_PORT=1773.
// 가짜 설치: localStorage symvibe.fakeInstalled (claude 는 늘 설치됨). 실제 CLI 기록은 읽지 않는다.
test.use({ actionTimeout: 8000 });
test.setTimeout(60_000);
const REPO = "C:/fake/repo";
const con = (id: string, x: number, y: number) => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name: `Con ${id}`, agentId: "claude", textSize: null, yolo: false });
const WHY_EN = "Symvibe can't read Grok's chat history yet";
const WHY_KO = "Symvibe는 아직 Grok의 대화 기록을 읽을 수 없어요";

const seed = async (page: Page, installed: string[], lang: "en" | "ko" = "en") => {
  const board = JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: REPO }, viewport: { x: 0, y: 0, zoom: 0.5 }, nodes: [con("c1", -760, -400)], groups: [] });
  await page.addInitScript(([b, inst, l]) => {
    (window as any).__symSeed = { boards: { "ws-fake": b } };
    (window as any).__fakeMemory = {};
    localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(inst));
    if (l === "ko") localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ language: "ko" }));
  }, [board, installed, lang] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await expect(page.getByTestId("console")).toHaveCount(1);
};
const openScan = async (page: Page) => {
  await page.mouse.click(1300, 100);
  await page.keyboard.press("m");
  await expect(page.getByTestId("memory-panel")).toBeVisible();
  await page.getByTestId("memory-scan").click();
  await expect(page.getByTestId("scan-flow")).toBeVisible();
};

test("S-3149 Memory scan: Gemini 는 누를 수 있고 Grok 은 회색+이유(누를 수 없음)", async ({ page }) => {
  await seed(page, ["gemini", "grok"]);
  await openScan(page);
  await expect(page.getByTestId("scan-agent-claude")).toHaveAttribute("aria-pressed", "true");
  const gem = page.getByTestId("scan-agent-gemini");
  await expect(gem).toBeEnabled();
  await expect(gem).toHaveText("Gemini CLI");
  const grok = page.getByTestId("scan-agent-grok");
  await expect(grok).toBeDisabled();
  await expect(grok).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("scan-why-grok")).toHaveText(WHY_EN);
  await grok.click({ force: true }).catch(() => undefined);
  await expect(page.getByTestId("scan-agent-claude")).toHaveAttribute("aria-pressed", "true"); // 눌러도 안 바뀜
  await gem.click();
  await expect(gem).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("scan-go")).toHaveText("Scan with Gemini CLI");
});

test("S-3153 한국어 이유 글", async ({ page }) => {
  await seed(page, ["grok"], "ko");
  await openScan(page);
  await expect(page.getByTestId("scan-why-grok")).toHaveText(WHY_KO);
});

test("S-3151 Loop 'An agent judges': 선택지 4개, 미설치는 disabled", async ({ page }) => {
  await seed(page, ["gemini"]);
  await page.getByTestId("rail-loops").click();
  await page.getByTestId("loops-scratch").click();
  await page.getByTestId("lf-stop-goal").check();
  await page.getByTestId("lf-goal-mode-agent").check();
  const sel = page.getByTestId("lf-goal-agent");
  await expect(sel.locator("option")).toHaveCount(4);
  await expect(sel.locator("option")).toHaveText(["Claude Code", "Codex", "Gemini CLI", "OpenCode"]);
  await expect(sel.locator("option[value=claude]")).toHaveJSProperty("disabled", false);
  await expect(sel.locator("option[value=gemini]")).toHaveJSProperty("disabled", false);
  await expect(sel.locator("option[value=codex]")).toHaveJSProperty("disabled", true);
  await expect(sel.locator("option[value=opencode]")).toHaveJSProperty("disabled", true);
  await sel.selectOption("gemini");
  await expect(sel).toHaveValue("gemini");
});
