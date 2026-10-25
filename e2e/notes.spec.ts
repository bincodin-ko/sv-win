import { expect, test, type Page } from "@playwright/test";

// C7 체크리스트·캘린더 (S-900~S-919). 가짜 PTY(Tauri 밖). 1400×900, 줌 1, 월드 (x,y) = 화면 (700+x, 450+y).
// 오늘은 2026-09-15 로 고정(page.clock). 약속한 이름:
//   체크리스트 data-testid: checklist · checklist-title · checklist-title-input · checklist-count("N/M") · checklist-ring(data-done·data-total·data-ratio)
//     checklist-empty("No objectives") · checklist-add · checklist-new(입력) · check-item(data-item-id) · check-box · check-text · check-edit(입력) · check-del · checklist-clear
//   캘린더: calendar · cal-title · cal-new · cal-today · cal-prev · cal-next · cal-cell(data-date, data-today, 놓을 칸 data-drop) · cal-chip(data-event-id·data-date·data-color·data-time)
//     cal-more("+N") · cal-day-pop · cal-event-menu(role=menu)
//   이벤트 대화상자(role=dialog): placeholder "Event title" · ev-date · ev-allday(체크) · ev-time · ev-color-<이름> · ev-notes · Cancel · ev-submit
test.use({ actionTimeout: 5000 });
type N = Record<string, unknown> & { id: string; kind: string; x: number; y: number; w: number; h: number };
const n = (id: string, kind: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): N => ({ id, kind, x, y, w, h, z: 1, ...extra });
const CHECK = (extra: Record<string, unknown> = {}) => n("c1", "checklist", -150, -130, 300, 260, { title: "Checklist", items: [], ...extra }); // 화면 550..850 × 320..580
const CAL = (events: unknown[] = [], extra: Record<string, unknown> = {}) => n("k1", "calendar", -260, -220, 520, 440, { year: 2026, month: 9, events, ...extra }); // 화면 440..960 × 230..670
const ev = (id: string, date: string, extra: Record<string, unknown> = {}) => ({ id, title: `Ev ${id}`, date, allDay: true, notes: "", color: "Amber", ...extra });

const boardJson = (nodes: N[]) => JSON.stringify({
  formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 1 }, nodes, groups: [],
});
const seed = async (page: Page, nodes: N[], json?: string) => {
  await page.clock.setFixedTime(new Date(2026, 8, 15, 12, 0));
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), json ?? boardJson(nodes));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
};
const savedNodes = (page: Page) => page.evaluate(async () => JSON.parse((await (window as any).__shell.saved("ws-fake")) ?? "{}").nodes as N[] | undefined);
const t = (page: Page, id: string) => page.getByTestId(id);
const items = (page: Page) => t(page, "check-item");
const cell = (page: Page, d: string) => page.locator(`[data-testid="cal-cell"][data-date="${d}"]`);
const chips = (page: Page) => t(page, "cal-chip");
const chip = (page: Page, id: string) => page.locator(`[data-testid="cal-chip"][data-event-id="${id}"]`);
const menuitem = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });
const dialog = (page: Page) => page.getByRole("dialog");

