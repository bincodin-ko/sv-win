import { expect, test, type Page } from "@playwright/test";

// C13 코드·Markdown·탐색기 카드 (S-957~S-964). 가짜 PTY·가짜 파일(window.__fakeFiles, Tauri 밖). 1400×900, 줌 1, 월드 (x,y) = 화면 (700+x, 450+y).
// 약속한 이름(data-testid):
//   코드 카드  code-card · code-title(파일 이름) · code-copy(Copy 버튼) · code-line(줄 하나) · code-ln(줄 번호) · code-notice("Showing the first 5,000 lines …")
//              강조 글자 = <span class="tok-keyword|tok-string|tok-comment|tok-number">
//   Markdown   md-card · md-title · md-body · md-deleted("File deleted" + 경로)
//   탐색기     explorer-card · ex-file(data-path, data-selected) · ex-view(오른쪽 보기, 안에 code-line)
test.use({ actionTimeout: 5000 });
type N = Record<string, unknown> & { id: string; kind: string; x: number; y: number; w: number; h: number };
const n = (id: string, kind: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): N => ({ id, kind, x, y, w, h, z: 1, ...extra });
const CODE = (text: string, extra: Record<string, unknown> = {}) => n("c1", "code", -240, -180, 480, 360, { path: "C:/fake/repo/src/a.ts", name: "a.ts", text, ...extra }); // 화면 460..940 × 270..630
const MD = (path = "C:/fake/repo/README.md", extra: Record<string, unknown> = {}) => n("m1", "markdown", -240, -180, 480, 360, { path, name: "README.md", ...extra });
const EX = (files: string[], extra: Record<string, unknown> = {}) => n("e1", "explorer", -300, -200, 600, 400, { dir: "C:/fake/repo/src", name: "src", files, selected: files[0], ...extra });

