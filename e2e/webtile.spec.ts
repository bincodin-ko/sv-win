import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";

// C11 웹 타일 (S-1100~S-1115). 가짜 __fakeWeb(Tauri 밖) + 시험 코드가 띄운 로컬 서버(외부 사이트 접속 없음). 기대값은 spec/3묶음-3.md 문장에서만.
// 구현이 맞출 약속(이름): 타일 web-tile · 머리줄 web-head(data-node-handle) · 기기 버튼 web-device · 탭 web-tab(data-tab-id,data-active)/web-tab-close/web-tab-add
//   툴바 web-back/web-forward/web-reload/web-stop/web-url(입력)/web-url-error/web-inspect/web-more/web-zoom-pill · 다이얼 web-dial · 포트 web-port(data-port,data-open) · 빠른 링크 web-quick
//   본문 web-body · iframe web-frame(data-tab-id,data-active) · 덮개 web-cover · 서버 대기 web-waiting/web-retry-now · 실패 web-failed/web-retry/web-open-browser
//   임베드 불가 web-blocked/web-open-window/web-open-browser2 · 자리 표시 web-placeholder · 상태 읽기 window.__web.node("ws-fake")
// 1400×900, 줌 1, 이동 0 → 월드 (x,y) = 화면 (700+x, 450+y).
test.use({ actionTimeout: 5000 });

let server: Server;
let P = 0;
let BASE = "";
test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(`<!doctype html><title>t</title><body style="margin:0"><h1 id="h">TEST PAGE ${req.url}</h1>`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  P = (server.address() as AddressInfo).port;
  BASE = `http://localhost:${P}`;
});
test.afterAll(async () => { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); });

const boardJson = (nodes: unknown[], viewport = { x: 0, y: 0, zoom: 1 }) => JSON.stringify({
  formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport, nodes, groups: [],
});
async function open(page: Page, nodes: unknown[] = [], viewport?: { x: number; y: number; zoom: number }) {
  const fake = { ports: { 3000: true, 8080: true }, probe: { "http://localhost:3000": { reachable: true }, [BASE]: { reachable: true }, [`${BASE}/a`]: { reachable: true }, [`${BASE}/b`]: { reachable: true }, "https://blocked.example.com": { reachable: true, frameBlocked: true } } };
  await page.addInitScript(([f, b]) => { (window as any).__fakeWeb = f; (window as any).__symSeed = { boards: { "ws-fake": b } }; }, [fake, boardJson(nodes, viewport)] as const);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
}
async function place(page: Page) { // 레일 Web tile → 빈 곳 클릭. 타일 왼쪽 위 = 화면 (300,200)
  await page.getByTestId("rail-web").click();
  await page.mouse.click(300, 200);
  await expect(page.getByTestId("web-tile")).toHaveCount(1);
}
const tile = (page: Page) => page.getByTestId("web-tile");
const frame = (page: Page) => page.locator('[data-testid="web-frame"][data-active="true"]');
const url = (page: Page) => page.getByTestId("web-url");
async function go(page: Page, text: string) { await url(page).fill(text); await url(page).press("Enter"); }
const node = (page: Page) => page.evaluate(() => (window as any).__web.node("ws-fake") as Record<string, any>);
const blank = (page: Page) => page.mouse.click(1300, 100);
const WNODE = (extra: Record<string, unknown> = {}) => ({ id: "w1", kind: "web", x: -400, y: -250, w: 640, h: 420, z: 1, tabs: [{ id: "t1", url: "" }], active: "t1", zoom: 100, device: null, ...extra });

