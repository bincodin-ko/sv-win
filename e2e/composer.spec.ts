import { expect, test, type Page } from "@playwright/test";

// B8 그룹 composer·Spawn N (S-520~S-533). 가짜 PTY·가짜 agents_list(Tauri 밖).
// 가짜 에이전트: claude·shell 설치됨. 이 시험은 localStorage "symvibe.fakeInstalled" 로 codex·gemini 도 설치된 것으로 본다(S-525 역할 기본을 보려고).
// 순환 순서: claude → codex → gemini → grok → opencode → shell → claude (내장 5, Shell, 내 에이전트)
// 데이터 속성(구현이 맞출 약속): 팝오버 composer(role=dialog) data-testid="group-composer", 이름 입력 "composer-name"(안내 Team),
// 역할 칩 "role-chip"(data-role, 고른 것은 data-active="true"), 슬롯 "slot"(data-agent), Fill all 줄의 로고 "fill-all-agent"(data-agent)와 "fill-all-more"(+),
// 스테퍼 "composer-minus"·"composer-plus"·"composer-count"(숫자 글자), "composer-spawn"(글자 "Spawn N"). 슬롯 우클릭 목록은 기존 AgentPicker(data-testid="agent-picker", 항목 data-agent-id).
// 빈 보드 버튼: "Spawn 2"·"Spawn 4"·"Spawn 8".
const consoles = (page: Page) => page.getByTestId("console");
const item = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });
const composer = (page: Page) => page.getByTestId("group-composer");
const slots = (page: Page) => page.getByTestId("slot");
const agents = (page: Page) => slots(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-agent")));
const role = (page: Page, r: string) => page.locator(`[data-testid="role-chip"][data-role="${r}"]`);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(["codex", "gemini"])));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
});

async function openFromRing(page: Page, at = { x: 700, y: 450 }) {
  await page.mouse.click(at.x, at.y, { button: "right" });
  await item(page, "Spawn group").click();
  await expect(composer(page)).toBeVisible();
}

test("S-520·S-521 링 Spawn group → 팝오버: 이름 칸, 역할 칩 8개(General 강조), 슬롯 6개, Fill all 줄, 스테퍼 6, Spawn 6", async ({ page }) => {
  await openFromRing(page);
  await expect(page.getByTestId("ring-menu")).toHaveCount(0);
  await expect(composer(page)).toHaveAttribute("role", "dialog");
  await expect(page.getByTestId("composer-name")).toHaveAttribute("placeholder", "Team");
  await expect(page.getByTestId("role-chip")).toHaveCount(8);
  await expect(role(page, "general")).toHaveAttribute("data-active", "true");
  await expect(page.locator('[data-testid="role-chip"][data-active="true"]')).toHaveCount(1);
  await expect(slots(page)).toHaveCount(6);
  expect(await agents(page)).toEqual(Array(6).fill("claude")); // General = 기본 에이전트(claude)
  await expect(slots(page).first()).toContainText("Claude");
  expect(await page.getByTestId("fill-all-agent").count()).toBeGreaterThanOrEqual(5);
  await expect(page.getByTestId("fill-all-more")).toBeVisible();
  await expect(page.getByTestId("composer-count")).toHaveText("6");
  await expect(page.getByTestId("composer-spawn")).toHaveText("Spawn 6");
  const b = (await composer(page).boundingBox())!; // 화면 안, 누른 자리 근처
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(1400);
  expect(b.y + b.height).toBeLessThanOrEqual(900);
});

test("S-525 역할 Backend → 손대지 않은 슬롯이 codex, 손댄 슬롯은 역할을 바꿔도 유지", async ({ page }) => {
  await openFromRing(page);
  await role(page, "backend").click();
  await expect(role(page, "backend")).toHaveAttribute("data-active", "true");
  await expect(role(page, "general")).not.toHaveAttribute("data-active", "true");
  expect(await agents(page)).toEqual(Array(6).fill("codex"));
  await slots(page).nth(0).click(); // codex → gemini (손댐)
  await role(page, "reviewers").click();
  expect(await agents(page)).toEqual(["gemini", "claude", "claude", "claude", "claude", "claude"]);
  await role(page, "testers").click();
  expect(await agents(page)).toEqual(["gemini", "gemini", "gemini", "gemini", "gemini", "gemini"]);
});

