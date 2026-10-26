import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const CUR: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version; // 지금 앱 버전(About 이 package.json 에서 읽는다)

// Q2 S-3122~S-3128. 실제 GitHub 는 부르지 않는다: page.route 로 api.github.com 을 가로채고, 시작 확인은 window.__updateTest 가 있을 때만(delayMs=0).
const API = "https://api.github.com/**";
const SETUP = "https://github.com/bincodin-ko/sv-win/releases/download/v9.9.9/Symvibe_9.9.9_x64-setup.exe";
const SHA = "b6f0c967" + "0".repeat(56);
const REL_URL = "https://github.com/bincodin-ko/sv-win/releases/tag/v9.9.9";
const release = (o: { assets?: boolean; digest?: boolean; tag?: string } = {}) => ({
  tag_name: o.tag ?? "v9.9.9",
  html_url: REL_URL,
  assets: o.assets === false ? [] : [{ name: "Symvibe_9.9.9_x64-setup.exe", browser_download_url: SETUP, ...(o.digest === false ? {} : { digest: `sha256:${SHA}` }) }],
});
type Reply = { status: number; body?: unknown } | "error";
async function fake(page: Page, r: Reply, calls: string[] = []) {
  await page.route(API, (route) => {
    calls.push(route.request().url());
    if (r === "error") return route.abort();
    return route.fulfill({ status: r.status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(r.body ?? {}) });
  });
}
const seed = (page: Page, o: { startup?: boolean; settings?: Record<string, unknown> }) =>
  page.addInitScript((a) => {
    if (a.startup) (window as unknown as { __updateTest: unknown }).__updateTest = { delayMs: 0 };
    if (a.settings && !localStorage.getItem("symvibe.fakeSettings")) localStorage.setItem("symvibe.fakeSettings", JSON.stringify(a.settings));
  }, o);
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}") as Record<string, unknown>);
const urls = (page: Page) => page.evaluate(() => ((window as unknown as { __fakeFsLog?: string[] }).__fakeFsLog ?? []).filter((s) => s.startsWith("url ")));
const boot = async (page: Page) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
};
const notice = (page: Page) => page.getByTestId("app-notice");
async function openAbout(page: Page) {
  await page.keyboard.press("Control+,");
  await page.getByRole("tab", { name: /About|정보/ }).click();
}

test("S-3122/S-3123 새 버전: 알림 -> Get installer 가 설치 파일 주소를 연다", async ({ page }) => {
  await seed(page, { startup: true });
  await fake(page, { status: 200, body: release() });
  await boot(page);
  await expect(notice(page)).toContainText("Symvibe v9.9.9 is available.");
  await notice(page).getByRole("button", { name: "Get installer" }).click();
  expect(await urls(page)).toEqual([`url ${SETUP}`]);
  await expect(notice(page)).toHaveCount(0);
});

test("S-3122 설치 파일 자산이 없으면 Release page", async ({ page }) => {
  await seed(page, { startup: true });
  await fake(page, { status: 200, body: release({ assets: false }) });
  await boot(page);
  await notice(page).getByRole("button", { name: "Release page" }).click();
  expect(await urls(page)).toEqual([`url ${REL_URL}`]);
});

test("S-3123 Not now: updateSkip 저장, 다시 시작해도 알림 없음, About 에는 보임", async ({ page }) => {
  await seed(page, { startup: true });
  await fake(page, { status: 200, body: release() });
  await boot(page);
  await notice(page).getByRole("button", { name: "Not now" }).click();
  await expect.poll(async () => (await saved(page)).updateSkip).toBe("v9.9.9");
  await page.reload();
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await page.waitForTimeout(800);
  await expect(notice(page)).toHaveCount(0);
  await openAbout(page);
  await page.getByTestId("about-check").click();
  await expect(page.getByTestId("about-update")).toContainText("Version v9.9.9 is available");
});

for (const [name, r] of [["같은 버전", { status: 200, body: release({ tag: `v${CUR}` }) }], ["릴리스 없음 404", { status: 404 }], ["네트워크 실패", "error"], ["서버 500", { status: 500 }]] as [string, Reply][]) {
  test(`S-3122/S-3124 ${name}: 알림 없음, 콘솔 오류 없음`, async ({ page }) => {
    const errs: string[] = [];
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text()) && errs.push(m.text()));
    page.on("pageerror", (e) => errs.push(String(e)));
    const calls: string[] = [];
    await seed(page, { startup: true });
    await fake(page, r, calls);
    await boot(page);
    await expect.poll(() => calls.length).toBe(1);
    await page.waitForTimeout(500);
    await expect(notice(page)).toHaveCount(0);
    expect(errs).toEqual([]);
  });
}

