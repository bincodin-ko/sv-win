import { expect, test, type Page } from "@playwright/test";

// B14 Presets 라이브러리·진입점·우측 레일 (S-320·S-321·S-340·S-645~S-653). 가짜 IPC·가짜 agents_list(claude·shell 설치됨).
// 데이터 속성(구현이 맞출 약속): 우측 레일 버튼 "rail-presets"와 팝오버 "rail-presets-menu"(role=menu), 라이브러리 "preset-library"(role=dialog),
// 카드 "preset-card"(data-name), inspector "preset-inspector"(안의 "slot" = 레인 하나, data-agent), "fill-lane-agent"(data-agent), "preset-deploy"·"preset-save"(홈)·"preset-close",
// 저장 선반 "preset-shelf", 빈 보드 버튼 "Start from a preset", 홈 pill "preset-pill"(누르면 "preset-menu") 안의 "preset-new"·"preset-armed".
const consoles = (page: Page) => page.getByTestId("console");
const lib = (page: Page) => page.getByTestId("preset-library");
const card = (page: Page, name: string) => page.locator(`[data-testid="preset-card"][data-name="${name}"]`);
const item = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });

async function openBoard(page: Page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
}
async function openLibFromRail(page: Page) {
  await page.getByTestId("rail-presets").click();
  await item(page, "Open the full library").click();
  await expect(lib(page)).toBeVisible();
}

test("S-652 우측 레일: Presets 버튼 하나, 팝오버 항목 2개(저장 Set 없음), 줌 컨트롤·화면 가운데를 가리지 않음", async ({ page }) => {
  await openBoard(page);
  await expect(page.getByTestId("rail-presets")).toHaveCount(1);
  await page.getByTestId("rail-presets").click();
  const menu = page.getByTestId("rail-presets-menu");
  await expect(menu).toHaveAttribute("role", "menu");
  await expect(item(page, "Open the full library")).toBeVisible();
  await expect(item(page, "Save current layout")).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  const r = (await page.getByTestId("rail-presets").boundingBox())!;
  const z = (await page.getByTestId("zoom-pct").boundingBox())!;
  expect(r.x + r.width).toBeLessThanOrEqual(1400);
  const overlap = r.x < z.x + z.width && r.x + r.width > z.x && r.y < z.y + z.height && r.y + r.height > z.y;
  expect(overlap).toBe(false);
  expect(r.x > 800 || r.y > 200).toBe(true); // 화면 가운데(700,450)를 가리지 않음
});

test("S-650·S-653 라이브러리: 카드 18개(이름+요약), 건너뛰는 타일 표시, Esc·닫기로 닫힘", async ({ page }) => {
  await openBoard(page);
  await openLibFromRail(page);
  await expect(lib(page)).toHaveAttribute("role", "dialog");
  await expect(page.getByTestId("preset-card")).toHaveCount(18);
  await expect(card(page, "Dev HQ")).toContainText("12 agents · 3 teams");
  await expect(card(page, "Dev HQ").getByTestId("preset-skipped")).toHaveCount(0); // S-1794: orchestrator 도 놓을 수 있다
  await expect(card(page, "Pair").getByTestId("preset-skipped")).toHaveCount(0);
  await expect(page.getByTestId("preset-deploy")).toBeVisible();
  await expect(page.getByTestId("preset-save")).toHaveCount(0); // 보드에서는 Deploy
  await page.keyboard.press("Escape");
  await expect(lib(page)).toHaveCount(0);
  await openLibFromRail(page);
  await page.getByTestId("preset-close").click();
  await expect(lib(page)).toHaveCount(0);
});

