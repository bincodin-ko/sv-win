import { expect, test, type Page } from "@playwright/test";

// 11묶음 P3: Settings 'Planner' 줄·상태 줄·Thread 임시 줄 (S-2900·S-2902~S-2905·S-2980). PW_PORT=1763
// 가짜: 설치 목록 "symvibe.fakePlannerInstalled"(JSON 배열), 설정 "symvibe.fakeSettings", planner 상태 window.__usePlanner
const saved = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem("symvibe.fakeSettings") ?? "{}") as Record<string, any>);
const init = (p: Page, installed: string[], settings: object = {}) =>
  p.addInitScript(([i, s]) => { localStorage.setItem("symvibe.fakePlannerInstalled", i); localStorage.setItem("symvibe.fakeSettings", s); }, [JSON.stringify(installed), JSON.stringify(settings)]);
const openGeneral = async (p: Page) => {
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto("/");
  await expect(p.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await p.keyboard.press("Control+,");
  await p.getByRole("tab", { name: /General|일반/ }).click();
};
const opts = (p: Page) => p.getByTestId("set-planner").locator("option").allTextContents();
const API_LABELS = ["OpenAI API", "Anthropic API", "Google Gemini API", "OpenAI-compatible (Ollama…)"];
const setPlanner = (p: Page, v: object) => p.evaluate((s) => (window as any).__usePlanner.setState(s), v);

test("S-2900 설치된 claude·codex -> Claude Code·Codex·Off, 기본 Claude Code, Language 아래", async ({ page }) => {
  await init(page, ["claude", "codex"]);
  await openGeneral(page);
  expect(await opts(page)).toEqual(["Claude Code", "Codex (GPT)", ...API_LABELS, "Off"]);
  await expect(page.getByTestId("set-planner")).toHaveValue("claude");
  const a = (await page.getByTestId("set-language").boundingBox())!, b = (await page.getByTestId("set-planner").boundingBox())!;
  expect(b.y).toBeGreaterThan(a.y);
});

test("S-2904 claude 미설치·codex 설치 -> Codex로 보인다(저장값은 그대로)", async ({ page }) => {
  await init(page, ["codex"], { planner: "claude" });
  await openGeneral(page);
  expect(await opts(page)).toEqual(["Codex (GPT)", ...API_LABELS, "Off"]);
  await expect(page.getByTestId("set-planner")).toHaveValue("codex");
  expect((await saved(page)).planner).toBe("claude");
});

test("S-2904·S-3360 아무것도 미설치 -> API 4개와 Off, 안내 글 없음", async ({ page }) => {
  await init(page, []);
  await openGeneral(page);
  expect(await opts(page)).toEqual([...API_LABELS, "Off"]);
  await expect(page.getByText("Install Claude Code or Codex to use the planner")).toHaveCount(0);
});

test("S-2903 값을 바꾸면 settings에 저장된다", async ({ page }) => {
  await init(page, ["claude", "codex"]);
  await openGeneral(page);
  await page.getByTestId("set-planner").selectOption("codex");
  await expect.poll(async () => (await saved(page)).planner).toBe("codex");
  await page.getByTestId("set-planner").selectOption("off");
  await expect.poll(async () => (await saved(page)).planner).toBe("off");
});

test("S-2902 상태 줄 네 경우", async ({ page }) => {
  await init(page, ["claude"]);
  await openGeneral(page);
  const st = page.getByTestId("planner-status");
  await setPlanner(page, { status: "none" });
  await expect(st).toHaveCount(0);
  await setPlanner(page, { status: "ready" });
  await expect(st).toHaveText("Ready");
  await setPlanner(page, { status: "login" });
  await expect(st).toHaveText("Sign in needed — run claude once in a console");
  await setPlanner(page, { status: "failed", lastFail: "took too long" });
  await expect(st).toHaveText("Last try failed: took too long");
});

test("S-2980 한국어 화면에서 Planner 줄 글자가 한국어", async ({ page }) => {
  await init(page, ["claude"], { language: "ko" });
  await openGeneral(page);
  await expect(page.getByTestId("set-planner")).toBeVisible();
  const label = await page.getByTestId("set-planner").locator("xpath=..").innerText();
  expect(label).not.toMatch(/^Planner/);
  expect(await opts(page)).toEqual(["Claude Code", ...API_LABELS.slice(0, 3), "OpenAI 호환 (Ollama…)", "끔"]);
  await setPlanner(page, { status: "ready" });
  await expect(page.getByTestId("planner-status")).not.toHaveText("Ready");
});

const REPO = "C:/fake/repo";
test("S-2901 Thread에 Thinking…/Starting the planner… 임시 줄, 지우면 사라지고 메시지 수는 그대로", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=claude");
  await expect(page.getByTestId("command-bar")).toBeVisible();
  await page.getByTestId("thread-toggle").click();
  await expect(page.getByTestId("thread-panel")).toBeVisible();
  const n = await page.getByTestId("thread-msg").count();
  const busy = page.getByTestId("planner-busy");
  await expect(busy).toHaveCount(0);
  await setPlanner(page, { busy: { repo: REPO, phase: "thinking", since: 0 } });
  await expect(busy).toHaveText(/^Thinking…/);
  await expect(page.getByTestId("thread-msg")).toHaveCount(n);
  await setPlanner(page, { busy: { repo: REPO, phase: "starting", since: 0 } });
  await expect(busy).toHaveText(/^Starting the planner…/);
  await setPlanner(page, { busy: { repo: "C:/other", phase: "thinking", since: 0 } });
  await expect(busy).toHaveCount(0);
  await setPlanner(page, { busy: null });
  await expect(busy).toHaveCount(0);
});

