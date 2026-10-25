import { expect, test, type Page } from "@playwright/test";
import { GROUP_PAD } from "../src/board/groups";

// B7 그룹 시험 (S-500~S-506, S-508). 가짜 PTY(Tauri 밖), 저장된 보드를 window.__symSeed 로 심어 연다.
// 줌 0.5, 뷰포트 1400×900, 보드 이동 0 이면 월드 (x,y) = 화면 (700 + x/2, 450 + y/2). 콘솔 720×440 = 화면 360×220.
// 데이터 속성(구현이 맞출 약속): 할로 틀 data-testid="group-halo" data-group-id data-members="c1,c2"(정렬된 id), 헤더 라벨 data-testid="group-label"(textContent "GROUP 1 · 3 running"),
// 이름 편집 입력 data-testid="group-name-input"(라벨 더블클릭으로 열림, maxlength 24)
// 저장→다시 열기: Tauri 밖 가짜 저장소는 새로고침 때 사라지므로, 저장(groups 쓰기)은 vitest persist.test.ts 가, 열기는 여기서 심은 보드로 본다.
type C = { id: string; x: number; y: number; g?: string };
type G = { id: string; name: string; role: string };
const G1: G = { id: "g1", name: "Group 1", role: "general" };
const TRIO: C[] = [{ id: "c1", x: -760, y: -200 }, { id: "c2", x: 40, y: -200 }, { id: "c3", x: -360, y: 300 }];
const grouped = (cs: C[], g = "g1") => cs.map((c) => ({ ...c, g }));
const FAR: C = { id: "c4", x: 900, y: -200 }; // 세 콘솔의 할로(여백 포함 월드 x -792..792) 밖

const seed = async (page: Page, cons: C[], groups: G[] = []) => {
  const board = JSON.stringify({
    formatVersion: 1, savedBy: "symvibe-win",
    workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" },
    viewport: { x: 0, y: 0, zoom: 0.5 },
    nodes: cons.map((c, i) => ({ id: c.id, kind: "console", x: c.x, y: c.y, w: 720, h: 440, z: i + 1, name: `Con ${c.id}`, agentId: "shell", textSize: null, yolo: false, ...(c.g ? { groupId: c.g } : {}) })),
    groups,
  });
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), board);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("console")).toHaveCount(cons.length);
  await expect.poll(() => page.evaluate(() => (window as any).__fakePty.ids().length as number)).toBe(cons.length); // 모두 실행 중
};
const halos = (page: Page) => page.getByTestId("group-halo");
const label = (page: Page) => page.getByTestId("group-label");
const members = (page: Page, i = 0) => halos(page).nth(i).getAttribute("data-members");
const box = (page: Page, sel: string) => page.locator(sel).first().boundingBox().then((b) => b!);
const handle = (page: Page, id: string) => page.locator(`[data-node-id="${id}"] [data-node-handle]`);
async function dragHandle(page: Page, id: string, dx: number, dy: number) {
  const b = (await handle(page, id).boundingBox())!;
  const x = b.x + b.width * 0.4, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}
const blank = (page: Page) => page.mouse.click(700, 60); // 빈 캔버스: 선택 해제 + 보드가 키보드를 되찾음
const clickHandle = (page: Page, id: string) => handle(page, id).click({ position: { x: 100, y: 8 } });

test("S-500·S-502 콘솔 3개 선택 → Ctrl+G → 할로와 헤더 'GROUP 1 · 3 running'", async ({ page }) => {
  await seed(page, TRIO);
  await expect(halos(page)).toHaveCount(0);
  await blank(page);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  await expect(halos(page)).toHaveCount(1);
  await expect(label(page)).toHaveText("GROUP 1 · 3 running");
  expect(await members(page)).toBe("c1,c2,c3");
});

test("S-500 콘솔이 하나뿐이면 Ctrl+G 는 아무 일도 없다", async ({ page }) => {
  await seed(page, [TRIO[0]!, FAR]);
  await clickHandle(page, "c1");
  await page.keyboard.press("Control+g");
  await expect(halos(page)).toHaveCount(0);
});

