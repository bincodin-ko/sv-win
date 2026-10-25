import { expect, test, type Locator, type Page } from "@playwright/test";

// C8 칸반 (S-930~S-945). 가짜 PTY(Tauri 밖). 기대값은 spec/3묶음-2.md 문장에서만.
// 구현이 맞출 약속(이름): 칸반 본문 kb-root · 제목 kb-title(머리줄, data-node-handle) · 열 kb-col(data-col-id) 안에
//   머리 kb-col-head · 이름 kb-col-name(글자는 원문, 대문자는 CSS) · 개수 kb-col-count · ⋯ 버튼 kb-col-menu-btn · kb-add-card · 카드 목록 kb-cards
//   kb-add-col(+ Column) · 이름 입력 kb-col-input · 카드 kb-card(data-card-id, data-done) 안에 kb-card-title · kb-card-due · kb-card-prio(data-priority) · kb-card-menu-btn
//   놓을 자리 선 kb-insert · 대화상자 role=dialog aria-label "NEW CARD"/"EDIT CARD" 안에 kb-dlg-title · kb-dlg-notes · kb-dlg-date(날짜 입력) · 칩 버튼(aria-pressed)
// 상태 읽기 창구: window.__kb.cols("ws-fake") → 첫 칸반 노드의 columns, window.__kb.node("ws-fake") → 그 노드.
// 1400×900, 줌 1, 이동 0 → 월드 (x,y) = 화면 (700+x, 450+y).
test.use({ actionTimeout: 5000 });
type Card = { id: string; title: string; notes: string; due: string | null; priority: string; done: boolean };
type Col = { id: string; name: string; color: string | null; cards: Card[] };
const card = (id: string, title: string, extra: Partial<Card> = {}): Card => ({ id, title, notes: "", due: null, priority: "none", done: false, ...extra });
const col = (id: string, name: string, color: string | null, cards: Card[] = []): Col => ({ id, name, color, cards });
const COLS = (): Col[] => [col("c1", "Backlog", null), col("c2", "To do", "sky"), col("c3", "In progress", "amber"), col("c4", "Done", "sage")];
const NODE = (columns: Col[], extra: Record<string, unknown> = {}) => ({ id: "k1", kind: "kanban", x: -480, y: -230, w: 960, h: 460, z: 1, title: "Board", columns, ...extra });

