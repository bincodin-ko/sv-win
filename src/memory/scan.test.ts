import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeClock } from "../hidden/fakeclock";
import { closeAllHidden } from "../hidden/probe";
import { fakePty, type MemoryFact } from "../lib/ipc";
import { NO_FACTS } from "./parseFacts";
import { addSelected, cancelRefresh, cancelScan, discardScan, pickAgent, refreshFact, resolveRefresh, scanRepo, SCAN_TIMEOUT_MS, startScan } from "./scan";
import { SCAN_IDLE, useScan, type Row } from "./useScan";
import { useMemory } from "./useMemory";

vi.setConfig({ testTimeout: 30_000 }); // 진짜 150ms 대기가 단계마다 끼어 있다
const REPO = "C:\\fake\\repo";
const w = window as unknown as { __fakeReply?: string | null; __fakeMemory?: Record<string, MemoryFact[]> };
const real = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Clock = ReturnType<typeof fakeClock>;
/** 가짜 시계를 조금씩 보내고, 진짜 150ms 대기(typeAndSubmit)가 지나게 진짜 시간도 흘린다 */
async function drive(c: Clock, ms: number) {
  for (let t = 0; t < ms; t += 250) {
    await c.advance(250);
    await real(15);
  }
}
const fact = (id: string, p: Partial<MemoryFact> = {}): MemoryFact => ({ id, kind: "Commands", title: `Title ${id}`, body: `Body ${id}`, scope: "repo", at: "2026-01-01T00:00:00Z", ...p });
const JSON3 = JSON.stringify([
  { kind: "Commands", title: "Build", body: "npm run build" },
  { kind: "Gotchas", title: "Windows paths", body: "Use forward slashes" },
  { kind: "Context", title: "Why Tauri", body: "Small installer" },
]);
const kills = (id: number) => fakePty.ctl().filter((c) => c.id === id && c.op === "kill").length;
const lastId = () => fakePty.spawns().at(-1)!.id;
/** startScan/refreshFact 를 부른 뒤 숨은 세션이 열릴 때까지 기다려 id 를 돌려준다 */
async function opened(before: number) {
  await vi.waitFor(() => expect(fakePty.spawns().length).toBeGreaterThan(before));
  return lastId();
}
/** 준비 → 질문 전송까지 (그 뒤 phase=1) */
async function asked(c: Clock, id: number) {
  fakePty.emit(id, "ready\r\n");
  await drive(c, 2500);
  await real(300);
  await drive(c, 500);
}

beforeEach(() => {
  useScan.setState(SCAN_IDLE);
  useMemory.setState({ data: {}, tab: "repo", editing: null });
  w.__fakeMemory = {};
  delete w.__fakeReply;
  localStorage.clear();
});
afterEach(() => closeAllHidden());

describe("S-1380 pickAgent", () => {
  it("저장한 것 > 기본 에이전트 > 설치된 첫 것, 없으면 null", () => {
    expect(pickAgent(["claude", "codex"], "codex", "claude")).toBe("codex");
    expect(pickAgent(["claude", "codex"], "gemini", "codex")).toBe("codex");
    expect(pickAgent(["claude", "codex"], null, "shell")).toBe("claude");
    expect(pickAgent(["codex"], "claude", "claude")).toBe("codex");
    expect(pickAgent([], "claude", "claude")).toBeNull();
  });
});

describe("S-1380·S-1388 scanRepo 는 시작 화면을 연다", () => {
  it("설치된 Claude·Codex 만, 기본 Balanced, 기본 에이전트 선택", async () => {
    localStorage.setItem("symvibe.fakeInstalled", JSON.stringify(["codex", "gemini"]));
    await scanRepo(REPO);
    const s = useScan.getState();
    expect([s.stage, s.repo, s.quality, s.agent]).toEqual(["start", REPO, "balanced", "claude"]);
    expect(s.agents.map((a) => a.id)).toEqual(["claude", "codex"]);
  });
  it("진행 중이면 다시 눌러도 시작 화면으로 돌아가지 않는다", async () => {
    useScan.setState({ stage: "running", repo: REPO, phase: 1 });
    await scanRepo(REPO);
    expect(useScan.getState().stage).toBe("running");
  });
});