test("S-646·S-645 inspector: 카드 고르면 레인 목록, 레인 클릭 = 순환, Fill every lane", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(["codex", "gemini"])));
  await openBoard(page);
  await openLibFromRail(page);
  await card(page, "Sprint Room").click();
  const ins = page.getByTestId("preset-inspector");
  const slot = (i: number) => ins.getByTestId("slot").nth(i);
  await expect(ins.getByTestId("slot")).toHaveCount(2);
  await expect(slot(0)).toHaveAttribute("data-agent", "claude");
  await slot(0).click(); // 순환: claude → codex
  await expect(slot(0)).toHaveAttribute("data-agent", "codex");
  await expect(slot(1)).toHaveAttribute("data-agent", "claude");
  await slot(1).click({ button: "right" });
  await expect(page.getByTestId("agent-picker")).toBeVisible();
  await page.locator('[data-testid="agent-picker"] [data-agent-id="shell"]').click();
  await expect(slot(1)).toHaveAttribute("data-agent", "shell");
  await page.locator('[data-testid="fill-lane-agent"][data-agent="gemini"]').click();
  await expect(slot(0)).toHaveAttribute("data-agent", "gemini");
  await expect(slot(1)).toHaveAttribute("data-agent", "gemini");
  await card(page, "Ship It").click(); // 다른 카드로 바꾸면 손댄 것이 초기화
  await expect(ins.getByTestId("slot")).toHaveCount(4);
  await expect(slot(0)).toHaveAttribute("data-agent", "claude");
});

test("S-642·S-644 Deploy: 콘솔 수·그룹이 맞고 Ctrl+Z 한 번에 전부 사라짐, 고른 에이전트로", async ({ page }) => {
  await openBoard(page);
  await openLibFromRail(page);
  await card(page, "Sprint Room").click();
  await page.getByTestId("preset-inspector").getByTestId("slot").nth(1).click({ button: "right" });
  await page.locator('[data-testid="agent-picker"] [data-agent-id="shell"]').click();
  await page.getByTestId("preset-deploy").click();
  await expect(lib(page)).toHaveCount(0);
  await expect(consoles(page)).toHaveCount(4);
  await expect(page.getByTestId("group-halo")).toHaveCount(2);
  const badges = await page.getByTestId("console-badge").evaluateAll((e) => e.map((x) => x.getAttribute("title")).sort());
  expect(badges).toEqual(["claude", "claude", "shell", "shell"]);
  await page.mouse.click(40, 700); // 빈 캔버스 (보드 키보드 포커스)
  await page.keyboard.press("Control+z");
  await page.getByTestId("confirm-close").getByRole("button", { name: "Close" }).click(); // 실행 중 콘솔을 지우는 되돌리기라 확인창
  await expect(consoles(page)).toHaveCount(0);
  await expect(page.getByTestId("group-halo")).toHaveCount(0);
});

test("S-1160·S-1162·S-1164 Dev HQ: 칸반 1·웹 1(localhost:3000 대기)·콘솔 12, Ctrl+Z 한 번에 전부, 카드에 skipped 표시 없음", async ({ page }) => {
  await openBoard(page);
  await openLibFromRail(page);
  await expect(card(page, "Dev HQ").getByTestId("preset-skipped")).toHaveCount(0);
  await card(page, "Dev HQ").click();
  await page.getByTestId("preset-deploy").click();
  await expect(lib(page)).toHaveCount(0);
  await expect(consoles(page)).toHaveCount(12);
  await expect(page.getByTestId("kb-col")).toHaveCount(4);
  await expect(page.getByTestId("web-tile")).toHaveCount(1);
  await expect(page.getByTestId("web-dial")).toHaveCount(0); // 빈 시작 탭이 아니라 주소를 연다
  await expect(page.getByTestId("web-waiting")).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // 큰 덩어리라 빈 캔버스 클릭이 타일에 닿을 수 있다
  await page.keyboard.press("Control+z");
  await page.getByTestId("confirm-close").getByRole("button", { name: "Close" }).click(); // 실행 중 콘솔을 지우는 되돌리기라 확인창
  await expect(consoles(page)).toHaveCount(0);
  await expect(page.getByTestId("kb-col")).toHaveCount(0);
  await expect(page.getByTestId("web-tile")).toHaveCount(0);
});

