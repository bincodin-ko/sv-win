import { expect, test, type Page } from "@playwright/test";

// D12 Accounts 화면(프로필)과 콘솔 연결. 근거 S-1620~S-1634·S-1521.
// 가짜: window.__fakeProfiles(D3) = 프로필 목록, __fakePty.spawns() 의 env 로 CLAUDE_CONFIG_DIR 를 본다. 실제 로그인·실제 ~/.claude 는 건드리지 않는다.
const WORK = { id: "work", agent: "claude", name: "Work", createdAt: "t" };
const HOME = { id: "home", agent: "claude", name: "Home", createdAt: "t" };

async function setup(page: Page, profiles: object[] = [], installed = ["codex", "gemini"]) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(
    ({ list, installed }) => {
      localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(installed));
      const w = window as any;
      w.__fakeUsage = { screens: { claude: " Current session\n ███  14% used\n Resets 4:09pm (Asia/Seoul)", codex: "x", gemini: "x" }, blocked: [], fail: [], calls: [] };
      w.__fakeProfiles = { list, signedIn: {} };
    },
    { list: profiles, installed },
  );
  await page.goto("/");
  await expect(page.getByTestId("usage-pill")).toBeVisible();
}
const openAccounts = async (page: Page) => {
  await page.getByTestId("usage-pill").click();
  await page.getByTestId("usage-view-accounts").click();
  await expect(page.getByTestId("accounts-view")).toBeVisible();
};
type Spawn = { id: number; args: string[]; env?: [string, string][] };
const spawns = (page: Page) => page.evaluate(() => (window as any).__fakePty.spawns() as Spawn[]);
const envOf = (s: Spawn | undefined, key: string) => s?.env?.find((e) => e[0] === key)?.[1];
const lastSpawn = async (page: Page) => (await spawns(page)).at(-1);
const initials = (page: Page) => page.getByTestId("console-badge-initials");

test.describe("화면 (S-1620~S-1623·S-1631·S-1633)", () => {
  test("사람 아이콘 → accounts 뷰, 탭은 Claude Code·Codex 만, 경고 배너는 Claude 에만", async ({ page }) => {
    await setup(page);
    await openAccounts(page);
    await expect(page.getByTestId("usage-title")).toHaveText("accounts");
    await expect(page.getByTestId("usage-tab-claude")).toBeVisible();
    await expect(page.getByTestId("usage-tab-codex")).toBeVisible();
    await expect(page.getByTestId("usage-tab-gemini")).toHaveCount(0);
    await expect(page.getByTestId("accounts-warning")).toHaveText(
      "On this PC, Claude Code may keep its sign-in in Windows Credential Manager, which profiles can't fully isolate yet. After switching, verify the account with /status inside the console.",
    );
    await page.getByTestId("usage-tab-codex").click();
    await expect(page.getByTestId("accounts-view")).toBeVisible();
    await expect(page.getByTestId("accounts-warning")).toHaveCount(0);
  });

  test("Your sign-in 행(ACTIVE) · 약관 한 줄 · worktree 안내", async ({ page }) => {
    await setup(page);
    await openAccounts(page);
    const row = page.getByTestId("account-row-default");
    await expect(row).toContainText("Your sign-in");
    await expect(row).toContainText("Powering new Claude lanes");
    await expect(page.getByTestId("account-active-default")).toHaveText("ACTIVE");
    await expect(page.getByTestId("accounts-terms")).toHaveText("Whether you may hold several accounts is up to each provider. Symvibe never pools or rotates accounts.");
    await expect(page.getByTestId("accounts-worktree")).toHaveText("If both accounts edit files, give each its own git worktree.");
    await expect(page.getByTestId("connect-name")).toHaveAttribute("placeholder", "e.g. Personal Max");
  });

  test("프로필 행: 부제(로그인 파일 있음/없음)와 Use·콘솔 열기·연필·× 아이콘", async ({ page }) => {
    await setup(page, [WORK, HOME]);
    await page.evaluate(() => ((window as any).__fakeProfiles.signedIn["claude/work"] = true));
    await openAccounts(page);
    await expect(page.getByTestId("account-row-work")).toContainText("Ready when you need it");
    await expect(page.getByTestId("account-row-home")).toContainText("Not signed in yet");
    for (const a of ["use", "console", "rename", "remove"]) await expect(page.getByTestId(`account-${a}-work`)).toBeVisible();
    await page.getByTestId("usage-tab-codex").click();
    await expect(page.getByTestId("account-row-work")).toHaveCount(0); // 다른 에이전트의 프로필은 안 보인다
  });
});