test.describe("체크리스트", () => {
  test("S-900/S-901 Insert to-do 팝오버 → Checklist 가 놓이고 'No objectives' 와 Add an objective 가 보인다", async ({ page }) => {
    await seed(page, []);
    await t(page, "rail-insert-todo").click();
    await expect(menuitem(page, "Checklist")).toBeVisible();
    await expect(menuitem(page, "Calendar")).toBeVisible();
    await menuitem(page, "Checklist").click();
    await expect(t(page, "checklist")).toHaveCount(1);
    await expect(t(page, "checklist-title")).toHaveText("Checklist");
    await expect(t(page, "checklist-empty")).toHaveText("No objectives");
    await expect(t(page, "checklist-add")).toHaveText("Add an objective");
    await expect(t(page, "checklist-count")).toHaveText("0/0");
    await expect(t(page, "checklist-clear")).toHaveCount(0);
    await expect.poll(async () => (await savedNodes(page))?.find((x) => x.kind === "checklist")?.title, { timeout: 10_000 }).toBe("Checklist");
  });

  test("S-902/S-903 Add an objective → Enter 연속 입력, Esc·빈 글은 취소, 체크하면 N/M 과 링이 바뀐다", async ({ page }) => {
    await seed(page, [CHECK()]);
    await t(page, "checklist-add").click();
    await page.keyboard.type("alpha");
    await page.keyboard.press("Enter");
    await expect(t(page, "checklist-new")).toBeFocused(); // 연달아 다음 항목
    await page.keyboard.type("beta");
    await page.keyboard.press("Enter");
    await page.keyboard.type("gamma");
    await page.keyboard.press("Escape"); // 입력 중이던 글은 취소
    await expect(t(page, "checklist-new")).toHaveCount(0);
    await expect(items(page)).toHaveCount(2);
    await expect(t(page, "check-text")).toHaveText(["alpha", "beta"]);
    await expect(t(page, "checklist-empty")).toHaveCount(0);
    await t(page, "checklist-add").click();
    await page.keyboard.press("Enter"); // 빈 글 = 취소
    await expect(t(page, "checklist-new")).toHaveCount(0);
    await expect(items(page)).toHaveCount(2);
    await expect(t(page, "checklist-count")).toHaveText("0/2");
    await expect(t(page, "checklist-ring")).toHaveAttribute("data-ratio", "0");
    await items(page).first().getByTestId("check-box").check();
    await expect(t(page, "checklist-count")).toHaveText("1/2");
    await expect(t(page, "checklist-ring")).toHaveAttribute("data-ratio", "0.5");
    await expect(t(page, "checklist-ring")).toHaveAttribute("data-done", "1");
    await expect(t(page, "checklist-ring")).toHaveAttribute("data-total", "2");
    await page.keyboard.press("Control+z"); // 체크는 되돌리기 1단계
    await expect(t(page, "checklist-count")).toHaveText("0/2");
  });

  test("S-902 항목 글 더블클릭으로 고치고, 마우스를 올리면 ✕ 가 보여 묻지 않고 지운다", async ({ page }) => {
    await seed(page, [CHECK({ items: [{ id: "a", text: "alpha", done: false }, { id: "b", text: "beta", done: false }] })]);
    const first = items(page).first();
    await expect(first.getByTestId("check-del")).toHaveCount(0);
    await first.getByTestId("check-text").dblclick();
    await expect(first.getByTestId("check-edit")).toBeFocused();
    await first.getByTestId("check-edit").fill("alpha 2");
    await page.keyboard.press("Enter");
    await expect(first.getByTestId("check-text")).toHaveText("alpha 2");
    await first.hover();
    await first.getByTestId("check-del").click();
    await expect(items(page)).toHaveCount(1);
    await expect(t(page, "check-text")).toHaveText("beta");
    await expect(dialog(page)).toHaveCount(0);
  });

  test("S-904 Clear done 은 체크한 항목이 있을 때만 보이고, 묻지 않고 지우며, Ctrl+Z 한 번에 돌아온다", async ({ page }) => {
    await seed(page, [CHECK({ items: [{ id: "a", text: "alpha", done: true }, { id: "b", text: "beta", done: false }, { id: "c", text: "gamma", done: true }] })]);
    await expect(t(page, "checklist-count")).toHaveText("2/3");
    await t(page, "checklist-clear").click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(t(page, "check-text")).toHaveText(["beta"]);
    await expect(t(page, "checklist-clear")).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(t(page, "check-text")).toHaveText(["alpha", "beta", "gamma"]);
    await expect(t(page, "checklist-count")).toHaveText("2/3");
  });

  test("S-905 제목 더블클릭 이름 바꾸기: Enter 확정, Esc 취소, 빈 값 취소, 40자 제한", async ({ page }) => {
    await seed(page, [CHECK()]);
    const title = t(page, "checklist-title");
    await title.dblclick();
    await expect(t(page, "checklist-title-input")).toBeFocused();
    await expect(t(page, "checklist-title-input")).toHaveValue("Checklist");
    await t(page, "checklist-title-input").fill("Groceries");
    await page.keyboard.press("Enter");
    await expect(title).toHaveText("Groceries");
    await title.dblclick();
    await t(page, "checklist-title-input").fill("Nope");
    await page.keyboard.press("Escape");
    await expect(title).toHaveText("Groceries");
    await title.dblclick();
    await t(page, "checklist-title-input").fill("   ");
    await page.keyboard.press("Enter");
    await expect(title).toHaveText("Groceries");
    await title.dblclick();
    await t(page, "checklist-title-input").fill("y".repeat(55));
    await page.keyboard.press("Enter");
    await expect(title).toHaveText("y".repeat(40));
  });

  test("S-906 머리줄만 끌리고(본문 끌기는 노드를 안 옮김), 크기 조절은 최소 220×140 까지, 항목이 넘치면 안에서 스크롤", async ({ page }) => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, text: `item ${i}`, done: false }));
    await seed(page, [CHECK({ items: many })]);
    const node = page.locator('[data-node-id="c1"]');
    const b0 = (await node.boundingBox())!;
    await page.mouse.move(b0.x + 150, b0.y + 120); // 본문
    await page.mouse.down(); await page.mouse.move(b0.x + 250, b0.y + 220, { steps: 8 }); await page.mouse.up();
    const b1 = (await node.boundingBox())!;
    expect([Math.round(b1.x), Math.round(b1.y)]).toEqual([Math.round(b0.x), Math.round(b0.y)]);
    await page.mouse.move(b0.x + 120, b0.y + 12); // 머리줄
    await page.mouse.down(); await page.mouse.move(b0.x + 170, b0.y + 62, { steps: 8 }); await page.mouse.up();
    const b2 = (await node.boundingBox())!;
    expect(Math.round(b2.x - b0.x)).toBe(50);
    expect(Math.round(b2.y - b0.y)).toBe(50);
    const hb = (await node.locator('[data-handle="se"]').boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down(); await page.mouse.move(b2.x + 50, b2.y + 50, { steps: 8 }); await page.mouse.up();
    const b3 = (await node.boundingBox())!;
    expect([Math.round(b3.width), Math.round(b3.height)]).toEqual([220, 140]);
    const list = t(page, "checklist").locator("[data-wheel-own]");
    expect(await list.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  });
});