test("S-2901 Thread가 닫혀 있으면 임시 줄이 없다", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=claude");
  await expect(page.getByTestId("command-bar")).toBeVisible();
  await setPlanner(page, { busy: { repo: REPO, phase: "thinking", since: 0 } });
  await expect(page.getByTestId("thread-panel")).toHaveCount(0);
  await expect(page.getByTestId("planner-busy")).toHaveCount(0);
});

// ---- 13묶음 R3 (포트 1803): S-3342·S-3360~S-3368. 가짜 window.__fakePlannerApi ----
const KEY = "sk-test-SECRET-123456";
const fakeApi = (p: Page, js = "") => p.addInitScript(`window.__fakePlannerApi = { keys: {}, calls: [], cancels: [] }; ${js}`);
const pick = (p: Page, v: string) => p.getByTestId("set-planner").selectOption(v);
const leaked = (p: Page) =>
  p.evaluate((k) => ({ ls: JSON.stringify(localStorage).includes(k), html: document.body.innerHTML.includes(k), inputs: [...document.querySelectorAll("input")].some((i) => i.value.includes(k)) }), KEY);

test("S-3360 optgroup 둘: CLI(설치된 것) / API, Off는 맨 끝", async ({ page }) => {
  await init(page, ["claude", "codex"]);
  await openGeneral(page);
  const g = page.getByTestId("set-planner").locator("optgroup");
  expect(await g.evaluateAll((e) => e.map((x) => x.getAttribute("label")))).toEqual(["CLI — uses your plan", "API key — billed per use"]);
  expect(await g.nth(0).locator("option").allTextContents()).toEqual(["Claude Code", "Codex (GPT)"]);
  expect(await g.nth(1).locator("option").allTextContents()).toEqual(API_LABELS);
  await expect(page.getByTestId("set-planner").locator("option").last()).toHaveText("Off");
});

test("S-3361~S-3363 api:openai -> 키 입력란(password)·저장(빈 입력 disabled)·연결 시험, 주소 줄 없음", async ({ page }) => {
  await init(page, [], { planner: "api:openai" });
  await fakeApi(page);
  await openGeneral(page);
  const key = page.getByTestId("planner-key");
  await expect(key).toHaveAttribute("type", "password");
  await expect(key).toHaveAttribute("autocomplete", "off");
  await expect(page.getByTestId("planner-key-save")).toBeDisabled();
  await expect(page.getByTestId("planner-test")).toBeVisible();
  await expect(page.getByTestId("planner-baseurl")).toHaveCount(0);
  await expect(page.getByTestId("planner-model")).toHaveValue("gpt-5-mini");
});

test("S-3342·S-3364 키 저장 -> 가짜 keys에만, 화면·localStorage·DOM에 키 없음, 지우기 -> 입력란 복귀", async ({ page }) => {
  await init(page, [], { planner: "api:openai" });
  await fakeApi(page);
  await openGeneral(page);
  await page.getByTestId("planner-key").fill(KEY);
  await page.getByTestId("planner-key-save").click();
  await expect(page.getByTestId("planner-key-state")).toHaveText("Key saved in Windows Credential Manager");
  await expect(page.getByTestId("planner-key")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__fakePlannerApi.keys["api:openai"])).toBe(KEY);
  expect(await leaked(page)).toEqual({ ls: false, html: false, inputs: false });
  expect(JSON.stringify(await saved(page))).not.toContain(KEY);
  await page.getByTestId("planner-key-clear").click();
  await expect(page.getByTestId("planner-key")).toHaveValue("");
  await expect(page.getByTestId("planner-key-state")).toHaveCount(0);
  expect(await page.evaluate(() => "api:openai" in (window as any).__fakePlannerApi.keys)).toBe(false);
});

test("S-3364 저장 실패 -> 고정 오류 글, 키 글자 없음", async ({ page }) => {
  await init(page, [], { planner: "api:openai" });
  await fakeApi(page);
  await openGeneral(page);
  await page.getByTestId("planner-key").fill("bad\u0001key"); // 가짜의 검사(제어 문자)에 걸려 reject
  await page.getByTestId("planner-key-save").click();
  await expect(page.getByTestId("planner-key-error")).toHaveText("That key can't be saved");
  expect(await page.getByTestId("planner-key-error").innerText()).not.toContain("bad");
});

