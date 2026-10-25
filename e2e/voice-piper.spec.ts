import { expect, test, type Page } from "@playwright/test";

// Q1 Piper 로컬 음성 (S-3100~S-3111). PW_PORT=1771. 가짜: 엔진 상태·내려받기(window.__fakeVoice) · speechSynthesis · play(). 진짜 내려받기·piper 실행 없음.
type P = { kind: string; pct?: number; why?: string };
const saved = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}") as Record<string, unknown>);
const fv = <T,>(p: Page, f: string) => p.evaluate((x) => new Function("v", `return ${x}`)((window as any).__fakeVoice) as T, f);
const dlg = (p: Page) => p.getByRole("dialog", { name: /Settings|설정/ });
const spoken = (p: Page) => p.evaluate(() => (window as any).__spoken as string[]);

const NONE: P = { kind: "none" };
const READY: P = { kind: "ready" };
const open = async (page: Page, o: { language?: "ko" | "en"; engine?: string; piper?: Partial<Record<"engine" | "ko" | "en", P>>; piperFail?: string } = {}) => {
  const pp = { engine: NONE, ko: NONE, en: NONE, ...(o.piper ?? {}) };
  await page.addInitScript(
    ([language, engine, pp, piperFail]) => {
      const w = window as any;
      if (!localStorage.getItem("symvibe.fakeSettings")) localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ firstRunDone: true, language, ...(engine ? { ttsEngine: engine } : {}) }));
      const n = { kind: "none" };
      w.__fakeVoice = {
        parts: { engine: n, small: n, base: n, "piper-engine": pp.engine, "piper-ko": pp.ko, "piper-ko-json": pp.ko, "piper-en": pp.en, "piper-en-json": pp.en },
        calls: [], downloads: [], piperCalls: [], piperFail,
      };
      w.__spoken = [];
      HTMLMediaElement.prototype.play = () => Promise.resolve(); // 44바이트 빈 wav 라 진짜 재생은 못 함
      w.SpeechSynthesisUtterance = class { text: string; voice: unknown; onend: unknown; onerror: unknown; constructor(t: string) { this.text = t; } };
      const list = [{ name: "Fake", lang: language === "ko" ? "ko-KR" : "en-US", localService: true, default: true, voiceURI: "Fake" }];
      Object.defineProperty(window, "speechSynthesis", {
        value: { getVoices: () => list, cancel() {}, speak(u: any) { w.__spoken.push(u.text); }, addEventListener() {}, removeEventListener() {} },
      });
    },
    [o.language ?? "en", o.engine ?? "", pp, o.piperFail ?? null] as const,
  );
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=claude");
  await expect(page.getByTestId("command-bar")).toBeVisible();
  await page.keyboard.press("Control+,");
  await dlg(page).getByRole("tab", { name: o.language === "ko" ? "음성" : "Voice" }).click();
};

test("① 엔진 선택 기본 Windows, Piper 를 고르면 저장되고 내장 줄이 숨는다 (S-3100·S-3109)", async ({ page }) => {
  await open(page);
  const sel = page.getByTestId("voice-tts-engine");
  await expect(sel).toHaveValue("windows");
  expect(await sel.locator("option").allTextContents()).toEqual(["Windows built-in", "Piper (natural, offline)"]);
  await expect(page.getByTestId("voice-test")).toBeVisible();
  await expect(page.getByTestId("voice-voice")).toBeVisible();
  await expect(page.getByTestId("voice-piper-state")).toHaveCount(0);
  await sel.selectOption("piper");
  await expect.poll(async () => (await saved(page)).ttsEngine).toBe("piper");
  await expect(page.getByTestId("voice-piper-state")).toBeVisible();
  await expect(page.getByTestId("voice-test")).toHaveCount(0);
  await expect(page.getByTestId("voice-voice")).toHaveCount(0);
  await sel.selectOption("windows");
  await expect.poll(async () => (await saved(page)).ttsEngine).toBe("windows");
  await expect(page.getByTestId("voice-test")).toBeVisible();
});

test("② Piper 줄 네 상태와 모델 라이선스 한 줄 (S-3101)", async ({ page }) => {
  await open(page, { engine: "piper" });
  await expect(page.getByTestId("voice-piper-state")).toHaveText("Not downloaded");
  await expect(page.getByTestId("voice-piper-dl")).toHaveText("Download Piper voice (~85 MB)");
  await expect(page.getByTestId("voice-piper-license")).toHaveText("English voice: LJ Speech, public domain");
  await expect(page.getByTestId("voice-piper-test")).toHaveCount(0);
  // 받는 중
  await page.evaluate(() => { const p = (window as any).__fakeVoice.parts; p["piper-en"] = p["piper-en-json"] = { kind: "downloading", pct: 40 }; p["piper-engine"] = { kind: "ready" }; });
  await page.getByTestId("voice-tts-engine").selectOption("windows");
  await page.getByTestId("voice-tts-engine").selectOption("piper");
  await expect(page.getByTestId("voice-piper-state")).toHaveText(/^Downloading… \d+%$/);
  await expect(page.getByTestId("voice-piper-cancel")).toHaveText("Cancel");
  await expect(page.getByTestId("voice-piper-dl")).toHaveCount(0);
  // 준비됨
  await page.evaluate(() => { const p = (window as any).__fakeVoice.parts; p["piper-en"] = p["piper-en-json"] = { kind: "ready" }; });
  await page.getByTestId("voice-tts-engine").selectOption("windows");
  await page.getByTestId("voice-tts-engine").selectOption("piper");
  await expect(page.getByTestId("voice-piper-state")).toHaveText("Ready");
  await expect(page.getByTestId("voice-piper-test")).toHaveText("Test");
  // 실패
  await page.evaluate(() => { const p = (window as any).__fakeVoice.parts; p["piper-en"] = { kind: "failed", why: "checksum" }; });
  await page.getByTestId("voice-tts-engine").selectOption("windows");
  await page.getByTestId("voice-tts-engine").selectOption("piper");
  await expect(page.getByTestId("voice-piper-state")).toHaveText("Failed: checksum");
  await expect(page.getByTestId("voice-piper-retry")).toHaveText("Retry");
});