test("S-1101·S-1102 Web tile 도구로 놓임 640×420, 빈 시작 탭에 다이얼 6포트(초록 점)와 빠른 링크 6개", async ({ page }) => {
  await open(page);
  await place(page);
  const b = (await tile(page).boundingBox())!;
  expect([Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]).toEqual([300, 200, 640, 420]);
  await expect(page.getByTestId("web-tab")).toHaveCount(1);
  await expect(page.getByTestId("web-tab")).toHaveText(/New tab/);
  await expect(page.getByTestId("web-dial")).toBeVisible();
  const ports = page.getByTestId("web-port");
  expect(await ports.evaluateAll((l) => l.map((e) => (e as HTMLElement).dataset.port))).toEqual(["3000", "3001", "4200", "5173", "8000", "8080"]);
  await expect(page.locator('[data-testid="web-port"][data-port="3000"]')).toHaveAttribute("data-open", "true");
  await expect(page.locator('[data-testid="web-port"][data-port="8080"]')).toHaveAttribute("data-open", "true");
  await expect(page.locator('[data-testid="web-port"][data-port="5173"]')).toHaveAttribute("data-open", "false");
  const q = page.getByTestId("web-quick");
  expect(await q.allInnerTexts()).toEqual(["Google", "GitHub", "YouTube", "MDN", "npm", "Hacker News"]);
  // 3초마다 다시 본다: 5173 이 열리면 점이 바뀐다
  await page.evaluate(() => ((window as any).__fakeWeb.ports[5173] = true));
  await expect(page.locator('[data-testid="web-port"][data-port="5173"]')).toHaveAttribute("data-open", "true", { timeout: 6000 });
});

test("S-1101 고리 Insert web 으로도 놓인다", async ({ page }) => {
  await open(page);
  await page.mouse.click(700, 450, { button: "right" });
  await page.getByRole("menuitem", { name: "Insert web" }).click();
  await expect(tile(page)).toHaveCount(1);
});

test("S-1102 포트를 누르면 localhost 로 이동, 빠른 링크는 https 주소(연결 전 검사에서 막힘 = 외부 접속 없음)", async ({ page }) => {
  await open(page);
  await place(page);
  await page.locator('[data-testid="web-port"][data-port="3000"]').click();
  await expect(frame(page)).toHaveAttribute("src", "http://localhost:3000");
  await expect(url(page)).toHaveValue("http://localhost:3000");
  await expect(page.getByTestId("web-dial")).toHaveCount(0);
  // 빠른 링크: 주소만 확인한다(가짜 probe 가 reachable:false 라 iframe 은 만들지 않는다)
  await page.getByTestId("web-tab-add").click();
  await page.getByTestId("web-quick").filter({ hasText: "Hacker News" }).click();
  await expect(url(page)).toHaveValue("https://news.ycombinator.com");
  await expect(frame(page)).toHaveCount(0);
});

test("S-1103 주소 입력: 이동, 스킴 보정, 잘못된 주소 거절 문구", async ({ page }) => {
  await open(page);
  await place(page);
  await go(page, `localhost:${P}/a`);
  await expect(frame(page)).toHaveAttribute("src", `${BASE}/a`);
  await expect(frame(page).contentFrame().locator("#h")).toHaveText("TEST PAGE /a");
  await go(page, "hello");
  await expect(page.getByTestId("web-url-error")).toHaveText("Only http and https pages load.");
  await expect(frame(page)).toHaveAttribute("src", `${BASE}/a`); // 거절하면 그대로
  await go(page, "javascript:alert(1)");
  await expect(page.getByTestId("web-url-error")).toBeVisible();
  await go(page, `localhost:${P}/b`);
  await expect(page.getByTestId("web-url-error")).toHaveCount(0);
  await expect(frame(page)).toHaveAttribute("src", `${BASE}/b`);
});

