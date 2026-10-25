import { expect, test, type Page } from "@playwright/test";

// 5묶음 E4: Code 스튜디오 (S-1870~S-1889). 가짜 ipc: window.__fakeStudio(파일 글·mtime·초안), __fakeFiles(Add folder 의 dirFiles), __fakeFsLog(reveal·trash 기록).
// 약속한 data-testid: tree-<repo 안 상대 경로>(data-active), tree-plus, new-name, code-head, code-textarea, code-save, code-insert, code-add-folder,
// code-banner, find-bar, find-input, find-count. 큰 파일·바이너리·repo 밖 위치·인코딩 3종·mixed 줄 끝은 가짜가 못 만들어 vitest·cargo 가 맡는다.
test.use({ actionTimeout: 5000 });
const R = "C:/fake/repo";
const FILES: Record<string, string> = {
  [`${R}/README.md`]: "# Readme\nhello world\n",
  [`${R}/src/main.ts`]: "const hello = 1;\nconst Hello = 2;\n",
  [`${R}/src/util.ts`]: "export {};\n",
  [`${R}/zeta.txt`]: "z\n",
  [`${R}/node_modules/x/i.js`]: "skip\n",
  [`${R}/.git/config`]: "skip\n",
};
const boot = async (p: Page, files = FILES) => {
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.addInitScript(([f, r]) => {
    const w = window as any;
    w.__fakeStudio = { files: { ...f } };
    w.__fakeFiles = { [`${r}/src/a.ts`]: { text: "a" }, [`${r}/src/b.ts`]: { text: "b" }, [`${r}/src/deep/c.ts`]: { text: "c" } };
  }, [files, R] as const);
  await p.goto("/");
  await expect(p.getByTestId("command-bar")).toBeVisible();
};
const openCode = async (p: Page) => { await p.getByTestId("tools-btn").click(); await p.getByRole("menuitem", { name: "Code", exact: true }).click(); await expect(p.getByTestId("studio-frame")).toBeVisible(); };
const row = (p: Page, rel: string) => p.getByTestId(`tree-${rel}`);
const ta = (p: Page) => p.getByTestId("code-textarea");
const fake = (p: Page) => p.evaluate(() => (window as any).__fakeStudio);

test("S-1870·S-1871 Tools › Code 로 열면 README 먼저, 트리는 폴더 먼저·숨김 폴더 없음, 열린 줄 강조", async ({ page }) => {
  await boot(page);
  await openCode(page);
  await expect(page.getByTestId("studio-title")).toHaveText("Code — repo");
  await expect(ta(page)).toHaveValue("# Readme\nhello world\n");
  await expect(row(page, "README.md")).toHaveAttribute("data-active", "true");
  const names = await page.locator('[data-testid^="tree-"]:not([data-testid="tree-plus"])').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(names).toEqual(["tree-src", "tree-README.md", "tree-zeta.txt"]); // 폴더 먼저, node_modules·.git 없음
  await row(page, "src").click(); // 펼친다
  await expect(row(page, "src/main.ts")).toBeVisible();
  await expect(row(page, "src")).toHaveAttribute("aria-expanded", "true");
  await row(page, "src").click(); // 접는다
  await expect(row(page, "src/main.ts")).toHaveCount(0);
});

test("S-1875·S-1877·S-1879 파일 열기→편집→Save→Saved, 저장은 자동으로 안 된다, Tab 은 공백 2칸", async ({ page }) => {
  await boot(page);
  await openCode(page);
  await row(page, "src").click();
  await row(page, "src/main.ts").click();
  await expect(ta(page)).toHaveValue(FILES[`${R}/src/main.ts`]!);
  await expect(page.getByTestId("code-head")).toContainText("src/main.ts");
  await expect(page.getByTestId("code-head")).toContainText("ts");
  await expect(page.getByTestId("code-head")).toContainText("3 lines");
  await expect(page.getByTestId("code-save")).toBeDisabled();
  await ta(page).click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Tab");
  await expect(ta(page)).toHaveValue("  " + FILES[`${R}/src/main.ts`]!);
  await expect(page.getByTestId("code-save")).toBeEnabled();
  expect((await fake(page)).files[`${R}/src/main.ts`]).toBe(FILES[`${R}/src/main.ts`]); // 안 눌렀으니 디스크 그대로
  await page.getByTestId("code-save").click();
  await expect(page.getByTestId("code-save")).toHaveText("Saved");
  expect((await fake(page)).files[`${R}/src/main.ts`]).toBe("  " + FILES[`${R}/src/main.ts`]!);
  await expect(page.getByTestId("code-save")).toBeDisabled();
  await ta(page).pressSequentially("x");
  await page.keyboard.press("Control+s"); // Ctrl+S
  await expect.poll(async () => (await fake(page)).files[`${R}/src/main.ts`]).toContain("x");
});