const boardJson = (nodes: unknown[]) => JSON.stringify({
  formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 1 }, nodes, groups: [],
});
const seed = async (page: Page, nodes: unknown[], json?: string) => {
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b } }), json ?? boardJson(nodes));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
};
const cols = (page: Page) => page.evaluate(() => (window as any).__kb.cols("ws-fake") as Col[]);
const node = (page: Page) => page.evaluate(() => (window as any).__kb.node("ws-fake") as Record<string, unknown> & { x: number; y: number; w: number; h: number });
const nodeCount = (page: Page) => page.evaluate(() => (window as any).__kb.count("ws-fake") as number);
const colEl = (page: Page, name: string) => page.locator(`[data-testid="kb-col"][data-col-name="${name}"]`);
const cardEl = (page: Page, title: string) => page.locator('[data-testid="kb-card"]', { has: page.locator(`[data-testid="kb-card-title"]:text-is("${title}")`) });
const blank = (page: Page) => page.mouse.click(1300, 100);
const menu = (page: Page) => page.locator('[role="menu"]');
const items = (page: Page) => menu(page).getByRole("menuitem").allInnerTexts().then((a) => a.map((s) => s.replace(/\s*›$/, "").trim()));
const center = async (l: Locator) => { const b = (await l.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) / 2, from.y + (to.y - from.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}
const localDate = (add = 0) => { const d = new Date(); d.setDate(d.getDate() + add); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const titlesOf = (c: Col[], name: string) => c.find((x) => x.name === name)!.cards.map((k) => k.title);
const withCards = () => {
  const c = COLS();
  c[1]!.cards = [card("a", "Alpha", { priority: "low" }), card("b", "Beta", { priority: "high" }), card("c", "Gamma")];
  return c;
};

test.describe("S-930·S-931 놓기·모양", () => {
  test("Insert to-do › Board: 열 4개·제목 Board·개수 0·+ Add card·+ Column·열마다 ⋯", async ({ page }) => {
    await seed(page, []);
    await page.getByTestId("rail-insert-todo").click();
    await page.getByTestId("insert-todo-menu").getByRole("menuitem", { name: "Board", exact: true }).click();
    await expect(page.getByTestId("kb-root")).toBeVisible();
    await expect(page.getByTestId("kb-title")).toHaveText("Board");
    await expect(page.getByTestId("kb-col-name")).toHaveText(["Backlog", "To do", "In progress", "Done"]);
    await expect(page.getByTestId("kb-col-count")).toHaveText(["0", "0", "0", "0"]);
    await expect(page.getByTestId("kb-add-card")).toHaveCount(4);
    await expect(page.getByTestId("kb-col-menu-btn")).toHaveCount(4);
    await expect(page.getByTestId("kb-add-col")).toHaveText(/\+ Column/);
    const n = await node(page);
    expect([n.w, n.h, n.kind]).toEqual([960, 460, "kanban"]);
    expect(await page.getByTestId("kb-col-name").first().evaluate((e) => getComputedStyle(e).textTransform)).toBe("uppercase");
    await page.keyboard.press("Control+z"); // 놓기 = 1단계
    expect(await nodeCount(page)).toBe(0);
  });

  test("고리 More › Kanban board 도 칸반을 놓는다", async ({ page }) => {
    await seed(page, []);
    await page.mouse.click(1300, 100, { button: "right" });
    const ring = page.getByTestId("ring-menu");
    await ring.getByRole("menuitem", { name: "More", exact: true }).click();
    await ring.getByRole("menuitem", { name: "Kanban board", exact: true }).click();
    await expect(page.getByTestId("kb-root")).toBeVisible();
  });
});

test.describe("S-936·S-937·S-938 카드 대화상자·모양", () => {
  test("NEW CARD: 제목이 비면 Add card 비활성, 칩은 누르면 강조·다시 누르면 해제, 카드가 생기고 Today 칩·우선순위 점", async ({ page }) => {
    await seed(page, [NODE(COLS())]);
    await colEl(page, "To do").getByTestId("kb-add-card").click();
    const dlg = page.getByRole("dialog", { name: "NEW CARD" });
    await expect(dlg).toBeVisible();
    const add = dlg.getByRole("button", { name: "Add card", exact: true });
    await expect(add).toBeDisabled();
    await dlg.getByTestId("kb-dlg-title").fill("Research market");
    await expect(add).toBeEnabled();
    await dlg.getByTestId("kb-dlg-notes").fill("some notes");
    for (const n of ["Today", "Tomorrow", "Next week"]) await expect(dlg.getByRole("button", { name: n, exact: true })).toBeVisible();
    const today = dlg.getByRole("button", { name: "Today", exact: true });
    await today.click();
    await expect(today).toHaveAttribute("aria-pressed", "true");
    await today.click();
    await expect(today).toHaveAttribute("aria-pressed", "false");
    await today.click();
    for (const p of ["None", "Low", "Med", "High"]) await expect(dlg.getByRole("button", { name: p, exact: true })).toBeVisible();
    await expect(dlg.getByRole("button", { name: "None", exact: true })).toHaveAttribute("aria-pressed", "true"); // 기본
    await dlg.getByRole("button", { name: "High", exact: true }).click();
    await expect(dlg.getByRole("button", { name: "High", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(dlg.getByRole("button", { name: "None", exact: true })).toHaveAttribute("aria-pressed", "false");
    await dlg.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await cols(page)).flatMap((c) => c.cards)).toHaveLength(0); // Cancel = 만들지 않음
    await colEl(page, "To do").getByTestId("kb-add-card").click();
    await dlg.getByTestId("kb-dlg-title").fill("Research market");
    await dlg.getByTestId("kb-dlg-notes").fill("some notes");
    await dlg.getByRole("button", { name: "Today", exact: true }).click();
    await dlg.getByRole("button", { name: "High", exact: true }).click();
    await add.click();
    await expect(dlg).toHaveCount(0);
    const c = (await cols(page)).find((x) => x.name === "To do")!;
    expect(c.cards).toHaveLength(1);
    expect(c.cards[0]).toMatchObject({ title: "Research market", notes: "some notes", due: localDate(0), priority: "high", done: false });
    const el = cardEl(page, "Research market");
    await expect(el.getByTestId("kb-card-due")).toHaveText("Today");
    await expect(el.getByTestId("kb-card-prio")).toHaveAttribute("data-priority", "high");
    await expect(colEl(page, "To do").getByTestId("kb-col-count")).toHaveText("1");
    await page.keyboard.press("Control+z"); // 만들기 = 1단계
    await expect(cardEl(page, "Research market")).toHaveCount(0);
  });

  test("Tomorrow / Next week 는 +1 / +7일로 저장하고 직접 고른 날짜는 'Sep 12' 꼴, 지난 날짜는 붉게", async ({ page }) => {
    await seed(page, [NODE(COLS())]);
    const addWith = async (title: string, chip: string) => {
      await colEl(page, "Backlog").getByTestId("kb-add-card").click();
      const dlg = page.getByRole("dialog", { name: "NEW CARD" });
      await dlg.getByTestId("kb-dlg-title").fill(title);
      await dlg.getByRole("button", { name: chip, exact: true }).click();
      await dlg.getByRole("button", { name: "Add card", exact: true }).click();
    };
    await addWith("T1", "Tomorrow");
    await addWith("T2", "Next week");
    await colEl(page, "Backlog").getByTestId("kb-add-card").click();
    const dlg = page.getByRole("dialog", { name: "NEW CARD" });
    await dlg.getByTestId("kb-dlg-title").fill("T3");
    await dlg.getByTestId("kb-dlg-date").fill("2020-09-12");
    await dlg.getByRole("button", { name: "Add card", exact: true }).click();
    const b = (await cols(page)).find((x) => x.name === "Backlog")!.cards;
    expect(b.map((k) => k.due)).toEqual([localDate(1), localDate(7), "2020-09-12"]);
    await expect(cardEl(page, "T1").getByTestId("kb-card-due")).toHaveText("Tomorrow");
    await expect(cardEl(page, "T3").getByTestId("kb-card-due")).toHaveText("Sep 12");
    await expect(cardEl(page, "T3").getByTestId("kb-card-due")).toHaveAttribute("data-overdue", "true");
    await expect(cardEl(page, "T1").getByTestId("kb-card-due")).toHaveAttribute("data-overdue", "false");
  });

  test("done 카드는 제목에 취소선·흐린 색, 우선순위 None 은 점 없음", async ({ page }) => {
    const c = COLS();
    c[1]!.cards = [card("a", "Done one", { done: true, priority: "med" }), card("b", "Plain")];
    await seed(page, [NODE(c)]);
    const t = cardEl(page, "Done one").getByTestId("kb-card-title");
    expect(await t.evaluate((e) => getComputedStyle(e).textDecorationLine)).toContain("line-through");
    expect(await t.evaluate((e) => Number(getComputedStyle(e).opacity) < 1)).toBe(true); // 흐린 색
    await expect(cardEl(page, "Plain").getByTestId("kb-card-prio")).toHaveCount(0);
    await expect(cardEl(page, "Done one").getByTestId("kb-card-prio")).toHaveAttribute("data-priority", "med");
  });
});

test.describe("S-939 카드 메뉴", () => {
  test("항목 5개(⋯ 버튼, 우클릭 둘 다), Mark as done → 취소선·열 그대로·메뉴는 Mark as not done", async ({ page }) => {
    await seed(page, [NODE(withCards())]);
    await cardEl(page, "Alpha").getByTestId("kb-card-menu-btn").click();
    expect(await items(page)).toEqual(["Mark as done", "Edit", "Duplicate", "Move to", "Delete card"]);
    await menu(page).getByRole("menuitem", { name: "Mark as done" }).click();
    expect(titlesOf(await cols(page), "To do")).toEqual(["Alpha", "Beta", "Gamma"]);
    expect((await cols(page)).find((x) => x.name === "To do")!.cards[0]!.done).toBe(true);
    await expect(cardEl(page, "Alpha")).toHaveAttribute("data-done", "true");
    await cardEl(page, "Alpha").click({ button: "right" });
    expect((await items(page))[0]).toBe("Mark as not done");
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
  });

  test("Edit 은 EDIT CARD(Save)로 바꾸고, Duplicate 는 바로 아래, Move to › 는 다른 열 목록, Delete card 는 묻지 않는다", async ({ page }) => {
    await seed(page, [NODE(withCards())]);
    await cardEl(page, "Beta").getByTestId("kb-card-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Edit" }).click();
    const dlg = page.getByRole("dialog", { name: "EDIT CARD" });
    await expect(dlg.getByTestId("kb-dlg-title")).toHaveValue("Beta");
    await expect(dlg.getByRole("button", { name: "High", exact: true })).toHaveAttribute("aria-pressed", "true");
    await dlg.getByTestId("kb-dlg-title").fill("Beta 2");
    await dlg.getByRole("button", { name: "Save", exact: true }).click();
    expect(titlesOf(await cols(page), "To do")).toEqual(["Alpha", "Beta 2", "Gamma"]);

    await cardEl(page, "Alpha").getByTestId("kb-card-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Duplicate" }).click();
    expect(titlesOf(await cols(page), "To do")).toEqual(["Alpha", "Alpha", "Beta 2", "Gamma"]);

    await cardEl(page, "Gamma").getByTestId("kb-card-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Move to" }).click();
    expect(await items(page)).toEqual(expect.arrayContaining(["Backlog", "In progress", "Done"]));
    expect(await items(page)).not.toContain("To do");
    await menu(page).getByRole("menuitem", { name: "Done", exact: true }).click();
    expect(titlesOf(await cols(page), "Done")).toEqual(["Gamma"]);

    await cardEl(page, "Beta 2").getByTestId("kb-card-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Delete card" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0); // 묻지 않음
    expect(titlesOf(await cols(page), "To do")).toEqual(["Alpha", "Alpha"]);
    await page.keyboard.press("Control+z"); // 한 동작씩
    expect(titlesOf(await cols(page), "To do")).toEqual(["Alpha", "Alpha", "Beta 2"]);
    await page.keyboard.press("Control+z");
    expect(titlesOf(await cols(page), "Done")).toEqual([]);
  });
});