test("S-3122 __updateTest 가 없으면 시작 확인을 안 한다", async ({ page }) => {
  const calls: string[] = [];
  await fake(page, { status: 200, body: release() }, calls);
  await boot(page);
  await page.waitForTimeout(800);
  expect(calls).toEqual([]);
  await expect(notice(page)).toHaveCount(0);
});

test("S-3126 체크 상자를 끄면 시작 확인 안 함, 설정 updateCheck 저장", async ({ page }) => {
  const calls: string[] = [];
  await seed(page, { startup: true, settings: { updateCheck: false } });
  await fake(page, { status: 200, body: release() }, calls);
  await boot(page);
  await page.waitForTimeout(800);
  expect(calls).toEqual([]);
  await openAbout(page);
  const box = page.getByTestId("about-autocheck");
  await expect(box).not.toBeChecked();
  await box.check();
  await expect.poll(async () => (await saved(page)).updateCheck).toBe(true);
  await box.uncheck();
  await expect.poll(async () => (await saved(page)).updateCheck).toBe(false);
});

test("S-3126 기본은 켬", async ({ page }) => {
  await fake(page, { status: 200, body: release() });
  await boot(page);
  await openAbout(page);
  await expect(page.getByTestId("about-autocheck")).toBeChecked();
  await expect(page.getByText("Check for updates at startup")).toBeVisible();
});

test("S-3125 About Check now: 새 버전 + Get installer + SHA-256", async ({ page }) => {
  await fake(page, { status: 200, body: release() });
  await boot(page);
  await openAbout(page);
  await expect(page.getByText("Updates", { exact: true })).toBeVisible();
  await page.getByTestId("about-check").click();
  const st = page.getByTestId("about-update");
  await expect(st).toContainText("Version v9.9.9 is available");
  await expect(st).toContainText(`SHA-256: ${SHA}`);
  await expect(st.getByText(SHA)).toHaveCSS("user-select", "text");
  await page.getByTestId("about-get").click();
  expect(await urls(page)).toEqual([`url ${SETUP}`]);
});

test("S-3125 새 버전인데 digest 없으면 SHA-256 줄 없음", async ({ page }) => {
  await fake(page, { status: 200, body: release({ digest: false }) });
  await boot(page);
  await openAbout(page);
  await page.getByTestId("about-check").click();
  await expect(page.getByTestId("about-update")).toContainText("Version v9.9.9 is available");
  await expect(page.getByTestId("about-update")).not.toContainText("SHA-256");
});

test("S-3125 About: 확인 중 / 최신 / 실패 / 릴리스 없음(줄 숨김)", async ({ page }) => {
  let mode: "slow" | "none" | "fail" = "slow";
  const h = { "access-control-allow-origin": "*" };
  await page.route(API, async (route) => {
    if (mode === "slow") {
      await new Promise((r) => setTimeout(r, 600));
      return route.fulfill({ status: 200, headers: h, contentType: "application/json", body: JSON.stringify(release({ tag: `v${CUR}` })) });
    }
    if (mode === "none") return route.fulfill({ status: 404, headers: h, body: "{}" });
    return route.abort();
  });
  await boot(page);
  await openAbout(page);
  const st = page.getByTestId("about-update");
  await expect(st).toHaveCount(0); // 누르기 전에는 상태 글 없음
  await page.getByTestId("about-check").click();
  await expect(st).toHaveText("Checking…");
  await expect(st).toHaveText("You're up to date");
  mode = "fail";
  await page.getByTestId("about-check").click();
  await expect(st).toHaveText("Couldn't check for updates");
  mode = "none";
  await page.getByTestId("about-check").click();
  await expect(page.getByTestId("about-check")).toHaveCount(0); // 줄 전체 숨김
  await expect(page.getByText("Updates", { exact: true })).toHaveCount(0);
});

test("S-3128 한국어 화면: 알림·About 글자가 한국어", async ({ page }) => {
  await seed(page, { startup: true, settings: { language: "ko" } });
  await fake(page, { status: 200, body: release() });
  await boot(page);
  const n = notice(page);
  await expect(n).toContainText("v9.9.9");
  await expect(n).not.toContainText("is available");
  await expect(n.getByRole("button", { name: "Get installer" })).toHaveCount(0);
  await expect(n.getByRole("button")).toHaveCount(2);
  await n.getByRole("button").nth(1).click(); // 나중에
  await openAbout(page);
  await expect(page.getByTestId("about-check")).not.toHaveText("Check now");
  await page.getByTestId("about-check").click();
  await expect(page.getByTestId("about-update")).not.toContainText("available");
  await expect(page.getByTestId("about-update")).toContainText("v9.9.9");
  await expect(page.getByTestId("about-update")).toContainText(`SHA-256: ${SHA}`);
});
