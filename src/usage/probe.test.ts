import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
import { closeAllHidden } from "../hidden/probe";
import { fakeClock } from "../hidden/fakeclock";
import { fakePty } from "../lib/ipc";
import { BG_MAX_AGE, CHECK_TIMEOUT, EXEC_ARGS, OPEN_MAX_AGE, SESSION_CMDS, checkUsage, isStale, type CheckOpts } from "./probe";

beforeEach(() => localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(["codex", "gemini", "amp", "opencode", "kimi", "copilot"])));
afterEach(() => closeAllHidden());

const DIR = "C:\\fake\\UsageProbe";
const TRUST = "Do you trust the files in this folder?\r\n 1. Yes, proceed\r\n";
const CLAUDE = "Current session\r\n██ 14% used\r\nResets 4:09pm (Asia/Seoul)\r\n";
const CODEX = "Monthly limit  [██] 27% used\r\n Resets 08:37 on 14 Sep\r\n";
/** 가짜 시계를 250ms 씩 돌리며 진짜 시간도 조금 준다(입력 150ms 지연이 진짜 setTimeout 이라서) */
async function pump(c: ReturnType<typeof fakeClock>, ms: number) {
  for (let t = 0; t < ms; t += 250) {
    await c.advance(Math.min(250, ms - t));
    await new Promise((r) => setTimeout(r, 20));
  }
}
const kills = (id: number) => fakePty.ctl().filter((c) => c.id === id && c.op === "kill").length;

/** 확인을 시작하고 spawn 이 일어날 때까지 시계를 돌린다 */
async function start(agent: string, o: Partial<CheckOpts> = {}) {
  const clock = fakeClock();
  const n = fakePty.spawns().length;
  const p = checkUsage(agent, { manual: false, dir: DIR, clock, ...o });
  for (let i = 0; i < 200 && fakePty.spawns().length === n; i++) await new Promise((r) => setTimeout(r, 5)); // 줄·spawn 주문이 끝날 때까지(진짜 시간)
  const sp = fakePty.spawns()[n]!;
  return { p, clock, id: sp.id, sp };
}
const ready = async (c: ReturnType<typeof fakeClock>, id: number) => {
  fakePty.emit(id, "welcome\r\n");
  await pump(c, 3000); // 첫 출력이 2.5초 가라앉은 뒤에야 입력
};

describe("S-1518 시각 규칙", () => {
  it("백그라운드 3분, popover 30초", () => {
    expect([BG_MAX_AGE, OPEN_MAX_AGE, CHECK_TIMEOUT]).toEqual([180_000, 30_000, 60_000]);
    expect(isStale(undefined, 1e6, BG_MAX_AGE)).toBe(true); // 확인한 적 없음
    expect(isStale(1e6 - 180_000, 1e6, BG_MAX_AGE)).toBe(false);
    expect(isStale(1e6 - 180_001, 1e6, BG_MAX_AGE)).toBe(true);
    expect(isStale(1e6 - 30_000, 1e6, OPEN_MAX_AGE)).toBe(false);
    expect(isStale(1e6 - 30_001, 1e6, OPEN_MAX_AGE)).toBe(true);
  });
});

describe("S-1517 명령 표", () => {
  it("Claude /usage, Codex /status 다음 /usage, Gemini /stats, Kimi·Copilot /usage, Amp·OpenCode 는 명령 실행", () => {
    expect(SESSION_CMDS).toMatchObject({ claude: ["/usage"], codex: ["/status", "/usage"], gemini: ["/stats"], kimi: ["/usage"], copilot: ["/usage"] });
    expect(EXEC_ARGS).toMatchObject({ amp: ["usage"], opencode: ["stats"] });
  });
});