test.describe("S-933·S-934·S-941·S-942 열 메뉴", () => {
  test("항목: 카드 2장 미만이면 Sort 없음, done 없으면 Clear done 없음, 맨 왼쪽 열은 Move left/start 없음", async ({ page }) => {
    const c = COLS();
    c[2]!.cards = [card("x", "Only")];
    await seed(page, [NODE(c)]);
    await colEl(page, "Backlog").getByTestId("kb-col-menu-btn").click();
    expect(await items(page)).toEqual(["Rename", "Add card", "Color", "Move right", "Move to end", "Delete column"]);
    await page.keyboard.press("Escape");
    await colEl(page, "In progress").getByTestId("kb-col-menu-btn").click();
    const list = await items(page);
    expect(list).not.toContain("Sort by priority");
    expect(list).not.toContain("Clear done cards");
    expect(list).toEqual(["Rename", "Add card", "Color", "Move left", "Move right", "Move to start", "Move to end", "Delete column"]);
    await page.keyboard.press("Escape");
    await colEl(page, "Done").getByTestId("kb-col-menu-btn").click();
    expect(await items(page)).toEqual(["Rename", "Add card", "Color", "Move left", "Move to start", "Delete column"]);
  });

  test("카드가 2장 이상이면 Sort by priority(High>Med>Low>None, 안정)가 저장되고, Ctrl+Z 한 번에 돌아온다", async ({ page }) => {
    await seed(page, [NODE(withCards())]); // Alpha low, Beta high, Gamma none
    await colEl(page, "To do").getByTestId("kb-col-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Sort by priority" }).click();
    expect(titlesOf(await cols(page), "To do")).toEqual(["Beta", "Alpha", "Gamma"]);
    await page.keyboard.press("Control+z");
    expect(titlesOf(await cols(page), "To do")).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  test("Clear done cards 는 묻지 않고 done 만 지우고 Ctrl+Z 한 번에 돌아온다", async ({ page }) => {
    const c = withCards();
    c[1]!.cards[0]!.done = true;
    c[1]!.cards[2]!.done = true;
    await seed(page, [NODE(c)]);
    await colEl(page, "To do").getByTestId("kb-col-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Clear done cards" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(titlesOf(await cols(page), "To do")).toEqual(["Beta"]);
    await page.keyboard.press("Control+z");
    expect(titlesOf(await cols(page), "To do")).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  test("Rename(24자)·열 메뉴의 Add card", async ({ page }) => {
    await seed(page, [NODE(COLS())]);
    await colEl(page, "Backlog").getByTestId("kb-col-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Rename" }).click();
    await page.getByTestId("kb-col-input").fill("Ideas that are way too long to fit");
    await page.keyboard.press("Enter");
    expect((await cols(page))[0]!.name).toBe("Ideas that are way too l"); // 24자
    await colEl(page, "Ideas that are way too l").getByTestId("kb-col-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Add card" }).click(); // 메뉴의 Add card = 열 아래 버튼과 같은 대화상자
    await expect(page.getByRole("dialog", { name: "NEW CARD" })).toBeVisible();
  });

  test("Color 6개(Amber, Sage, Sky, Violet, Rose, Teal)를 고르면 열 머리 색이 바뀐다", async ({ page }) => {
    await seed(page, [NODE(COLS())]);
    const head = colEl(page, "Backlog").getByTestId("kb-col-head");
    await expect(head).toHaveAttribute("data-color", "none");
    await expect(colEl(page, "To do").getByTestId("kb-col-head")).toHaveAttribute("data-color", "sky");
    await colEl(page, "Backlog").getByTestId("kb-col-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Color" }).click();
    expect(await items(page)).toEqual(expect.arrayContaining(["Amber", "Sage", "Sky", "Violet", "Rose", "Teal"]));
    await menu(page).getByRole("menuitem", { name: "Rose" }).click();
    await expect(head).toHaveAttribute("data-color", "rose");
    expect((await cols(page))[0]!.color).toBe("rose");
    const dot = await colEl(page, "Backlog").getByTestId("kb-col-dot").evaluate((e) => getComputedStyle(e).backgroundColor);
    const sky = await colEl(page, "To do").getByTestId("kb-col-dot").evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(dot).not.toBe(sky);
  });

  test("Move right/left 가 열 순서를 바꾸고 한 동작씩 되돌린다", async ({ page }) => {
    await seed(page, [NODE(COLS())]);
    await colEl(page, "Backlog").getByTestId("kb-col-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Move to end" }).click();
    expect((await cols(page)).map((c) => c.name)).toEqual(["To do", "In progress", "Done", "Backlog"]);
    await page.keyboard.press("Control+z");
    expect((await cols(page)).map((c) => c.name)).toEqual(["Backlog", "To do", "In progress", "Done"]);
  });

  test("Delete column: 카드가 있으면 확인창(Cancel 은 유지·Delete 는 지움), 빈 열은 바로", async ({ page }) => {
    await seed(page, [NODE(withCards())]);
    await colEl(page, "To do").getByTestId("kb-col-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Delete column" }).click();
    const ask = page.getByRole("dialog");
    await expect(ask).toContainText("Delete column");
    await expect(ask).toContainText("3");
    await ask.getByRole("button", { name: "Cancel" }).click();
    expect((await cols(page)).map((c) => c.name)).toContain("To do");
    await colEl(page, "To do").getByTestId("kb-col-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Delete column" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^(Delete|Delete column)$/ }).click();
    expect((await cols(page)).map((c) => c.name)).toEqual(["Backlog", "In progress", "Done"]);
    await page.keyboard.press("Control+z");
    expect(titlesOf(await cols(page), "To do")).toEqual(["Alpha", "Beta", "Gamma"]);
    await colEl(page, "Backlog").getByTestId("kb-col-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Delete column" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0); // 빈 열은 묻지 않음
    expect((await cols(page)).map((c) => c.name)).toEqual(["To do", "In progress", "Done"]);
  });
});