const boardJson = (nodes: N[]) => JSON.stringify({
  formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" }, viewport: { x: 0, y: 0, zoom: 1 }, nodes, groups: [],
});
type Files = Record<string, { text?: string; stat?: { mtime?: number; size?: number } }>;
const init = ([b, f]: readonly [string, Files]) => { (window as any).__symSeed = { boards: { "ws-fake": b } }; (window as any).__fakeFiles = f; };
const open = async (page: Page, json: string, files: Files) => {
  await page.addInitScript(init, [json, files] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
};
const seed = (page: Page, nodes: N[], files: Files = {}) => open(page, boardJson(nodes), files);
/** 같은 컨텍스트의 새 탭에 저장된 노드 하나를 심어 연다(복원 왕복) */
const reopen = async (page: Page, node: N, files: Files = {}) => {
  const p2 = await page.context().newPage();
  await open(p2, boardJson([node]), files);
  return p2;
};
const t = (page: Page, id: string) => page.getByTestId(id);
const savedNode = async (page: Page, id: string) =>
  (await page.evaluate(async () => JSON.parse((await (window as any).__shell.saved("ws-fake")) ?? "{}").nodes as N[] | undefined))!.find((x) => x.id === id)!;
const setFile = (page: Page, p: string, f: unknown) => page.evaluate(([p, f]) => { (window as any).__fakeFiles[p] = f; }, [p, f] as const);
const delFile = (page: Page, p: string) => page.evaluate((p) => { delete (window as any).__fakeFiles[p]; }, p);
const many = (k: number) => Array.from({ length: k }, (_, i) => `line${i + 1}`).join("\n");
const SRC = "const a = 1;\n// hi\nreturn 'x';";
const touch = (page: Page, id: string) => page.locator(`[data-node-id="${id}"] [data-node-handle]`).click({ position: { x: 5, y: 5 } }); // 선택 → 저장 유도

test.describe("코드 카드", () => {
  test("S-957 머리에 파일 이름, 줄 번호 1..N, 강조 색 클래스(keyword·comment·string·number)", async ({ page }) => {
    await seed(page, [CODE(SRC)]);
    await expect(t(page, "code-title")).toHaveText("a.ts");
    await expect(t(page, "code-line")).toHaveCount(3);
    await expect(t(page, "code-ln")).toHaveText(["1", "2", "3"]);
    const card = t(page, "code-card");
    await expect(card.locator("span.tok-keyword").first()).toHaveText("const");
    await expect(card.locator("span.tok-number").first()).toHaveText("1");
    await expect(card.locator("span.tok-comment").first()).toContainText("// hi");
    await expect(card.locator("span.tok-string").first()).toContainText("'x'");
    const color = (sel: string) => card.locator(sel).first().evaluate((e) => getComputedStyle(e).color);
    const kw = await color("span.tok-keyword"), cm = await color("span.tok-comment"), st = await color("span.tok-string");
    expect(new Set([kw, cm, st]).size).toBe(3); // 색이 서로 다르다
    await expect(t(page, "code-notice")).toHaveCount(0);
  });

  test("S-957 Copy 는 카드의 글 전체를 클립보드에 넣는다", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seed(page, [CODE(SRC)]);
    await t(page, "code-copy").click();
    const got = await page.evaluate(() => navigator.clipboard.readText());
    expect(got.replace(/\r\n/g, "\n")).toBe(SRC); // Windows 클립보드는 줄바꿈을 CRLF 로 돌려준다
  });

  test("S-957 6,000줄 글은 5,000줄만 그리고 안내 문구를 보인다 / 5,000줄은 안내 없음", async ({ page }) => {
    await seed(page, [CODE(many(6000))]);
    await expect(t(page, "code-line")).toHaveCount(5000);
    await expect(t(page, "code-notice")).toContainText("Showing the first 5,000 lines");
    await expect(t(page, "code-ln").last()).toHaveText("5000");
    const p2 = await reopen(page, CODE(many(5000)));
    await expect(p2.getByTestId("code-line")).toHaveCount(5000);
    await expect(p2.getByTestId("code-notice")).toHaveCount(0);
  });

  test("S-958 truncated 로 저장된 글은 5,000줄이어도 안내가 있고, 안내에 Copy 범위가 적힌다", async ({ page }) => {
    await seed(page, [CODE(many(5000), { truncated: true })]);
    await expect(t(page, "code-notice")).toContainText("Showing the first 5,000 lines");
    await expect(t(page, "code-notice")).toContainText("Copy");
  });

  test("S-957 코드 카드는 놓은 뒤 파일이 바뀌어도 그대로다 (사본)", async ({ page }) => {
    await seed(page, [CODE(SRC)], { "C:/fake/repo/src/a.ts": { text: SRC } });
    await setFile(page, "C:/fake/repo/src/a.ts", { text: "changed();\n", stat: { mtime: 9 } });
    await page.waitForTimeout(2500);
    await expect(t(page, "code-line")).toHaveCount(3);
    await expect(t(page, "code-card")).not.toContainText("changed");
  });

  test("S-964 머리줄만 끌리고 본문은 안 끌린다, 선택하면 8핸들", async ({ page }) => {
    await seed(page, [CODE(SRC)]);
    const card = page.locator('[data-node-id="c1"]');
    const b0 = (await card.boundingBox())!;
    const drag = async (x: number, y: number, dx: number, dy: number) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 10 }); await page.mouse.up(); };
    await drag(b0.x + b0.width / 2, b0.y + b0.height / 2, 120, 60); // 본문
    const b1 = (await card.boundingBox())!;
    expect(Math.abs(b1.x - b0.x)).toBeLessThan(2);
    expect(Math.abs(b1.y - b0.y)).toBeLessThan(2);
    await drag(b0.x + b0.width / 2, b0.y + 12, 120, 60); // 머리줄 가운데(제목 오른쪽 빈 곳, Copy 버튼 아님)
    const b2 = (await card.boundingBox())!;
    expect(Math.abs(b2.x - b0.x - 120)).toBeLessThan(3);
    expect(Math.abs(b2.y - b0.y - 60)).toBeLessThan(3);
    await expect(card.locator("[data-handle]")).toHaveCount(8);
  });

  test("S-957·S-963 저장·복원 왕복: kind=code, text·name·path 가 저장되고 새로 열어도 같다", async ({ page }) => {
    await seed(page, [CODE(SRC)]);
    await touch(page, "c1");
    const s = await savedNode(page, "c1");
    expect(s).toMatchObject({ kind: "code", path: "C:/fake/repo/src/a.ts", name: "a.ts", text: SRC });
    const p2 = await reopen(page, s);
    await expect(p2.getByTestId("code-ln")).toHaveText(["1", "2", "3"]);
  });
});