test("S-3365 연결 시험 성공 -> Connected — 3 models·datalist, 공급자 바꾸면 결과 지움", async ({ page }) => {
  await init(page, [], { planner: "api:openai" });
  await fakeApi(page, `window.__fakePlannerApi.models = () => ["m-a", "m-b", "gpt-5"];`);
  await openGeneral(page);
  await page.getByTestId("planner-test").click();
  await expect(page.getByTestId("planner-test-result")).toHaveText("Connected — 3 models");
  const names = await page.locator("#planner-models option").evaluateAll((e) => e.map((x) => (x as HTMLOptionElement).value));
  expect(names).toEqual(expect.arrayContaining(["m-a", "m-b", "gpt-5", "gpt-5-mini"]));
  expect(new Set(names).size).toBe(names.length);
  await pick(page, "api:anthropic");
  await expect(page.getByTestId("planner-test-result")).toHaveCount(0);
});

test("S-3365 연결 시험 실패(auth) -> 이유 글", async ({ page }) => {
  await init(page, [], { planner: "api:openai" });
  await fakeApi(page, `window.__fakePlannerApi.models = () => ({ err: { kind: "auth" } });`);
  await openGeneral(page);
  await page.getByTestId("planner-test").click();
  const r = page.getByTestId("planner-test-result");
  await expect(r).toBeVisible();
  await expect(r).not.toHaveText(/Connected/);
});

test("S-3361 모델 입력은 blur 때만 저장", async ({ page }) => {
  await init(page, [], { planner: "api:openai" });
  await fakeApi(page);
  await openGeneral(page);
  const m = page.getByTestId("planner-model");
  await m.fill("my-model");
  expect((await saved(page)).plannerModel).toBeUndefined();
  await m.blur();
  await expect.poll(async () => (await saved(page)).plannerModel?.["api:openai"]).toBe("my-model");
});

test("S-3362 api:compat -> 주소 줄(기본 localhost:11434)·키 없어도 됨 글·Enter 저장", async ({ page }) => {
  await init(page, [], { planner: "api:compat" });
  await fakeApi(page);
  await openGeneral(page);
  await expect(page.getByTestId("planner-baseurl")).toHaveValue("http://localhost:11434/v1");
  await expect(page.getByText("optional for local servers")).toBeVisible();
  await page.getByTestId("planner-baseurl").fill("http://localhost:1234/v1");
  await page.getByTestId("planner-baseurl").press("Enter");
  await expect.poll(async () => (await saved(page)).plannerBaseUrl).toBe("http://localhost:1234/v1");
});

test("S-3361 CLI(claude) -> 모델 줄만(값 haiku), 키·시험 줄 없음", async ({ page }) => {
  await init(page, ["claude"], { planner: "claude" });
  await openGeneral(page);
  await expect(page.getByTestId("planner-model")).toHaveValue("haiku");
  await expect(page.getByTestId("planner-key")).toHaveCount(0);
  await expect(page.getByTestId("planner-test")).toHaveCount(0);
  await expect(page.getByTestId("planner-baseurl")).toHaveCount(0);
});

test("S-3366 로그인 문구에 CLI 이름", async ({ page }) => {
  await init(page, ["codex"], { planner: "codex" });
  await openGeneral(page);
  await setPlanner(page, { status: "login" });
  await expect(page.getByTestId("planner-status")).toHaveText("Sign in needed — run codex once in a console");
});

test("S-3367 한국어 화면 새 글", async ({ page }) => {
  await init(page, [], { planner: "api:compat", language: "ko" });
  await fakeApi(page, `window.__fakePlannerApi.models = () => ["a", "b"];`);
  await openGeneral(page);
  await expect(page.getByText("서버 주소")).toBeVisible();
  await expect(page.getByText("로컬 서버는 없어도 됨")).toBeVisible();
  await expect(page.getByTestId("planner-test")).toHaveText("연결 시험");
  await page.getByTestId("planner-test").click();
  await expect(page.getByTestId("planner-test-result")).toHaveText("연결됨 — 모델 2개");
  expect(await page.getByTestId("set-planner").locator("optgroup").evaluateAll((e) => e.map((x) => x.getAttribute("label")))).toEqual(["API 키 — 쓴 만큼 요금"]);
});

test("S-3368 Tab 순서·Enter로 키 저장", async ({ page }) => {
  await init(page, [], { planner: "api:openai" });
  await fakeApi(page);
  await openGeneral(page);
  await page.getByTestId("planner-model").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("planner-key")).toBeFocused();
  await page.keyboard.type(KEY);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("planner-key-state")).toBeVisible();
});