test("S-1876 구문 강조 겹침 pre 가 있고 120,000자 넘으면 강조가 없다", async ({ page }) => {
  await boot(page, { ...FILES, [`${R}/big.ts`]: "const a = 1;\n".repeat(10_000), [`${R}/small.ts`]: "const a = 1;\n" });
  await openCode(page);
  await row(page, "small.ts").click();
  await expect(page.getByTestId("code-pre").locator("[class^='tok-']").first()).toBeVisible();
  await row(page, "big.ts").click();
  await expect(ta(page)).toHaveValue(/const a = 1;/);
  await expect(page.getByTestId("code-pre").locator("[class^='tok-']")).toHaveCount(0);
});

test("S-1878·S-1889 Ctrl+F 찾기: 개수·다음/이전·Esc 는 찾기만 닫고 한 번 더 누르면 스튜디오 닫힘", async ({ page }) => {
  await boot(page);
  await openCode(page);
  await row(page, "src").click();
  await row(page, "src/main.ts").click();
  await ta(page).click();
  await page.keyboard.press("Control+f");
  await expect(page.getByTestId("find-bar")).toBeVisible();
  await page.getByTestId("find-input").fill("HELLO");
  await expect(page.getByTestId("find-count")).toHaveText("1/2");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("find-count")).toHaveText("2/2");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("find-count")).toHaveText("1/2"); // 감긴다
  await page.keyboard.press("Shift+Enter");
  await expect(page.getByTestId("find-count")).toHaveText("2/2");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("find-bar")).toHaveCount(0);
  await expect(page.getByTestId("studio-frame")).toBeVisible();
  await expect(ta(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("studio-frame")).toHaveCount(0);
});

test("S-1880 고친 글은 500ms 쉬면 초안으로 남고, 저장하면 지워진다. 다시 열면 Recovered unsaved edits", async ({ page }) => {
  await boot(page);
  await openCode(page);
  await ta(page).click();
  await ta(page).pressSequentially("DRAFT");
  await expect.poll(async () => Object.keys((await fake(page)).drafts ?? {}).length, { timeout: 3000 }).toBe(1);
  // 앱이 꺼졌다 다시 열린 것처럼: 확인창에서 저장 안 하고 닫는 대신 초안만 남기고 새로 연다
  await page.evaluate(() => { (window as any).__draftKeep = JSON.stringify((window as any).__fakeStudio.drafts); });
  await page.getByTestId("studio-close").click();
  await page.getByTestId("unsaved-dialog").getByRole("button", { name: "Don't Save" }).click();
  await expect(page.getByTestId("studio-frame")).toHaveCount(0);
  expect(Object.keys((await fake(page)).drafts ?? {}).length).toBe(0); // 버리면 초안도 지운다
  await page.evaluate(() => { (window as any).__fakeStudio.drafts = JSON.parse((window as any).__draftKeep); });
  await openCode(page);
  await expect(page.getByTestId("code-banner")).toContainText("Recovered unsaved edits");
  await expect(ta(page)).toHaveValue(/DRAFT/);
  await page.getByTestId("code-banner").getByRole("button", { name: "Discard" }).click();
  await expect(ta(page)).toHaveValue("# Readme\nhello world\n");
  await expect(page.getByTestId("code-banner")).toHaveCount(0);
});

