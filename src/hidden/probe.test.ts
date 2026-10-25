import { afterEach, describe, expect, it, vi } from "vitest";
import { agentSpawnSpec } from "../agents/api";
import { fakePty } from "../lib/ipc";
import { fakeClock } from "./fakeclock";
import { closeAllHidden, hiddenSession, runHidden, type HiddenOpts } from "./probe";

// 호출 인자를 기록하되 진짜(가짜 IPC) 구현을 그대로 부른다
vi.mock("../agents/api", async (orig) => {
  const m = await orig<typeof import("../agents/api")>();
  return { ...m, agentSpawnSpec: vi.fn(m.agentSpawnSpec) };
});
const open: { close(): void }[] = [];
afterEach(() => {
  localStorage.removeItem("symvibe.fakeSettings");
  vi.mocked(agentSpawnSpec).mockClear();
  for (const s of open.splice(0)) s.close(); // 시험이 실패해도 가짜 세션을 끈다
  closeAllHidden();
});
const base = { agentId: "claude", cwd: "C:\\probe", timeoutMs: 600000 };
async function mk(o: Partial<HiddenOpts> = {}) {
  const clock = fakeClock();
  const s = await hiddenSession({ ...base, clock, ...o });
  open.push(s);
  return { s, clock };
}
const kills = (id: number) => fakePty.ctl().filter((c) => c.id === id && c.op === "kill").length;
const TRUST = "Do you trust the files in this folder?\r\n 1. Yes, proceed\r\n";