test("S-525 설치 안 된 CLI 역할은 기본 에이전트로 (grok 쪽이 아닌 codex 미설치 상태)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("symvibe.fakeInstalled", "[]"));
  await page.reload();
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await openFromRing(page);
  await role(page, "backend").click();
  expect(await agents(page)).toEqual(Array(6).fill("claude"));
});

test("S-523 슬롯 클릭은 다음 에이전트로 순환, 우클릭은 전체 카탈로그(AgentPicker)", async ({ page }) => {
  await openFromRing(page);
  const s0 = slots(page).first();
  await s0.click();
  await expect(s0).toHaveAttribute("data-agent", "codex");
  await s0.click();
  await expect(s0).toHaveAttribute("data-agent", "gemini");
  for (let i = 0; i < 4; i++) await s0.click(); // grok, opencode, shell, claude
  await expect(s0).toHaveAttribute("data-agent", "claude");
  await expect(slots(page).nth(1)).toHaveAttribute("data-agent", "claude"); // 다른 슬롯은 그대로
  await s0.click({ button: "right" });
  const picker = page.getByTestId("agent-picker");
  await expect(picker).toBeVisible();
  await expect(picker.locator("[data-agent-id]")).toHaveCount(7); // 내장 5 + Shell + 카탈로그 Aider
  await picker.locator('[data-agent-id="grok"]').click();
  await expect(picker).toHaveCount(0);
  await expect(s0).toHaveAttribute("data-agent", "grok");
  await expect(s0).toContainText("Grok");
});

test("S-524 Fill all: 로고를 누르면 모든 슬롯이 그 에이전트, + 는 카탈로그에서 골라 채운다", async ({ page }) => {
  await openFromRing(page);
  await page.locator('[data-testid="fill-all-agent"][data-agent="shell"]').click();
  expect(await agents(page)).toEqual(Array(6).fill("shell"));
  await page.getByTestId("fill-all-more").click();
  const picker = page.getByTestId("agent-picker");
  await expect(picker).toBeVisible();
  await picker.locator('[data-agent-id="opencode"]').click();
  expect(await agents(page)).toEqual(Array(6).fill("opencode"));
});

test("S-522 −/+ 로 슬롯 수를 바꾸고 12 에서 + 가 멈춘다, 새 칸은 지금 역할 기본", async ({ page }) => {
  await openFromRing(page);
  await role(page, "backend").click();
  await page.getByTestId("composer-minus").click();
  await expect(slots(page)).toHaveCount(5);
  await expect(page.getByTestId("composer-spawn")).toHaveText("Spawn 5");
  await slots(page).nth(0).click(); // gemini (손댐)
  for (let i = 0; i < 6; i++) await page.getByTestId("composer-plus").click();
  await expect(slots(page)).toHaveCount(11);
  await page.getByTestId("composer-plus").click();
  await expect(slots(page)).toHaveCount(12);
  await expect(page.getByTestId("composer-plus")).toBeDisabled();
  await page.getByTestId("composer-plus").click({ force: true });
  await expect(slots(page)).toHaveCount(12);
  await expect(page.getByTestId("composer-count")).toHaveText("12");
  const a = await agents(page);
  expect(a[0]).toBe("gemini");
  expect(a.slice(1)).toEqual(Array(11).fill("codex"));
  for (let i = 0; i < 20; i++) if (await page.getByTestId("composer-minus").isEnabled()) await page.getByTestId("composer-minus").click();
  await expect(slots(page)).toHaveCount(1);
  await expect(page.getByTestId("composer-minus")).toBeDisabled();
});

