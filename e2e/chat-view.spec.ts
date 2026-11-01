import { expect, test, type Page } from "@playwright/test";

// 대기열 1번: CLI 를 채팅처럼 보는 패널. 대화 기록(가짜: window.__fakeChat[세션 id])을 읽어 말풍선·접힌 도구로, 입력창은 CLI 로 보낸다
const BOARD = (agent: string) => JSON.stringify({
  formatVersion: 1, savedBy: "symvibe-win",
  workspace: { id: "ws-fake", name: "Workspace 1", repoPath: "C:/fake/repo" },
  viewport: { x: 0, y: 0, zoom: 0.6 },
  nodes: [{ id: "c1", kind: "console", x: -700, y: -220, w: 640, h: 420, z: 1, name: "A", agentId: agent, textSize: null, yolo: false }],
});
const open = async (page: Page, agent: string) => {
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: { "ws-fake": b }, transcripts: [] }), BOARD(agent));
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("console")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (window as any).__fakePty.spawns().length)).toBe(1);
  return page.evaluate(() => { const s = (window as any).__fakePty.spawns()[0]; return { id: s.id as number, args: s.args as string[] }; });
};
const J = (o: unknown) => JSON.stringify(o);

test("대기열 1번 Claude — 대화·접힌 도구·입력창 보내기·권한 질문 단추", async ({ page }) => {
  const sp = await open(page, "claude");
  const sid = sp.args[sp.args.indexOf("--session-id") + 1]!;
  await page.evaluate(([sid, lines]) => ((window as any).__fakeChat = { [sid]: lines }), [sid, [
    J({ type: "user", message: { content: "표 그려줘" } }),
    J({ type: "assistant", message: { content: [{ type: "text", text: "확인할게요" }, { type: "tool_use", name: "Bash", input: { command: "ls" } }] } }),
    J({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "a.ts" } }] } }),
    J({ type: "assistant", message: { content: [{ type: "text", text: "끝났어요" }] } }),
  ]] as const);
  await page.getByTestId("console-chat").click();
  await expect(page.getByTestId("chat-user")).toHaveText("표 그려줘");
  await expect(page.getByTestId("chat-assistant")).toHaveText(["확인할게요", "끝났어요"]);
  await expect(page.getByTestId("chat-tools")).toContainText("2 tools used");
  await page.getByTestId("chat-tools").getByRole("button").click();
  await expect(page.getByTestId("chat-tools")).toContainText("Bash ls");
  // 새 줄이 붙으면 따라 보인다
  await page.evaluate(([sid, l]) => (window as any).__fakeChat[sid].push(l), [sid, J({ type: "assistant", message: { content: [{ type: "text", text: "추가 답" }] } })] as const);
  await expect(page.getByTestId("chat-assistant")).toHaveCount(3);
  // 입력창 → CLI
  await page.getByTestId("chat-input").fill("다음 해줘");
  await page.getByTestId("chat-input").press("Enter");
  await expect.poll(() => page.evaluate((i) => ((window as any).__fakePty.writes(i) as string[]).join(""), sp.id)).toContain("다음 해줘");
  await expect.poll(() => page.evaluate((i) => ((window as any).__fakePty.writes(i) as string[]).join(""), sp.id)).toContain("\r");
  // 권한 질문 → 번호 단추
  await page.evaluate((i) => (window as any).__fakePty.emit(i, "\r\nDo you want to proceed?\r\n❯ 1. Yes\r\n  2. No, and tell Claude what to do\r\n"), sp.id);
  await expect(page.getByTestId("chat-prompt-option")).toHaveCount(2);
  await expect(page.getByTestId("chat-input")).toBeDisabled(); // 질문이 떠 있으면 입력창 잠금
  await page.getByTestId("chat-prompt-option").first().click();
  await expect.poll(() => page.evaluate((i) => ((window as any).__fakePty.writes(i) as string[]).at(-1), sp.id)).toBe("1");
  await page.getByTestId("chat-close").click();
  await expect(page.getByTestId("chat-panel")).toHaveCount(0);
});

test("대기열 1번 Codex — 채팅 단추가 있고 대화가 없으면 안내", async ({ page }) => {
  await open(page, "codex");
  await page.getByTestId("console-chat").click();
  await expect(page.getByTestId("chat-empty")).toBeVisible();
});

test("대기열 1번 셸 — 채팅 단추 없음", async ({ page }) => {
  await open(page, "shell");
  await expect(page.getByTestId("console-chat")).toHaveCount(0);
});

test("대기열 1번 — 번호 없는 질문(폴더 신뢰)은 화살표로 골라 Enter", async ({ page }) => {
  const sp = await open(page, "claude");
  await page.getByTestId("console-chat").click();
  await page.evaluate((i) => (window as any).__fakePty.emit(i, "\r\nDo you trust the files in this folder?\r\n\r\n ❯ No, exit\r\n   Yes, I trust this folder\r\n\r\n Enter to confirm · Esc to cancel\r\n"), sp.id);
  await expect(page.getByTestId("chat-prompt-option")).toHaveText(["No, exit", "Yes, I trust this folder"]);
  await page.getByTestId("chat-prompt-option").nth(1).click();
  await expect.poll(() => page.evaluate((i) => ((window as any).__fakePty.writes(i) as string[]).at(-1), sp.id)).toBe("\x1b[B\r");
});
