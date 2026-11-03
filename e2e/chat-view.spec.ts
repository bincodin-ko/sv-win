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

// 설치본 실측: --session-id 로 띄운 콘솔이 /resume 등으로 다른 대화를 쓰면 패널이 비었다 → 프로세스 기록(sessions/<pid>.json)의 대화를 따른다
test("대기열 1번 — 콘솔이 다른 대화로 바뀌어도(프로세스 기록) 그 대화를 보인다", async ({ page }) => {
  const sp = await open(page, "claude");
  await page.evaluate(([id]) => {
    (window as any).__fakeLive = { [id as number]: ["live-sess", "C:/fake/repo"] };
    (window as any).__fakeChat = { "live-sess": [JSON.stringify({ type: "user", message: { content: "바뀐 대화의 말" } })] };
  }, [sp.id] as const);
  await page.getByTestId("console-chat").click();
  await expect(page.getByTestId("chat-user")).toHaveText("바뀐 대화의 말");
});

test("대기열 1번 — / 자동완성(내장 명령·스킬)과 / 명령은 붙여넣기 없이 그대로 보냄", async ({ page }) => {
  await page.addInitScript(() => ((window as any).__fakeSkills = { skills: [{ scope: "personal", kind: "skill", plugin: null, folderName: "my-skill", path: "C:/fake/personal/my-skill/SKILL.md", dir: "C:/fake/personal/my-skill", raw: "", mtime: 1, sideFiles: [] }] }));
  const sp = await open(page, "claude");
  await page.getByTestId("console-chat").click();
  await page.getByTestId("chat-input").fill("/my");
  await expect(page.getByTestId("chat-slash").getByRole("option")).toHaveText(["/my-skill"]);
  await page.getByTestId("chat-input").fill("/cl");
  await expect(page.getByTestId("chat-slash").getByRole("option").first()).toHaveText("/clear");
  await page.getByTestId("chat-input").press("Enter"); // 고르기
  await expect(page.getByTestId("chat-input")).toHaveValue("/clear ");
  await page.getByTestId("chat-input").press("Enter"); // 보내기
  await expect.poll(() => page.evaluate((i) => ((window as any).__fakePty.writes(i) as string[]).join(""), sp.id)).toContain("/clear\r");
  expect(await page.evaluate((i) => ((window as any).__fakePty.writes(i) as string[]).join(""), sp.id)).not.toContain("\x1b[200~/clear");
});

// 남은일 468번: 휠로 목록이 굴러가고(보드는 안 움직임), 처음 열면 맨 아래(최근), 패널은 보드 줌 밖에서 CSS zoom 으로 그려 선명
test("468번 — 휠로 굴리기·처음엔 맨 아래·보드 줌 밖에 그림", async ({ page }) => {
  const sp = await open(page, "claude");
  const sid = sp.args[sp.args.indexOf("--session-id") + 1]!;
  await page.evaluate(([sid]) => {
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) lines.push(JSON.stringify({ type: "user", message: { content: `질문 ${i}` } }), JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: `답 ${i}\n둘째 줄\n셋째 줄` }] } }));
    (window as any).__fakeChat = { [sid as string]: lines };
  }, [sid] as const);
  await page.getByTestId("console-chat").click();
  await expect(page.getByTestId("chat-user")).toHaveCount(60);
  const list = page.getByTestId("chat-list");
  await expect.poll(() => list.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(4); // 맨 아래
  await expect(page.getByTestId("chat-assistant").last()).toBeInViewport();
  // 보드 줌(world) 밖, 배율은 CSS zoom
  const info = await page.evaluate(() => {
    const d = document.querySelector('[data-testid="chat-dock"]') as HTMLElement;
    const m = new DOMMatrix(getComputedStyle(document.querySelector('[data-testid="world"]')!).transform);
    return { inWorld: !!d.closest('[data-testid="world"]'), zoom: Number((d.firstElementChild as HTMLElement).style.zoom), board: m.a };
  });
  expect(info.inWorld).toBe(false);
  expect(info.zoom).toBeCloseTo(info.board, 2);
  // 휠: 목록이 위로, 보드는 그대로
  const before = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="world"]')!).transform);
  const top0 = await list.evaluate((el) => el.scrollTop);
  const b = (await list.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.wheel(0, -600);
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeLessThan(top0 - 100);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="world"]')!).transform)).toBe(before);
});

// 채팅 / 자동완성 = CLI 가 그린 / 메뉴 그대로(내장·스킬·플러그인·MCP 빠짐 없음). 친 글은 Ctrl+U 뒤 CLI 입력 줄에도 넣고, 지우면 CLI 줄도 비운다
test("/ 자동완성은 CLI 메뉴를 그대로 — 입력 줄 맞추기·메뉴 읽기·지우면 비우기", async ({ page }) => {
  const sp = await open(page, "claude");
  await page.getByTestId("console-chat").click();
  const writes = () => page.evaluate((i) => ((window as any).__fakePty.writes(i) as string[]).join(""), sp.id);
  await page.getByTestId("chat-input").fill("/re");
  await page.evaluate((i) => (window as any).__fakePty.emit(i, "\r\n    /remote-env                                     Choose the default environment for cloud agents\r\n    /rea:trace_crash (MCP)                          Correlate a crash symptom\r\n    /reverse-engineer-anything                      Reverse engineer native\r\n"), sp.id);
  await expect(page.getByTestId("chat-slash").getByRole("option")).toHaveCount(3);
  await expect(page.getByTestId("chat-slash").getByRole("option").nth(1)).toContainText("/rea:trace_crash");
  await expect(page.getByTestId("chat-slash").getByRole("option").first()).toContainText("Choose the default environment");
  expect(await writes()).toContain("\x15/re"); // CLI 입력 줄에도 같은 글
  await page.getByTestId("chat-input").fill("");
  await expect.poll(async () => (await writes()).endsWith("\x15")).toBe(true); // 지우면 CLI 줄도 비움
});
