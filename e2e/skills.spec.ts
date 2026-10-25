import { expect, test, type Page } from "@playwright/test";

// 5묶음 E7 Skills 관리자 (S-2070~S-2085). PW_PORT=1507. 가짜 IPC: window.__fakeSkills = { skills: [...] }, 가짜 PTY: __fakePty.
// 저장소 = C:/fake/repo. 콘솔 하나(claude) c1 을 시드한다. 실제 ~/.claude 는 건드리지 않는다.
test.use({ actionTimeout: 5000 });
const REPO = "C:/fake/repo";
const raw = (front: string, body = "Do the thing.\nSecond line.") => `---\n${front}\n---\n${body}`;
const sk = (scope: string, kind: string, folder: string, text: string, p: Record<string, unknown> = {}) => {
  const dir = scope === "plugin" ? `C:/fake/plugins/${folder}` : `C:/fake/${scope}/${folder}`;
  return { scope, kind, plugin: null, folderName: folder, path: kind === "command" ? `${dir}.md` : `${dir}/SKILL.md`, dir: kind === "command" ? `${dir}.md` : dir, raw: text, mtime: 1000, sideFiles: [], ...p };
};
const SEED = [
  sk("personal", "skill", "alpha", raw("name: alpha\ndescription: Alpha does a thing.\nargument-hint: [file]\nmodel: opus", "Alpha body line one.\nAlpha body line two."), { sideFiles: ["notes.md"] }),
  sk("personal", "skill", "Bad_Name", raw("name: Bad_Name\ndescription: Needs <care>\nfoo: 1")),
  sk("personal", "skill", "dup", raw("name: dup\ndescription: Personal dup.")),
  sk("project", "skill", "dup", raw("name: dup\ndescription: Project dup.")),
  sk("project", "skill", "proj-only", raw("name: proj-only\ndescription: Project thing.\ndisable-model-invocation: true\ncontext: fork")),
  sk("personal", "command", "deploy", "Deploy it now."),
  sk("plugin", "skill", "plug", raw("name: plug\ndescription: From a plugin."), { plugin: "ecc" }),
];

const boot = async (page: Page) => {
  const board = JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: REPO }, viewport: { x: 0, y: 0, zoom: 0.5 }, nodes: [{ id: "c1", kind: "console", x: -760, y: -400, w: 720, h: 440, z: 1, name: "Con c1", agentId: "claude", textSize: null, yolo: false }], groups: [] });
  await page.addInitScript(([b, s]) => { (window as any).__symSeed = { boards: { "ws-fake": b } }; (window as any).__fakeSkills = { skills: s }; (window as any).__fakePickFolder = "C:/fake/import/cool"; }, [board, SEED] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  await expect(page.getByTestId("console")).toHaveCount(1);
};
const open = async (page: Page) => {
  await page.getByTestId("tools-btn").click();
  await page.getByRole("menuitem", { name: "Skills", exact: true }).click();
  await expect(page.getByTestId("studio-title")).toHaveText("Skills");
};
const rows = (page: Page) => page.getByTestId("skill-row");
const row = (page: Page, name: string) => page.locator(`[data-testid="skill-row"][data-name="${name}"]`).first();
const chip = (page: Page, c: string) => page.getByTestId(`skills-chip-${c}`);
const detail = (page: Page) => page.getByTestId("skill-detail");
const writes = (page: Page, id: number) => page.evaluate((i) => (window as any).__fakePty.writes(i) as string[], id);

