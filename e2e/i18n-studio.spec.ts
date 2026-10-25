import { expect, test, type Page } from "@playwright/test";

// K6 S-2470~S-2473·S-2410. PW_PORT=1606. 가짜 설정은 localStorage "symvibe.fakeSettings". 가짜 ipc: __fakeStudio(Code·Markdown), __fakeSkills, __fakeStudioRun.
test.use({ actionTimeout: 5000 });
const KO = /[가-힣]/;
const R = "C:/fake/repo";
const seed = (page: Page, language: "ko" | "en") => page.addInitScript((l) => localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ firstRunDone: true, language: l })), language);
const boot = async (page: Page, language: "ko" | "en") => {
  await seed(page, language);
  await page.addInitScript(([r]) => {
    const w = window as any;
    w.__fakeStudio = { files: { [`${r}/README.md`]: "# Readme\nhello\n", [`${r}/a.ts`]: "x\n", [`${r}/b.md`]: "# B\n" } };
    w.__fakeSkills = { skills: [{ scope: "personal", kind: "skill", plugin: null, folderName: "Bad_Name", path: "C:/fake/personal/Bad_Name/SKILL.md", dir: "C:/fake/personal/Bad_Name", raw: "---\nname: Bad_Name\n---\n", mtime: 1, sideFiles: [] }] };
    w.__fakeStudioRun = () => new Promise(() => {});
  }, [R] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("command-bar")).toBeVisible();
};
const tools = async (page: Page) => { await page.getByTestId("tools-btn").click(); };
const openStudio = async (page: Page, name: RegExp | string) => { await tools(page); await page.getByRole("menuitem", { name }).click(); await expect(page.getByTestId("studio-frame")).toBeVisible(); };

test("① ko Tools 메뉴의 스튜디오 항목 이름이 한국어", async ({ page }) => {
  await boot(page, "ko");
  await tools(page);
  for (const n of ["코드", "마크다운", "스킬"]) await expect(page.getByRole("menuitem", { name: n, exact: true })).toBeVisible();
});

test("② ko Code 스튜디오: 틀 머리·파일 트리·저장 안 한 변경 확인", async ({ page }) => {
  await boot(page, "ko");
  await openStudio(page, "코드");
  await expect(page.getByTestId("studio-title")).toHaveText("코드 — repo");
  await expect(page.getByTestId("studio-close")).toHaveAttribute("aria-label", "닫기");
  await expect(page.getByTestId("tree-plus")).toHaveAttribute("aria-label", "새로 만들기");
  await expect(page.getByTestId("code-save")).toHaveText("저장");
  await expect(page.getByTestId("code-insert")).toHaveText(KO);
  await expect(page.getByTestId("code-head")).toContainText("줄");
  await page.getByTestId("code-textarea").fill("changed\n");
  await page.getByTestId("studio-close").click();
  const d = page.getByTestId("unsaved-dialog");
  await expect(d).toContainText("변경 사항을 저장할까요?");
  await expect(d.getByRole("button", { name: "저장 안 함", exact: true })).toBeVisible();
  await expect(d.getByRole("button", { name: "취소", exact: true })).toBeVisible();
});

test("S-2410 ko 새 파일 이름 입력란은 한글 조합 중 Enter 로 제출되지 않는다", async ({ page }) => {
  await boot(page, "ko");
  await openStudio(page, "코드");
  await page.getByTestId("tree-plus").click();
  await page.getByRole("menuitem", { name: "새 파일", exact: true }).click();
  const input = page.getByTestId("new-name");
  await input.fill("한글");
  await input.evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true, keyCode: 229 })));
  await expect(input).toBeVisible();
  await expect(page.getByTestId("new-name-error")).toHaveCount(0);
});

test("③ ko Markdown 스튜디오 탭 이름·검색 자리", async ({ page }) => {
  await boot(page, "ko");
  await openStudio(page, "마크다운");
  await expect(page.getByTestId("md-tab-reading")).toHaveText("읽기");
  await expect(page.getByTestId("md-tab-source")).toHaveText("소스");
  await expect(page.getByTestId("md-tab-graph")).toHaveText("그래프");
  await expect(page.getByTestId("md-search")).toHaveAttribute("placeholder", KO);
  await expect(page.getByTestId("md-add-board")).toHaveText(KO);
});

test("④ ko Documents 입력란 자리 문구(한국어 예시)와 Diagrams 패널 머리", async ({ page }) => {
  await boot(page, "ko");
  await page.getByTestId("rail-pdf").click();
  await page.getByRole("menuitem").first().click();
  await expect(page.getByTestId("studio-frame")).toBeVisible();
  await expect(page.getByTestId("studio-title")).toHaveText("문서 — repo");
  await expect(page.getByTestId("doc-ask-input")).toHaveAttribute("placeholder", KO);
  await page.getByTestId("studio-close").click();
  await page.getByTestId("rail-diagrams").click();
  const panel = page.getByTestId("diagrams-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("모델");
  await expect(panel).toContainText("스타일");
  await expect(page.getByTestId("dia-input")).toHaveAttribute("placeholder", KO);
  await expect(page.getByTestId("dia-generate")).toHaveText(KO);
});

test("⑤ ko Skills 점검 문구", async ({ page }) => {
  await boot(page, "ko");
  await openStudio(page, "스킬");
  await page.getByTestId("skill-row").first().click();
  const f = page.getByTestId("skill-findings");
  await expect(f).toContainText(KO);
  await expect(f).not.toContainText("Use lowercase letters");
  await expect(page.getByTestId("skills-tab-installed")).toHaveText("설치됨");
});

test("en 같은 대표 문구는 영어 그대로", async ({ page }) => {
  await boot(page, "en");
  await openStudio(page, "Code");
  await expect(page.getByTestId("studio-title")).toHaveText("Code — repo");
  await expect(page.getByTestId("code-save")).toHaveText("Save");
  await page.getByTestId("studio-close").click();
  await openStudio(page, "Markdown");
  await expect(page.getByTestId("md-tab-reading")).toHaveText("Reading");
  await page.getByTestId("studio-close").click();
  await openStudio(page, "Skills");
  await page.getByTestId("skill-row").first().click();
  await expect(page.getByTestId("skill-findings")).toContainText("Use lowercase letters");
});
