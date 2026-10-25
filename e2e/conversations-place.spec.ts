import { expect, test, type Page } from "@playwright/test";

// H3 보드에 놓기. 근거 S-2840~S-2846. PW_PORT=1753.
// 가짜: window.__fakeConvs(H1) · __fakeProfiles(D3) · __symSeed(보드·transcripts) · __fakePty.spawns()/exit() · __shell.repos()/saved()
test.use({ actionTimeout: 5000 });
type C = { cli: "claude" | "codex"; sessionId: string; cwd: string | null; cwdExists: boolean; title: string; firstPrompt: string; lastAt: number; messages: number; profile: string | null };
const mk = (id: string, o: Partial<C> = {}): C => ({ cli: "claude", sessionId: id, cwd: "C:/other", cwdExists: true, title: `title ${id}`, firstPrompt: `first ${id}`, lastAt: Date.now() - 1000, messages: 4, profile: null, ...o });
const CONVS = [
  mk("conv-claude", { profile: "p1", title: "Claude one" }),
  mk("conv-codex", { cli: "codex", title: "Codex one" }),
  mk("conv-dup", { title: "Dup one" }),
];
const REPO = "C:/fake/repo";
const BOARD = (nodes: object[] = []) =>
  JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: REPO }, viewport: { x: 0, y: 0, zoom: 0.5 }, nodes });
const dupNode = { id: "c1", kind: "console", x: -3000, y: -200, w: 720, h: 440, z: 1, name: "Claude 1", agentId: "claude", textSize: null, yolo: false, resume: { claudeSessionId: "conv-dup" } };

type Spawn = { id: number; args: string[]; cwd?: string; env?: [string, string][] };
const spawns = (page: Page) => page.evaluate(() => (window as any).__fakePty.spawns() as Spawn[]);
const last = async (page: Page) => (await spawns(page)).at(-1);
const env = (s: Spawn | undefined, k: string) => s?.env?.find((e) => e[0] === k)?.[1];

async function open(page: Page, o: { board?: object[] | null; transcripts?: string[] } = {}) {
  await page.addInitScript(
    ([cv, board, tr]) => {
      const w = window as any;
      w.__fakeConvs = cv;
      w.__fakeProfiles = { list: [{ id: "p1", agent: "claude", name: "P1", createdAt: "t" }], signedIn: {} };
      w.__symSeed = board ? { boards: { "ws-fake": board }, transcripts: tr } : { repos: { repos: [{ path: "C:/fake/a", name: "alpha", workspaces: [] }], lastRepo: null, lastWorkspace: {} } };
      if (!board) localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ reopenLastRepo: false, firstRunDone: true }));
    },
    [CONVS, o.board === null ? null : BOARD(o.board ?? []), o.transcripts ?? []] as const,
  );
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  if (o.board === null) await expect(page.getByTestId("home")).toBeVisible();
  else await expect(page.getByTestId("command-bar")).toBeVisible();
}
async function place(page: Page, title: string) {
  if (await page.getByTestId("home").isVisible()) await page.getByTestId("home-conversations").click();
  else {
    await page.getByTestId("tools-btn").click();
    await page.getByRole("menuitem", { name: "All conversations", exact: true }).click();
  }
  await page.getByTestId("conv-row").filter({ hasText: title }).click();
  await page.getByTestId("conv-place").click();
}
const text = (page: Page, id: number) =>
  page.evaluate((i) => {
    const b = (window as any).__terms.get(i).buffer.active;
    let s = "";
    for (let r = 0; r < b.length; r++) s += (b.getLine(r)?.translateToString(true) ?? "") + "\n";
    return s;
  }, id);

test("S-2840~S-2842 Claude 대화(프로필 p1) 놓기: --resume <id>·--session-id 없음·원래 폴더·프로필 env·머리줄 폴더·화면 닫힘·선택", async ({ page }) => {
  await open(page);
  await place(page, "Claude one");
  await expect(page.getByTestId("conversations")).toHaveCount(0);
  await expect(page.getByTestId("console")).toHaveCount(1);
  await expect.poll(async () => (await last(page))?.args.includes("--resume")).toBe(true);
  const s = (await last(page))!;
  expect(s.args[s.args.indexOf("--resume") + 1]).toBe("conv-claude");
  expect(s.args).not.toContain("--session-id");
  expect(s.cwd).toBe("C:/other");
  expect(env(s, "CLAUDE_CONFIG_DIR")).toBe("C:/fake/Profiles/claude/p1");
  await expect(page.getByTestId("console-folder")).toHaveText(/other/);
  await expect(page.locator('[data-node-id][data-selected="true"]')).toHaveCount(1);
});

