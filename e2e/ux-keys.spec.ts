import { expect, test, type Page } from "@playwright/test";

// U7: 받아쓰기 Ctrl+Space·Voice 선택지·Fixed keys 표·tidy up 명령·메뉴 방향키 (S-2720~S-2724, S-2640). PW_PORT=1637
// 가짜: 마이크(window.__fakeCapture) · 엔진(window.__fakeVoice) · 가짜 PTY. 진짜 마이크는 안 쓴다.
const input = (p: Page) => p.getByTestId("bar-input");
const pill = (p: Page) => p.getByTestId("dict-pill");
const dlg = (p: Page) => p.getByRole("dialog", { name: "Settings" });
const capLog = (p: Page) => p.evaluate(() => (window as any).__capLog as string[]);
const ids = (p: Page) => p.evaluate(() => (window as any).__fakePty.ids() as number[]);
const writes = (p: Page, id: number) => p.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);

const open = async (page: Page, settings: Record<string, unknown> = {}) => {
  await page.addInitScript((s) => {
    const w = window as any;
    if (!localStorage.getItem("symvibe.fakeSettings")) localStorage.setItem("symvibe.fakeSettings", JSON.stringify(s));
    const st = { kind: "ready" };
    w.__fakeVoice = { parts: { engine: st, small: st, base: st }, calls: [], downloads: [], reply: "run the tests comma please period" };
    w.__capLog = [];
    w.__fakeCapture = async () => {
      w.__capLog.push("start");
      return {
        snapshot: () => new Uint8Array(new Int16Array(16000).fill(8000).buffer),
        stop: async () => (w.__capLog.push("stop"), { pcm: new Uint8Array(new Int16Array(16000).fill(8000).buffer), ms: 1000 }),
        cancel: async () => void w.__capLog.push("cancel"),
      };
    };
  }, { firstRunDone: true, ...settings });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=2&agent=claude");
  await expect(page.getByTestId("console")).toHaveCount(2);
};
const dictate = async (page: Page, down: string[], ms = 500) => {
  for (const k of down) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
};

test("S-2720·S-2721 Ctrl+Space 를 누르고 있는 동안 듣기, 떼면 명령 바에 글자만", async ({ page }) => {
  await open(page);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await dictate(page, ["Control", "Space"]);
  await expect(pill(page)).toContainText("Dictating → command bar");
  await page.keyboard.up("Space");
  await page.keyboard.up("Control");
  await expect(input(page)).toHaveValue("run the tests, please.");
  await expect(pill(page)).toHaveCount(0);
});

test("S-2721 콘솔(xterm) 안에서도 Ctrl+Space 는 셸에 NUL 을 보내지 않고 글자만 붙인다", async ({ page }) => {
  await open(page);
  const [id] = await ids(page);
  await page.locator(".xterm").first().click();
  await dictate(page, ["Control", "Space"]);
  await expect(pill(page)).toContainText("Dictating → ");
  await page.keyboard.up("Space");
  await page.keyboard.up("Control");
  await expect.poll(async () => (await writes(page, id!)).join("")).toContain("run the tests, please.");
  expect((await writes(page, id!)).join("")).not.toContain("\x00");
});

test("S-2720 옛 ControlRight 저장 사용자는 그 키로 계속 동작하고 Ctrl+Space 는 받아쓰기가 아니다", async ({ page }) => {
  await open(page, { dictateKey: "ControlRight" });
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await dictate(page, ["ControlRight"]);
  await expect(pill(page)).toContainText("Dictating → command bar");
  await page.keyboard.up("ControlRight");
  await expect(input(page)).toHaveValue("run the tests, please.");
  const n = (await capLog(page)).length;
  await dictate(page, ["Control", "Space"]);
  await page.keyboard.up("Space");
  await page.keyboard.up("Control");
  expect((await capLog(page)).length).toBe(n);
});

test("S-2722 Voice 설정: 받아쓰기 선택지 4개(기본 Ctrl+Space)와 안내 한 줄", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Control+,");
  await dlg(page).getByRole("tab", { name: "Voice" }).click();
  const sel = page.getByTestId("voice-dictkey");
  expect(await sel.locator("option").allTextContents()).toEqual(["Ctrl+Space (default)", "Right Ctrl", "Right Alt", "Right Shift"]);
  await expect(sel).toHaveValue("CtrlSpace");
  await expect(page.getByTestId("settings-pane-voice")).toContainText("On some Korean keyboards Right Ctrl and Right Alt are the Hanja/Han-Eng keys and may not work.");
});

test("S-2723 Shortcuts 창 Fixed keys 표: 키 줄이 보이고 기존 음성 줄은 그대로", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Control+,");
  await dlg(page).getByRole("tab", { name: "Shortcuts" }).click();
  const tbl = page.getByTestId("fixed-keys");
  await expect(tbl).toContainText("Fixed keys");
  for (const k of ["Ctrl+K", "Ctrl+Shift+P", "F2", "Ctrl+S", "Ctrl+Shift+T", "Ctrl+Q", "Ctrl+Space"]) await expect(tbl.getByText(k, { exact: true })).toBeVisible();
  await expect(tbl).toContainText("Focus the command bar");
  await expect(page.getByTestId("shortcut-fixed-dict")).toHaveText(/Hold Ctrl\+Space.*Dictate into the focused console or field/);
  await expect(page.getByTestId("shortcut-fixed-space")).toHaveText(/Hold Space.*Talk to the command bar/);
});

test("S-2724 `tidy up` 명령이 흩어진 콘솔 4개를 2×2 격자로 놓고 답한다(선택 무시)", async ({ page }) => {
  const board = JSON.stringify({
    formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" },
    viewport: { x: 0, y: 0, zoom: 0.5 },
    nodes: [["a", 300, 300], ["b", -800, -300], ["c", -500, 250], ["d", 100, -250]].map(([id, x, y], i) => ({ id, kind: "console", x, y, w: 720, h: 440, z: i + 1, name: `Con ${id}`, agentId: "shell", textSize: null, yolo: false })),
    groups: [],
  });
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), board);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("console")).toHaveCount(4);
  await page.getByTestId("thread-toggle").click();
  await input(page).fill("tidy up");
  await input(page).press("Enter");
  await expect(page.getByTestId("thread-msg").last()).toContainText("Tidied the board.");
  const at = (id: string) => page.locator(`[data-node-id="${id}"]`).evaluate((e) => [parseFloat((e as HTMLElement).style.left), parseFloat((e as HTMLElement).style.top)]);
  expect([await at("b"), await at("d"), await at("c"), await at("a")]).toEqual([[-800, -300], [-56, -300], [-800, 164], [-56, 164]]);
});

test("S-2640 Spawn 플라이아웃: 열면 첫 항목에 포커스, ↓로 이동, Enter 로 고르면 닫힘", async ({ page }) => {
  await open(page);
  await page.getByTestId("rail-spawn").click();
  const fly = page.getByTestId("spawn-flyout");
  await expect(fly).toBeVisible();
  const idx = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="spawn-flyout"] [role="menuitem"]')].indexOf(document.activeElement as Element));
  await expect.poll(idx).toBe(0);
  await page.keyboard.press("ArrowDown");
  expect(await idx()).toBe(1);
  await page.keyboard.press("Enter");
  await expect(fly).toHaveCount(0);
});
