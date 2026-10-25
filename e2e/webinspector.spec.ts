import { expect, test, type Page } from "@playwright/test";

// C16 웹 인스펙터 카드·자동 미리보기 (S-1130·S-1131·S-1140~S-1142). 가짜 __fakeWeb·__fakeWebLog·__fakePty(Tauri 밖). 외부 접속 없음.
// 구현이 맞출 약속(이름): 카드 inspector-card(data-id) · Open in window = inspector-open · Re-attach = inspector-reattach
//   "창이 열려 있음" 표시 inspector-opened · 안내 문구 inspector-note · 선 wire(data-from,data-to,data-wire-color)
//   상태 읽기 window.__insp.nodes(ws) / .selection(ws) · 저장 기록 window.__savedBoards[ws](ipc 가짜) · 재시도 간격 window.__autoRetryMs(시험용)
// 1400×900, 줌 1, 이동 0 → 월드 (x,y) = 화면 (700+x, 450+y).
test.use({ actionTimeout: 5000 });

const REPO = "C:/fake/repo";
const URL3000 = "http://localhost:3000/";
type N = Record<string, any>;
const con = (id = "c1", x = -760, y = -220) => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name: `Con ${id}`, agentId: "shell", textSize: null, yolo: false });
const web = (extra: N = {}) => ({ id: "w1", kind: "web", x: -400, y: -250, w: 640, h: 420, z: 1, tabs: [{ id: "t1", url: URL3000 }], active: "t1", zoom: 100, device: null, ...extra });
const board = (ws: string, nodes: unknown[]) => JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: ws, name: ws, repoPath: REPO }, viewport: { x: 0, y: 0, zoom: 1 }, nodes, groups: [] });
const FAKE = { probe: { [URL3000]: { reachable: true }, "http://localhost:3001/": { reachable: true } } };