describe("S-1381·S-1382·S-1384 스캔 진행", () => {
  it("Launch → Read → Write → 결과, 같은 종류+제목은 이미 있음·체크 해제", async () => {
    useMemory.setState({ data: { [REPO]: [fact("x", { title: "Build" })], _all: [] } });
    await scanRepo(REPO);
    const before = fakePty.spawns().length;
    const clock = fakeClock();
    const p = startScan({ clock });
    const id = await opened(before);
    expect(useScan.getState()).toMatchObject({ stage: "running", phase: 0 });
    expect(fakePty.spawns().at(-1)!.cwd).toBe(REPO);
    await asked(clock, id);
    expect(useScan.getState().phase).toBe(1);
    expect(fakePty.writes(id).join("")).toContain("about 10 facts");
    w.__fakeReply = JSON3;
    await drive(clock, 1000);
    expect(useScan.getState().phase).toBe(2);
    await drive(clock, 9000);
    await p;
    const s = useScan.getState();
    expect(s.stage).toBe("review");
    expect(s.rows.map((r) => [r.title, r.dup, r.checked])).toEqual([["Build", true, false], ["Windows paths", false, true], ["Why Tauri", false, true]]);
    expect(kills(id)).toBe(1); // 끝나면 세션을 닫는다
    expect(w.__fakeMemory).toEqual({}); // 저장 전에는 아무것도 쓰지 않는다
  });
  it("고른 에이전트를 settings.memoryAgent 로 기억한다", async () => {
    const { useSettings } = await import("../settings/useSettings");
    await scanRepo(REPO);
    const before = fakePty.spawns().length;
    void startScan({ clock: fakeClock() });
    await opened(before);
    expect(useSettings.getState().get().memoryAgent).toBe("claude");
  });
  it("취소하면 세션을 끄고 아무것도 저장하지 않는다", async () => {
    await scanRepo(REPO);
    const before = fakePty.spawns().length;
    const clock = fakeClock();
    const p = startScan({ clock });
    const id = await opened(before);
    await asked(clock, id);
    cancelScan();
    expect(useScan.getState().stage).toBe("idle");
    expect(kills(id)).toBe(1);
    w.__fakeReply = JSON3;
    await drive(clock, 10000);
    await p;
    expect(useScan.getState().stage).toBe("idle");
    expect(w.__fakeMemory).toEqual({});
  });
  it("S-1385 막히면 안내와 Open console 용 에이전트", async () => {
    await scanRepo(REPO);
    const before = fakePty.spawns().length;
    const clock = fakeClock();
    const p = startScan({ clock });
    const id = await opened(before);
    fakePty.emit(id, "Select login method\r\n");
    await drive(clock, 3000);
    await p;
    const s = useScan.getState();
    expect(s.stage).toBe("error");
    expect(s.error).toMatchObject({ kind: "blocked", agent: "claude", text: "Claude needs an answer. Open a console of it, answer, and scan again." });
    expect(kills(id)).toBe(1);
  });
  it("S-1382 시간 초과는 'The scan took too long.' (제한은 10분)", async () => {
    expect(SCAN_TIMEOUT_MS).toBe(600_000);
    await scanRepo(REPO);
    const before = fakePty.spawns().length;
    const clock = fakeClock();
    const p = startScan({ clock, timeoutMs: 5000 });
    const id = await opened(before);
    fakePty.emit(id, "ready\r\n");
    await drive(clock, 7000);
    await p;
    expect(useScan.getState()).toMatchObject({ stage: "error", error: { kind: "other", text: "The scan took too long." } });
    expect(kills(id)).toBeGreaterThanOrEqual(1);
  });
  it("S-1383 답에서 사실을 못 읽으면 오류 문구", async () => {
    await scanRepo(REPO);
    const before = fakePty.spawns().length;
    const clock = fakeClock();
    const p = startScan({ clock });
    const id = await opened(before);
    await asked(clock, id);
    w.__fakeReply = "I could not find anything.";
    await drive(clock, 10000);
    await p;
    expect(useScan.getState()).toMatchObject({ stage: "error", error: { text: NO_FACTS } });
  });
});