describe("S-1517 확인 흐름", () => {
  it("Claude: 빈 폴더에서 열고 /usage 를 입력하고 화면을 읽어 해석한다(프롬프트 없음)", async () => {
    const { p, clock, id, sp } = await start("claude", { env: [["CLAUDE_CONFIG_DIR", "D:\\prof"]] });
    expect(sp.cwd).toBe(DIR);
    expect(sp.env).toContainEqual(["CLAUDE_CONFIG_DIR", "D:\\prof"]);
    await ready(clock, id);
    expect(fakePty.writes(id)[0]).toBe("/usage");
    fakePty.emit(id, CLAUDE);
    await pump(clock, 5000);
    const r = await p;
    expect(fakePty.writes(id)).toEqual(["/usage", "\r"]);
    expect(r.state).toBe("ok");
    expect(r.parsed?.windows).toEqual([{ label: "Current session", pct: 14, resetText: "4:09pm" }]);
    expect(r.raw).toContain("14% used");
    expect(kills(id)).toBe(1); // 읽고 닫는다
  });
  it("Codex: /status 다음 /usage", async () => {
    const { p, clock, id } = await start("codex");
    await ready(clock, id);
    fakePty.emit(id, "status screen\r\n");
    await pump(clock, 5000);
    fakePty.emit(id, CODEX);
    await pump(clock, 5000);
    const r = await p;
    expect(fakePty.writes(id).filter((w) => w !== "\r")).toEqual(["/status", "/usage"]);
    expect(r.parsed?.windows[0]).toEqual({ label: "Monthly limit", pct: 27, resetText: "08:37 on 14 Sep" });
  });
  it("Gemini: /stats, 화면은 해석하지 않고 raw 만", async () => {
    const { p, clock, id } = await start("gemini");
    await ready(clock, id);
    fakePty.emit(id, "Session stats: 12 requests\r\n");
    await pump(clock, 5000);
    const r = await p;
    expect(fakePty.writes(id)[0]).toBe("/stats");
    expect(r).toMatchObject({ state: "ok", parsed: null });
    expect(r.raw).toContain("12 requests");
  });
  it("Amp: 세션 없이 `usage` 인자로 실행해 출력을 읽는다", async () => {
    const { p, clock, id, sp } = await start("amp");
    expect(sp.args.at(-1)).toBe("usage");
    fakePty.emit(id, "Amp credits: $4.20\r\n");
    await pump(clock, 500);
    fakePty.exit(id, 0);
    await pump(clock, 1000);
    const r = await p;
    expect(fakePty.writes(id)).toEqual([]); // 아무것도 입력하지 않는다
    expect(r).toMatchObject({ state: "ok", parsed: null });
    expect(r.raw).toContain("$4.20");
  });
  it("확인 결과의 at 은 끝난 시각", async () => {
    const { p, clock, id } = await start("gemini");
    await ready(clock, id);
    fakePty.emit(id, "x\r\n");
    await pump(clock, 5000);
    const at = (await p).at;
    expect(at > 1000 && at <= clock.now()).toBe(true);
  });
});

describe("S-1518·S-1204 신뢰 질문과 막힘", () => {
  it("백그라운드(manual:false)는 신뢰 질문에도 답하지 않고 blocked", async () => {
    const { p, clock, id } = await start("claude", { manual: false });
    fakePty.emit(id, TRUST);
    await pump(clock, 5000);
    const r = await p;
    expect(r.state).toBe("blocked");
    expect(r.blockedScreen).toMatch(/trust the files/i);
    expect(fakePty.writes(id)).toEqual([]);
    expect(kills(id)).toBe(1);
  });
  it("manual:true 는 우리 빈 폴더의 신뢰 질문만 수락(Enter 한 번)하고 이어서 읽는다", async () => {
    const { p, clock, id } = await start("claude", { manual: true });
    fakePty.emit(id, TRUST);
    await pump(clock, 2000);
    expect(fakePty.writes(id)).toEqual(["\r"]);
    fakePty.emit(id, "\x1b[2J\x1b[Hready\r\n");
    await pump(clock, 2000);
    fakePty.emit(id, CLAUDE);
    await pump(clock, 12000);
    const r = await p;
    expect(r.state).toBe("ok");
    expect(fakePty.writes(id).filter((w) => w === "\r").length).toBe(2); // 신뢰 Enter + 명령 Enter
  });
  it("로그인 같은 다른 질문은 manual 이어도 blocked", async () => {
    const { p, clock, id } = await start("claude", { manual: true });
    fakePty.emit(id, "Select login method:\r\n 1. Claude account\r\n");
    await pump(clock, 5000);
    expect((await p).state).toBe("blocked");
  });
});

describe("S-1519 읽기 실패·60초 초과", () => {
  it("60초 동안 아무 일도 없으면 failed, 그 PID 만 끈다", async () => {
    const { p, clock, id } = await start("claude");
    await pump(clock, 61_000);
    const r = await p;
    expect(r.state).toBe("failed");
    expect(r.parsed).toBeNull();
    expect(kills(id)).toBe(1);
  });
  it("실행 파일이 없으면(spawn 실패) failed", async () => {
    localStorage.setItem("symvibe.fakeInstalled", "[]");
    const clock = fakeClock();
    const p = checkUsage("codex", { manual: true, dir: DIR, clock });
    await new Promise((r) => setTimeout(r, 50));
    expect((await p).state).toBe("failed");
  });
});
