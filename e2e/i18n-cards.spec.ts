import { expect, test, type Page } from "@playwright/test";

// K5 카드·도구 번역 (S-2460~S-2463). 가짜 PTY(Tauri 밖). 한국어 화면은 브라우저 언어 ko-KR 로(설정이 없으면 navigator.language).
// 저장되는 값(칸반 기본 열 이름 등)은 영어 그대로, 그릴 때만 번역. 1400×900, 줌 1, 이동 0.
test.use({ actionTimeout: 5000 });

const PNG1 = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 218, 99, 100, 248, 15, 4, 0, 9, 251, 3, 253, 5, 3, 181, 68, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
const cc = (id: string, name: string, color: string | null) => ({ id, name, color, cards: [] as unknown[] });
const NODES = [
  { id: "k1", kind: "kanban", x: -690, y: -440, w: 640, h: 300, z: 1, title: "Board", columns: [cc("c1", "Backlog", null), cc("c2", "To do", "sky"), cc("c3", "In progress", "amber"), cc("c4", "Done", "sage")] },
  { id: "cal1", kind: "calendar", x: 0, y: -440, w: 520, h: 400, z: 1, year: 2026, month: 10, events: [] },
  { id: "w1", kind: "web", x: -690, y: -100, w: 520, h: 300, z: 1, tabs: [{ id: "t1", url: "" }], active: "t1", zoom: 100, device: null },
  { id: "ex1", kind: "explorer", x: -140, y: -20, w: 360, h: 160, z: 1, dir: "C:/fake/repo/src", files: [], selected: "" },
  { id: "f1", kind: "file", x: 250, y: -20, w: 240, h: 120, z: 1, path: "C:/fake/repo/gone.bin", isDir: false, name: "gone.bin" },
  { id: "im1", kind: "image", x: -140, y: 170, w: 200, h: 150, z: 1, path: "C:/fake/pics/one.png", nw: 1, nh: 1 },
  { id: "im2", kind: "image", x: 100, y: 170, w: 200, h: 150, z: 1, path: "C:/fake/pics/none.png", nw: 1, nh: 1 },
];
const boardJson = () => JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 1 }, nodes: NODES, groups: [] });
async function seed(page: Page) {
  await page.addInitScript(([b, png]) => {
    const w = window as any;
    w.__symSeed = { boards: { "ws-fake": b } };
    w.__fakeFiles = { "C:/fake/pics/one.png": { bytes: png } };
  }, [boardJson(), PNG1] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
}
const names = (page: Page) => page.getByTestId("kb-col-name").allInnerTexts().then((a) => a.map((s) => s.trim()));
const stored = (page: Page) => page.evaluate(() => ((window as any).__kb.cols("ws-fake") as { name: string }[]).map((c) => c.name));

test.describe("한국어 화면", () => {
  test.use({ locale: "ko-KR" });

  test("S-2460 칸반: 기본 열 이름·카드 추가·열 추가 한국어, 저장 이름은 영어", async ({ page }) => {
    await seed(page);
    expect(await names(page)).toEqual(["백로그", "할 일", "진행 중", "완료"]);
    await expect(page.getByTestId("kb-add-card").first()).toHaveText("+ 카드 추가");
    await expect(page.getByTestId("kb-add-col")).toHaveText("+ 열");
    await expect(page.getByTestId("kb-col-menu-btn").first()).toHaveAttribute("aria-label", "열 메뉴");
    expect(await stored(page)).toEqual(["Backlog", "To do", "In progress", "Done"]);
    await page.getByTestId("kb-col-menu-btn").first().click();
    expect((await page.locator('[role="menu"]').getByRole("menuitem").allInnerTexts()).map((s) => s.replace(/\s*›$/, "").trim())).toEqual(["이름 바꾸기", "카드 추가", "색", "오른쪽으로 이동", "맨 끝으로 이동", "열 삭제"]);
    await page.keyboard.press("Escape");
    await page.getByTestId("kb-add-card").first().click();
    await expect(page.getByTestId("kb-dlg-title")).toHaveAttribute("placeholder", "제목");
    await expect(page.getByTestId("kb-dlg-notes")).toHaveAttribute("placeholder", "메모");
    expect(await stored(page)).toEqual(["Backlog", "To do", "In progress", "Done"]);
    await page.keyboard.press("Escape");
  });

  test("S-2461 캘린더: 월 머리·요일·버튼·이벤트 대화상자", async ({ page }) => {
    await seed(page);
    await expect(page.getByTestId("cal-title")).toHaveText("2026년 10월");
    await expect(page.getByTestId("calendar")).toContainText("일월화수목금토");
    await expect(page.getByTestId("cal-new")).toHaveText("새 일정");
    await expect(page.getByTestId("cal-today")).toHaveText("오늘");
    await expect(page.getByTestId("cal-prev")).toHaveAttribute("aria-label", "이전 달");
    await page.getByTestId("cal-new").click();
    const dlg = page.getByRole("dialog", { name: "새 일정" });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByPlaceholder("일정 제목")).toBeVisible();
    await expect(dlg).toContainText("하루 종일");
    await expect(dlg.getByRole("button", { name: "취소" })).toBeVisible();
    await expect(dlg.getByRole("button", { name: "일정 추가" })).toBeVisible();
  });

  test("S-2462 웹 타일: Dial·주소 자리 문구", async ({ page }) => {
    await seed(page);
    await expect(page.getByTestId("web-dial")).toContainText("로컬호스트");
    await expect(page.getByTestId("web-dial")).toContainText("바로가기");
    await expect(page.getByTestId("web-url")).toHaveAttribute("placeholder", "검색하거나 주소를 입력하세요");
    await expect(page.getByTestId("web-back")).toHaveAttribute("aria-label", "뒤로");
  });

  test("S-2462 파일 카드 빈 상태·없는 파일·이미지 Markup 도구", async ({ page }) => {
    await seed(page);
    await expect(page.getByTestId("explorer-card")).toContainText("텍스트 파일 없음");
    await expect(page.getByTestId("file-missing")).toHaveText("파일 없음");
    await expect(page.getByTestId("image-missing")).toContainText("이미지를 찾을 수 없음");
    await page.locator('[data-node-id="im1"]').click({ position: { x: 100, y: 75 } });
    await page.getByTestId("image-markup").click();
    const dlg = page.getByRole("dialog", { name: "마크업" });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByTestId("mk-tool-arrow")).toHaveText("화살표");
    await expect(dlg.getByTestId("mk-tool-text")).toHaveText("텍스트");
    await expect(dlg.getByTestId("mk-width-0")).toHaveAttribute("title", "굵기 2");
    await expect(dlg.getByTestId("mk-clear")).toHaveText("모두 지우기");
    await expect(dlg.getByTestId("mk-save")).toHaveText("마크업 저장");
  });
});

test("영어 화면은 그대로", async ({ page }) => {
  await seed(page);
  expect((await names(page)).map((s) => s.toLowerCase())).toEqual(["backlog", "to do", "in progress", "done"]); // 영어는 CSS 대문자
  await expect(page.getByTestId("kb-add-card").first()).toHaveText("+ Add card");
  await expect(page.getByTestId("kb-add-col")).toHaveText("+ Column");
  await expect(page.getByTestId("cal-title")).toHaveText("October 2026");
  await expect(page.getByTestId("calendar")).toContainText("SunMonTueWedThuFriSat");
  await expect(page.getByTestId("web-dial")).toContainText("LOCALHOST");
  await expect(page.getByTestId("web-url")).toHaveAttribute("placeholder", "Search or enter address");
  await expect(page.getByTestId("explorer-card")).toContainText("No text files");
  await expect(page.getByTestId("file-missing")).toHaveText("Missing");
  await expect(page.getByTestId("image-missing")).toContainText("Image missing");
});