describe("S-1384 Add N·Discard", () => {
  const rows = (): Row[] => [
    { kind: "Commands", title: "A", body: "a", dup: false, checked: true },
    { kind: "Gotchas", title: "B", body: "b", dup: false, checked: false },
    { kind: "Context", title: "C", body: "c", dup: true, checked: true },
  ];
  it("체크된 것만 현재 탭(This repo) 범위로 저장", async () => {
    useMemory.setState({ data: { [REPO]: [fact("old")], _all: [] }, tab: "repo" });
    useScan.setState({ stage: "review", repo: REPO, rows: rows() });
    await addSelected();
    expect(w.__fakeMemory![REPO]!.map((f) => [f.title, f.scope])).toEqual([["Title old", "repo"], ["A", "repo"], ["C", "repo"]]);
    expect(useMemory.getState().data[REPO]).toHaveLength(3);
    expect(useScan.getState().stage).toBe("idle");
  });
  it("All repos 탭이면 모든 저장소 범위", async () => {
    useMemory.setState({ data: { [REPO]: [], _all: [] }, tab: "all" });
    useScan.setState({ stage: "review", repo: REPO, rows: rows() });
    await addSelected();
    expect(w.__fakeMemory!._all!.map((f) => [f.title, f.scope])).toEqual([["A", "all"], ["C", "all"]]);
    expect(w.__fakeMemory![REPO]).toBeUndefined();
  });
  it("Discard 는 저장 없이 목록으로", () => {
    useScan.setState({ stage: "review", repo: REPO, rows: rows() });
    discardScan();
    expect(useScan.getState()).toMatchObject({ stage: "idle", rows: [] });
    expect(w.__fakeMemory).toEqual({});
  });
});

describe("S-1386 Refresh", () => {
  const F = fact("f1");
  async function run(reply: string) {
    delete w.__fakeReply; // 지난 번 답이 남아 있으면 새 답으로 안 보인다
    useMemory.setState({ data: { [REPO]: [F], _all: [] } });
    w.__fakeMemory = { [REPO]: [F] };
    const before = fakePty.spawns().length;
    const clock = fakeClock();
    const p = refreshFact(REPO, F, { clock });
    const id = await opened(before);
    expect(useScan.getState().refresh).toMatchObject({ factId: "f1", status: "running" });
    await asked(clock, id);
    expect(fakePty.writes(id).join("")).toContain("Body f1");
    w.__fakeReply = reply;
    await drive(clock, 10000);
    await p;
    return id;
  }
  it("ok → refreshedAt 만 갱신", async () => {
    await run('{"status":"ok"}');
    expect(useScan.getState().refresh?.status).toBe("ok");
    const saved = w.__fakeMemory![REPO]![0]!;
    expect(saved.refreshedAt).toBeTruthy();
    expect(saved.body).toBe("Body f1");
  });
  it("changed → 새 본문을 보여 주고 Update 하면 저장, Keep 이면 그대로", async () => {
    await run('{"status":"changed","body":"New body"}');
    expect(useScan.getState().refresh).toMatchObject({ status: "changed", body: "New body" });
    expect(w.__fakeMemory![REPO]![0]!.body).toBe("Body f1");
    await resolveRefresh(REPO, "keep");
    expect(useScan.getState().refresh).toBeNull();
    expect(w.__fakeMemory![REPO]![0]!.body).toBe("Body f1");
    await run('{"status":"changed","body":"New body"}');
    await resolveRefresh(REPO, "update");
    expect(w.__fakeMemory![REPO]![0]).toMatchObject({ body: "New body" });
    expect(w.__fakeMemory![REPO]![0]!.refreshedAt).toBeTruthy();
    expect(useScan.getState().refresh).toBeNull();
  });
  it("gone → Delete 하면 지우고, Keep 이면 남긴다", async () => {
    await run('{"status":"gone"}');
    expect(useScan.getState().refresh?.status).toBe("gone");
    await resolveRefresh(REPO, "keep");
    expect(w.__fakeMemory![REPO]).toHaveLength(1);
    await run('{"status":"gone"}');
    await resolveRefresh(REPO, "delete");
    expect(w.__fakeMemory![REPO]).toEqual([]);
  });
  it("취소하면 세션을 끄고 아무것도 바꾸지 않는다", async () => {
    useMemory.setState({ data: { [REPO]: [F], _all: [] } });
    w.__fakeMemory = { [REPO]: [F] };
    const before = fakePty.spawns().length;
    const clock = fakeClock();
    const p = refreshFact(REPO, F, { clock });
    const id = await opened(before);
    await asked(clock, id);
    cancelRefresh();
    expect(useScan.getState().refresh).toBeNull();
    expect(kills(id)).toBe(1);
    w.__fakeReply = '{"status":"ok"}';
    await drive(clock, 10000);
    await p;
    expect(useScan.getState().refresh).toBeNull();
    expect(w.__fakeMemory![REPO]![0]!.refreshedAt).toBeUndefined();
  });
});
