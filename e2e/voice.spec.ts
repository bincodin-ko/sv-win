import { expect, test, type Page } from "@playwright/test";

// F3: Hold Space·마이크 버튼·orb·받아쓰기·Settings Voice·지구본 (S-2260~S-2294). PW_PORT=1513
// 가짜: 마이크(window.__fakeCapture) · 엔진(window.__fakeVoice) · speechSynthesis · (60초 시험만) 가짜 시계. 진짜 마이크·엔진은 안 쓴다.
const bar = (p: Page) => p.getByTestId("command-bar");
const input = (p: Page) => p.getByTestId("bar-input");
const orb = (p: Page) => p.getByTestId("bar-orb");
const notice = (p: Page) => p.getByTestId("bar-notice");
const pill = (p: Page) => p.getByTestId("dict-pill");
const msgs = (p: Page) => p.getByTestId("thread-msg");
const dlg = (p: Page) => p.getByRole("dialog", { name: "Settings" });
const saved = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}") as Record<string, unknown>);
const capLog = (p: Page) => p.evaluate(() => (window as any).__capLog as string[]);
const calls = (p: Page) => p.evaluate(() => (window as any).__fakeVoice.calls.length as number);
const reply = (p: Page, r: string) => p.evaluate((x) => ((window as any).__fakeVoice.reply = x), r);
const ids = (p: Page) => p.evaluate(() => (window as any).__fakePty.ids() as number[]);
const writes = (p: Page, id: number) => p.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);

const open = async (page: Page, o: { settings?: Record<string, unknown>; parts?: "ready" | "none"; capFail?: string; voices?: boolean } = {}) => {
  await page.addInitScript(
    ([settings, parts, capFail, voices]) => {
      const w = window as any;
      if (!localStorage.getItem("symvibe.fakeSettings")) localStorage.setItem("symvibe.fakeSettings", JSON.stringify(settings));
      const st = { kind: parts };
      w.__fakeVoice = { parts: { engine: st, small: st, base: st }, calls: [], downloads: [], reply: "status" };
      w.__capLog = [];
      w.__fakeCapture = async (opts: { onLevel?: (v: number) => void }) => {
        if (w.__capFail) throw Object.assign(new Error("x"), { name: w.__capFail });
        w.__capLog.push("start");
        const iv = setInterval(() => opts.onLevel?.(0.3), 50);
        return {
          snapshot: () => new Uint8Array(new Int16Array(16000).fill(8000).buffer),
          stop: async () => (clearInterval(iv), w.__capLog.push("stop"), { pcm: new Uint8Array(new Int16Array(16000).fill(8000).buffer), ms: 1000 }),
          cancel: async () => (clearInterval(iv), void w.__capLog.push("cancel")),
        };
      };
      w.__capFail = capFail;
      w.__spoken = [];
      w.SpeechSynthesisUtterance = class { text: string; voice: unknown; onend: unknown; onerror: unknown; constructor(t: string) { this.text = t; } }; // 가짜 음성은 진짜 SpeechSynthesisVoice 가 아니라서
      const voice = { name: "Fake", lang: "en-US", localService: true, default: true };
      Object.defineProperty(window, "speechSynthesis", {
        value: { getVoices: () => (voices ? [voice] : []), cancel() {}, speak(u: any) { w.__spoken.push(u.text); w.__utter = u; }, addEventListener() {}, removeEventListener() {} },
      });
    },
    [{ firstRunDone: true, ...(o.settings ?? {}) }, o.parts ?? "ready", o.capFail ?? null, o.voices ?? true] as const,
  );
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=2&agent=claude");
  await expect(bar(page)).toBeVisible();
  await expect(page.getByTestId("console")).toHaveCount(2);
};
const hold = async (page: Page, key: string, ms: number) => (await page.keyboard.down(key), await page.waitForTimeout(ms));