describe("S-1200·S-1210·S-1211 열기", () => {
  it("화면에 안 붙고 에이전트 주문·session-id·cwd·env 를 PTY 에 넘긴다", async () => {
    const { s } = await mk({ env: [["CLAUDE_CONFIG_DIR", "D:\\prof"]] });
    const sp = fakePty.spawns().find((x) => x.id === s.id)!;
    expect(sp.args).toEqual(["--session-id", s.sessionId, "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--settings", '{"disableAllHooks":true}']);
    expect(s.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sp.env).toContainEqual(["CLAUDE_CONFIG_DIR", "D:\\prof"]);
    expect(sp.cwd).toBe("C:\\probe");
    expect(document.querySelector(".xterm")).toBeNull();
  });
  it("FX1 S-1978·S-2026: 설정 Yolo 가 켜져 있어도 숨은 세션은 noYolo:true 로 주문하고 권한 건너뛰기 인자가 없다", async () => {
    localStorage.setItem("symvibe.fakeSettings", JSON.stringify({ yolo: true }));
    // 가짜가 계약대로인지: noYolo 아니면 인자를 붙인다(콘솔 경로)
    expect((await agentSpawnSpec("claude")).args).toContain("--dangerously-skip-permissions");
    vi.mocked(agentSpawnSpec).mockClear();
    const { s } = await mk(); // agentId 만 주는 길
    expect(vi.mocked(agentSpawnSpec).mock.calls).toHaveLength(1);
    expect(vi.mocked(agentSpawnSpec).mock.calls[0][1]).toMatchObject({ noYolo: true });
    const sp = fakePty.spawns().find((x) => x.id === s.id)!;
    expect(sp.args).toEqual(["--session-id", s.sessionId, "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--settings", '{"disableAllHooks":true}']);
    expect(sp.args.join(" ")).not.toContain("dangerously");
  });
  it("숨은 claude 는 사용자 전역 훅·MCP 를 안 읽는다(planner 가 이미 준 인자와 겹치지 않는다)", async () => {
    const { s } = await mk({ args: ["--model", "haiku", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "project"] });
    const sp = fakePty.spawns().find((x) => x.id === s.id)!;
    expect(sp.args.filter((a) => a === "--setting-sources")).toHaveLength(1);
    const { s: c } = await mk({ agentId: undefined, program: "node", args: ["x.js"] });
    expect(fakePty.spawns().find((x) => x.id === c.id)!.args).not.toContain("--setting-sources");
  });
  it("y4: 사용자 설정(권한 허용 목록)은 남기고 훅만 끈다 — --setting-sources project 는 Bash 권한 질문에서 멈춘다(실측)", async () => {
    const { s } = await mk();
    const a = fakePty.spawns().find((x) => x.id === s.id)!.args;
    expect(a).not.toContain("--setting-sources");
    expect(a).toContain("--settings");
  });
  it("프로그램+인자를 직접 줄 수도 있다", async () => {
    const { s } = await mk({ agentId: undefined, program: "node", args: ["fake-cli.js"] });
    const sp = fakePty.spawns().find((x) => x.id === s.id)!;
    expect([sp.program, sp.args]).toEqual(["node", ["fake-cli.js"]]);
  });
  it("close() 두 번은 안전하고 kill 은 한 번", async () => {
    const { s } = await mk();
    s.close();
    s.close();
    expect(kills(s.id)).toBe(1);
  });
  it("제한 시간에 그 PID 만 끈다", async () => {
    const a = await mk({ timeoutMs: 5000 });
    const b = await mk({ timeoutMs: 600000 });
    await a.clock.advance(6000);
    expect(kills(a.s.id)).toBe(1);
    expect(kills(b.s.id)).toBe(0);
  });
  it("runHidden 은 일이 실패해도 닫는다", async () => {
    let id = 0;
    await expect(
      runHidden({ ...base, clock: fakeClock() }, async (s) => {
        id = s.id;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(kills(id)).toBe(1);
  });
  it("S-1209 closeAllHidden 은 열린 세션을 모두 끈다", async () => {
    const a = await mk();
    const b = await mk();
    closeAllHidden();
    expect([kills(a.s.id), kills(b.s.id)]).toEqual([1, 1]);
  });
});

describe("S-1202·S-1203 기다리기·입력", () => {
  it("첫 출력 + 1.5초 조용한 뒤에만 입력한다", async () => {
    const { s, clock } = await mk();
    const p = s.type("hi there\nline2");
    await clock.advance(5000);
    expect(fakePty.writes(s.id)).toEqual([]); // 출력이 아직 없다
    fakePty.emit(s.id, "welcome\r\n❯ ");
    await clock.advance(1400);
    expect(fakePty.writes(s.id)).toEqual([]);
    await clock.advance(500);
    expect(fakePty.writes(s.id)[0]).toBe("hi there line2"); // 한 줄로 붙여넣고
    expect(await p).toEqual({ blocked: false });
    expect(fakePty.writes(s.id)).toEqual(["hi there line2", "\r"]); // 150ms 뒤 Enter
  });
  it("최종 확인 6번: Claude 는 입력칸이 보여야 보낸다. 15초 안에 안 보이면 그래도 보낸다", async () => {
    const { s, clock } = await mk({ waitPrompt: true });
    const p = s.type("hi");
    fakePty.emit(s.id, "loading MCP servers\r\n");
    await clock.advance(5000);
    expect(fakePty.writes(s.id)).toEqual([]); // 조용하지만 입력칸이 아직 없다
    await clock.advance(13000);
    expect(fakePty.writes(s.id)[0]).toBe("hi");
    expect(await p).toEqual({ blocked: false });
  });
  it("첫 요청 프라이머 누락: 신뢰 질문의 '❯ No, exit' 줄을 입력칸으로 보지 않는다", async () => {
    const { s, clock } = await mk({ waitPrompt: true, manual: true, emptyFolder: true });
    fakePty.emit(s.id, TRUST_NEW);
    const p = s.type("hi");
    await clock.advance(6000);
    expect(fakePty.writes(s.id)).not.toContain("hi"); // 신뢰 질문이 아직 화면에 있다
    fakePty.emit(s.id, "\x1b[2J\x1b[H? for shortcuts\r\n❯ \r\n");
    await clock.advance(3000);
    expect(fakePty.writes(s.id)).toContain("hi");
    expect(await p).toEqual({ blocked: false });
  });
  it("waitQuiet: 마지막 출력 뒤 ms 조용하면 끝, maxMs 면 timeout", async () => {
    const { s, clock } = await mk();
    fakePty.emit(s.id, "x");
    let r: unknown = null;
    void s.waitQuiet(3000, 60000).then((v) => (r = v));
    await clock.advance(2000);
    fakePty.emit(s.id, "y");
    await clock.advance(2900);
    expect(r).toBeNull();
    await clock.advance(600);
    expect(r).toEqual({ blocked: false });
    const e = s.waitQuiet(1000, 3000).catch((x: Error) => x);
    for (let i = 0; i < 8; i++) {
      fakePty.emit(s.id, ".");
      await clock.advance(500);
    }
    expect(((await e) as Error).message).toMatch(/timeout/);
  });
  it("출력이 전혀 없으면 제한 시간에 timeout 으로 끝나고 PID 를 끈다", async () => {
    const { s, clock } = await mk({ timeoutMs: 5000 });
    const e = s.waitQuiet(100, 600000).catch((x: Error) => x);
    await clock.advance(6000);
    expect(((await e) as Error).message).toMatch(/timeout/);
    expect(kills(s.id)).toBe(1);
  });
  it("screenText 는 쓴 출력의 글자를 돌려준다", async () => {
    const { s } = await mk();
    fakePty.emit(s.id, "\x1b[32mgreen\x1b[0m  \r\n");
    await new Promise((r) => setTimeout(r, 0));
    expect(await s.screenText()).toBe("green");
  });
});

const TRUST_NEW = "Quick safety check: Is this a project you created or one you trust?\r\n ❯ No, exit\r\n   Yes, I trust this folder\r\n";
const CPR = "\x1b[1;1R";
describe("perf-real 2·3번 숨은 세션 입력", () => {
  it("숨은 세션 터미널의 응답(CPR)이 PTY 로 간다", async () => {
    const { s } = await mk();
    fakePty.emit(s.id, "\x1b[6n");
    await new Promise((r) => setTimeout(r, 20));
    expect(fakePty.writes(s.id)).toEqual([CPR]);
  });
  it("새 신뢰 문구: 빈 폴더 수동이면 ↓ 뒤 Enter 순서로 Yes 를 고른다", async () => {
    const { s, clock } = await mk({ manual: true, emptyFolder: true });
    fakePty.emit(s.id, TRUST_NEW);
    const p = s.waitQuiet(2000, 60000);
    await clock.advance(6000);
    expect(await p).toEqual({ blocked: false });
    expect(fakePty.writes(s.id).filter((w) => w !== CPR)).toEqual(["\x1b[B", "\r"]);
  });
  it("새 신뢰 문구도 manual:false 면 답하지 않고 막힘", async () => {
    const { s, clock } = await mk({ manual: false, emptyFolder: true });
    fakePty.emit(s.id, TRUST_NEW);
    const p = s.waitQuiet(2000, 60000);
    await clock.advance(6000);
    expect((await p).blocked).toBe(true);
    expect(fakePty.writes(s.id)).toEqual([]);
  });
});

describe("S-1204 신뢰 질문 자동 수락", () => {
  it("manual:true + 빈 폴더: Enter 한 번만", async () => {
    const { s, clock } = await mk({ manual: true, emptyFolder: true });
    fakePty.emit(s.id, TRUST);
    const p = s.waitQuiet(2000, 60000);
    await clock.advance(1400);
    expect(fakePty.writes(s.id)).toEqual([]); // 1.5초 조용하기 전엔 입력 없음
    await clock.advance(5000);
    expect(await p).toEqual({ blocked: false });
    expect(fakePty.writes(s.id).filter((w) => w === "\r").length).toBe(1);
    const again = s.waitQuiet(100, 3000).catch(() => {});
    await clock.advance(4000);
    await again;
    expect(fakePty.writes(s.id).filter((w) => w === "\r").length).toBe(1);
  });
  it("manual:false 는 어떤 질문에도 답하지 않고 막힘으로 끈다", async () => {
    const { s, clock } = await mk({ manual: false, emptyFolder: true });
    fakePty.emit(s.id, TRUST);
    const p = s.waitQuiet(2000, 60000);
    await clock.advance(5000);
    expect(await p).toMatchObject({ blocked: true });
    expect(fakePty.writes(s.id)).toEqual([]);
    expect(kills(s.id)).toBe(1);
  });
  it("manual:true 라도 빈 폴더가 아니면(repo) 답하지 않는다", async () => {
    const { s, clock } = await mk({ manual: true, emptyFolder: false });
    fakePty.emit(s.id, TRUST);
    const p = s.waitQuiet(2000, 60000);
    await clock.advance(5000);
    expect(await p).toMatchObject({ blocked: true });
    expect(fakePty.writes(s.id)).toEqual([]);
  });
});

describe("S-1205 막힘", () => {
  it("로그인 질문이면 {blocked, screen} 을 주고 세션을 끈다", async () => {
    const { s, clock } = await mk({ manual: true, emptyFolder: true });
    fakePty.emit(s.id, "Select login method:\r\n 1. Claude account\r\n");
    const p = s.type("hello");
    await clock.advance(5000);
    const r = await p;
    expect(r).toMatchObject({ blocked: true });
    expect((r as { screen: string }).screen).toContain("Select login method");
    expect(fakePty.writes(s.id)).toEqual([]);
    expect(kills(s.id)).toBe(1);
  });
});

describe("Q3 S-3148 Gemini --skip-trust", () => {
  const spawnArgs = (id: number) => fakePty.spawns().find((x) => x.id === id)!.args;
  afterEach(() => localStorage.removeItem("symvibe.fakeInstalled"));
  it("gemini + emptyFolder 이면 --skip-trust 를 붙인다", async () => {
    localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(["gemini"]));
    const { s } = await mk({ agentId: "gemini", emptyFolder: true });
    expect(spawnArgs(s.id)).toContain("--skip-trust");
  });
  it("gemini 라도 빈 폴더가 아니면 안 붙인다", async () => {
    localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(["gemini"]));
    const { s } = await mk({ agentId: "gemini", emptyFolder: false });
    expect(spawnArgs(s.id)).not.toContain("--skip-trust");
  });
  it("claude 는 빈 폴더여도 안 붙인다", async () => {
    const { s } = await mk({ emptyFolder: true });
    expect(spawnArgs(s.id)).not.toContain("--skip-trust");
  });
});