test("S-526 Spawn 6 → 콘솔 6개 + 그룹, 이름이 비면 역할 이름, 팝오버는 닫힌다(S-529: 다음에 열면 기억 안 함)", async ({ page }) => {
  await openFromRing(page);
  await role(page, "backend").click();
  await page.getByTestId("composer-spawn").click();
  await expect(composer(page)).toHaveCount(0);
  await expect(consoles(page)).toHaveCount(6);
  await expect(page.getByTestId("group-halo")).toHaveCount(1);
  await expect(page.getByTestId("group-label")).toContainText(/backend/i);
  const titles = await page.getByTestId("console-badge").evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  expect(titles).toEqual(Array(6).fill("codex"));
  // 3열 2행, 겹치지 않음: 서로 다른 x 3개, y 2개
  const boxes = await page.locator("[data-node-id]").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; }));
  expect(new Set(boxes.map((b) => b[0])).size).toBe(3);
  expect(new Set(boxes.map((b) => b[1])).size).toBe(2);
  // 다시 열면 기본값
  await page.mouse.click(1300, 100, { button: "right" });
  await item(page, "Spawn group").click();
  await expect(role(page, "general")).toHaveAttribute("data-active", "true");
  await expect(slots(page)).toHaveCount(6);
  await expect(page.getByTestId("composer-name")).toHaveValue("");
});

test("S-526 이름을 쓰면 그룹 이름", async ({ page }) => {
  await openFromRing(page);
  await page.getByTestId("composer-name").fill("Crew");
  await page.getByTestId("composer-minus").click();
  await page.getByTestId("composer-minus").click();
  await page.getByTestId("composer-minus").click();
  await page.getByTestId("composer-minus").click();
  await page.getByTestId("composer-spawn").click(); // 슬롯 2개
  await expect(consoles(page)).toHaveCount(2);
  await expect(page.getByTestId("group-label")).toContainText("CREW");
});

test("S-526 슬롯 1개면 그룹 없이 콘솔만", async ({ page }) => {
  await openFromRing(page);
  for (let i = 0; i < 5; i++) await page.getByTestId("composer-minus").click();
  await expect(page.getByTestId("composer-spawn")).toHaveText("Spawn 1");
  await page.getByTestId("composer-spawn").click();
  await expect(consoles(page)).toHaveCount(1);
  await expect(page.getByTestId("group-halo")).toHaveCount(0);
});

test("S-529 Esc 와 팝오버 밖 클릭으로 닫힌다 (콘솔은 안 놓인다)", async ({ page }) => {
  await openFromRing(page);
  await page.keyboard.press("Escape");
  await expect(composer(page)).toHaveCount(0);
  await expect(consoles(page)).toHaveCount(0);
  await openFromRing(page);
  await page.mouse.click(40, 860);
  await expect(composer(page)).toHaveCount(0);
  await expect(consoles(page)).toHaveCount(0);
});

test("S-532 빈 보드 Spawn 2 / 4 / 8 → 기본 에이전트 콘솔 N개, 그룹 없음", async ({ page }) => {
  const empty = page.getByTestId("empty-board");
  await expect(empty.getByRole("button", { name: "Spawn 2", exact: true })).toBeVisible();
  await expect(empty.getByRole("button", { name: "Spawn 8", exact: true })).toBeVisible();
  await empty.getByRole("button", { name: "Spawn 4", exact: true }).click();
  await expect(consoles(page)).toHaveCount(4);
  await expect(page.getByTestId("group-halo")).toHaveCount(0);
  await expect(empty).toHaveCount(0);
  const titles = await page.getByTestId("console-badge").evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  expect(titles).toEqual(Array(4).fill("claude"));
  const boxes = await page.locator("[data-node-id]").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; }));
  expect(new Set(boxes.map((b) => b[0])).size).toBe(2); // 2열 2행
  expect(new Set(boxes.map((b) => b[1])).size).toBe(2);
});

test("S-507·S-521 역할 칩 순서는 영상과 같다 (FX5 D8)", async ({ page }) => {
  await openFromRing(page);
  const order = await page.getByTestId("role-chip").evaluateAll((els) => els.map((e) => e.getAttribute("data-role")));
  expect(order).toEqual(["frontend", "backend", "testers", "reviewers", "design", "docs", "security", "general"]);
});