test("S-1112 덮개: 선택 전 첫 클릭은 선택만, 선택 뒤 한 번 더 누르면 사라짐, 빈 곳·Esc 로 돌아옴, 휠은 보드로", async ({ page }) => {
  await open(page, [WNODE({ tabs: [{ id: "t1", url: `${BASE}/a` }] })]);
  await expect(tile(page)).toHaveCount(1);
  const cover = page.getByTestId("web-cover");
  await expect(cover).toBeVisible();
  const body = (await page.getByTestId("web-body").boundingBox())!;
  const at = { x: body.x + body.width / 2, y: body.y + body.height / 2 };
  await blank(page);
  await page.mouse.click(at.x, at.y); // 첫 클릭 = 선택만
  await expect(page.locator('[data-node-id="w1"]')).toHaveAttribute("data-selected", "true");
  await expect(cover).toBeVisible();
  // 덮개 위 휠: 보드 팬(월드 변환이 바뀐다), Ctrl+휠: 보드 줌
  const t0 = await page.getByTestId("world").getAttribute("style");
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.getByTestId("world").getAttribute("style")).not.toBe(t0);
  const z0 = await page.getByTestId("zoom-pct").innerText();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Control");
  await expect.poll(() => page.getByTestId("zoom-pct").innerText()).not.toBe(z0);
  const body2 = (await page.getByTestId("web-body").boundingBox())!;
  const at2 = { x: body2.x + body2.width / 2, y: body2.y + body2.height / 2 };
  await page.mouse.click(at2.x, at2.y); // 선택된 뒤 한 번 더 → 덮개 사라짐
  await expect(cover).toHaveCount(0);
  await blank(page); // 빈 캔버스 → 덮개 복귀
  await expect(cover).toBeVisible();
  const body3 = (await page.getByTestId("web-body").boundingBox())!;
  const at3 = { x: body3.x + body3.width / 2, y: body3.y + body3.height / 2 };
  await page.mouse.click(at3.x, at3.y);
  await page.mouse.click(at3.x, at3.y);
  await expect(cover).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(cover).toBeVisible();
});

test("S-1109 서버 대기: 안내와 Retry now → 서버가 뜨면 자동으로 불러온다", async ({ page }) => {
  await open(page);
  await place(page);
  await go(page, `localhost:${P}/w`); // 가짜 probe 에 없는 주소 = 연결 안 됨
  await expect(page.getByTestId("web-waiting")).toContainText("Waiting for the dev server");
  await expect(page.getByTestId("web-retry-now")).toBeVisible();
  await expect(frame(page)).toHaveCount(0);
  await page.evaluate((u) => ((window as any).__fakeWeb.probe[u] = { reachable: true }), `${BASE}/w`);
  await expect(frame(page)).toHaveAttribute("src", `${BASE}/w`, { timeout: 4000 });
  await expect(page.getByTestId("web-waiting")).toHaveCount(0);
});

test("S-1109 10번 다시 시도해도 안 되면 Couldn't load + Retry/Open in Browser, 외부 주소는 바로", async ({ page }) => {
  test.setTimeout(45_000);
  await open(page);
  await place(page);
  await go(page, "localhost:1");
  await expect(page.getByTestId("web-waiting")).toBeVisible();
  await expect(page.getByTestId("web-failed")).toContainText("Couldn't load this page", { timeout: 20_000 });
  await expect(page.getByTestId("web-retry")).toBeVisible();
  await expect(page.getByTestId("web-open-browser")).toBeVisible();
  await page.getByTestId("web-retry").click();
  await expect(page.getByTestId("web-waiting")).toBeVisible(); // 다시 처음부터
  // localhost 가 아닌 주소가 연결 실패면 바로 실패(대기 없이)
  await go(page, "nothing-here.example.com");
  await expect(page.getByTestId("web-failed")).toContainText("Couldn't load this page");
  await expect(page.getByTestId("web-waiting")).toHaveCount(0);
  await page.getByTestId("web-open-browser").click();
  expect(await page.evaluate(() => (window as any).__fakeFsLog)).toContain("url https://nothing-here.example.com");
});

