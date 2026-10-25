import { expect, test, type Page } from "@playwright/test";

// B2: 워크스페이스 둘을 열고(window.__shell, 가짜 IPC) 숨겨도 콘솔이 계속 도는지 본다. 근거 S-300~S-306, S-343.
// 기본 워크스페이스 ws-fake(가짜 repo)는 goto 직후 바로 뜨고(S-308), ws-b 는 __shell.openWs 로 연다.
const REPO = "C:/fake/repo";
type Con = { id: string; agent?: string; x?: number; y?: number };
const board = (wsId: string, cons: Con[], zoom = 1, vx = 20) =>
  JSON.stringify({
    formatVersion: 1,
    savedBy: "symvibe-win",
    workspace: { id: wsId, name: wsId, repoPath: REPO },
    viewport: { x: vx, y: 20, zoom },
    nodes: cons.map((c, i) => ({ id: c.id, kind: "console", x: c.x ?? 0, y: c.y ?? 0, w: 720, h: 440, z: i + 1, name: `Con ${c.id}`, agentId: c.agent ?? "shell", textSize: null, yolo: false })),
  });
const grid = (n: number): Con[] => Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, x: (i % 5) * 760, y: Math.floor(i / 5) * 480 }));

const open2 = async (page: Page, boards: Record<string, string>) => {
  await page.addInitScript((b) => ((window as any).__symSeed = { boards: b }), boards);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("console").first()).toBeVisible(); // 기본 워크스페이스는 바로 뜬다(S-308)
  await page.evaluate((r) => (window as any).__shell.openWs(r, "ws-b"), REPO);
};
type W = { id: string; visible: boolean; loaded: boolean };
const list = (page: Page) => page.evaluate(() => (window as any).__shell.list() as W[]);
const show = (page: Page, id: string) => page.evaluate((i) => (window as any).__shell.show(i), id);
const running = (page: Page) => page.evaluate(() => (window as any).__shell.running() as number);
const ids = (page: Page) => page.evaluate(() => (window as any).__fakePty.ids() as number[]);
const resizes = (page: Page, id: number) => page.evaluate((i) => (window as any).__fakePty.resizes(i).length as number, id);
const emit = (page: Page, id: number, t: string) => page.evaluate(([i, s]) => (window as any).__fakePty.emit(i, s), [id, t] as const);
const text = (page: Page, id: number) =>
  page.evaluate((i) => {
    const b = (window as any).__terms.get(i).buffer.active;
    let s = "";
    for (let r = 0; r < b.length; r++) s += (b.getLine(r)?.translateToString(true) ?? "") + "\n";
    return s;
  }, id);
const webgl = (page: Page) => page.evaluate(() => (window as any).__webglActive() as number);
const one = (id: string) => board(id, [{ id: "c1" }]); // 두 워크스페이스 모두 노드 id c1 (S-303)

test("S-300 워크스페이스 둘이 열리고 보이는 것은 하나, 콘솔은 각자 하나씩 실행", async ({ page }) => {
  await open2(page, { "ws-fake": one("ws-fake"), "ws-b": one("ws-b") });
  await expect.poll(async () => (await list(page)).map((w) => [w.id, w.visible])).toEqual([["ws-fake", false], ["ws-b", true]]);
  await expect.poll(async () => (await ids(page)).length).toBe(2);
  expect(await running(page)).toBe(2); // 같은 노드 id c1 이어도 세션이 하나로 합쳐지지 않는다(S-303)
});

test("S-301 숨긴 워크스페이스의 콘솔은 계속 실행되고 숨은 동안 나온 출력도 쌓인다", async ({ page }) => {
  await open2(page, { "ws-fake": one("ws-fake"), "ws-b": one("ws-b") });
  await expect.poll(async () => (await ids(page)).length).toBe(2);
  const [a] = await ids(page); // ws-fake 의 PTY (숨은 쪽)
  await emit(page, a!, "HIDDEN-OUTPUT-1\r\n");
  await expect.poll(() => text(page, a!)).toContain("HIDDEN-OUTPUT-1");
  expect(await ids(page)).toContain(a!); // 끝나지 않았다(kill 되면 가짜 PTY 목록에서 빠진다)
  expect(await running(page)).toBe(2);
  await show(page, "ws-fake");
  await expect.poll(async () => (await list(page)).find((w) => w.id === "ws-fake")?.visible).toBe(true);
  expect(await text(page, a!)).toContain("HIDDEN-OUTPUT-1"); // 스크롤백 그대로
});