test("S-2260~S-2263·S-2270 Space 길게→listening 바+파형→놓기→말풍선+명령 실행, orb 전이, 이력", async ({ page }) => {
  await open(page);
  await expect(orb(page)).toHaveAttribute("data-state", "idle");
  await expect(input(page)).toHaveAttribute("placeholder", "Hold space to speak · @ to direct"); // S-2269
  await hold(page, "Space", 400);
  await expect(page.getByTestId("listen-bar")).toBeVisible();
  await expect(page.getByTestId("listen-label")).toHaveText("listening");
  await expect(page.getByTestId("listen-wave").locator("i")).toHaveCount(24);
  await expect(page.getByTestId("listen-secs")).toBeVisible();
  await expect(orb(page)).toHaveAttribute("data-state", "listening");
  expect(await capLog(page)).toEqual(["start"]);
  await page.evaluate(() => { const w = window as any; w.__fakeVoice.hold = new Promise((r) => (w.__release = r)); });
  await page.keyboard.up("Space");
  await expect(orb(page)).toHaveAttribute("data-state", "thinking");
  await expect(page.getByTestId("listen-bar")).toHaveCount(0);
  await page.evaluate(() => (window as any).__release());
  await page.getByTestId("thread-toggle").click();
  await expect(msgs(page).first()).toHaveText("status");
  await expect(msgs(page).first()).toHaveAttribute("data-role", "user");
  await expect(msgs(page).nth(1)).toHaveAttribute("data-role", "bot"); // 명령 실행 답
  expect(await calls(page)).toBe(1);
  // 답을 읽는 동안 speaking, 끝나면 idle
  await expect(orb(page)).toHaveAttribute("data-state", "speaking");
  await page.evaluate(() => (window as any).__utter.onend());
  await expect(orb(page)).toHaveAttribute("data-state", "idle");
  // 명령 이력 ↑ 에도 들어간다
  await input(page).click();
  await page.keyboard.press("ArrowUp");
  await expect(input(page)).toHaveValue("status");
});

test("S-2260·S-2267 짧게 톡·입력란 안·수정 키는 듣지 않는다, Space 는 글자로 들어간다", async ({ page }) => {
  await open(page);
  await hold(page, "Space", 100);
  await page.keyboard.up("Space");
  await page.waitForTimeout(300);
  await expect(page.getByTestId("listen-bar")).toHaveCount(0);
  await page.keyboard.down("Alt"); // U7: Ctrl+Space 는 이제 받아쓰기(S-2721)라 다른 수정 키로 바꿈
  await hold(page, "Space", 450);
  await expect(page.getByTestId("listen-bar")).toHaveCount(0);
  await page.keyboard.up("Space");
  await page.keyboard.up("Alt");
  await input(page).click();
  await hold(page, "Space", 450);
  await page.keyboard.up("Space");
  await expect(page.getByTestId("listen-bar")).toHaveCount(0);
  await expect(input(page)).toHaveValue(" ");
  expect(await capLog(page)).toEqual([]);
});