test.describe("진입 S-1620", () => {
  test("usage 화면의 Manage accounts 로도 들어간다", async ({ page }) => {
    await setup(page);
    await page.getByTestId("usage-pill").click();
    await page.getByTestId("usage-manage-accounts").click();
    await expect(page.getByTestId("accounts-view")).toBeVisible();
    await expect(page.getByTestId("usage-title")).toHaveText("accounts");
  });
  test("설치 안 된 CLI 도 탭은 두 개 고정, 흐리게", async ({ page }) => {
    await setup(page, [], ["gemini"]); // codex 미설치
    await openAccounts(page);
    await expect(page.getByTestId("usage-tab-claude")).toBeVisible();
    await expect(page.getByTestId("usage-tab-codex")).toBeVisible();
    await expect(page.getByTestId("usage-tab-codex")).toHaveAttribute("data-installed", "false");
    await expect(page.getByTestId("usage-tab-claude")).toHaveAttribute("data-installed", "true");
  });
});

test.describe("Connect·Use (S-1623·S-1624·S-1625)", () => {
  test("+ Connect: 프로필이 생기고 그 환경의 콘솔이 보드에 놓이며, 앱은 아무것도 입력하지 않는다", async ({ page }) => {
    await setup(page);
    await openAccounts(page);
    await page.getByTestId("connect-name").fill("Personal Max");
    await page.getByTestId("connect-btn").click();
    await expect(page.getByTestId("account-row-personal-max")).toContainText("Not signed in yet");
    await expect.poll(async () => envOf(await lastSpawn(page), "CLAUDE_CONFIG_DIR")).toBe("C:/fake/Profiles/claude/personal-max");
    await expect(page.getByTestId("console")).toHaveCount(1);
    await expect(initials(page)).toHaveText("PM");
    const id = (await lastSpawn(page))!.id;
    expect(await page.evaluate((i) => (window as any).__fakePty.writes(i).length, id)).toBe(0);
    await expect(page.getByTestId("connect-name")).toHaveValue("");
  });

  test("Use: 새 콘솔만 그 계정 환경, 이미 뜬 콘솔은 그대로, Your sign-in 의 Use 로 되돌린다", async ({ page }) => {
    await setup(page, [WORK]);
    // 기본 로그인 콘솔 하나
    await page.keyboard.press("t");
    await page.mouse.click(250, 300);
    await expect(page.getByTestId("console")).toHaveCount(1);
    const a = (await lastSpawn(page))!;
    expect(envOf(a, "CLAUDE_CONFIG_DIR")).toBeUndefined();
    await openAccounts(page);
    await page.getByTestId("account-use-work").click();
    await expect(page.getByTestId("account-active-work")).toHaveText("ACTIVE");
    await expect(page.getByTestId("account-active-default")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.mouse.click(1250, 800); // 빈 보드를 눌러 키 입력이 터미널로 가지 않게 한다
    await page.keyboard.press("t");
    await page.mouse.click(1250, 800); // 첫 콘솔(720×440) 바깥
    await expect(page.getByTestId("console")).toHaveCount(2);
    await expect.poll(async () => envOf(await lastSpawn(page), "CLAUDE_CONFIG_DIR")).toBe("C:/fake/Profiles/claude/work");
    await expect(initials(page)).toHaveCount(1); // 새 콘솔만 이니셜이 붙는다
    // 되돌리기
    await page.getByTestId("usage-pill").click();
    await page.getByTestId("usage-view-accounts").click();
    await page.getByTestId("account-use-default").click();
    await expect(page.getByTestId("account-active-default")).toHaveText("ACTIVE");
    await expect(page.getByTestId("account-active-work")).toHaveCount(0);
  });

  test("콘솔 열기 아이콘: 그 프로필 환경으로 콘솔을 놓는다(Use 와 별개)", async ({ page }) => {
    await setup(page, [WORK]);
    await openAccounts(page);
    await page.getByTestId("account-console-work").click();
    await expect.poll(async () => envOf(await lastSpawn(page), "CLAUDE_CONFIG_DIR")).toBe("C:/fake/Profiles/claude/work");
    await expect(page.getByTestId("account-active-default")).toHaveText("ACTIVE");
  });

  test("계정 칩의 Use for new lanes 가 같은 설정을 바꾼다(S-1521)", async ({ page }) => {
    await setup(page, [WORK]);
    await page.getByTestId("usage-pill").click();
    await page.getByTestId("usage-chip-work").click();
    await page.getByTestId("usage-use-for-new").click();
    await page.getByTestId("usage-view-accounts").click();
    await expect(page.getByTestId("account-active-work")).toHaveText("ACTIVE");
  });
});

test.describe("배지·ACCOUNT 구역 (S-1627)", () => {
  test("배지 → ACCOUNT 구역(현재 체크) → 다른 계정 → 확인창 → 새로 시작(이어받기 없음)·이니셜", async ({ page }) => {
    await setup(page, [WORK, HOME]);
    await openAccounts(page);
    await page.getByTestId("account-console-work").click();
    await expect.poll(async () => envOf(await lastSpawn(page), "CLAUDE_CONFIG_DIR")).toContain("/work");
    await expect(initials(page)).toHaveText("W");
    await page.keyboard.press("Escape");
    await page.getByTestId("console-badge").click();
    await expect(page.getByTestId("account-section")).toContainText("ACCOUNT");
    await expect(page.getByTestId("account-item-work")).toHaveAttribute("data-checked", "true");
    await expect(page.getByTestId("account-item-default")).toHaveAttribute("data-checked", "false");
    const before = (await spawns(page)).length;
    await page.getByTestId("account-item-home").click();
    await page.getByTestId("confirm-close").getByRole("button", { name: "Close" }).click();
    await expect.poll(async () => (await spawns(page)).length).toBeGreaterThan(before);
    const s = (await lastSpawn(page))!;
    expect(envOf(s, "CLAUDE_CONFIG_DIR")).toBe("C:/fake/Profiles/claude/home");
    expect(s.args).not.toContain("--resume");
    await expect(initials(page)).toHaveText("H");
  });

  test("ACCOUNT 구역은 프로필이 없으면 안 보이고, 프로필 없는 콘솔엔 이니셜이 없다", async ({ page }) => {
    await setup(page);
    await page.keyboard.press("t");
    await page.mouse.click(300, 300);
    await expect(page.getByTestId("console")).toHaveCount(1);
    await expect(initials(page)).toHaveCount(0);
    await page.getByTestId("console-badge").click();
    await expect(page.getByTestId("agent-picker")).toBeVisible();
    await expect(page.getByTestId("account-section")).toHaveCount(0);
  });
});

test.describe("이름 바꾸기·Remove (S-1630·S-1632)", () => {
  test("연필: 인라인으로 이름을 바꾼다(목록만)", async ({ page }) => {
    await setup(page, [WORK]);
    await openAccounts(page);
    await page.getByTestId("account-rename-work").click();
    await page.getByTestId("account-rename-input").fill("Day Job");
    await page.getByTestId("account-rename-input").press("Enter");
    await expect(page.getByTestId("account-row-work")).toContainText("Day Job");
    expect(await page.evaluate(() => (window as any).__fakeProfiles.list[0].id)).toBe("work"); // 폴더(id)는 그대로
  });

  test("× Remove: 확인창 → 행 사라짐, 쓰던 콘솔은 다음 시작에 환경 없음 + Use 가 null", async ({ page }) => {
    await setup(page, [WORK]);
    await openAccounts(page);
    await page.getByTestId("account-use-work").click();
    await page.getByTestId("account-console-work").click();
    await expect.poll(async () => envOf(await lastSpawn(page), "CLAUDE_CONFIG_DIR")).toContain("/work");
    await page.getByTestId("account-remove-work").click();
    await expect(page.getByTestId("account-remove-confirm")).toContainText("Remove Work? Its saved sign-in is deleted for good; settings and conversation history move to the Recycle Bin.");
    await page.getByTestId("account-remove-cancel").click();
    await expect(page.getByTestId("account-row-work")).toBeVisible();
    await page.getByTestId("account-remove-work").click();
    await page.getByTestId("account-remove-ok").click();
    await expect(page.getByTestId("account-row-work")).toHaveCount(0);
    await expect(page.getByTestId("account-active-default")).toHaveText("ACTIVE");
    // 그 콘솔은 다음 시작부터 기본 로그인
    await page.keyboard.press("Escape");
    const before = (await spawns(page)).length;
    await page.getByTestId("console-restart").click();
    await page.getByTestId("confirm-close").getByRole("button", { name: "Close" }).click();
    await expect.poll(async () => (await spawns(page)).length).toBeGreaterThan(before);
    expect(envOf(await lastSpawn(page), "CLAUDE_CONFIG_DIR")).toBeUndefined();
    await expect(initials(page)).toHaveCount(0);
  });
});