test("S-1110 임베드 불가: 안내와 Open in window · Open in Browser", async ({ page }) => {
  await open(page);
  await place(page);
  await go(page, "blocked.example.com");
  await expect(page.getByTestId("web-blocked")).toContainText("This site blocks frames, so it opens in a built-in browser view.");
  // 107번: 진짜 웹뷰를 열고 타일 자리에 맞춘다
  const log = () => page.evaluate(() => (window as any).__fakeWebLog as string[]);
  await expect.poll(async () => (await log()).some((l) => /^child-open .* https:\/\/blocked\.example\.com/.test(l))).toBe(true);
  // 만들기가 끝난 뒤 자리를 한 번 더 보낸다(처음 알림은 웹뷰가 생기기 전이라 버려질 수 있다)
  await expect.poll(async () => { const l = await log(); const i = l.findIndex((x) => x.startsWith("child-open")); return l.slice(i + 1).filter((x) => /^child-place \S+ \d/.test(x)).length; }).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await log()).filter((l) => l.startsWith("child-place")).at(-1)).toMatch(/^child-place \S+ \d+,\d+,\d+,\d+,[\d.]+$/);
  const box = (await page.getByTestId("web-blocked").boundingBox())!;
  const [x, y, w, h] = (await log()).filter((l) => l.startsWith("child-place")).at(-1)!.split(" ")[2]!.split(",").map(Number);
  expect(Math.abs(x! - box.x) + Math.abs(y! - box.y) + Math.abs(w! - box.width) + Math.abs(h! - box.height)).toBeLessThan(6);
  // 메뉴가 덮으면 숨긴다(진짜 웹뷰는 앱 위에 그려지므로). 타일과 안 겹치는 메뉴는 그대로
  await page.getByTestId("tools-btn").click();
  await page.waitForTimeout(200);
  expect((await log()).at(-1)).not.toMatch(/hide$/);
  await page.keyboard.press("Escape");
  await page.evaluate(() => { const d = document.createElement("div"); d.id = "ov"; d.setAttribute("role", "menu"); Object.assign(d.style, { position: "fixed", left: "500px", top: "400px", width: "40px", height: "20px", zIndex: "99" }); document.body.append(d); });
  await expect.poll(async () => (await log()).at(-1)).toMatch(/hide$/);
  await page.evaluate(() => document.getElementById("ov")!.remove());
  await expect.poll(async () => (await log()).at(-1)).toMatch(/^child-place \S+ \d+/);
  await expect(frame(page)).toHaveCount(0);
  await expect(page.getByTestId("web-open-window")).toHaveText("Open in window");
  await expect(page.getByTestId("web-open-browser2")).toHaveText("Open in Browser");
  await page.getByTestId("web-open-window").click();
  expect((await page.evaluate(() => (window as any).__fakeWebLog)).some((l: string) => /^open .* https:\/\/blocked\.example\.com/.test(l))).toBe(true);
  await page.getByTestId("web-open-browser2").click();
  expect(await page.evaluate(() => (window as any).__fakeFsLog)).toContain("url https://blocked.example.com");
});

test("S-1107 탭: + 로 최대 12개, 이름은 호스트, 마지막 탭을 닫으면 새 시작 탭", async ({ page }) => {
  await open(page);
  await place(page);
  await go(page, `localhost:${P}/a`);
  await expect(page.getByTestId("web-tab").first()).toHaveText(/localhost/);
  for (let i = 0; i < 11; i++) await page.getByTestId("web-tab-add").click();
  await expect(page.getByTestId("web-tab")).toHaveCount(12);
  await expect(page.getByTestId("web-tab-add")).toBeDisabled();
  // 12개 중 11개는 시작 탭(New tab)
  await expect(page.getByTestId("web-tab").filter({ hasText: "New tab" })).toHaveCount(11);
  for (let i = 0; i < 11; i++) await page.getByTestId("web-tab-close").last().click();
  await expect(page.getByTestId("web-tab")).toHaveCount(1);
  await page.getByTestId("web-tab-close").first().click(); // 마지막 탭 → 새 시작 탭
  await expect(page.getByTestId("web-tab")).toHaveCount(1);
  await expect(page.getByTestId("web-tab")).toHaveText(/New tab/);
  await expect(page.getByTestId("web-dial")).toBeVisible();
  // 탭을 바꿔도 다른 탭 iframe 은 지우지 않고 숨긴다(S-1114)
  await go(page, `localhost:${P}/a`);
  await page.getByTestId("web-tab-add").click();
  await expect(page.getByTestId("web-frame")).toHaveCount(1);
  await expect(frame(page)).toHaveCount(0);
});