test("S-1790·S-1791 Dev HQ: 카드 3개(칸반·웹·orchestrator)가 서로 겹치지 않고, orchestrator 의 주황 곡선이 그룹 3개로 간다", async ({ page }) => {
  await openBoard(page);
  await openLibFromRail(page);
  await card(page, "Dev HQ").click();
  await page.getByTestId("preset-deploy").click();
  await expect(consoles(page)).toHaveCount(12);
  const orch = page.getByTestId("orch-card");
  await expect(orch).toHaveCount(1);
  const boxes = await Promise.all([page.getByTestId("kb-col").first().locator("xpath=ancestor::*[@data-node-id][1]"), page.getByTestId("web-tile").locator("xpath=ancestor::*[@data-node-id][1]"), orch.locator("xpath=ancestor::*[@data-node-id][1]")].map((l) => l.boundingBox()));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const a = boxes[i]!, b = boxes[j]!;
    expect([i, j, a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height]).toEqual([i, j, false]);
  }
  const id = await orch.getAttribute("data-id");
  await expect(page.locator(`[data-testid="wire"][data-from="${id}"][data-wire-color="orange"]`)).toHaveCount(3);
});

test("S-1790 Sprint Room·Briefed Squad 에도 orchestrator 가 놓이고 skipped 표시가 없다", async ({ page }) => {
  await openBoard(page);
  await openLibFromRail(page);
  await expect(card(page, "Briefed Squad").getByTestId("preset-skipped")).toHaveCount(0);
  await card(page, "Sprint Room").click();
  await page.getByTestId("preset-deploy").click();
  await expect(consoles(page)).toHaveCount(4);
  await expect(page.getByTestId("orch-card")).toHaveCount(1);
  await expect(page.getByTestId("kb-col")).toHaveCount(4);
  await openLibFromRail(page);
  await card(page, "Briefed Squad").click();
  await page.getByTestId("preset-deploy").click();
  await expect(consoles(page)).toHaveCount(8);
  await expect(page.getByTestId("orch-card")).toHaveCount(2);
});

test("S-1160 Squad and Preview 는 웹 타일을 놓는다", async ({ page }) => {
  await openBoard(page);
  await openLibFromRail(page);
  await card(page, "Squad and Preview").click();
  await page.getByTestId("preset-deploy").click();
  await expect(consoles(page)).toHaveCount(4);
  await expect(page.getByTestId("web-tile")).toHaveCount(1);
});

test("S-1163 Save current layout 후 칸반이 있는 보드를 찍으면 빈 4열 칸반", async ({ page }) => {
  await openBoard(page);
  await openLibFromRail(page);
  await card(page, "Squad and Board").click();
  await page.getByTestId("preset-deploy").click();
  await expect(page.getByTestId("kb-col")).toHaveCount(4);
  await page.getByTestId("rail-presets").click();
  await item(page, "Save current layout").click();
  await page.getByTestId("rail-presets").click();
  await item(page, "Set 1").click();
  await expect(page.getByTestId("kb-col")).toHaveCount(8);
});

test("S-647·S-648·S-652 Save current layout → Set 1, 클릭하면 찍힘, 우클릭 Delete preset 은 묻지 않고 삭제", async ({ page }) => {
  await openBoard(page);
  await page.getByRole("button", { name: "Spawn 2" }).click();
  await expect(consoles(page)).toHaveCount(2);
  await page.getByTestId("rail-presets").click();
  await item(page, "Save current layout").click();
  await page.getByTestId("rail-presets").click();
  await expect(item(page, "Set 1")).toBeVisible();
  await item(page, "Set 1").click();
  await expect(consoles(page)).toHaveCount(4);
  await openLibFromRail(page); // 라이브러리 선반에도 같은 이름
  await expect(page.getByTestId("preset-shelf")).toContainText("Saved on this board");
  await expect(page.getByTestId("preset-shelf")).toContainText("Set 1");
  await page.keyboard.press("Escape");
  await page.getByTestId("rail-presets").click();
  await item(page, "Set 1").click({ button: "right" });
  await item(page, "Delete preset").click();
  await expect(page.getByRole("dialog")).toHaveCount(0); // 확인창 없음
  await page.getByTestId("rail-presets").click();
  await expect(item(page, "Set 1")).toHaveCount(0);
});