test.describe("캘린더", () => {
  test("S-910/S-911/S-912 More › Calendar 로 놓이고 'September 2026', 오늘 표시, 이전·다음·Today", async ({ page }) => {
    await seed(page, []);
    await page.mouse.click(300, 700, { button: "right" });
    await menuitem(page, "More").click();
    await menuitem(page, "Calendar").click();
    await expect(t(page, "calendar")).toHaveCount(1);
    await expect(t(page, "cal-title")).toHaveText("September 2026");
    await expect(cell(page, "2026-09-15")).toHaveAttribute("data-today", "true");
    await expect(page.locator('[data-testid="cal-cell"][data-today="true"]')).toHaveCount(1);
    await expect(t(page, "cal-cell")).toHaveCount(42);
    await expect(t(page, "cal-cell").first()).toHaveAttribute("data-date", "2026-08-30"); // 일요일 시작
    for (const b of ["cal-new", "cal-today", "cal-prev", "cal-next"]) await expect(t(page, b)).toBeVisible();
    await t(page, "cal-prev").click();
    await expect(t(page, "cal-title")).toHaveText("August 2026");
    await t(page, "cal-today").click();
    await expect(t(page, "cal-title")).toHaveText("September 2026");
    for (let i = 0; i < 4; i++) await t(page, "cal-next").click();
    await expect(t(page, "cal-title")).toHaveText("January 2027"); // 연도를 넘긴다
    for (let i = 0; i < 5; i++) await t(page, "cal-prev").click();
    await expect(t(page, "cal-title")).toHaveText("August 2026");
    await expect.poll(async () => (await savedNodes(page))?.find((x) => x.kind === "calendar")?.month, { timeout: 10_000 }).toBe(8); // 보는 달은 노드에 저장
  });

  test("S-913 New → 이벤트 대화상자: 제목이 비면 Add event 비활성, All day 끄면 시간 입력, 색 6개, Cancel, Add event → 칩", async ({ page }) => {
    await seed(page, [CAL()]);
    await t(page, "cal-new").click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByPlaceholder("Event title")).toBeFocused();
    await expect(t(page, "ev-date")).toHaveValue("2026-09-15"); // 오늘
    await expect(t(page, "ev-allday")).toBeChecked();
    await expect(t(page, "ev-time")).toHaveCount(0);
    await expect(t(page, "ev-submit")).toHaveText("Add event");
    await expect(t(page, "ev-submit")).toBeDisabled();
    for (const c of ["Amber", "Sage", "Sky", "Violet", "Rose", "Teal"]) await expect(t(page, `ev-color-${c}`)).toBeVisible();
    await d.getByRole("button", { name: "Cancel" }).click();
    await expect(d).toHaveCount(0);
    await expect(chips(page)).toHaveCount(0);
    await t(page, "cal-new").click();
    await d.getByPlaceholder("Event title").fill("Standup");
    await expect(t(page, "ev-submit")).toBeEnabled();
    await t(page, "ev-allday").uncheck();
    await t(page, "ev-time").fill("09:30");
    await t(page, "ev-color-Sky").click();
    await t(page, "ev-notes").fill("room 4");
    await t(page, "ev-submit").click();
    await expect(d).toHaveCount(0);
    await expect(chips(page)).toHaveCount(1);
    await expect(chips(page).first()).toContainText("09:30");
    await expect(chips(page).first()).toContainText("Standup");
    await expect(chips(page).first()).toHaveAttribute("data-color", "Sky");
    await expect(chips(page).first()).toHaveAttribute("data-date", "2026-09-15");
    await expect(cell(page, "2026-09-15").getByTestId("cal-chip")).toHaveCount(1);
  });

  test("S-914 날짜 칸 더블클릭 → 그 날짜로 New 대화상자 (노드 맞춤 이동은 일어나지 않는다)", async ({ page }) => {
    await seed(page, [CAL()]);
    const b0 = (await page.locator('[data-node-id="k1"]').boundingBox())!;
    await cell(page, "2026-09-20").dblclick();
    await expect(dialog(page)).toBeVisible();
    await expect(t(page, "ev-date")).toHaveValue("2026-09-20");
    await dialog(page).getByPlaceholder("Event title").fill("Party");
    await page.keyboard.press("Escape"); // Esc = Cancel
    await expect(dialog(page)).toHaveCount(0);
    await expect(chips(page)).toHaveCount(0);
    const b1 = (await page.locator('[data-node-id="k1"]').boundingBox())!;
    expect(Math.round(b1.width)).toBe(Math.round(b0.width));
    expect(Math.round(b1.x)).toBe(Math.round(b0.x));
  });

  test("S-915 한 칸에 3개까지 보이고 넘치면 +N, 누르면 그날 목록 팝오버", async ({ page }) => {
    const five = ["a", "b", "c", "d", "e"].map((i) => ev(i, "2026-09-10"));
    await seed(page, [CAL(five)]);
    await expect(cell(page, "2026-09-10").getByTestId("cal-chip")).toHaveCount(3);
    await expect(cell(page, "2026-09-10").getByTestId("cal-more")).toHaveText("+2");
    await expect(cell(page, "2026-09-11").getByTestId("cal-more")).toHaveCount(0);
    await cell(page, "2026-09-10").getByTestId("cal-more").click();
    const pop = t(page, "cal-day-pop");
    await expect(pop).toBeVisible();
    await expect(pop.getByText(/^Ev /)).toHaveCount(5);
    await page.keyboard.press("Escape");
    await expect(pop).toHaveCount(0);
  });

  test("S-916 칩을 끌어 다른 날짜 칸에 놓으면 날짜만 바뀌고 시간·색은 유지, 3px 미만은 클릭(이동 없음)", async ({ page }) => {
    await seed(page, [CAL([ev("a", "2026-09-15", { allDay: false, time: "14:30", color: "Teal" })])]);
    const c = chip(page, "a");
    const b = (await c.boundingBox())!;
    const target = (await cell(page, "2026-09-22").boundingBox())!;
    await page.mouse.move(b.x + 20, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 22, b.y + b.height / 2); // 2px = 클릭
    await page.mouse.up();
    await expect(c).toHaveAttribute("data-date", "2026-09-15");
    await page.mouse.move(b.x + 20, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
    await expect(cell(page, "2026-09-22")).toHaveAttribute("data-drop", "true"); // 놓을 칸 강조
    await page.mouse.up();
    await expect(chip(page, "a")).toHaveAttribute("data-date", "2026-09-22");
    await expect(chip(page, "a")).toHaveAttribute("data-time", "14:30");
    await expect(chip(page, "a")).toHaveAttribute("data-color", "Teal");
    await expect(cell(page, "2026-09-22").getByTestId("cal-chip")).toHaveCount(1);
    await expect(cell(page, "2026-09-22")).not.toHaveAttribute("data-drop", "true");
    await page.keyboard.press("Control+z");
    await expect(chip(page, "a")).toHaveAttribute("data-date", "2026-09-15");
  });

  test("S-917 칩 우클릭 메뉴: Edit(Save)·Duplicate·Color·Delete, Delete 는 묻지 않고 Ctrl+Z 로 돌아온다", async ({ page }) => {
    await seed(page, [CAL([ev("a", "2026-09-15", { color: "Amber" })])]);
    await chip(page, "a").click({ button: "right" });
    const menu = t(page, "cal-event-menu");
    await expect(menu).toHaveAttribute("role", "menu");
    await expect(menu.getByRole("menuitem")).toHaveCount(4);
    for (const m of ["Edit", "Duplicate", "Color", "Delete"]) await expect(menuitem(page, m)).toBeVisible();
    await menuitem(page, "Edit").click();
    await expect(dialog(page).getByPlaceholder("Event title")).toHaveValue("Ev a");
    await expect(t(page, "ev-submit")).toHaveText("Save");
    await dialog(page).getByPlaceholder("Event title").fill("Renamed");
    await t(page, "ev-submit").click();
    await expect(chip(page, "a")).toContainText("Renamed");
    await chip(page, "a").click({ button: "right" });
    await menuitem(page, "Duplicate").click();
    await expect(chips(page)).toHaveCount(2);
    await expect(chips(page).filter({ hasText: "Renamed" })).toHaveCount(2);
    await expect(cell(page, "2026-09-15").getByTestId("cal-chip")).toHaveCount(2);
    await chip(page, "a").click({ button: "right" });
    await menuitem(page, "Color").click();
    for (const c of ["Amber", "Sage", "Sky", "Violet", "Rose", "Teal"]) await expect(menuitem(page, c)).toBeVisible();
    await menuitem(page, "Rose").click();
    await expect(chip(page, "a")).toHaveAttribute("data-color", "Rose");
    await chip(page, "a").click({ button: "right" });
    await menuitem(page, "Delete").click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(chips(page)).toHaveCount(1);
    await page.keyboard.press("Control+z");
    await expect(chips(page)).toHaveCount(2);
  });

  test("S-919 크기 조절은 최소 420×360, 칸은 노드 크기에 따라 늘어난다", async ({ page }) => {
    await seed(page, [CAL()]);
    const node = page.locator('[data-node-id="k1"]');
    const b0 = (await node.boundingBox())!;
    const w0 = (await cell(page, "2026-09-15").boundingBox())!.width;
    await page.mouse.click(b0.x + 40, b0.y + 12); // 머리줄 클릭으로 선택해야 핸들이 보인다
    const hb = (await node.locator('[data-handle="se"]').boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down(); await page.mouse.move(b0.x + b0.width + 140, b0.y + b0.height + 40, { steps: 8 }); await page.mouse.up();
    expect((await cell(page, "2026-09-15").boundingBox())!.width).toBeGreaterThan(w0 + 15);
    const b1 = (await node.boundingBox())!;
    const hb2 = (await node.locator('[data-handle="se"]').boundingBox())!;
    await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2);
    await page.mouse.down(); await page.mouse.move(b1.x + 50, b1.y + 50, { steps: 8 }); await page.mouse.up();
    const b2 = (await node.boundingBox())!;
    expect([Math.round(b2.width), Math.round(b2.height)]).toEqual([420, 360]);
  });

  test("S-815 저장·복원 왕복: 이벤트와 보는 달이 다시 열어도 같다", async ({ page, browser }) => {
    await seed(page, [CAL([ev("a", "2026-09-15", { allDay: false, time: "10:00", color: "Violet", notes: "hi" })])]);
    await t(page, "cal-new").click();
    await dialog(page).getByPlaceholder("Event title").fill("Round trip");
    await t(page, "ev-submit").click();
    await t(page, "cal-next").click();
    await expect.poll(async () => { const c = (await savedNodes(page))?.find((x) => x.kind === "calendar"); return `${c?.month}:${(c?.events as unknown[] | undefined)?.length}`; }, { timeout: 10_000 }).toBe("10:2");
    const json = await page.evaluate(async () => (await (window as any).__shell.saved("ws-fake")) as string);
    const p2 = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
    await seed(p2, [], json);
    await expect(t(p2, "cal-title")).toHaveText("October 2026");
    await t(p2, "cal-prev").click();
    await expect(chips(p2)).toHaveCount(2);
    await expect(chip(p2, "a")).toHaveAttribute("data-color", "Violet");
    await expect(chip(p2, "a")).toHaveAttribute("data-time", "10:00");
    await expect(chips(p2).filter({ hasText: "Round trip" })).toHaveCount(1);
    const c2 = (await savedNodes(p2))!.find((x) => x.kind === "calendar")!;
    expect((c2.events as { id: string; notes: string }[]).find((e) => e.id === "a")?.notes).toBe("hi");
  });
});