test("③ 내려받기 단추 → 확인창 → voiceDownload 순서 (엔진 없음 / 있음) (S-3102)", async ({ page }) => {
  await open(page, { engine: "piper" });
  await page.getByTestId("voice-piper-dl").click();
  const ask = page.getByRole("dialog", { name: "Download Piper voice?" });
  await expect(ask).toContainText("Download Piper (~22 MB) and the English voice (~63 MB) from GitHub and Hugging Face? Speech stays on this PC.");
  await ask.getByRole("button", { name: "Not now" }).click();
  expect(await fv<string[]>(page, "v.downloads")).toEqual([]); // 아니오면 아무것도 안 받음
  await page.getByTestId("voice-piper-dl").click();
  await page.getByRole("dialog", { name: "Download Piper voice?" }).getByRole("button", { name: "Download" }).click();
  await expect(page.getByTestId("voice-piper-state")).toHaveText("Ready");
  expect(await fv<string[]>(page, "v.downloads")).toEqual(["piper-engine", "piper-en", "piper-en-json"]);
});

test("③b 엔진이 이미 있으면 음성 둘만 받는다", async ({ page }) => {
  await open(page, { engine: "piper", piper: { engine: READY } });
  await page.getByTestId("voice-piper-dl").click();
  await page.getByRole("dialog", { name: "Download Piper voice?" }).getByRole("button", { name: "Download" }).click();
  await expect(page.getByTestId("voice-piper-state")).toHaveText("Ready");
  expect(await fv<string[]>(page, "v.downloads")).toEqual(["piper-en", "piper-en-json"]);
});

test("④ Ready 에서 Test 는 piperSpeak 를 부른다 (S-3109)", async ({ page }) => {
  await open(page, { engine: "piper", piper: { engine: READY, en: READY } });
  await page.getByTestId("voice-piper-test").click();
  await expect.poll(() => fv<{ text: string; lang: string }[]>(page, "v.piperCalls")).toEqual([{ text: "This is the voice I'll use.", lang: "en" }]);
  expect(await spoken(page)).toEqual([]); // 내장은 안 읽음
  await expect(page.getByTestId("voice-piper-fail")).toHaveCount(0);
});

test("⑤ piperSpeak 실패 → 내장으로 읽고 'Last Piper try failed' (S-3108)", async ({ page }) => {
  await open(page, { engine: "piper", piper: { engine: READY, en: READY }, piperFail: "timeout" });
  await page.getByTestId("voice-piper-test").click();
  await expect.poll(() => spoken(page)).toEqual(["This is the voice I'll use."]);
  await expect(page.getByTestId("voice-piper-fail")).toHaveText("Last Piper try failed: timeout — used the Windows voice");
});

test("⑥ 한국어 화면: 엔진 선택·Piper 줄·확인창·라이선스가 한국어, 상태는 ko 음성 (S-3111)", async ({ page }) => {
  await open(page, { language: "ko", engine: "piper", piper: { engine: READY } });
  const KO = /[가-힣]/;
  expect(await page.getByTestId("voice-tts-engine").locator("option").allTextContents()).toEqual(["Windows 내장", "Piper (자연스러운 음성, 오프라인)"]);
  await expect(page.getByTestId("voice-piper-state")).toHaveText(KO);
  await expect(page.getByTestId("voice-piper-dl")).toHaveText("Piper 음성 내려받기 (약 85 MB)");
  await expect(page.getByTestId("voice-piper-license")).toHaveText("한국어 음성: KSS 데이터셋, CC BY-NC-SA 4.0 (비상업용)");
  await page.getByTestId("voice-piper-dl").click();
  const ask = page.getByRole("dialog", { name: "Piper 음성을 내려받을까요?" });
  await expect(ask).toContainText("GitHub");
  await expect(ask).toContainText("한국어");
  await ask.getByRole("button", { name: "내려받기" }).click();
  await expect(page.getByTestId("voice-piper-state")).toHaveText("준비됨");
  expect(await fv<string[]>(page, "v.downloads")).toEqual(["piper-ko", "piper-ko-json"]);
  await page.getByTestId("voice-piper-test").click();
  await expect.poll(() => fv<{ lang: string }[]>(page, "v.piperCalls")).toMatchObject([{ lang: "ko" }]);
});