test("S-301·S-343 탭을 오가도 콘솔이 안 죽고 화면 요소를 다시 만들지 않는다", async ({ page }) => {
  await open2(page, { "ws-fake": one("ws-fake"), "ws-b": one("ws-b") });
  await expect.poll(async () => (await ids(page)).length).toBe(2);
  const before = await ids(page);
  await page.evaluate(() => document.querySelectorAll("[data-node-id]").forEach((el, i) => ((el as any).__mark = `m${i}`)));
  for (const w of ["ws-fake", "ws-b", "ws-fake", "ws-b"]) {
    await show(page, w);
    await expect.poll(async () => (await list(page)).find((x) => x.visible)?.id).toBe(w);
    expect(await running(page)).toBe(2);
    expect(await ids(page)).toEqual(before); // kill·재시작 없음
  }
  const marks = await page.evaluate(() => [...document.querySelectorAll("[data-node-id]")].map((el) => (el as any).__mark));
  expect(marks).toEqual(["m0", "m1"]); // 다시 마운트됐다면 표시가 사라진다
});

test("S-303 한 워크스페이스의 콘솔이 끝나도 같은 노드 id 의 다른 워크스페이스 세션은 그대로", async ({ page }) => {
  await open2(page, { "ws-fake": one("ws-fake"), "ws-b": one("ws-b") });
  await expect.poll(async () => (await ids(page)).length).toBe(2);
  const [a, b] = await ids(page);
  await page.evaluate((i) => (window as any).__fakePty.exit(i, 0), b!);
  await expect.poll(() => running(page)).toBe(1);
  expect(await ids(page)).toEqual([a]);
});

test("S-233·S-303 불러온 두 워크스페이스의 같은 id 콘솔이 둘 다 'lane restored' 메모를 받는다", async ({ page }) => {
  const claude = (id: string) => board(id, [{ id: "c1", agent: "claude" }]);
  await open2(page, { "ws-fake": claude("ws-fake"), "ws-b": claude("ws-b") });
  await expect.poll(async () => (await ids(page)).length).toBe(2);
  for (const id of await ids(page)) await expect.poll(() => text(page, id)).toContain("Claude lane restored — relaunching");
});

test("S-302 숨은 워크스페이스는 크기 맞춤·PTY 크기 변경을 하지 않고, 다시 보이면 한 번 맞춘다", async ({ page }) => {
  await open2(page, { "ws-fake": one("ws-fake"), "ws-b": one("ws-b") });
  await expect.poll(async () => (await ids(page)).length).toBe(2);
  const [a, b] = await ids(page); // a = 숨은 ws-fake, b = 보이는 ws-b
  const na = await resizes(page, a!);
  const nb = await resizes(page, b!);
  const upd = (ws: string) => page.evaluate((w) => (window as any).__shell.update(w, "c1", { w: 960 }), ws);
  await upd("ws-fake"); // 숨은 노드의 크기가 바뀐다
  await upd("ws-b");
  await expect.poll(() => resizes(page, b!)).toBeGreaterThan(nb); // 보이는 쪽은 맞춘다(대조)
  expect(await resizes(page, a!)).toBe(na); // 숨은 쪽은 PTY 크기 변경 없음
  await show(page, "ws-fake");
  await expect.poll(() => resizes(page, a!)).toBe(na + 1); // 다시 보이면 한 번 맞춤
  await page.waitForTimeout(300);
  expect(await resizes(page, a!)).toBe(na + 1);
});

test("S-302 WebGL 은 보이는 보드만 센다(최대 12)", async ({ page }) => {
  await open2(page, { "ws-fake": board("ws-fake", grid(14), 0.3, -570), "ws-b": board("ws-b", [{ id: "c1" }], 0.3) });
  await expect.poll(async () => (await ids(page)).length).toBe(15);
  await expect.poll(() => webgl(page)).toBe(1); // 보이는 ws-b 한 개만. 숨은 ws-fake 의 14개는 반납
  await show(page, "ws-fake");
  await expect.poll(() => webgl(page)).toBe(12); // 보이는 14개 중 최대 12, ws-b 는 반납
  await show(page, "ws-b");
  await expect.poll(() => webgl(page)).toBe(1);
});

test("S-305 숨은 워크스페이스도 1분마다 저장한다", async ({ page }) => {
  await open2(page, { "ws-fake": one("ws-fake"), "ws-b": one("ws-b") });
  await expect.poll(async () => (await ids(page)).length).toBe(2);
  await page.clock.install(); // 이 뒤에 만드는 타이머만 가짜 시계
  const id = await page.evaluate(() => (window as any).__shell.spawn("ws-fake", "shell") as string);
  expect(id).not.toBe("");
  const count = async () => JSON.parse((await page.evaluate(() => (window as any).__shell.saved("ws-fake"))) as string).nodes.length as number;
  expect(await count()).toBe(1); // 아직 저장 전
  await page.clock.runFor(61_000);
  await expect.poll(count).toBe(2);
});

test("S-306 종료 확인의 세션 수는 열린 모든 워크스페이스의 합계", async ({ page }) => {
  await open2(page, { "ws-fake": one("ws-fake"), "ws-b": one("ws-b") });
  await expect.poll(async () => (await ids(page)).length).toBe(2);
  await page.keyboard.press("Control+q");
  await expect(page.getByTestId("quit-confirm")).toContainText("2 sessions will end.");
});