test("S-1104 Back/Forward: 이 타일에서 연 주소 기록 안에서, 다이얼로도 돌아간다", async ({ page }) => {
  await open(page);
  await place(page);
  await expect(page.getByTestId("web-back")).toBeDisabled();
  await go(page, `localhost:${P}/a`);
  await go(page, `localhost:${P}/b`);
  await page.getByTestId("web-back").click();
  await expect(url(page)).toHaveValue(`${BASE}/a`);
  await expect(frame(page)).toHaveAttribute("src", `${BASE}/a`);
  await expect(page.getByTestId("web-forward")).toBeEnabled();
  await page.getByTestId("web-forward").click();
  await expect(url(page)).toHaveValue(`${BASE}/b`);
  await page.getByTestId("web-back").click();
  await page.getByTestId("web-back").click();
  await expect(page.getByTestId("web-dial")).toBeVisible();
  await expect(page.getByTestId("web-back")).toBeDisabled();
});

test("S-1105 Reload 는 iframe 을 다시 불러오고, 로딩 중엔 Stop(누르면 about:blank)", async ({ page }) => {
  await open(page);
  await place(page);
  await go(page, `localhost:${P}/a`);
  await expect(page.getByTestId("web-reload")).toBeVisible(); // 로드가 끝나면 Reload
  await expect(frame(page).contentFrame().locator("#h")).toHaveText("TEST PAGE /a");
  await page.evaluate(() => { (window as any).__loads = 0; document.querySelector('[data-testid="web-frame"]')!.addEventListener("load", () => (window as any).__loads++); });
  await page.getByTestId("web-reload").click();
  await expect.poll(() => page.evaluate(() => (window as any).__loads)).toBeGreaterThan(0);
  // Stop: 로드 완료를 가로막아 로딩 중 상태를 만든다(느린 응답 경로)
  await page.route(`${BASE}/slow`, async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.fulfill({ status: 200, contentType: "text/html", body: "slow" }); });
  await page.evaluate((u) => ((window as any).__fakeWeb.probe[u] = { reachable: true }), `${BASE}/slow`);
  await go(page, `localhost:${P}/slow`);
  await expect(page.getByTestId("web-stop")).toBeVisible();
  await page.getByTestId("web-stop").click();
  await expect(page.getByTestId("web-stop")).toHaveCount(0);
  await expect(page.getByTestId("web-reload")).toBeVisible();
  await expect(frame(page)).toHaveAttribute("src", "about:blank");
});

test("S-1108 기기 크기: 메뉴 구성, 고르면 iframe 이 그 크기가 되고 비율을 지켜 가운데로 축소", async ({ page }) => {
  await open(page);
  await place(page);
  await go(page, `localhost:${P}/a`);
  await page.getByTestId("web-device").click();
  const items = await page.getByRole("menu").getByRole("menuitem").allInnerTexts();
  expect(items.map((s) => s.replace(/\s+/g, " ").trim())).toEqual([
    "Fit tile", "24 in monitor 1920×1080", "27 in monitor 2560×1440", "32 in 4K 3840×2160",
    "iPhone SE 375×667", "iPhone 14 Pro 393×852", "iPhone 14 Pro Max 430×932", "Pixel 7 412×915", "Galaxy S8+ 360×740",
  ].map((s) => s)); // DISPLAYS·PHONES 는 제목 줄(menuitem 아님)
  await expect(page.getByRole("menuitem", { name: /^Fit tile/ })).toHaveAttribute("data-checked", "true");
  await page.getByRole("menuitem", { name: /^iPhone SE/ }).click();
  const f = frame(page);
  expect(await f.evaluate((e) => [(e as HTMLElement).offsetWidth, (e as HTMLElement).offsetHeight])).toEqual([375, 667]);
  const fb = (await f.boundingBox())!, bb = (await page.getByTestId("web-body").boundingBox())!;
  expect(fb.width / 375).toBeLessThan(1);
  expect(fb.width / 375).toBeCloseTo(fb.height / 667, 2); // 비율 유지
  expect(fb.x + fb.width / 2).toBeCloseTo(bb.x + bb.width / 2, 0); // 가운데
  expect((await node(page)).device).toBe("iphone-se");
  await page.getByTestId("web-device").click();
  await page.getByRole("menuitem", { name: /^Fit tile/ }).click();
  expect(await f.evaluate((e) => (e as HTMLElement).offsetWidth)).toBeCloseTo(bb.width, 0);
  expect((await node(page)).device).toBeNull();
});