test("S-2070~S-2075·S-2078 열기·필터·상세·점검·충돌·Edit 저장 충돌", async ({ page }) => {
  await boot(page);
  await open(page);
  await expect(page.getByTestId("skills-tab-installed")).toBeVisible();
  await expect(page.getByTestId("skills-tab-starters")).toBeVisible();
  await expect(rows(page)).toHaveCount(7);
  // 필터 칩: 켜고 끄기, 아무것도 안 켜면 전부
  await chip(page, "plugins").click();
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, "plug")).toBeVisible();
  await chip(page, "plugins").click();
  await expect(rows(page)).toHaveCount(7);
  await chip(page, "commands").click();
  await expect(rows(page)).toHaveCount(1);
  await chip(page, "project").click();
  await expect(rows(page)).toHaveCount(3);
  await chip(page, "commands").click();
  await chip(page, "project").click();
  await expect(chip(page, "project")).toBeEnabled(); // repo 가 있으니 Project 칩이 켜진다
  // 이름순 + 경고 점 + 진 쪽 흐리게
  const names = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-name")));
  expect(names).toEqual([...names].sort((a, b) => a!.localeCompare(b!)));
  await expect(row(page, "Bad_Name").getByTestId("skill-warn")).toBeVisible();
  await expect(row(page, "alpha").getByTestId("skill-warn")).toHaveCount(1); // model 은 업로드가 거부하는 필드 ⑥
  // 깨끗한 스킬은 No findings 문구
  await page.locator('[data-testid="skill-row"][data-name="dup"][data-scope="personal"]').click();
  await expect(page.getByTestId("skill-findings")).toHaveText("No findings. Name, description and size all look right.");
  // 상세
  await row(page, "alpha").click();
  await expect(page.getByTestId("skill-invoke")).toHaveText("/alpha [file]");
  await expect(detail(page)).toContainText("Personal");
  await expect(page.getByTestId("skill-mode")).toHaveText("Claude can call it on its own");
  await expect(page.getByTestId("skill-tokens")).toHaveText(/^~\d+ tokens$/);
  await expect(detail(page)).toContainText("opus");
  await expect(detail(page)).toContainText("notes.md");
  await expect(page.getByTestId("skill-body")).toContainText("Alpha body line two.");
  await page.getByTestId("skill-copy").click();
  await expect(page.getByTestId("skill-copy")).toHaveText("Copied");
  // 점검 결과
  await expect(page.getByTestId("skill-findings")).toContainText("Claude Code-only");
  await row(page, "Bad_Name").click();
  await expect(page.getByTestId("skill-findings")).toContainText("lowercase");
  await expect(page.getByTestId("skill-findings")).toContainText("unknown field");
  await row(page, "proj-only").click();
  await expect(page.getByTestId("skill-mode")).toHaveText("Manual only");
  await expect(detail(page)).toContainText("Runs in a subagent");
  await expect(page.getByTestId("skill-findings")).toContainText("Claude Code-only"); // context·disable-model-invocation
  // 이름 겹침: Project dup 은 진다
  await page.locator('[data-testid="skill-row"][data-name="dup"][data-scope="project"]').click();
  await expect(page.getByTestId("skill-collide")).toHaveText("This one never runs: Personal 'dup' wins.");
  await expect(page.locator('[data-testid="skill-row"][data-name="dup"][data-scope="project"]')).toHaveAttribute("data-dim", "true");
  // 플러그인은 Edit 없음
  await row(page, "plug").click();
  await expect(page.getByTestId("skill-edit")).toHaveCount(0);
  await expect(page.getByTestId("skill-invoke")).toHaveText("/ecc:plug");
  // Edit: 디스크가 달라졌으면 거절 + Reload
  await row(page, "alpha").click();
  await page.getByTestId("skill-edit").click();
  const ta = page.getByTestId("skill-edit-text");
  await expect(ta).toHaveValue(/^---\nname: alpha/);
  await ta.fill(raw("name: alpha\ndescription: Alpha v2.", "Edited body."));
  await page.evaluate(() => { (window as any).__fakeSkills.skills.find((s: any) => s.folderName === "alpha").mtime += 5; });
  await page.getByTestId("skill-save").click();
  await expect(page.getByTestId("skill-edit-error")).toHaveText("This file changed on disk since you opened it.");
  await page.getByTestId("skill-reload").click();
  await expect(ta).toHaveValue(/Alpha does a thing/);
  await ta.fill(raw("name: alpha\ndescription: Alpha v2.", "Edited body."));
  await page.getByTestId("skill-save").click();
  await expect(page.getByTestId("skill-body")).toContainText("Edited body.");
  await expect(detail(page)).toContainText("Alpha v2.");
  // 고친 채 닫으면 S-1810 확인창
  await page.getByTestId("skill-edit").click();
  await page.getByTestId("skill-edit-text").fill("changed again");
  await page.getByTestId("studio-close").click();
  await expect(page.getByTestId("unsaved-dialog")).toHaveAttribute("aria-label", "Save your skill changes?");
  await page.getByRole("button", { name: "Don't Save" }).click();
  await expect(page.getByTestId("studio-frame")).toHaveCount(0);
});