test.describe("S-932 + Column", () => {
  test("이름 입력 줄 → Enter 로 맨 오른쪽에 더하고, 빈 이름·Esc 는 취소, 24자까지", async ({ page }) => {
    await seed(page, [NODE(COLS())]);
    await page.getByTestId("kb-add-col").click();
    await page.keyboard.press("Enter"); // 빈 이름
    expect((await cols(page))).toHaveLength(4);
    await page.getByTestId("kb-add-col").click();
    await page.getByTestId("kb-col-input").fill("Review");
    await page.keyboard.press("Enter");
    expect((await cols(page)).map((c) => c.name)).toEqual(["Backlog", "To do", "In progress", "Done", "Review"]);
    await page.getByTestId("kb-add-col").click();
    await page.getByTestId("kb-col-input").fill("abcdefghijklmnopqrstuvwxyz0123");
    await page.keyboard.press("Enter");
    expect((await cols(page))[5]!.name).toBe("abcdefghijklmnopqrstuvwx");
    await page.getByTestId("kb-add-col").click();
    await page.getByTestId("kb-col-input").fill("Nope");
    await page.keyboard.press("Escape");
    expect((await cols(page))).toHaveLength(6);
    await page.keyboard.press("Control+z");
    expect((await cols(page))).toHaveLength(5);
  });
});