const README = "# Title\n\nSome **bold** and `code`.\n\n- [x] done\n- [ ] todo\n\n| a | b |\n|---|--:|\n| 1 | 2 |\n\n```ts\nconst z = 1;\n```\n\n[site](https://example.com)\n";
const MDP = "C:/fake/repo/README.md";

test.describe("Markdown 카드", () => {
  test("S-960 제목·굵게·목록(체크)·표·코드 블록(강조)·링크가 그려진다", async ({ page }) => {
    await seed(page, [MD()], { [MDP]: { text: README } });
    const body = t(page, "md-body");
    await expect(t(page, "md-title")).toHaveText("README.md");
    await expect(body.locator("h1")).toHaveText("Title");
    await expect(body.locator("strong")).toHaveText("bold");
    await expect(body.locator("p code").first()).toHaveText("code");
    await expect(body.locator("li")).toHaveCount(2);
    await expect(body.locator('li input[type="checkbox"]')).toHaveCount(2);
    await expect(body.locator('li input[type="checkbox"]').first()).toBeChecked();
    await expect(body.locator("table th")).toHaveText(["a", "b"]);
    await expect(body.locator("table td")).toHaveText(["1", "2"]);
    expect(await body.locator("table td").nth(1).evaluate((e) => getComputedStyle(e).textAlign)).toBe("right");
    await expect(body.locator("pre span.tok-keyword").first()).toHaveText("const");
    await expect(body.locator("a")).toHaveText("site");
  });

  test("S-960 링크를 누르면 기본 브라우저 열기(http/https)를 부른다", async ({ page }) => {
    await seed(page, [MD()], { [MDP]: { text: README } });
    await page.evaluate(() => { (window as any).__fakeFsLog = []; });
    await t(page, "md-body").locator("a").click();
    expect(await page.evaluate(() => (window as any).__fakeFsLog)).toContain("url https://example.com");
  });

  test("S-959 파일이 바뀌면 1~2초 안에 갱신되고, 지워지면 File deleted 와 경로가 보인다", async ({ page }) => {
    await seed(page, [MD()], { [MDP]: { text: "# One\n" } });
    await expect(t(page, "md-body").locator("h1")).toHaveText("One");
    await setFile(page, MDP, { text: "# Two changed\n", stat: { mtime: 5 } });
    await expect(t(page, "md-body").locator("h1")).toHaveText("Two changed", { timeout: 3000 });
    await delFile(page, MDP);
    await expect(t(page, "md-deleted")).toContainText("File deleted", { timeout: 3000 });
    await expect(t(page, "md-deleted")).toContainText(MDP);
    await setFile(page, MDP, { text: "# Back\n", stat: { mtime: 7 } }); // 다시 생기면 돌아온다
    await expect(t(page, "md-body").locator("h1")).toHaveText("Back", { timeout: 3000 });
  });

  test("S-960 HTML(<script>)은 글자로 보이고 실행되지 않는다", async ({ page }) => {
    await seed(page, [MD()], { [MDP]: { text: '<script>window.__xss=1</script>\n\n<img src=x onerror="window.__xss=2">\n' } });
    await expect(t(page, "md-body")).toContainText("<script>window.__xss=1</script>");
    expect(await page.locator('[data-testid="md-body"] script, [data-testid="md-body"] img').count()).toBe(0);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });

  test("S-961 → S-1939 Open in Studio·PDF 버튼이 머리에 있다(repo 밖이면 Open in Studio 숨김, 지워졌으면 둘 다 비활성)", async ({ page }) => {
    await seed(page, [MD()], { [MDP]: { text: "# x\n" } });
    await expect(t(page, "md-title")).toBeVisible();
    await expect(t(page, "md-card").getByRole("button", { name: "Open in Studio" })).toBeEnabled();
    await expect(t(page, "md-card").getByRole("button", { name: "PDF" })).toBeEnabled();
    await expect(t(page, "md-card").getByRole("button")).toHaveCount(2);
    await delFile(page, MDP);
    await expect(t(page, "md-deleted")).toBeVisible({ timeout: 4000 });
    await expect(t(page, "md-card").getByRole("button", { name: "Open in Studio" })).toBeDisabled();
    await expect(t(page, "md-card").getByRole("button", { name: "PDF" })).toBeDisabled();
  });

  test("S-1939 repo 밖 파일의 카드에는 Open in Studio 가 없고 PDF 만 있다", async ({ page }) => {
    await seed(page, [MD("C:/elsewhere/x.md")], { "C:/elsewhere/x.md": { text: "# x\n" } });
    await expect(t(page, "md-title")).toBeVisible();
    await expect(t(page, "md-card").getByRole("button", { name: "Open in Studio" })).toHaveCount(0);
    await expect(t(page, "md-card").getByRole("button", { name: "PDF" })).toBeEnabled();
  });

  test("S-957·S-959 저장은 path 만(text 없음), 새로 열면 디스크에서 다시 그린다", async ({ page }) => {
    await seed(page, [MD()], { [MDP]: { text: "# Disk\n" } });
    await touch(page, "m1");
    const s = await savedNode(page, "m1");
    expect(s).toMatchObject({ kind: "markdown", path: MDP });
    expect(s.text).toBeUndefined();
    const p2 = await reopen(page, s, { [MDP]: { text: "# Disk2\n" } });
    await expect(p2.getByTestId("md-body").locator("h1")).toHaveText("Disk2");
  });
});