async function open(page: Page, boards: Record<string, string>, fake: N = FAKE) {
  await page.addInitScript(([b, f]) => { const w = window as any; w.__symSeed = { boards: b }; w.__fakeWeb = f; w.__autoRetryMs = 100; }, [boards, fake] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
}
const ids = (page: Page) => page.evaluate(() => (window as any).__fakePty.ids() as number[]);
const emit = (page: Page, id: number, t: string) => page.evaluate(([i, s]) => (window as any).__fakePty.emit(i, s), [id, t] as const);
const nodes = (page: Page, ws = "ws-fake") => page.evaluate((w) => (window as any).__insp.nodes(w) as N[], ws);
const ofKind = async (page: Page, kind: string, ws = "ws-fake") => (await nodes(page, ws)).filter((n) => n.kind === kind);
const sel = (page: Page) => page.evaluate(() => (window as any).__insp.selection("ws-fake") as string[]);
const log = (page: Page) => page.evaluate(() => ((window as any).__fakeWebLog ?? []) as string[]);
const SERVER = "\x1b[32m  ➜  Local:\x1b[0m   http://localhost:3000/\r\n";
async function oneConsole(page: Page) {
  await open(page, { "ws-fake": board("ws-fake", [con()]) });
  await expect.poll(async () => (await ids(page)).length).toBe(1);
  return (await ids(page))[0]!;
}

test.describe("자동 미리보기 (S-1140·S-1141·S-1142)", () => {
  test("S-1140 콘솔이 주소를 찍고 응답하면 콘솔 오른쪽에 auto 웹 타일 + cyan 선", async ({ page }) => {
    const p = await oneConsole(page);
    await emit(page, p, SERVER);
    await expect.poll(async () => (await ofKind(page, "web")).length).toBe(1);
    const w = (await ofKind(page, "web"))[0]!;
    expect(w.auto).toBe(true);
    expect(w.wireTo).toBe("c1");
    expect(w.tabs[0].url).toBe(URL3000);
    expect(w.x).toBeGreaterThanOrEqual(-760 + 720); // 콘솔 오른쪽(겹치지 않음)
    const wire = page.getByTestId("wire");
    await expect(wire).toHaveCount(1);
    await expect(wire).toHaveAttribute("data-from", w.id);
    await expect(wire).toHaveAttribute("data-to", "c1");
    await expect(wire).toHaveAttribute("data-wire-color", "cyan");
  });

  test("S-1140 조각 경계에서 끊긴 주소도 잡고, 같은 출력을 또 찍어도 타일 하나", async ({ page }) => {
    const p = await oneConsole(page);
    await emit(page, p, "ready http://local");
    await emit(page, p, "host:3000/\r\n");
    await expect.poll(async () => (await ofKind(page, "web")).length).toBe(1);
    await emit(page, p, SERVER);
    await emit(page, p, "http://localhost:3000/again\r\n");
    await page.waitForTimeout(800);
    expect((await ofKind(page, "web")).length).toBe(1);
  });

  test("S-1140 사용자가 타일을 지운 뒤 다시 찍어도 안 만든다 / 다른 포트는 따로", async ({ page }) => {
    const p = await oneConsole(page);
    await emit(page, p, SERVER);
    await expect.poll(async () => (await ofKind(page, "web")).length).toBe(1);
    const w = (await ofKind(page, "web"))[0]!;
    await page.evaluate((id) => (window as any).__insp.remove("ws-fake", id), w.id);
    expect((await ofKind(page, "web")).length).toBe(0);
    await emit(page, p, SERVER);
    await page.waitForTimeout(800);
    expect((await ofKind(page, "web")).length).toBe(0);
    await emit(page, p, "http://localhost:3001/\r\n");
    await expect.poll(async () => (await ofKind(page, "web")).length).toBe(1);
  });

  test("S-1140 서버가 늦게 뜨면(처음 몇 번 응답 없음) 뜬 뒤에 만들어진다", async ({ page }) => {
    const p = await oneConsole(page);
    await page.evaluate((u) => { (window as any).__fakeWeb.probe[u] = { reachable: false }; }, URL3000);
    await emit(page, p, SERVER);
    await page.waitForTimeout(700);
    expect((await ofKind(page, "web")).length).toBe(0);
    await page.evaluate((u) => { (window as any).__fakeWeb.probe[u] = { reachable: true }; }, URL3000);
    await expect.poll(async () => (await ofKind(page, "web")).length).toBe(1);
  });

  test("S-1140 외부 주소는 무시, 0.0.0.0 은 localhost 로 연다", async ({ page }) => {
    const p = await oneConsole(page);
    await emit(page, p, "docs https://example.com/ and http://192.168.0.5:3000/\r\n");
    await page.waitForTimeout(500);
    expect((await ofKind(page, "web")).length).toBe(0);
    await emit(page, p, "Serving on http://0.0.0.0:3001/\r\n");
    await expect.poll(async () => (await ofKind(page, "web")).length).toBe(1);
    expect((await ofKind(page, "web"))[0]!.tabs[0].url).toBe("http://localhost:3001/");
  });

  test("S-1142 숨은 워크스페이스의 콘솔에서도 만들어지고, 타일 놓기는 되돌리기 1단계", async ({ page }) => {
    await page.addInitScript(() => { (window as any).__autoRetryMs = 100; });
    await open(page, { "ws-fake": board("ws-fake", [con()]), "ws-b": board("ws-b", [con()]) });
    await expect(page.getByTestId("console").first()).toBeVisible();
    await page.evaluate((r) => (window as any).__shell.openWs(r, "ws-b"), REPO);
    await expect.poll(async () => (await ids(page)).length).toBe(2);
    for (const p of await ids(page)) await emit(page, p, SERVER);
    await expect.poll(async () => (await ofKind(page, "web", "ws-fake")).length).toBe(1);
    await expect.poll(async () => (await ofKind(page, "web", "ws-b")).length).toBe(1);
    const vis = await page.evaluate(() => (window as any).__shell.list() as { id: string; visible: boolean }[]);
    expect(vis.filter((w) => w.visible).length).toBe(1); // 하나는 숨어 있었다
    // 보이는 쪽에서 Ctrl+Z 한 번 → 그 쪽 타일이 사라진다(타일 놓기 = 1단계)
    const shown = vis.find((w) => w.visible)!.id;
    await page.mouse.click(1300, 100);
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await ofKind(page, "web", shown)).length).toBe(0);
  });

  test("S-1141 저장 때 손대지 않은 auto 타일은 빠지고, 주소를 옮기면 auto 가 풀려 저장·복원된다", async ({ page }) => {
    const p = await oneConsole(page);
    await emit(page, p, SERVER);
    await expect.poll(async () => (await ofKind(page, "web")).length).toBe(1);
    const saved = () => page.evaluate(() => ((window as any).__savedBoards?.["ws-fake"] ?? "") as string);
    await expect.poll(async () => (await saved()) !== "").toBe(true);
    const kinds = async () => (JSON.parse(await saved()).nodes as N[]).map((n) => n.kind);
    expect(await kinds()).toEqual(["console"]); // 자동 타일은 저장에 없다
    // 타일에서 주소를 옮긴다 → auto 해제
    await page.getByTestId("web-url").fill("http://localhost:3001/");
    await page.getByTestId("web-url").press("Enter");
    await expect.poll(async () => (await ofKind(page, "web"))[0]?.auto).toBeFalsy();
    await expect.poll(async () => (await kinds()).includes("web")).toBe(true);
    const json = await saved();
    // 저장본으로 다시 연다 → 옮긴 타일은 돌아온다
    const page2 = await page.context().newPage();
    await open(page2, { "ws-fake": json });
    await expect.poll(async () => (await ofKind(page2, "web")).length).toBe(1);
    expect((await ofKind(page2, "web"))[0]!.tabs[0].url).toBe("http://localhost:3001/");
  });
});