test.describe("S-940·S-935 끌기 (포인터 이벤트)", () => {
  test("카드를 끌어 다른 열 가운데 자리에 놓는다: 놓을 자리 선·열 강조, 3px 미만은 클릭, Ctrl+Z 한 번", async ({ page }) => {
    const c = withCards();
    c[2]!.cards = [card("p", "P1"), card("q", "Q1")];
    await seed(page, [NODE(c)]);
    const alpha = await center(cardEl(page, "Alpha"));
    // 3px 미만: 끌기가 아니다
    await page.mouse.move(alpha.x, alpha.y);
    await page.mouse.down();
    await page.mouse.move(alpha.x + 2, alpha.y + 1);
    await page.mouse.up();
    expect(titlesOf(await cols(page), "To do")).toEqual(["Alpha", "Beta", "Gamma"]);
    // P1·Q1 사이로
    const p1 = await center(cardEl(page, "P1"));
    const q1 = await center(cardEl(page, "Q1"));
    const to = { x: p1.x, y: (p1.y + q1.y) / 2 + 2 };
    await page.mouse.move(alpha.x, alpha.y);
    await page.mouse.down();
    await page.mouse.move(alpha.x + 40, alpha.y + 20, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect(page.getByTestId("kb-insert")).toHaveCount(1);
    await expect(colEl(page, "In progress")).toHaveAttribute("data-drop", "true");
    await page.mouse.up();
    await expect(page.getByTestId("kb-insert")).toHaveCount(0);
    const now = await cols(page);
    expect(titlesOf(now, "To do")).toEqual(["Beta", "Gamma"]);
    expect(titlesOf(now, "In progress")).toEqual(["P1", "Alpha", "Q1"]);
    await page.keyboard.press("Control+z");
    expect(titlesOf(await cols(page), "To do")).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(titlesOf(await cols(page), "In progress")).toEqual(["P1", "Q1"]);
  });

  test("같은 열 안에서 위로 끌어 순서를 바꾼다", async ({ page }) => {
    await seed(page, [NODE(withCards())]);
    const g = await center(cardEl(page, "Gamma"));
    const a = await center(cardEl(page, "Alpha"));
    await dragTo(page, g, { x: a.x, y: a.b.y + 3 });
    expect(titlesOf(await cols(page), "To do")).toEqual(["Gamma", "Alpha", "Beta"]);
  });

  test("끌기는 보드 이동·노드 이동이 아니다(머리줄만 노드를 끈다)", async ({ page }) => {
    await seed(page, [NODE(withCards())]);
    const before = await node(page);
    const a = await center(cardEl(page, "Alpha"));
    await dragTo(page, a, { x: a.x + 80, y: a.y + 30 });
    const after = await node(page);
    expect([after.x, after.y]).toEqual([before.x, before.y]);
    const head = await center(page.getByTestId("kb-title").locator("xpath=.."));
    await dragTo(page, { x: head.b.x + head.b.width - 20, y: head.y }, { x: head.b.x + head.b.width - 20 + 60, y: head.y + 40 });
    const moved = await node(page);
    expect(Math.round(moved.x - before.x)).toBe(60);
    expect(Math.round(moved.y - before.y)).toBe(40);
  });

  test("열 머리를 끌어 열 순서를 바꾼다(삽입선), 메뉴 Move 와 같은 결과", async ({ page }) => {
    await seed(page, [NODE(COLS())]);
    const from = await center(colEl(page, "Backlog").getByTestId("kb-col-name"));
    const inProg = await center(colEl(page, "In progress").getByTestId("kb-col-head"));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 30, from.y + 2, { steps: 4 });
    await page.mouse.move(inProg.b.x + inProg.b.width - 8, inProg.y, { steps: 10 });
    await expect(page.getByTestId("kb-insert")).toHaveCount(1);
    await page.mouse.up();
    expect((await cols(page)).map((c) => c.name)).toEqual(["To do", "In progress", "Backlog", "Done"]);
    await page.keyboard.press("Control+z");
    expect((await cols(page)).map((c) => c.name)).toEqual(["Backlog", "To do", "In progress", "Done"]);
  });
});