test("S-2079~S-2084 New skill → Starters 설치 → Duplicate·Delete·Import → Run on an agent", async ({ page }) => {
  await boot(page);
  await open(page);
  // New skill: 이름 검사, 겹침 거절, 만들면 선택
  await page.getByTestId("skills-new").click();
  await page.getByTestId("new-name").fill("Bad Name");
  await expect(page.getByTestId("new-name-error")).toContainText("lowercase");
  await expect(page.getByTestId("new-create")).toBeDisabled();
  await page.getByTestId("new-name").fill("alpha");
  await page.getByTestId("new-desc").fill("dup");
  await page.getByTestId("new-body").fill("x");
  await page.getByTestId("new-create").click();
  await expect(page.getByTestId("new-error")).toHaveText("A skill with that name already exists.");
  await page.getByTestId("new-name").fill("fresh");
  await page.getByTestId("new-desc").fill("A fresh skill.");
  await page.getByTestId("new-hint").fill("[topic]");
  await page.getByTestId("new-body").fill("Fresh body.");
  await page.getByTestId("new-create").click();
  await expect(page.getByTestId("skill-invoke")).toHaveText("/fresh [topic]");
  await expect(row(page, "fresh")).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("skill-findings")).toContainText("argument-hint"); // argument-hint 는 Claude Code 전용(⑥)
  // Starters
  await page.getByTestId("skills-tab-starters").click();
  await expect(page.getByTestId("starter-row")).toHaveCount(12);
  await page.locator('[data-testid="starter-row"][data-name="commit"]').click();
  await expect(page.getByTestId("starter-preview")).toContainText("/commit");
  await page.getByTestId("starter-install-personal").click();
  await expect(page.getByTestId("starter-installed")).toBeVisible();
  await expect(page.getByTestId("starter-install-personal")).toBeDisabled();
  await expect(page.locator('[data-testid="starter-row"][data-name="commit"]')).toContainText("Installed");
  await page.locator('[data-testid="starter-row"][data-name="changelog"]').click();
  await page.getByTestId("starter-install-project").click();
  await expect(page.getByTestId("starter-install-project")).toBeDisabled();
  // 다시 Installed 탭: 새로 읽혀 두 개가 보인다
  await page.getByTestId("skills-tab-installed").click();
  await expect(row(page, "commit")).toBeVisible();
  await expect(row(page, "changelog")).toBeVisible();
  // Duplicate
  await row(page, "alpha").click();
  await page.getByTestId("skill-dup-personal").click();
  await expect(row(page, "alpha-copy")).toHaveAttribute("data-selected", "true");
  // Delete: 확인창 → 목록에서 사라진다
  await page.getByTestId("skill-delete").click();
  await page.getByRole("dialog", { name: /Delete/ }).getByRole("button", { name: "Delete" }).click();
  await expect(row(page, "alpha-copy")).toHaveCount(0);
  // Import: 폴더 → SKILL.md 확인 → 범위 고르기
  await page.evaluate(() => { (window as any).__fakeSkills.importable = { "C:/fake/import/cool": { raw: "---\nname: cool\ndescription: Cool.\n---\nbody", bytes: 100 }, "C:/fake/import/empty": { raw: null, bytes: 0 } }; });
  await page.getByTestId("skills-import").click();
  await page.getByTestId("import-to-personal").click();
  await expect(row(page, "cool")).toBeVisible();
  await page.evaluate(() => { (window as any).__fakePickFolder = "C:/fake/import/empty"; });
  await page.getByTestId("skills-import").click();
  await expect(page.getByTestId("import-error")).toHaveText("That folder has no SKILL.md.");
  await page.getByTestId("import-cancel").click();
  // Run on an agent: 콘솔 하나면 거기에 /commit 입력 + 제출
  await row(page, "commit").click();
  await page.getByTestId("skill-run-args").fill("fix typo\nnow");
  await page.getByTestId("skill-run").click();
  const id = (await page.evaluate(() => (window as any).__fakePty.ids() as number[]))[0];
  await expect.poll(async () => (await writes(page, id)).join("")).toContain("/commit fix typo now");
  await expect.poll(async () => (await writes(page, id)).at(-1)).toBe("\r");
  // 실행 중인 에이전트가 없으면 보내지 않고 문구
  await page.evaluate((i) => (window as any).__fakePty.exit(i, 0), id);
  const before = (await writes(page, id)).length;
  await page.getByTestId("skill-run").click();
  await expect(page.getByTestId("skill-run-msg")).toHaveText("Start an agent first.");
  expect((await writes(page, id)).length).toBe(before);
});