test("S-2261·S-2273 Esc 는 취소(보내지 않음), 선택은 그대로, 다음 Esc 가 선택 해제", async ({ page }) => {
  await open(page);
  await page.locator("[data-node-handle]").first().click({ position: { x: 300, y: 16 } });
  const sel = () => page.locator('[data-node-id][data-selected="true"]').count();
  expect(await sel()).toBe(1);
  await hold(page, "Space", 400);
  await expect(page.getByTestId("listen-bar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("listen-bar")).toHaveCount(0);
  expect(await sel()).toBe(1);
  expect(await capLog(page)).toEqual(["start", "cancel"]);
  await page.keyboard.up("Space");
  expect(await calls(page)).toBe(0);
  await page.keyboard.press("Escape");
  await expect.poll(sel).toBe(0);
  // 창 블러도 취소
  await hold(page, "Space", 400);
  await expect(page.getByTestId("listen-bar")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByTestId("listen-bar")).toHaveCount(0);
  await page.keyboard.up("Space");
  expect(await calls(page)).toBe(0);
});

test("S-2264 60초에 닿으면 보내지 않고 바에 안내(가짜 시계)", async ({ page }) => {
  await open(page);
  await page.clock.install();
  await page.keyboard.down("Space");
  await page.clock.runFor(300);
  await expect(page.getByTestId("listen-bar")).toBeVisible();
  await page.clock.runFor(60_000);
  await expect(notice(page)).toHaveText("That was over 60 seconds — not sent.");
  await expect(page.getByTestId("listen-bar")).toHaveCount(0);
  await page.keyboard.up("Space");
  await page.getByTestId("thread-toggle").click();
  await expect(msgs(page)).toHaveCount(0); // 보내지 않았다(회색 부분 받아쓰기 호출은 calls 에 셈)
  await page.clock.runFor(3100);
  await expect(notice(page)).toHaveCount(0);
});

test("S-2268 마이크 버튼: 길게=누르는 동안, 톡=시작/다시 톡=전송, holdSpace 꺼져도 동작", async ({ page }) => {
  await open(page, { settings: { holdSpace: false } });
  const mic = page.getByTestId("bar-mic");
  await expect(mic).toBeVisible();
  // Space 는 꺼져 있다
  await hold(page, "Space", 450);
  await expect(page.getByTestId("listen-bar")).toHaveCount(0);
  await page.keyboard.up("Space");
  const b = (await mic.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("listen-bar")).toBeVisible();
  await expect(mic).toHaveAttribute("data-listening", "true");
  await page.mouse.up();
  await expect(page.getByTestId("listen-bar")).toHaveCount(0);
  await expect.poll(() => calls(page)).toBe(1);
  // 톡 → 계속 듣는다 → 다시 톡 → 전송
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByTestId("listen-bar")).toBeVisible();
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => calls(page)).toBe(2);
  // 톡 → Esc 취소
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByTestId("listen-bar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("listen-bar")).toHaveCount(0);
  expect(await calls(page)).toBe(2);
});

test("S-2263 빈 글이면 1.5초 Didn't catch that., 영어가 아닌 말은 Thread 에 남고 못 읽음 답(S-2272)", async ({ page }) => {
  await open(page);
  await reply(page, "");
  await hold(page, "Space", 400);
  await page.keyboard.up("Space");
  await expect(notice(page)).toHaveText("Didn't catch that.");
  await expect(notice(page)).toHaveCount(0, { timeout: 4000 });
  await reply(page, "bonjour tout le monde, lance les tests");
  await hold(page, "Space", 400);
  await page.keyboard.up("Space");
  await page.getByTestId("thread-toggle").click();
  await expect(msgs(page).first()).toHaveText("bonjour tout le monde, lance les tests");
  await expect(msgs(page).nth(1)).toContainText("I couldn't read that without the planner");
});

test("S-2265·S-2266 인식이 없으면 안내만(듣지 않음), 마이크 오류는 문구 4초", async ({ page }) => {
  await open(page, { parts: "none" });
  await hold(page, "Space", 400);
  await page.keyboard.up("Space");
  await expect(page.getByRole("dialog", { name: "Download speech recognition?" })).toBeVisible();
  await expect(notice(page)).toHaveText("Preparing speech recognition…");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(notice(page)).toHaveText("Speech recognition isn't downloaded. Settings › Voice.");
  expect(await capLog(page)).toEqual([]);
  await expect(notice(page)).toHaveCount(0, { timeout: 4000 });
});

test("S-2266 마이크 권한 오류 문구", async ({ page }) => {
  await open(page, { capFail: "NotAllowedError" });
  await hold(page, "Space", 400);
  await page.keyboard.up("Space");
  await expect(notice(page)).toContainText("Microphone blocked. Allow Symvibe in Windows Settings");
  await expect(page.getByTestId("listen-bar")).toHaveCount(0);
  await page.evaluate(() => ((window as any).__capFail = "NotFoundError"));
  await hold(page, "Space", 400);
  await page.keyboard.up("Space");
  await expect(notice(page)).toHaveText("No microphone found.");
});

test("S-2274~S-2277 받아쓰기: 명령 바·콘솔·입력란에 글자만(Enter 없음), 알약, 다른 키 취소", async ({ page }) => {
  await open(page, { settings: { dictateKey: "ControlRight" } }); // U7: 기본이 CtrlSpace 로 바뀜 - 저장된 옛 값이 계속 동작함을 같이 증명
  await reply(page, "run the tests comma please period");
  // ④ 명령 바
  await hold(page, "ControlRight", 500);
  await expect(pill(page)).toContainText("Dictating → command bar");
  await page.keyboard.up("ControlRight");
  await expect(input(page)).toHaveValue("run the tests, please.");
  await expect(page.getByTestId("thread-panel")).toHaveCount(0); // 보내지 않았다(Enter 는 사용자가)
  await expect(pill(page)).toHaveCount(0);
  await expect(page.getByTestId("dict-pill")).toHaveCount(0);
  // 다른 키를 끼우면 시작하지 않는다
  const n = (await capLog(page)).length;
  await page.keyboard.down("ControlRight");
  await page.waitForTimeout(100);
  await page.keyboard.press("c");
  await page.waitForTimeout(500);
  await page.keyboard.up("ControlRight");
  expect((await capLog(page)).length).toBe(n);
  // 시작한 뒤 Esc 는 취소
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await hold(page, "ControlRight", 500);
  await expect(pill(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pill(page)).toHaveCount(0);
  await page.keyboard.up("ControlRight");
  expect(await calls(page)).toBe(1);
  // ② 키보드를 가진 콘솔
  const [id] = await ids(page);
  await page.locator(".xterm").first().click();
  await hold(page, "ControlRight", 500);
  await expect(pill(page)).toContainText("Dictating → ");
  await expect(pill(page)).not.toContainText("command bar");
  await page.keyboard.up("ControlRight");
  await expect.poll(async () => (await writes(page, id!)).join("")).toContain("run the tests, please.");
  expect((await writes(page, id!)).join("")).not.toContain("\r");
  // ① 입력란(설정 창 이름)
  await page.keyboard.press("Control+,");
  await page.getByLabel("Name").fill("");
  await hold(page, "ControlRight", 500);
  await expect(pill(page)).toContainText("Dictating → text field");
  await page.keyboard.up("ControlRight");
  await expect(page.getByLabel("Name")).toHaveValue("run the tests, please.");
});

test("S-2290·S-2292 Settings › Voice 창: 자리·줄 구성·Recognition·저장, Shortcuts 고정 줄", async ({ page }) => {
  await open(page, { parts: "none" });
  await page.keyboard.press("Control+,");
  const tabs = await dlg(page).getByRole("tab").allTextContents();
  expect(tabs.indexOf("Voice")).toBe(tabs.indexOf("Connections") + 1);
  expect(tabs.indexOf("About")).toBe(tabs.indexOf("Voice") + 1);
  await dlg(page).getByRole("tab", { name: "Voice" }).click();
  const pane = page.getByTestId("settings-pane-voice");
  for (const l of ["Input device", "Speech language", "Speech model", "Recognition", "Hold Space to talk", "Hold to dictate", "Confirm commands out loud"]) await expect(pane).toContainText(l);
  await expect(pane).not.toContainText("Cached audio");
  await expect(pane).not.toContainText("Intelligence");
  await expect(page.getByTestId("voice-recog")).toHaveText("Not downloaded");
  await page.getByTestId("voice-action").click(); // Download
  await expect(page.getByTestId("voice-recog")).toHaveText("Ready");
  await expect(page.getByTestId("voice-action")).toHaveCount(0);
  await page.getByTestId("voice-lang").selectOption("fr");
  await expect.poll(async () => (await saved(page)).speechLanguage).toBe("fr");
  await page.getByTestId("voice-model").selectOption("base");
  await expect.poll(async () => (await saved(page)).speechModel).toBe("base");
  await page.getByTestId("voice-dictkey").selectOption("AltRight");
  await expect.poll(async () => (await saved(page)).dictateKey).toBe("AltRight");
  await page.getByTestId("voice-holdspace").uncheck();
  await expect.poll(async () => (await saved(page)).holdSpace).toBe(false);
  await page.getByTestId("voice-test").click();
  await expect.poll(() => page.evaluate(() => (window as any).__spoken)).toContain("This is the voice I'll use.");
  // 마이크 권한을 묻지 않았다(열기만 해서는)
  // Shortcuts 고정 줄
  await dlg(page).getByRole("tab", { name: "Shortcuts" }).click();
  await expect(page.getByTestId("shortcut-fixed-dict")).toHaveText(/Hold Right Alt.*Dictate into the focused console or field/);
  await expect(page.getByTestId("shortcut-fixed-space")).toHaveCount(0); // holdSpace 가 꺼졌으니 없다
  await dlg(page).getByRole("tab", { name: "Voice" }).click();
  await page.getByTestId("voice-holdspace").check();
  await dlg(page).getByRole("tab", { name: "Shortcuts" }).click();
  await expect(page.getByTestId("shortcut-fixed-space")).toHaveText(/Hold Space.*Talk to the command bar/);
});

test("S-2290 Recognition 실패는 Failed: … + Retry, 로컬 음성이 없으면 안내", async ({ page }) => {
  await open(page, { parts: "none", voices: false });
  await page.evaluate(() => ((window as any).__fakeVoice.failNext = "net"));
  await page.keyboard.press("Control+,");
  await dlg(page).getByRole("tab", { name: "Voice" }).click();
  await page.getByTestId("voice-action").click();
  await expect(page.getByTestId("voice-recog")).toHaveText("Failed: net");
  await expect(page.getByTestId("voice-action")).toHaveText("Retry");
  await page.getByTestId("voice-action").click();
  await expect(page.getByTestId("voice-recog")).toHaveText("Ready");
  await expect(page.getByTestId("settings-pane-voice")).toContainText("No local voice found");
});

test("S-2271 Thread 지구본: Automatic + 26개 언어, 고르면 저장되고 옆에 코드", async ({ page }) => {
  await open(page);
  await page.getByTestId("thread-toggle").click();
  const globe = page.getByTestId("thread-globe");
  await expect(globe).toBeVisible();
  await expect(page.getByTestId("thread-lang")).toHaveText("");
  await globe.click();
  await expect(page.locator('[data-testid^="globe-opt-"]')).toHaveCount(27); // S-2450: Automatic + 26
  await page.getByTestId("globe-opt-fr").click();
  await expect(page.getByTestId("thread-lang")).toHaveText("FR");
  await expect.poll(async () => (await saved(page)).speechLanguage).toBe("fr");
  await expect(page.locator('[data-testid^="globe-opt-"]')).toHaveCount(0);
  await globe.click();
  await page.getByTestId("globe-opt-auto").click();
  await expect(page.getByTestId("thread-lang")).toHaveText("");
  await expect.poll(async () => (await saved(page)).speechLanguage).toBe("auto");
  // 머리의 다른 요소는 그대로
  await expect(page.getByTestId("thread-title")).toHaveText("THREAD");
  await expect(page.getByTestId("thread-clear")).toBeVisible();
});

test("S-2262 듣는 동안 2초마다 지금까지의 소리를 받아써 회색 글로 보인다", async ({ page }) => {
  await open(page);
  await reply(page, "partial words");
  await hold(page, "Space", 400);
  const part = page.getByTestId("listen-partial");
  await expect(part).toHaveText("partial words", { timeout: 4500 });
  await expect(part).toHaveCSS("color", /^rgb\((1[0-9]{2}|[2-9][0-9]), /); // 회색(var(--text-dim))
  await page.keyboard.up("Space");
});

test("S-2290 Recognition 줄의 폴더 열기가 엔진·모델 폴더(Voice)를 연다", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Control+,");
  await dlg(page).getByRole("tab", { name: "Voice" }).click();
  await page.getByTestId("voice-folder").click();
  await expect.poll(() => page.evaluate(() => (window as any).__fakeFsLog ?? [])).toContain("reveal C:/fake/Voice");
});

test("S-2265 내려받는 중이면 Preparing 문구에 %가 붙고 올라간다 (FX7)", async ({ page }) => {
  await open(page, { parts: "none" });
  await page.evaluate(() => { const p = (window as any).__fakeVoice.parts; p.engine = { kind: "downloading", pct: 50 }; p.small = { kind: "downloading", pct: 50 }; p.base = p.small; });
  await hold(page, "Space", 400);
  await page.keyboard.up("Space");
  await expect(notice(page)).toHaveText("Preparing speech recognition… 50%");
  await page.evaluate(() => { const p = (window as any).__fakeVoice.parts; p.engine = { kind: "downloading", pct: 100 }; p.small = { kind: "downloading", pct: 100 }; p.base = p.small; });
  await expect(notice(page)).toHaveText("Preparing speech recognition… 100%", { timeout: 3000 });
});