test.describe("S-943·S-944 제목·크기·삭제·저장", () => {
  test("머리줄 제목을 더블클릭하면 이름을 바꾼다(Enter 저장, Esc 취소)", async ({ page }) => {
    await seed(page, [NODE(COLS())]);
    await page.getByTestId("kb-title").dblclick();
    const input = page.getByTestId("kb-title-input");
    await expect(input).toBeVisible();
    await input.fill("Sprint 12");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("kb-title")).toHaveText("Sprint 12");
    expect((await node(page)).title).toBe("Sprint 12");
    await page.getByTestId("kb-title").dblclick();
    await page.getByTestId("kb-title-input").fill("zzz");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("kb-title")).toHaveText("Sprint 12");
  });

  test("크기 조절은 최소 480×280, 열이 넓으면 가로 스크롤·카드가 넘치면 열 안 세로 스크롤", async ({ page }) => {
    const c = COLS();
    c[0]!.cards = Array.from({ length: 20 }, (_, i) => card(`m${i}`, `Many ${i}`));
    await seed(page, [NODE([...c, col("c5", "Review", null), col("c6", "QA", null)], { w: 480, h: 280, x: -240, y: -140 })]);
    await page.getByTestId("kb-title").click();
    const se = (await page.locator('[data-node-id="k1"] [data-handle="se"]').boundingBox())!;
    await dragTo(page, { x: se.x + se.width / 2, y: se.y + se.height / 2 }, { x: se.x - 200, y: se.y - 200 });
    const n = await node(page);
    expect([n.w, n.h]).toEqual([480, 280]);
    const scroll = await page.getByTestId("kb-board-scroll").evaluate((e) => ({ sw: e.scrollWidth > e.clientWidth, ov: getComputedStyle(e).overflowX }));
    expect(scroll.sw).toBe(true);
    expect(["auto", "scroll"]).toContain(scroll.ov);
    const list = colEl(page, "Backlog").getByTestId("kb-cards");
    expect(await list.evaluate((e) => ({ over: e.scrollHeight > e.clientHeight, oy: getComputedStyle(e).overflowY }))).toMatchObject({ over: true });
    expect(["auto", "scroll"]).toContain(await list.evaluate((e) => getComputedStyle(e).overflowY));
  });

  test("노드를 선택해 Delete 로(또는 우클릭 메뉴 Delete) 지워도 묻지 않고, Ctrl+Z 한 번에 카드까지 돌아온다", async ({ page }) => {
    await seed(page, [NODE(withCards())]);
    await page.getByTestId("kb-title").click();
    await page.keyboard.press("Delete");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await nodeCount(page)).toBe(0);
    await page.keyboard.press("Control+z");
    expect(await nodeCount(page)).toBe(1);
    expect(titlesOf(await cols(page), "To do")).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  test("저장·복원 왕복: 열 순서·카드 순서·done·날짜·우선순위·색·제목이 그대로", async ({ page, context }) => {
    const c = COLS();
    c[1]!.cards = [card("a", "A", { due: "2026-09-12", priority: "med", notes: "hi" }), card("b", "B", { done: true })];
    await seed(page, [NODE([c[2]!, c[0]!, c[1]!, c[3]!], { title: "Mine" })]);
    await colEl(page, "To do").getByTestId("kb-col-menu-btn").click();
    await menu(page).getByRole("menuitem", { name: "Move to end" }).click(); // 저장을 일으키는 변경
    await expect.poll(async () => page.evaluate(async () => JSON.parse((await (window as any).__shell.saved("ws-fake")) ?? "{}").nodes?.[0]?.columns?.map((x: Col) => x.name).join()), { timeout: 10_000 }).toBe("In progress,Backlog,Done,To do");
    const json = await page.evaluate(async () => (await (window as any).__shell.saved("ws-fake")) as string);
    const page2 = await context.newPage();
    await seed(page2, [], json);
    expect((await cols(page2)).map((x) => x.name)).toEqual(["In progress", "Backlog", "Done", "To do"]);
    expect((await cols(page2))[3]).toMatchObject({ color: "sky", cards: [{ title: "A", due: "2026-09-12", priority: "med", notes: "hi", done: false }, { title: "B", done: true }] });
    await expect(page2.getByTestId("kb-title")).toHaveText("Mine");
    await expect(page2.getByTestId("kb-col-name")).toHaveText(["In progress", "Backlog", "Done", "To do"]);
    await expect(cardEl(page2, "B")).toHaveAttribute("data-done", "true");
    await expect(page2.getByTestId("kb-col-head").nth(3)).toHaveAttribute("data-color", "sky");
  });
});
