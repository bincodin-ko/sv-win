import { expect, test, type Page } from "@playwright/test";

// K4 S-2441·S-2442·S-2450~S-2453·S-2456. PW_PORT=1604. 가짜 설정은 localStorage "symvibe.fakeSettings", 가짜 speechSynthesis 를 심는다.
const KO = /[가-힣]/;
const saved = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}") as Record<string, unknown>);
const dlg = (p: Page) => p.getByRole("dialog");

const open = async (page: Page, language: "ko" | "en", voices: { name: string; lang: string }[]) => {
  await page.addInitScript(
    ([lang, vs]) => {
      const w = window as any;
      if (!localStorage.getItem("symvibe.fakeSettings")) localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ firstRunDone: true, language: lang }));
      w.__spoken = [];
      w.SpeechSynthesisUtterance = class { text: string; voice: any; onend: unknown; onerror: unknown; constructor(t: string) { this.text = t; } };
      const list = (vs as { name: string; lang: string }[]).map((v, i) => ({ ...v, localService: true, default: i === 0, voiceURI: v.name }));
      Object.defineProperty(window, "speechSynthesis", {
        value: { getVoices: () => list, cancel() {}, speak(u: any) { w.__spoken.push({ text: u.text, voice: u.voice?.name }); }, addEventListener() {}, removeEventListener() {} },
      });
    },
    [language, voices] as const,
  );
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=claude");
  await expect(page.getByTestId("command-bar")).toBeVisible();
};
const VOICES = [{ name: "Microsoft Zira", lang: "en-US" }, { name: "Microsoft Heami", lang: "ko-KR" }];

test("① 명령줄 자리 문구·칩이 한국어이고 예문을 누르면 한국어 예문이 입력란에", async ({ page }) => {
  await open(page, "ko", VOICES);
  expect(await page.getByTestId("bar-input").getAttribute("placeholder")).toMatch(KO);
  await expect(page.getByTestId("bar-hint")).toContainText(KO);
  for (const id of ["new-console", "spawn-4", "group", "presets", "pause-all", "resume-all", "memory"]) await expect(page.getByTestId(`chip-${id}`)).toHaveText(KO);
  await page.getByTestId("hint-example").click();
  await expect(page.getByTestId("bar-input")).toHaveValue("클로드 두 개 띄워");
});

test("S-2442 한글 조합 중 Enter 로는 제출되지 않는다", async ({ page }) => {
  await open(page, "ko", VOICES);
  const input = page.getByTestId("bar-input");
  await input.fill("안녕");
  await input.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent("compositionstart"));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true, keyCode: 229 }));
  });
  await expect(input).toHaveValue("안녕");
  await expect(page.getByTestId("thread-msg")).toHaveCount(0);
});

test("② Thread 머리·지구본 메뉴에 한국어, 고르면 speechLanguage=ko 저장", async ({ page }) => {
  await open(page, "ko", VOICES);
  await page.getByTestId("thread-toggle").click();
  await expect(page.getByTestId("thread-title")).toHaveText("스레드");
  await expect(page.getByTestId("thread-clear")).toHaveText(KO);
  await page.getByTestId("thread-globe").click();
  await expect(page.locator('[data-testid^="globe-opt-"]')).toHaveCount(27);
  await expect(page.getByTestId("globe-opt-auto")).toHaveText(/자동/);
  await expect(page.getByTestId("globe-opt-fr")).toContainText("프랑스어");
  await page.getByTestId("globe-opt-ko").click();
  await expect(page.getByTestId("thread-lang")).toHaveText("KO");
  await expect.poll(async () => (await saved(page)).speechLanguage).toBe("ko");
});

test("③ Settings › Voice 창이 한국어이고 언어 목록에 한국어(27 옵션)", async ({ page }) => {
  await open(page, "ko", VOICES);
  await page.keyboard.press("Control+,");
  await dlg(page).getByRole("tab", { name: "음성" }).click();
  const pane = page.getByTestId("settings-pane-voice");
  await expect(pane).toContainText("음성 인식");
  expect(await pane.innerText()).not.toMatch(/Input device|Speech language|Hold to dictate/);
  const opts = page.getByTestId("voice-lang").locator("option");
  await expect(opts).toHaveCount(27);
  await expect(opts.filter({ hasText: "한국어" })).toHaveCount(1);
  await page.getByTestId("voice-lang").selectOption("ko");
  await expect.poll(async () => (await saved(page)).speechLanguage).toBe("ko");
});

test("④ 한국어 화면: Test 가 ko-KR Heami 로 말한다(음성 목록은 ko 만)", async ({ page }) => {
  await open(page, "ko", VOICES);
  await page.keyboard.press("Control+,");
  await dlg(page).getByRole("tab", { name: "음성" }).click();
  await page.getByTestId("voice-test").click();
  const spoken = await page.evaluate(() => (window as any).__spoken as { text: string; voice: string }[]);
  expect(spoken[0].voice).toBe("Microsoft Heami");
  expect(spoken[0].text).toMatch(KO);
  const names = await page.getByTestId("voice-voice").locator("option").allTextContents();
  expect(names).toHaveLength(2); // 자동 + Heami (en-US Zira 는 목록에서 빠짐)
  expect(names[1]).toBe("Microsoft Heami");
});

test("④b 한국어 로컬 음성이 없으면 안내가 한국어이고 목록·Test 는 없다(영어로 대체 안 함)", async ({ page }) => {
  await open(page, "ko", [{ name: "Microsoft Zira", lang: "en-US" }]);
  await page.keyboard.press("Control+,");
  await dlg(page).getByRole("tab", { name: "음성" }).click();
  await expect(page.getByTestId("voice-novoice")).toContainText("한국어 음성이 없어요");
  await expect(page.getByTestId("voice-test")).toHaveCount(0);
});

test("⑤ 영어 설정에서는 영어 로컬 음성을 고른다", async ({ page }) => {
  await open(page, "en", VOICES);
  await page.keyboard.press("Control+,");
  await dlg(page).getByRole("tab", { name: "Voice" }).click();
  await page.getByTestId("voice-test").click();
  const spoken = await page.evaluate(() => (window as any).__spoken as { text: string; voice: string }[]);
  expect(spoken[0].voice).toBe("Microsoft Zira");
  expect(spoken[0].text).toBe("This is the voice I'll use.");
});