test("S-1106 More: 확대 120% 표시·클릭하면 100%, Copy URL, Open in Browser, Hard reload", async ({ page }) => {
  await open(page);
  await place(page);
  await go(page, `localhost:${P}/a`);
  const bw = (await page.getByTestId("web-body").boundingBox())!.width;
  await page.getByTestId("web-more").click();
  const names = (await page.getByRole("menu").getByRole("menuitem").allInnerTexts()).map((s) => s.trim());
  for (const n of ["Inspect on board", "Hard reload (skip cache)", "Copy URL", "Open in Browser"]) expect(names).toContain(n);
  expect(names.filter((n) => /^\d+%$/.test(n)).length).toBe(21);
  await page.getByRole("menuitem", { name: "120%", exact: true }).click();
  await expect(page.getByTestId("web-zoom-pill")).toHaveText("120%");
  expect(await frame(page).evaluate((e) => (e as HTMLElement).offsetWidth)).toBeCloseTo(bw / 1.2, 0);
  expect((await node(page)).zoom).toBe(120);
  await page.getByTestId("web-zoom-pill").click();
  await expect(page.getByTestId("web-zoom-pill")).toHaveCount(0);
  expect((await node(page)).zoom).toBe(100);
  await page.getByTestId("web-more").click();
  await page.getByRole("menuitem", { name: "Copy URL" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${BASE}/a`);
  await page.getByTestId("web-more").click();
  await page.getByRole("menuitem", { name: "Open in Browser" }).click();
  expect(await page.evaluate(() => (window as any).__fakeFsLog)).toContain(`url ${BASE}/a`);
  await page.getByTestId("web-more").click();
  await page.getByRole("menuitem", { name: "Hard reload (skip cache)" }).click();
  await expect(frame(page)).toHaveAttribute("src", `${BASE}/a`);
});

test("S-1113·S-1114 저장·복원: 탭·활성·확대·기기가 돌아오고, 다른 탭 iframe 은 숨겨진 채 남는다", async ({ page }) => {
  await open(page, [WNODE({ tabs: [{ id: "t1", url: `${BASE}/a` }, { id: "t2", url: `${BASE}/b` }], active: "t2", zoom: 110, device: "pixel-7" })]);
  await expect(page.getByTestId("web-tab")).toHaveCount(2);
  await expect(page.locator('[data-testid="web-tab"][data-active="true"]')).toHaveAttribute("data-tab-id", "t2");
  await expect(frame(page)).toHaveAttribute("src", `${BASE}/b`);
  await expect(page.getByTestId("web-zoom-pill")).toHaveText("110%");
  await expect(page.getByTestId("web-frame")).toHaveCount(2);
  await expect(page.locator('[data-testid="web-frame"][data-tab-id="t1"]')).toBeHidden();
  expect(await frame(page).evaluate((e) => [(e as HTMLElement).offsetWidth, (e as HTMLElement).offsetHeight])).toEqual([375, 832]); // zoom 110: iframe = 기기 크기 / 1.1 (zoom.test.ts 식)
  await page.locator('[data-testid="web-tab"][data-tab-id="t1"]').click();
  await expect(url(page)).toHaveValue(`${BASE}/a`);
  await expect(page.locator('[data-testid="web-frame"][data-tab-id="t2"]')).toBeHidden();
  const n = await node(page);
  expect(n.active).toBe("t1");
  expect(n.tabs).toEqual([{ id: "t1", url: `${BASE}/a` }, { id: "t2", url: `${BASE}/b` }]);
  expect(n.zoom).toBe(110);
  expect(n.device).toBe("pixel-7");
});

test("S-1114 줌 아웃으로 타일 폭이 100px 미만이면 iframe 대신 회색 자리 표시", async ({ page }) => {
  await open(page, [WNODE({ w: 400, tabs: [{ id: "t1", url: `${BASE}/a` }] })], { x: 0, y: 0, zoom: 0.2 }); // 400*0.2 = 80px
  await expect(page.getByTestId("web-placeholder")).toBeVisible();
  await expect(frame(page)).toBeHidden();
  await page.getByTestId("zoom-in").click(); // 0.24 → 96px 아직 작다
  await expect(page.getByTestId("web-placeholder")).toBeVisible();
  await page.getByTestId("zoom-in").click(); // 0.288 → 115px
  await expect(page.getByTestId("web-placeholder")).toHaveCount(0);
  await expect(frame(page)).toBeVisible();
});

test("S-1113 머리줄만 끌린다: 머리줄 끌기는 이동, 본문 끌기는 이동 아님", async ({ page }) => {
  await open(page, [WNODE()]);
  const head = (await page.getByTestId("web-head").boundingBox())!;
  await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2);
  await page.mouse.down();
  await page.mouse.move(head.x + head.width / 2 + 60, head.y + head.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const n = await node(page);
  expect([n.x, n.y]).toEqual([-340, -210]);
  const body = (await page.getByTestId("web-body").boundingBox())!;
  await page.mouse.move(body.x + 200, body.y + 200);
  await page.mouse.down();
  await page.mouse.move(body.x + 260, body.y + 240, { steps: 5 });
  await page.mouse.up();
  const m = await node(page);
  expect([m.x, m.y]).toEqual([-340, -210]);
});

test("S-1100 크기 조절 최소 320×240, 지우개 대상(Delete 로 묻지 않고 지움)", async ({ page }) => {
  await open(page, [WNODE()]);
  await page.locator('[data-node-id="w1"]').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.getByTestId("web-head").click();
  const se = page.locator('[data-node-id="w1"] [data-handle="se"]');
  const hb = (await se.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - 600, hb.y - 500, { steps: 6 });
  await page.mouse.up();
  const n = await node(page);
  expect([n.w, n.h]).toEqual([320, 240]);
  await page.keyboard.press("Delete");
  await expect(tile(page)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("S-1102 숨은 워크스페이스에서는 포트 다이얼이 폴링하지 않고, 다시 보이면 다시 본다", async ({ page }) => {
  await open(page, [WNODE()]);
  const calls = () => page.evaluate(() => ((window as any).__fakePortCalls ?? 0) as number);
  await expect(page.getByTestId("web-dial")).toBeVisible();
  await expect.poll(calls).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).__shell.openWs("C:/fake/repo", "ws-b")); // ws-b 가 보이고 ws-fake 는 숨는다
  await expect.poll(async () => (await page.evaluate(() => (window as any).__shell.list() as { id: string; visible: boolean }[])).find((w) => w.id === "ws-fake")?.visible).toBe(false);
  await page.waitForTimeout(500);
  const n = await calls();
  await page.waitForTimeout(3600); // 3초 폴링이 한 번은 돌았을 시간
  expect(await calls()).toBe(n);
  await page.evaluate(() => (window as any).__shell.show("ws-fake"));
  await expect.poll(calls).toBeGreaterThan(n);
});
