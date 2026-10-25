import { expect, test, type Page } from "@playwright/test";

// E3 Diagrams 패널·만들기·스타터·내보내기 (S-2020~S-2041). 실행: PW_PORT=1503 npx playwright test e2e/diagrams.spec.ts
// 약속(이름): 레일 rail-diagrams → 패널 diagrams-panel. 에이전트 dia-agent-<claude|codex>(data-installed), 노력 dia-effort-<quick|balanced|thorough>(aria-pressed),
//   스타일 dia-style-<ink|colorful>(aria-pressed), 프로젝트 버튼 dia-topic-<architecture|user-flow|data-flow|components|request-lifecycle|state-flow>,
//   입력 dia-input · dia-generate, 스타터 dia-starter-<flow|steps|decision|mindmap>, repo 없음 dia-need-repo.
//   진행 카드 dia-card · dia-card-status · dia-card-close · dia-card-error · dia-card-retry · dia-card-hint
// 가짜 실행기: window.__fakeStudioRun(opts) (Tauri 밖에서만 쓰임). 가짜 저장 창 window.__fakeSavePath, 가짜 파일 window.__fakeFiles.
// 1400×900, 줌 1, 보드 이동 0 이면 월드 (x,y) = 화면 (700+x, 450+y).
test.use({ actionTimeout: 5000 });
type N = Record<string, unknown> & { id: string; kind: string; x: number; y: number; w: number; h: number };
const DUMMY: N = { id: "d", kind: "tk-plain", x: -600, y: -300, w: 100, h: 60, z: 1 };
const boardJson = (nodes: N[]) => JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 1 }, nodes, groups: [] });

const GOOD = JSON.stringify({
  title: "Auth flow",
  nodes: [
    { id: "a", label: "Login page", shape: "box", group: "UI" },
    { id: "b", label: "Valid?", shape: "diamond", group: "UI" },
    { id: "c", label: "Session", note: "cookie set", shape: "pill", group: "API" },
    { id: "d", label: "Users DB", shape: "ellipse", group: "API" },
  ],
  edges: [{ from: "a", to: "b" }, { from: "b", to: "c", label: "yes" }, { from: "c", to: "d" }],
});