test("S-1882 디스크가 바뀌었으면 덮어쓰지 않고 띠: Keep mine 은 force, Reload 는 디스크 글", async ({ page }) => {
  await boot(page);
  await openCode(page);
  await ta(page).click();
  await ta(page).pressSequentially("MINE");
  await page.evaluate((p) => { const f = (window as any).__fakeStudio; f.files[p] = "ON DISK"; (f.mtimes ??= {})[p] = 12345; }, `${R}/README.md`);
  await page.getByTestId("code-save").click();
  await expect(page.getByTestId("code-banner")).toContainText("This file changed on disk.");
  expect((await fake(page)).files[`${R}/README.md`]).toBe("ON DISK");
  await page.getByTestId("code-banner").getByRole("button", { name: "Keep mine" }).click();
  await expect(page.getByTestId("code-banner")).toHaveCount(0);
  await page.getByTestId("code-save").click();
  await expect(page.getByTestId("code-save")).toHaveText("Saved");
  expect((await fake(page)).files[`${R}/README.md`]).toContain("MINE");
  // Reload
  await page.evaluate((p) => { const f = (window as any).__fakeStudio; f.files[p] = "NEWER"; f.mtimes[p] = 99999999999999; }, `${R}/README.md`);
  await ta(page).pressSequentially("again");
  await page.getByTestId("code-save").click();
  await page.getByTestId("code-banner").getByRole("button", { name: "Reload" }).click();
  await expect(ta(page)).toHaveValue("NEWER");
  await expect(page.getByTestId("code-save")).toBeDisabled();
});

test("S-1887 Insert: 저장 안 한 편집이 든 열린 파일이 읽기 전용 코드 카드로 보드에 놓이고 스튜디오가 닫힌다", async ({ page }) => {
  await boot(page);
  await openCode(page);
  await ta(page).click();
  await ta(page).pressSequentially("UNSAVED ");
  await page.getByTestId("code-insert").click();
  await expect(page.getByTestId("studio-frame")).toHaveCount(0);
  await expect(page.getByTestId("unsaved-dialog")).toHaveCount(0); // Insert 는 닫기 확인을 거치지 않는다(편집은 그대로 초안)
  await expect(page.getByTestId("code-card")).toBeVisible();
  await expect(page.getByTestId("code-title")).toHaveText("README.md");
  await expect(page.getByTestId("code-card")).toContainText("UNSAVED");
});

test("S-1888 Add folder: 지금 폴더의 파일이 탐색기 카드로 놓이고 스튜디오가 닫힌다(하위 폴더 파일 없음)", async ({ page }) => {
  await boot(page);
  await openCode(page);
  await row(page, "src").click(); // 선택한 폴더
  await page.getByTestId("code-add-folder").click();
  await expect(page.getByTestId("studio-frame")).toHaveCount(0);
  await expect(page.getByTestId("explorer-card")).toBeVisible();
  await expect(page.getByTestId("explorer-title")).toHaveText("src");
  await expect(page.getByTestId("ex-file")).toHaveCount(2);
});

test("S-1873 우클릭 메뉴: 폴더는 New file here·New folder here, 공통 Reveal in Explorer·Move to Recycle Bin(확인 먼저)", async ({ page }) => {
  await boot(page);
  await openCode(page);
  await row(page, "src").click({ button: "right" });
  await expect(page.getByRole("menuitem")).toHaveText(["New file here", "New folder here", "Reveal in Explorer", "Move to Recycle Bin"]);
  await page.getByRole("menuitem", { name: "Reveal in Explorer" }).click();
  expect(await page.evaluate(() => (window as any).__fakeFsLog)).toContain(`reveal ${R}/src`);
  await row(page, "src").click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file here" }).click();
  await page.getByTestId("new-name").fill("fresh.ts");
  await page.getByTestId("new-name").press("Enter");
  expect(Object.keys((await fake(page)).files)).toContain(`${R}/src/fresh.ts`);
  await expect(page.getByTestId("code-head")).toContainText("src/fresh.ts"); // 만든 파일은 바로 열린다
  // 파일 우클릭엔 New … 가 없다
  await row(page, "zeta.txt").click({ button: "right" });
  await expect(page.getByRole("menuitem")).toHaveText(["Reveal in Explorer", "Move to Recycle Bin"]);
  await page.getByRole("menuitem", { name: "Move to Recycle Bin" }).click();
  await expect(page.getByRole("dialog", { name: "Move zeta.txt to the Recycle Bin?" })).toBeVisible();
  expect((await page.evaluate(() => (window as any).__fakeFsLog)).filter((s: string) => s.startsWith("trash"))).toEqual([]); // 확인 전엔 안 보냄
  await page.getByRole("dialog", { name: "Move zeta.txt to the Recycle Bin?" }).getByRole("button", { name: "Move to Recycle Bin" }).click();
  expect(await page.evaluate(() => (window as any).__fakeFsLog)).toContain(`trash ${R}/zeta.txt`);
});