test("S-651 진입점: Tools › Presets·빈 보드 Start from a preset 이 같은 패널을 연다", async ({ page }) => {
  await openBoard(page);
  await page.getByTestId("tools-btn").click();
  await item(page, "Presets").click();
  await expect(lib(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(lib(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Start from a preset" }).click();
  await expect(lib(page)).toBeVisible();
  await expect(page.getByTestId("preset-card")).toHaveCount(18);
});

// ---- 홈 ----
const A = "C:/fake/a";
async function openHome(page: Page) {
  await page.addInitScript(([seed, settings]) => {
    (window as any).__symSeed = { repos: seed };
    localStorage.setItem("symvibe.fakeSettings", JSON.stringify(settings));
  }, [{ repos: [{ path: A, name: "alpha", workspaces: [{ id: "ws-a", name: "Workspace 1" }] }], lastRepo: A, lastWorkspace: {} }, { reopenLastRepo: false }] as const);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await expect(page.getByTestId("home")).toBeVisible();
}

test("S-649·S-651·S-321 홈: New preset → 라이브러리(Save preset) → pill 에 이름 → Dispatch 로 배치하고 pill 이 비워짐", async ({ page }) => {
  await openHome(page);
  await expect(page.getByTestId("preset-pill")).toHaveText("No preset");
  await page.getByTestId("preset-pill").click();
  await page.getByTestId("preset-new").click();
  await expect(lib(page)).toBeVisible();
  await expect(page.getByTestId("preset-deploy")).toHaveCount(0); // 홈에서는 Save preset
  await card(page, "Pair").click();
  await page.getByTestId("preset-save").click();
  await expect(lib(page)).toHaveCount(0);
  await expect(page.getByTestId("preset-pill")).toContainText("Pair");
  await page.getByTestId("preset-pill").click();
  await expect(page.getByTestId("preset-armed")).toContainText("Pair");
  await expect(page.getByTestId("preset-armed")).toContainText("2 agents · 1 team");
  await page.keyboard.press("Escape");
  await page.getByTestId("dispatch").click();
  await expect(page.getByTestId("topbar")).toBeVisible();
  await expect(consoles(page)).toHaveCount(2);
  await expect(page.getByTestId("group-halo")).toHaveCount(1);
  await page.evaluate(() => (window as any).__shell.showHome());
  await expect(page.getByTestId("preset-pill")).toHaveText("No preset");
});

test("FX4 S-647 잉크·이미지가 섞인 보드 저장 → 저장된 노드에 ink·image 없음, 찍으면 노드 수가 같다", async ({ page }) => {
  await page.addInitScript(() => ((window as any).__symSeed = { boards: { "ws-fake": JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 1 }, groups: [], nodes: [
    { id: "t", kind: "text", x: 0, y: 0, w: 200, h: 34, z: 1, text: "a" },
    { id: "i1", kind: "ink", x: 50, y: 50, w: 6, h: 6, z: 2, points: [[1, 1], [5, 5]], color: "red", width: 4 },
    { id: "i2", kind: "ink", x: 80, y: 80, w: 6, h: 6, z: 3, points: [[1, 1], [5, 5]], color: "red", width: 4 },
    { id: "im", kind: "image", x: 150, y: 150, w: 100, h: 100, z: 4, src: "data:image/png;base64,AAAA" }] }) } }));
  await openBoard(page);
  const all = page.locator("[data-node-id]");
  await expect(all).toHaveCount(4);
  await page.getByTestId("rail-presets").click();
  await item(page, "Save current layout").click();
  await page.getByTestId("rail-presets").click();
  await item(page, "Set 1").click();
  await expect(all).toHaveCount(5); // 저장된 것 = text 1개뿐(잉크 2·이미지 1 은 저장 안 함)
});
