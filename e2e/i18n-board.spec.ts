import { expect, test, type Page } from "@playwright/test";

// K3 S-2430~S-2436. PW_PORT=1603. 가짜 설정은 localStorage "symvibe.fakeSettings". 기대 문구는 spec/7묶음.md 용어 표와 설명서.
const seed = (page: Page, v: object) => page.addInitScript((s) => localStorage.setItem("symvibe.fakeSettings", s), JSON.stringify(v));
const item = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });
const ready = async (page: Page, url = "/") => {
  await page.goto(url);
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
};
const STATUS_EN = ["IDLE", "STARTING", "WORKING", "RUNNING", "DONE", "ERROR", "PAUSED", "NEEDS YOU", "READY"];
const STATUS_KO = ["대기", "시작 중", "작업 중", "실행 중", "완료", "오류", "일시 중지", "확인 필요", "준비됨"];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test("S-2430 ko ① 빈 보드 안내·줌 컨트롤 툴팁", async ({ page }) => {
  await seed(page, { language: "ko" });
  await ready(page);
  const empty = page.getByTestId("empty-board");
  await expect(empty).toContainText("이 보드는 비어 있습니다");
  await expect(empty.getByRole("button", { name: "에이전트 생성", exact: true })).toBeVisible();
  await expect(empty.getByRole("button", { name: "프리셋으로 시작", exact: true })).toBeVisible();
  await expect(page.getByTestId("zoom-out")).toHaveAttribute("title", "축소");
  await expect(page.getByTestId("zoom-in")).toHaveAttribute("title", "확대");
  await expect(page.getByTestId("zoom-pct")).toHaveAttribute("title", "100%로 되돌리기");
});

test("S-2431 ko ② 레일 도구 툴팁·우클릭 링·노드 메뉴", async ({ page }) => {
  await seed(page, { language: "ko" });
  await ready(page, "/?console=1&agent=shell");
  await expect(page.getByTestId("rail-select")).toHaveAttribute("title", "선택 (V)");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("title", "에이전트 생성 (T)");
  await expect(page.getByTestId("rail-fit")).toHaveAttribute("title", "내용에 맞추기");
  await page.mouse.click(1000, 150, { button: "right" });
  await expect(page.getByTestId("ring-menu")).toBeVisible();
  await expect(item(page, "에이전트 생성")).toBeVisible();
  await expect(item(page, "붙여넣기")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("[data-node-handle]").first().click({ button: "right" });
  await expect(page.getByTestId("node-menu")).toBeVisible();
  await expect(item(page, "복제")).toBeVisible();
  await expect(item(page, "맨 앞으로 가져오기")).toBeVisible();
});

test("S-2432/S-2433 ko ③ 콘솔 헤더 버튼·상태 pill(속성값은 영어)", async ({ page }) => {
  await seed(page, { language: "ko" });
  await ready(page, "/?console=1&agent=shell");
  await expect(page.getByTestId("console-restart")).toHaveAttribute("title", "다시 시작");
  await expect(page.getByTestId("console-restart")).toHaveAttribute("aria-label", "다시 시작");
  await expect(page.getByTestId("console-duplicate")).toHaveAttribute("title", "복제");
  await expect(page.getByTestId("console-close")).toHaveAttribute("title", "닫기");
  const pill = page.getByTestId("console-status");
  await expect.poll(async () => STATUS_KO.includes((await pill.textContent()) ?? "")).toBe(true);
  expect(STATUS_EN).toContain(await pill.getAttribute("data-status"));
  await expect(page.getByTestId("console-badge")).toHaveAttribute("title", "shell"); // 에이전트 id 는 번역 안 함
});

test("S-2434 ko ④ 그룹 composer 역할 칩(내부 role 값은 영어)", async ({ page }) => {
  await seed(page, { language: "ko" });
  await ready(page);
  await page.mouse.click(700, 450, { button: "right" });
  await item(page, "그룹 생성").click();
  const c = page.getByTestId("group-composer");
  await expect(c).toBeVisible();
  await expect(c.locator('[data-testid="role-chip"][data-role="general"]')).toHaveText("일반");
  await expect(c.locator('[data-testid="role-chip"][data-role="frontend"]')).toHaveText("프론트엔드");
  await expect(c.locator('[data-testid="role-chip"][data-role="backend"]')).toHaveText("백엔드");
  await expect(page.getByTestId("composer-name")).toHaveAttribute("placeholder", "팀");
  await expect(page.getByTestId("composer-spawn")).toHaveText("6개 생성");
});

test("S-2430~S-2434 en ⑤ 같은 화면 문구가 영어 그대로", async ({ page }) => {
  await ready(page, "/");
  await expect(page.getByTestId("empty-board")).toContainText("This board is empty");
  await expect(page.getByTestId("zoom-out")).toHaveAttribute("title", "Zoom out");
  await expect(page.getByTestId("rail-select")).toHaveAttribute("title", "Select (V)");
  await page.mouse.click(700, 450, { button: "right" });
  await expect(item(page, "Spawn agent")).toBeVisible();
  await item(page, "Spawn group").click();
  await expect(page.getByTestId("role-chip").first()).toHaveText("Frontend");
  await expect(page.getByTestId("composer-name")).toHaveAttribute("placeholder", "Team");
  await expect(page.getByTestId("composer-spawn")).toHaveText("Spawn 6");
});

test("S-2435 한글 입력기 켠 채 키: key=ㅍ code=KeyV 가 Select 도구, 입력란 안은 그대로", async ({ page }) => {
  await seed(page, { language: "ko" });
  await ready(page);
  const press = (key: string, code: string) => page.evaluate(([k, c]) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: c, bubbles: true, cancelable: true })), [key, code]);
  await page.keyboard.press("t");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-active", "true");
  await press("ㅍ", "KeyV");
  await expect(page.getByTestId("rail-select")).toHaveAttribute("data-active", "true");
  await press("ㅅ", "KeyT");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-active", "true");
  await press("Process", "KeyV");
  await expect(page.getByTestId("rail-select")).toHaveAttribute("data-active", "true");
});