test("S-2841 Codex 대화는 codex resume <id>", async ({ page }) => {
  await open(page);
  await place(page, "Codex one");
  await expect.poll(async () => (await last(page))?.args.join(" ")).toContain("resume conv-codex");
  expect((await last(page))!.cwd).toBe("C:/other");
});

test("S-2843 같은 대화를 다시 놓으면 콘솔 수 그대로, 알림, 그 콘솔 선택", async ({ page }) => {
  await open(page, { board: [dupNode], transcripts: ["conv-dup"] });
  await expect(page.getByTestId("console")).toHaveCount(1);
  const n = (await spawns(page)).length;
  await place(page, "Dup one");
  await expect(page.getByTestId("app-notice")).toHaveText("Already on a board — jumped to it");
  await expect(page.getByTestId("conversations")).toHaveCount(0);
  await expect(page.getByTestId("console")).toHaveCount(1);
  expect((await spawns(page)).length).toBe(n);
  await expect(page.locator('[data-node-id][data-selected="true"]')).toHaveCount(1);
  // 새로 놓은 대화도 다시 놓으면 한 개
  await place(page, "Claude one");
  await expect(page.getByTestId("console")).toHaveCount(2);
  await place(page, "Claude one");
  await expect(page.getByTestId("app-notice")).toHaveText("Already on a board — jumped to it");
  await expect(page.getByTestId("console")).toHaveCount(2);
});

test("S-2844 열린 보드가 없으면(홈만) 새 Hub 1 이 생기고 거기에 놓인다", async ({ page }) => {
  await open(page, { board: null });
  await place(page, "Claude one");
  await expect(page.getByTestId("repo-chip")).toContainText("Hub 1");
  await expect(page.getByTestId("console")).toHaveCount(1);
  await expect.poll(async () => (await last(page))?.args.includes("--resume")).toBe(true);
  expect((await last(page))!.cwd).toBe("C:/other");
  const r = await page.evaluate(() => (window as any).__shell.repos());
  expect(r.hubs).toHaveLength(1);
});

test("S-2845 가짜 PTY 가 바로 끝나면 셸로 떨어지고 Resume 배너는 다시 안 뜬다", async ({ page }) => {
  await open(page);
  await place(page, "Claude one");
  await expect.poll(async () => (await last(page))?.args.includes("--resume")).toBe(true);
  const first = (await last(page))!;
  await page.evaluate((id) => (window as any).__fakePty.exit(id, 1), first.id);
  await expect.poll(async () => (await spawns(page)).length).toBeGreaterThan(1);
  const fall = (await last(page))!;
  expect(fall.args).not.toContain("--resume");
  await expect(page.getByTestId("resume-banner")).toHaveCount(0);
  expect(await text(page, fall.id)).toBeTruthy();
});

test("S-2840·S-2841 보드를 저장해 다시 열면 그 콘솔은 일반 복원 규칙(--session-id 새 시작 + 제안)", async ({ page }) => {
  await open(page, { transcripts: ["conv-claude"] });
  await place(page, "Claude one");
  await expect.poll(async () => (await last(page))?.args.includes("--resume")).toBe(true);
  const saved = () => page.evaluate(() => (window as any).__shell.saved("ws-fake")) as Promise<string>;
  await expect.poll(async () => JSON.parse(await saved()).nodes.length).toBe(1); // 저장은 조금 뒤
  const json = await saved();
  expect(JSON.parse(json).nodes[0]).toMatchObject({ agentId: "claude", cwd: "C:/other", profile: "p1", resume: { claudeSessionId: "conv-claude" } });
  const p2 = await page.context().newPage();
  await p2.addInitScript(([b]) => ((window as any).__symSeed = { boards: { "ws-fake": b }, transcripts: ["conv-claude"] }), [json] as const);
  await p2.setViewportSize({ width: 1400, height: 900 });
  await p2.goto("/");
  await expect(p2.getByTestId("console")).toHaveCount(1);
  await expect.poll(async () => (await spawns(p2)).length).toBe(1);
  expect((await last(p2))!.args[0]).toBe("--session-id");
  await expect(p2.getByTestId("resume-banner")).toHaveCount(1);
});