test.describe("인스펙터 카드 (S-1130·S-1131)", () => {
  const seed = (tile: N = {}, extra: unknown[] = []) => ({ "ws-fake": board("ws-fake", [web(tile), ...extra]) });
  const card = (page: Page) => page.getByTestId("inspector-card");

  test("S-1130 {} 버튼 → 타일 오른쪽에 300×180 카드, wireTo=타일, cyan 선", async ({ page }) => {
    await open(page, seed());
    await page.getByTestId("web-inspect").click();
    await expect(card(page)).toHaveCount(1);
    const c = (await ofKind(page, "inspector"))[0]!;
    expect(c.wireTo).toBe("w1");
    expect([c.w, c.h]).toEqual([300, 180]);
    expect(c.x).toBeGreaterThanOrEqual(-400 + 640); // 타일 오른쪽(겹치지 않음)
    const wire = page.locator('[data-testid="wire"][data-from="' + c.id + '"]');
    await expect(wire).toHaveAttribute("data-to", "w1");
    await expect(wire).toHaveAttribute("data-wire-color", "cyan");
    await expect(page.getByTestId("inspector-note")).toHaveText("Docking isn't available here. DevTools opens in its own window.");
  });

  test("S-1130 More › Inspect on board 도 같은 카드, 다시 누르면 새로 안 만들고 그 카드를 선택", async ({ page }) => {
    await open(page, seed());
    await page.getByTestId("web-inspect").click();
    await expect(card(page)).toHaveCount(1);
    const id = (await ofKind(page, "inspector"))[0]!.id;
    await page.mouse.click(1300, 100); // 빈 곳 → 선택 해제
    expect(await sel(page)).toEqual([]);
    await page.getByTestId("web-inspect").click();
    await expect(card(page)).toHaveCount(1);
    expect((await ofKind(page, "inspector")).length).toBe(1);
    expect(await sel(page)).toEqual([id]);
    await page.getByTestId("web-more").click();
    await page.getByRole("menuitem", { name: /Inspect on board/ }).click();
    expect((await ofKind(page, "inspector")).length).toBe(1);
  });

  test("S-1131 Open in window → 현재 탭 주소와 창 이름 inspect-<타일 id>, '창이 열려 있음' 표시", async ({ page }) => {
    await open(page, seed({ tabs: [{ id: "t1", url: "http://localhost:3001/" }, { id: "t2", url: URL3000 }], active: "t2" }));
    await page.getByTestId("web-inspect").click();
    await expect(page.getByTestId("inspector-opened")).toHaveCount(0);
    await page.getByTestId("inspector-open").click();
    await expect.poll(() => log(page)).toContain(`open inspect-w1 ${URL3000}`);
    await expect(page.getByTestId("inspector-opened")).toBeVisible();
  });

  test("S-1131 타일을 지우면 카드도 지워지고 창 닫기 요청, Ctrl+Z 한 번에 둘 다 돌아온다", async ({ page }) => {
    await open(page, seed());
    await page.getByTestId("web-inspect").click();
    await page.getByTestId("inspector-open").click();
    await page.getByTestId("web-head").click(); // 타일 선택
    await page.keyboard.press("Delete");
    await expect(card(page)).toHaveCount(0);
    expect((await nodes(page)).length).toBe(0);
    await expect.poll(() => log(page)).toContain("close inspect-w1");
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await nodes(page)).map((n) => n.kind).sort()).toEqual(["inspector", "web"]);
  });

  test("S-1131 붙었던 탭이 닫히면 Re-attach 가 보이고, 누르면 현재 활성 탭으로 다시 연결", async ({ page }) => {
    const insp = { id: "i1", kind: "inspector", x: 300, y: -250, w: 300, h: 180, z: 2, wireTo: "w1", tab: "gone" };
    await open(page, seed({}, [insp]));
    await expect(page.getByTestId("inspector-reattach")).toBeVisible();
    await expect(page.getByTestId("inspector-open")).toBeDisabled();
    await page.getByTestId("inspector-reattach").click();
    await expect(page.getByTestId("inspector-reattach")).toHaveCount(0);
    await expect(page.getByTestId("inspector-open")).toBeEnabled();
    expect((await ofKind(page, "inspector"))[0]!.tab).toBe("t1");
  });
});