test("S-502 할로 틀: 멤버 경계 상자 + 여백, 점선, 헤더는 틀 위쪽", async ({ page }) => {
  await seed(page, grouped(TRIO), [G1]);
  await expect(halos(page)).toHaveCount(1);
  const h = await box(page, '[data-testid="group-halo"]');
  // 멤버 경계 상자 월드 x -760..760, y -200..740 → 화면 = 700 + 월드/2
  expect([Math.round(h.x), Math.round(h.y), Math.round(h.width), Math.round(h.height)]).toEqual([
    Math.round(700 + (-760 - GROUP_PAD) / 2), Math.round(450 + (-200 - GROUP_PAD) / 2), Math.round((1520 + 2 * GROUP_PAD) / 2), Math.round((940 + 2 * GROUP_PAD) / 2),
  ]);
  expect(await halos(page).evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe("dashed");
  const l = await box(page, '[data-testid="group-label"]');
  expect(l.x).toBeGreaterThanOrEqual(h.x - 1);
  expect(l.x).toBeLessThan(h.x + h.width);
  expect(l.y).toBeLessThanOrEqual(h.y + 40); // 위쪽 헤더
});

test("S-508 저장된 groups 로 보드를 열면 할로가 바로 선다(콘솔 groupId)", async ({ page }) => {
  await seed(page, [...grouped(TRIO), FAR], [G1]);
  await expect(halos(page)).toHaveCount(1);
  await expect(label(page)).toHaveText("GROUP 1 · 3 running");
  expect(await members(page)).toBe("c1,c2,c3");
});

test("S-501 Ctrl+Shift+G 는 선택한 콘솔이 속한 그룹을 해체하고 콘솔은 남는다", async ({ page }) => {
  await seed(page, [...grouped(TRIO), FAR], [G1]);
  await expect(halos(page)).toHaveCount(1);
  await clickHandle(page, "c1");
  await page.keyboard.press("Control+Shift+g");
  await expect(halos(page)).toHaveCount(0);
  await expect(page.getByTestId("console")).toHaveCount(4);
});

test("S-503 멤버를 옮기면 할로가 따라온다", async ({ page }) => {
  await seed(page, grouped(TRIO), [G1]);
  const h0 = await box(page, '[data-testid="group-halo"]');
  await dragHandle(page, "c1", 60, 40); // c1 이 가장 왼쪽 → 틀의 왼쪽 가장자리가 같이 60 이동
  await expect.poll(async () => Math.round((await box(page, '[data-testid="group-halo"]')).x - h0.x)).toBe(60);
  expect(Math.round((await box(page, '[data-testid="group-halo"]')).width - h0.width)).toBe(-60);
});

test("S-503 할로는 선택 대상이 아니고, 할로 안 빈 곳을 눌러도 아래 보드가 받는다", async ({ page }) => {
  await seed(page, grouped(TRIO), [G1]);
  await expect(halos(page)).toHaveCount(1);
  // 화면 (700,585): c1·c2(아래 y 570)와 c3(위 y 600) 사이 빈 곳이면서 할로 안
  const hit = await page.evaluate(() => {
    const e = document.elementFromPoint(700, 585);
    return { halo: !!e?.closest('[data-testid="group-halo"]'), board: !!e?.closest('[data-testid="board"]') };
  });
  expect(hit).toEqual({ halo: false, board: true });
  await clickHandle(page, "c1");
  await expect(page.locator('[data-node-id][data-selected="true"]')).toHaveCount(1);
  await page.mouse.click(700, 585); // 빈 캔버스 클릭 = 선택 해제
  await expect(page.locator('[data-node-id][data-selected="true"]')).toHaveCount(0);
  await expect(halos(page)).toHaveCount(1); // 할로는 선택으로 사라지지 않는다
});

test("S-504 콘솔을 할로 안으로 끌면 들어가고, 끌기 1번 = Ctrl+Z 1번", async ({ page }) => {
  await seed(page, [...grouped(TRIO), FAR], [G1]);
  expect(await members(page)).toBe("c1,c2,c3");
  const c4 = await box(page, '[data-node-id="c4"]');
  await dragHandle(page, "c4", -630, -60); // 콘솔 중심이 월드 (0,-100) = 할로 안
  await expect(label(page)).toHaveText("GROUP 1 · 4 running");
  expect(await members(page)).toBe("c1,c2,c3,c4");
  await blank(page);
  await page.keyboard.press("Control+z");
  await expect(label(page)).toHaveText("GROUP 1 · 3 running");
  expect(await members(page)).toBe("c1,c2,c3");
  const back = await box(page, '[data-node-id="c4"]');
  expect([Math.round(back.x), Math.round(back.y)]).toEqual([Math.round(c4.x), Math.round(c4.y)]); // 위치도 같은 한 단계로 돌아옴
});

test("S-504·S-505 멤버를 할로 밖으로 끌면 빠지고(1개 남아도 그룹 유지), Ctrl+Z 1번이면 돌아온다", async ({ page }) => {
  await seed(page, grouped(TRIO.slice(0, 2)), [G1]);
  expect(await members(page)).toBe("c1,c2");
  await dragHandle(page, "c2", 0, 290); // 콘솔 중심이 월드 y 20 → 600, 할로 아래쪽(월드 272) 밖
  await expect(label(page)).toHaveText("GROUP 1 · 1 running");
  expect(await members(page)).toBe("c1");
  await blank(page);
  await page.keyboard.press("Control+z");
  await expect(label(page)).toHaveText("GROUP 1 · 2 running");
  expect(await members(page)).toBe("c1,c2");
});

test("S-505 마지막 멤버까지 빠지면 그룹이 사라진다", async ({ page }) => {
  await seed(page, grouped(TRIO.slice(0, 2)), [G1]);
  await dragHandle(page, "c2", 0, 290);
  await expect(halos(page)).toHaveCount(1);
  await dragHandle(page, "c1", 0, 290); // 남은 틀은 c1 하나 → 그 자리를 벗어나면 밖
  await expect(halos(page)).toHaveCount(0);
});

test("S-506 헤더 라벨 더블클릭 → 이름 바꾸기(Return 저장·Esc 취소·24자), 이름이 비면 역할 이름", async ({ page }) => {
  await seed(page, grouped(TRIO, "g2"), [{ id: "g2", name: "Group 1", role: "backend" }]);
  const input = page.getByTestId("group-name-input");
  await label(page).dblclick();
  await expect(input).toBeVisible();
  await input.fill("zzz");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(label(page)).toHaveText("GROUP 1 · 3 running"); // 취소
  await label(page).dblclick();
  await input.fill("Reviewers");
  await input.press("Enter");
  await expect(label(page)).toHaveText("REVIEWERS · 3 running"); // 저장, 대문자 표시
  await label(page).dblclick();
  await input.fill("");
  await input.pressSequentially("a".repeat(30));
  await input.press("Enter");
  await expect(label(page)).toHaveText(`${"A".repeat(24)} · 3 running`); // 24자까지
  await label(page).dblclick();
  await input.fill("");
  await input.press("Enter");
  await expect(label(page)).toHaveText("BACKEND · 3 running"); // 빈 이름 = 역할 이름
});