const DIR = "C:/fake/repo/src";
const fname = (i: number) => `${DIR}/f${String(i).padStart(2, "0")}.ts`;
const FILES: Files = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [fname(i), { text: `const file${i} = ${i};\n` }]));

test.describe("코드 탐색기 카드", () => {
  test("S-962 목록은 40개까지, 첫 파일이 선택된 채 시작하고 오른쪽에 강조 보기", async ({ page }) => {
    const names = Array.from({ length: 50 }, (_, i) => fname(i));
    await seed(page, [EX(names)], FILES);
    await expect(t(page, "ex-file")).toHaveCount(40);
    await expect(t(page, "ex-file").first()).toHaveAttribute("data-selected", "true");
    await expect(t(page, "ex-file").nth(1)).not.toHaveAttribute("data-selected", "true");
    await expect(t(page, "ex-file").first()).toHaveText("f00.ts");
    const view = t(page, "ex-view");
    await expect(view).toContainText("const file0 = 0;");
    await expect(view.locator("span.tok-keyword").first()).toHaveText("const");
    await expect(view.getByTestId("code-ln").first()).toHaveText("1");
  });

  test("S-962 파일을 누르면 보기가 바뀌고 선택이 저장·복원된다", async ({ page }) => {
    const names = Array.from({ length: 5 }, (_, i) => fname(i));
    await seed(page, [EX(names)], FILES);
    await t(page, "ex-file").nth(3).click();
    await expect(t(page, "ex-view")).toContainText("const file3 = 3;");
    await expect(t(page, "ex-file").nth(3)).toHaveAttribute("data-selected", "true");
    await expect(t(page, "ex-file").first()).not.toHaveAttribute("data-selected", "true");
    await expect.poll(async () => (await savedNode(page, "e1")).selected).toBe(fname(3)); // 자동 저장은 잠깐 뒤
    const s = await savedNode(page, "e1");
    expect(s).toMatchObject({ kind: "explorer", dir: DIR, selected: fname(3) });
    expect(s.files).toEqual(names);
    const p2 = await reopen(page, s, FILES);
    await expect(p2.getByTestId("ex-file").nth(3)).toHaveAttribute("data-selected", "true");
    await expect(p2.getByTestId("ex-view")).toContainText("const file3 = 3;");
  });
});

test.describe("FX7 S-1850 Markdown 카드 PDF 실패 안내", () => {
  test("PDF 만들기가 실패하면 카드에 문구가 뜬다", async ({ page }) => {
    await seed(page, [MD()], { [MDP]: { text: "# x\n" } });
    await page.evaluate(() => { const w = window as any; w.__fakeSavePath = "C:/fake/out.pdf"; w.__fakePdf = { error: "Microsoft Edge wasn't found." }; });
    await t(page, "md-pdf").click();
    await expect(t(page, "md-pdf-error")).toHaveText("Microsoft Edge wasn't found.");
    await expect(t(page, "md-pdf-error")).toHaveCount(0, { timeout: 8000 }); // 몇 초 뒤 사라진다
  });
});