test("S-1874 + 메뉴: New file·New folder, 금지 글자·겹치는 이름은 거절", async ({ page }) => {
  await boot(page);
  await openCode(page);
  await page.getByTestId("tree-plus").click();
  await expect(page.getByRole("menuitem")).toHaveText(["New file", "New folder"]);
  await page.getByRole("menuitem", { name: "New file" }).click();
  await page.getByTestId("new-name").fill("a:b.ts");
  await page.getByTestId("new-name").press("Enter");
  await expect(page.getByTestId("new-name-error")).toBeVisible();
  await page.getByTestId("new-name").fill("README.md"); // 겹침(덮어쓰지 않음)
  await page.getByTestId("new-name").press("Enter");
  await expect(page.getByTestId("new-name-error")).toBeVisible();
  expect((await fake(page)).files[`${R}/README.md`]).toBe("# Readme\nhello world\n");
  await page.getByTestId("new-name").fill("top.ts"); // 선택 없음 → repo 맨 위
  await page.getByTestId("new-name").press("Enter");
  expect(Object.keys((await fake(page)).files)).toContain(`${R}/top.ts`);
  await expect(row(page, "top.ts")).toBeVisible();
});

test("S-1881 저장 안 한 채 닫으면 확인창: Cancel 은 그대로, Save 는 저장 뒤 닫힘. 다른 파일 열 때도 묻는다", async ({ page }) => {
  await boot(page);
  await openCode(page);
  await ta(page).click();
  await ta(page).pressSequentially("EDIT");
  await row(page, "zeta.txt").click(); // 다른 파일 열기
  await expect(page.getByTestId("unsaved-dialog")).toBeVisible();
  await expect(page.getByTestId("unsaved-dialog")).toContainText("Save your code changes?");
  await page.getByTestId("unsaved-dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(ta(page)).toHaveValue(/EDIT/);
  await page.getByTestId("studio-close").click();
  await expect(page.getByTestId("unsaved-dialog")).toBeVisible();
  await page.getByTestId("unsaved-dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("studio-frame")).toHaveCount(0);
  expect((await fake(page)).files[`${R}/README.md`]).toContain("EDIT");
});

test("S-1870 Tools 메뉴에 Code 가 있고 우측 레일·칩으로도 열린다", async ({ page }) => {
  await boot(page);
  await page.getByTestId("tools-btn").click();
  await expect(page.getByRole("menuitem", { name: "Code", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("rail-code").click();
  await expect(page.getByTestId("studio-title")).toHaveText("Code — repo");
});

test("FX7 S-1872 800KB 넘는 파일은 트리에 보이지만 열면 막힌다", async ({ page }) => {
  await boot(page, { ...FILES, [`${R}/big.ts`]: "x" });
  await page.evaluate((p) => ((window as any).__fakeStudio.meta = { [p]: { bytes: 900_000 } }), `${R}/big.ts`);
  await openCode(page);
  await row(page, "big.ts").click();
  await expect(page.getByTestId("code-empty")).toHaveText("This file can't be shown (binary or over 800 KB).");
  await row(page, "zeta.txt").click();
  await expect(ta(page)).toHaveValue("z\n");
});

test("FX7 S-1884 줄 끝이 섞인 파일을 열면 띠가 뜨고, 저장은 많은 쪽(CRLF)으로 통일한다는 안내", async ({ page }) => {
  await boot(page, { ...FILES, [`${R}/mixed.txt`]: "a\nb\nc\nd\n" });
  await page.evaluate((p) => ((window as any).__fakeStudio.meta = { [p]: { crlf: true, mixedEol: true } }), `${R}/mixed.txt`);
  await openCode(page);
  await expect(page.getByTestId("eol-mixed")).toHaveCount(0);
  await row(page, "mixed.txt").click();
  await expect(page.getByTestId("eol-mixed")).toContainText("Line endings were mixed");
  await expect(page.getByTestId("eol-mixed")).toContainText("CRLF");
  await row(page, "zeta.txt").click();
  await expect(page.getByTestId("eol-mixed")).toHaveCount(0);
});