/** fake = 'good' | 'junk' | 'hold' | 'blocked' | 'junk-then-good' */
async function boot(page: Page, fake: string = "good") {
  await page.addInitScript(([b, g, mode]) => {
    const w = window as any;
    w.__symSeed = { boards: { "ws-fake": b } };
    w.__runs = [];
    w.__release = null;
    w.__fakeStudioRun = (o: any) => {
      w.__runs.push({ agentId: o.agentId, prompt: o.prompt, limitMs: o.limitMs, cwd: o.cwd });
      o.onStatus?.("launching");
      const n = w.__runs.length;
      if (mode === "good") return Promise.resolve({ ok: true, text: "Here you go\n```json\n" + g + "\n```" });
      if (mode === "junk") return Promise.resolve({ ok: true, text: "I could not draw that." });
      if (mode === "blocked") return Promise.resolve({ blocked: true, why: "Do you trust this folder?" });
      if (mode === "junk-then-good") return Promise.resolve({ ok: true, text: n === 1 ? "no json here" : g });
      return new Promise((res) => { // hold: Stop 이나 release() 까지 잡아 둔다
        o.signal?.addEventListener("abort", () => { w.__aborted = true; res({ stopped: true, text: '{"title":"Partial","nodes":[{"id":"a","label":"One"},{"id":"b","label":"Two"},{"id":"c","la' }); });
        w.__release = () => res({ ok: true, text: g });
      });
    };
  }, [boardJson([DUMMY]), GOOD, fake] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
}
type Snap = { tool: string; selection: string[]; nodes: (N & Record<string, any>)[] };
const st = (page: Page) => page.evaluate(() => (window as any).__kt.st() as Snap);
const pieces = async (page: Page) => (await st(page)).nodes.filter((x) => /^(shape|line|text)\d+$/.test(x.id));
const open = async (page: Page) => {
  await page.getByTestId("rail-diagrams").click();
  await expect(page.getByTestId("diagrams-panel")).toBeVisible();
};

test("S-2020·S-2021 레일 Shapes 다음에 Diagrams, 패널 구성(MODEL·STYLE·FROM YOUR PROJECT·입력·STARTER SHAPES)", async ({ page }) => {
  await boot(page);
  const ids = await page.locator('[data-testid="rail"] button').evaluateAll((bs) => bs.map((b) => b.getAttribute("data-testid")));
  const at = (i: string) => ids.indexOf(i);
  expect(at("rail-diagrams")).toBeGreaterThan(at("rail-shapes")); // order 32: Shapes(30) 다음, Text(35) 앞
  expect(at("rail-diagrams")).toBeLessThan(at("rail-text"));
  expect(at("rail-pen")).toBeLessThan(at("rail-web")); // Web 은 Pen·Eraser 뒤
  expect(at("rail-eraser")).toBeLessThan(at("rail-web"));
  await open(page);
  const p = page.getByTestId("diagrams-panel");
  await expect(p.getByText("MODEL", { exact: true })).toBeVisible();
  await expect(page.getByTestId("dia-agent-claude")).toHaveAttribute("data-installed", "true");
  await expect(page.getByTestId("dia-agent-codex")).toHaveAttribute("data-installed", "false"); // 없는 것은 흐리게
  await expect(page.getByTestId("dia-effort-balanced")).toHaveAttribute("aria-pressed", "true");
  await expect(p.locator('[data-testid^="dia-effort-"]')).toHaveText(["Quick", "Balanced", "Thorough"]);
  await expect(p.getByText("STYLE", { exact: true })).toBeVisible();
  await expect(page.getByTestId("dia-style-ink")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("dia-style-colorful")).toHaveAttribute("aria-pressed", "false");
  await expect(p.getByText("FROM YOUR PROJECT", { exact: true })).toBeVisible();
  await expect(p.locator('[data-testid^="dia-topic-"]')).toHaveText(["Architecture", "User flow", "Data flow", "Components", "Request lifecycle", "State flow"]);
  await expect(page.getByTestId("dia-input")).toHaveAttribute("placeholder", "Describe a diagram…");
  await expect(page.getByTestId("dia-generate")).toBeDisabled(); // 빈 입력은 비활성
  await expect(p.getByText("STARTER SHAPES", { exact: true })).toBeVisible();
  await expect(p.locator('[data-testid^="dia-starter-"]')).toHaveText(["Flow", "Steps", "Decision branch", "Mind map"]);
  await expect(p.getByText("Open a repo first.")).toHaveCount(0); // repo 가 있으면 안 보인다
});

test("S-2022 스타일은 켤 때마다 Ink, 에이전트·노력은 저장된다", async ({ page }) => {
  await boot(page);
  await open(page);
  await page.getByTestId("dia-style-colorful").click();
  await expect(page.getByTestId("dia-style-colorful")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("dia-effort-quick").click();
  await page.waitForFunction(() => (localStorage.getItem("symvibe.fakeSettings") ?? "").includes("diagramsEffort"));
  await page.reload();
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await open(page);
  await expect(page.getByTestId("dia-style-ink")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("dia-effort-quick")).toHaveAttribute("aria-pressed", "true");
});

test("S-2020·S-2024·S-2036 패널이 열린 채 빈 캔버스를 누르면 Flow 스타터가 그 자리에, 도구는 Select, 되돌리기 1단계, 내보내기 없음", async ({ page }) => {
  await boot(page);
  await open(page);
  await page.mouse.click(1100, 300); // 월드 (400,-150)
  const ps = await pieces(page);
  expect(ps.filter((x) => x.kind === "shape").length).toBe(3);
  expect(ps.filter((x) => x.kind === "line").length).toBe(2);
  const l = Math.min(...ps.map((x) => x.x)), r = Math.max(...ps.map((x) => x.x + x.w));
  expect(Math.abs((l + r) / 2 - 400)).toBeLessThan(2);
  expect((await st(page)).tool).toBe("select");
  await expect(page.getByTestId("rail-select")).toHaveAttribute("data-active", "true");
  expect(ps.every((x) => x.diagramId === undefined)).toBe(true);
  const first = ps.find((x) => x.kind === "shape")!;
  await page.locator(`[data-node-id="${first.id}"]`).click({ button: "right" }); // 스타터엔 내보내기 항목이 없다
  await expect(page.getByTestId("node-menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export diagram as PNG" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  expect((await pieces(page)).length).toBe(0);
});

test("S-2024 패널 버튼 스타터는 화면 가운데에 놓는다: Steps 알약 4 + 화살표 3, Mind map 5 + 4", async ({ page }) => {
  await boot(page);
  await open(page);
  await page.getByTestId("dia-starter-steps").click();
  let ps = await pieces(page);
  expect(ps.filter((x) => x.kind === "shape").length).toBe(4);
  expect(ps.filter((x) => x.kind === "line").length).toBe(3);
  expect(ps.filter((x) => x.kind === "shape").every((x) => x.edges === "round")).toBe(true);
  const l = Math.min(...ps.map((x) => x.x)), r = Math.max(...ps.map((x) => x.x + x.w));
  expect(Math.abs((l + r) / 2)).toBeLessThan(2); // 보기 가운데 = 월드 (0,0)
  await page.keyboard.press("Control+z");
  await page.getByTestId("dia-starter-mindmap").click();
  ps = await pieces(page);
  expect(ps.filter((x) => x.kind === "shape").length).toBe(5);
  expect(ps.filter((x) => x.kind === "line").length).toBe(4);
});

test("S-2023·S-2025·S-2027 프로젝트 버튼으로 만들기: 카드 → 도는 동안 비활성 → 착지(도형 개수·diagramId·선택·되돌리기 1단계)", async ({ page }) => {
  await boot(page, "hold");
  await open(page);
  await page.getByTestId("dia-topic-architecture").click();
  await expect(page.getByTestId("dia-card")).toBeVisible();
  await expect(page.getByTestId("dia-card-status")).toContainText("Claude Code");
  await expect(page.getByTestId("dia-card")).toContainText("is drawing");
  const run = (await page.evaluate(() => (window as any).__runs))[0];
  expect(run).toMatchObject({ agentId: "claude", limitMs: 12 * 60000, cwd: "C:/fake/repo" });
  expect(run.prompt).toContain("Reply with one JSON object and nothing else.");
  await expect(page.getByTestId("dia-topic-user-flow")).toBeDisabled(); // 도는 중에는 모두 비활성
  await expect(page.getByTestId("dia-input")).toBeDisabled();
  await expect(page.getByTestId("dia-starter-flow")).toBeEnabled(); // 스타터는 AI 가 아니므로 막지 않는다
  await page.evaluate(() => (window as any).__release());
  await expect(page.getByTestId("dia-card")).toHaveCount(0);
  const ps = await pieces(page);
  expect(ps.filter((x) => x.kind === "shape" && x.strokeStyle !== "dashed").length).toBe(4);
  expect(ps.filter((x) => x.kind === "shape" && x.strokeStyle === "dashed").length).toBe(2); // 그룹 UI·API 영역
  expect(ps.filter((x) => x.kind === "line").length).toBe(3);
  expect(ps.filter((x) => x.kind === "shape" || x.kind === "line").every((x) => typeof x.diagramId === "string")).toBe(true);
  expect((await st(page)).selection.length).toBe(ps.length);
  await page.keyboard.press("Control+z");
  expect((await pieces(page)).length).toBe(0);
});

test("S-2023 자유 설명 + Enter, 노력 Thorough 는 25분 한도, 에이전트는 Codex 없으면 못 고른다", async ({ page }) => {
  await boot(page);
  await open(page);
  await page.getByTestId("dia-effort-thorough").click();
  await page.getByTestId("dia-input").fill("how login works");
  await page.getByTestId("dia-input").press("Enter");
  await expect.poll(async () => (await pieces(page)).length).toBeGreaterThan(0);
  const run = (await page.evaluate(() => (window as any).__runs))[0];
  expect(run.limitMs).toBe(25 * 60000);
  expect(run.prompt).toContain("how login works");
  await expect(page.getByTestId("dia-agent-codex")).toBeDisabled();
});

test("S-2025 카드 닫기 ×: 실행을 멈추고 지금까지 온 것을 도형으로 남긴다", async ({ page }) => {
  await boot(page, "hold");
  await open(page);
  await page.getByTestId("dia-topic-components").click();
  await page.getByTestId("dia-card-close").click();
  await expect(page.getByTestId("dia-card")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__aborted)).toBe(true);
  const ps = await pieces(page);
  expect(ps.filter((x) => x.kind === "shape").length).toBe(2); // 닫힌 노드 2개만
});

test("S-2030 쓸 수 있는 응답이 없으면 카드가 안내하고 Try again 으로 같은 설명을 다시 돌린다", async ({ page }) => {
  await boot(page, "junk-then-good");
  await open(page);
  await page.getByTestId("dia-topic-data-flow").click();
  await expect(page.getByTestId("dia-card-error")).toHaveText("The agent returned nothing usable.");
  await expect(page.getByTestId("dia-card-hint")).toHaveText("Try another model if it keeps failing.");
  await expect((await pieces(page)).length).toBe(0);
  await page.getByTestId("dia-card-retry").click();
  await expect(page.getByTestId("dia-card")).toHaveCount(0);
  const runs = await page.evaluate(() => (window as any).__runs);
  expect(runs.length).toBe(2);
  expect(runs[1].prompt).toBe(runs[0].prompt);
  expect((await pieces(page)).filter((x) => x.kind === "shape").length).toBeGreaterThan(0);
});

test("S-2028 막힘은 대신 답하지 않고 안내만(Open a console …)", async ({ page }) => {
  await boot(page, "blocked");
  await open(page);
  await page.getByTestId("dia-topic-architecture").click();
  await expect(page.getByTestId("dia-card-error")).toContainText("is asking a question Symvibe will not answer for you. Open a console in this repo, answer it there, and try again.");
  await expect(page.getByTestId("dia-card-retry")).toBeVisible();
});

test("S-2035~S-2039 생성된 조각 우클릭에 내보내기 항목, Excalidraw·PNG 파일을 쓴다. 지우기·옮기기는 평범한 도형처럼", async ({ page }) => {
  await boot(page);
  await open(page);
  await page.getByTestId("dia-topic-architecture").click();
  await expect.poll(async () => (await pieces(page)).length).toBeGreaterThan(5);
  const shape = (await pieces(page)).find((x) => x.text === "Login page")!;
  await page.locator(`[data-node-id="${shape.id}"]`).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Export diagram as PNG" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export as Excalidraw" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible(); // 기존 항목은 그대로
  await page.evaluate(() => ((window as any).__fakeSavePath = "C:/fake/out/Auth flow.excalidraw"));
  await page.getByRole("menuitem", { name: "Export as Excalidraw" }).click();
  await page.waitForFunction(() => (window as any).__fakeFiles?.["C:/fake/out/Auth flow.excalidraw"]);
  const ex = await page.evaluate(() => (window as any).__fakeFiles["C:/fake/out/Auth flow.excalidraw"]);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(ex.bytes)));
  expect(json).toMatchObject({ type: "excalidraw", version: 2, files: {} });
  expect(json.elements.filter((e: any) => e.type === "arrow").length).toBe(3);
  await page.locator(`[data-node-id="${shape.id}"]`).click({ button: "right" });
  await page.evaluate(() => ((window as any).__fakeSavePath = "C:/fake/out/Auth flow.png"));
  await page.getByRole("menuitem", { name: "Export diagram as PNG" }).click();
  await page.waitForFunction(() => (window as any).__fakeFiles?.["C:/fake/out/Auth flow.png"]);
  const png = await page.evaluate(() => (window as any).__fakeFiles["C:/fake/out/Auth flow.png"]);
  expect(png.bytes.slice(0, 4)).toEqual([137, 80, 78, 71]); // PNG 머리말
  expect(png.bytes.length).toBeGreaterThan(1000);
  // 편집기·다시 만들기 없음: 레일·메뉴에 그런 항목이 없다
  await expect(page.getByRole("menuitem", { name: /regenerate|edit diagram/i })).toHaveCount(0);
});

test("S-2037 명세 파일이 없으면(옛 보드의 diagramId) 내보내기 항목이 없다", async ({ page }) => {
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }),
    boardJson([DUMMY, { id: "shape900", kind: "shape", x: 0, y: 0, w: 160, h: 100, z: 2, shape: "rectangle", diagramId: "dia-gone", stroke: "default", strokeWidth: 1, strokeStyle: "solid", roughness: 0, fill: "transparent", fillStyle: "hachure", edges: "round", opacity: 100, seed: 1, text: "x" }]));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await page.locator('[data-node-id="shape900"]').click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export diagram as PNG" })).toHaveCount(0);
});

test("S-2039 내보내기가 실패하면 Couldn't export the diagram. 알림이 뜬다 (FX7)", async ({ page }) => {
  await boot(page);
  await open(page);
  await page.getByTestId("dia-topic-architecture").click();
  await expect.poll(async () => (await pieces(page)).length).toBeGreaterThan(5);
  const shape = (await pieces(page)).find((x) => x.text === "Login page")!;
  await page.evaluate(() => { const w = window as any; w.__fakeSavePath = "C:/fake/out/x.png"; w.__fakeWriteError = "disk full"; });
  await page.locator(`[data-node-id="${shape.id}"]`).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export diagram as PNG" }).click();
  await expect(page.getByTestId("app-notice")).toHaveText("Couldn't export the diagram.", { timeout: 15000 });
  await page.locator(`[data-node-id="${shape.id}"]`).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export as Excalidraw" }).click();
  await expect(page.getByTestId("app-notice")).toHaveText("Couldn't export the diagram.", { timeout: 15000 });
});
