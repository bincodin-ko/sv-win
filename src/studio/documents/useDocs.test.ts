import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocMeta } from "../../lib/ipc";
import * as ipc from "../../lib/ipc";
import { studioRun, type StudioResult, type StudioRunOpts } from "../run";
import { BUSY, NOTHING, dismissNotice, loadVersions, removeVersion, repoState, select, showVersion, startRun, stopRun, useDocs } from "./useDocs";

vi.mock("../run", () => ({
  studioRun: vi.fn(),
  effortLimitMs: (e: "quick" | "balanced" | "thorough") => ({ quick: 360000, balanced: 720000, thorough: 1500000 })[e],
}));
vi.mock("../../lib/ipc", () => ({ docList: vi.fn(), docPut: vi.fn(), docGet: vi.fn(), docDelete: vi.fn() }));

const A = "C:/work/votelanding";
const B = "C:/work/other";
// 가짜 studioRun: 시험이 resolve 를 쥔다. Stop(signal) 이면 지금까지의 글로 stopped 를 돌려준다
type Held = { o: StudioRunOpts; done: (r: StudioResult) => void };
let held: Held[];
let store: Record<string, DocMeta[]>;
let now: number;
const flush = () => new Promise((r) => setTimeout(r, 0));
const req = { docId: "architecture", agentId: "claude", effort: "balanced" as const };

beforeEach(() => {
  held = [];
  store = {};
  now = 1_000_000;
  vi.clearAllMocks(); // 시험 결함 고침: docPut 등 호출 기록이 시험 사이에 남아 mock.calls[0] 이 옛것을 가리켰다
  useDocs.setState({ repos: {} });
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.mocked(studioRun).mockReset();
  vi.mocked(studioRun).mockImplementation((o) => new Promise<StudioResult>((resolve) => {
    let text = "";
    const origText = o.onText;
    o.onText = (t) => ((text = t), origText?.(t));
    o.signal?.addEventListener("abort", () => resolve({ stopped: true, text }));
    held.push({ o, done: resolve });
  }));
  vi.mocked(ipc.docList).mockImplementation(async (r) => store[r] ?? []);
  vi.mocked(ipc.docPut).mockImplementation(async (r, m) => void (store[r] = [m, ...(store[r] ?? []).filter((x) => x.id !== m.id)]));
  vi.mocked(ipc.docGet).mockResolvedValue("# saved");
  vi.mocked(ipc.docDelete).mockImplementation(async (r, id) => void (store[r] = (store[r] ?? []).filter((x) => x.id !== id)));
});
afterEach(() => vi.restoreAllMocks());

describe("S-1970 선택만으로는 시작 안 함", () => {
  it("select 는 studioRun 을 부르지 않고 run 도 없다", () => {
    select(A, { docId: "architecture" });
    expect(studioRun).not.toHaveBeenCalled();
    expect(repoState(A).run).toBeNull();
    expect(repoState(A).view.docId).toBe("architecture");
  });
});

describe("S-1978·S-1980·S-1981 실행", () => {
  it("startRun: repo 경로·에이전트·노력별 한도·프롬프트를 넘기고 run 상태를 채운다", async () => {
    void startRun(A, req);
    expect(studioRun).toHaveBeenCalledTimes(1);
    const o = held[0]!.o;
    expect(o.agentId).toBe("claude");
    expect(o.cwd).toBe(A);
    expect(o.limitMs).toBe(720000);
    expect(o.prompt).toContain("Architecture");
    expect(repoState(A).run).toMatchObject({ docId: "architecture", agentId: "claude", effort: "balanced", startedAt: 1_000_000, phase: "launching", text: "" });
  });
  it("onStatus·onText 가 run 의 단계와 글을 바꾼다", () => {
    void startRun(A, req);
    held[0]!.o.onStatus?.("thinking");
    expect(repoState(A).run?.phase).toBe("thinking");
    held[0]!.o.onText?.("# Doc\npart");
    held[0]!.o.onStatus?.("writing");
    expect(repoState(A).run).toMatchObject({ phase: "writing", text: "# Doc\npart" });
  });
  it("ok 면 complete 버전 하나를 저장하고 run 을 지운다. 제목 = '<repo> <문서>'", async () => {
    const p = startRun(A, req);
    held[0]!.o.onText?.("# Heading\nbody");
    now += 130000;
    held[0]!.done({ ok: true, text: "# Heading\nbody" });
    await p;
    const m = vi.mocked(ipc.docPut).mock.calls[0]!;
    expect(m[0]).toBe(A);
    expect(m[1]).toMatchObject({ docId: "architecture", title: "Votelanding Architecture", agent: "claude", effort: "balanced", startedAt: 1_000_000, durationMs: 130000, status: "complete" });
    expect(m[2]).toBe("# Heading\nbody");
    const st = repoState(A);
    expect(st.run).toBeNull();
    expect(st.versions).toHaveLength(1);
    expect(st.view).toMatchObject({ docId: "architecture", versionId: m[1].id });
    expect(st.md[m[1].id]).toBe("# Heading\nbody");
  });
  it("자유 요청: 제목은 글의 첫 # 제목", async () => {
    const p = startRun(A, { docId: "ask", ask: "a migration plan from REST to GraphQL", agentId: "claude", effort: "quick" });
    expect(held[0]!.o.prompt).toContain("a migration plan from REST to GraphQL");
    held[0]!.done({ ok: true, text: "# REST to GraphQL\nsteps" });
    await p;
    expect(vi.mocked(ipc.docPut).mock.calls[0]![1].title).toBe("REST to GraphQL");
  });
});

describe("S-1977 한 번에 하나", () => {
  it("돌고 있으면 두 번째 startRun 은 시작 안 하고 false", async () => {
    void startRun(A, req);
    expect(await startRun(A, { ...req, docId: "readme" })).toBe(false);
    expect(studioRun).toHaveBeenCalledTimes(1);
    expect(BUSY).toBe("A document is being written.");
  });
  it("끝나면 다시 시작할 수 있다", async () => {
    const p = startRun(A, req);
    held[0]!.done({ ok: true, text: "# X" });
    await p;
    void startRun(A, req);
    expect(studioRun).toHaveBeenCalledTimes(2);
  });
});

describe("S-1982 Stop", () => {
  it("글이 있으면 Incomplete 버전으로 저장", async () => {
    const p = startRun(A, req);
    held[0]!.o.onText?.("# Half\nwri");
    stopRun(A);
    await p;
    expect(vi.mocked(ipc.docPut).mock.calls[0]![1].status).toBe("incomplete");
    expect(vi.mocked(ipc.docPut).mock.calls[0]![2]).toBe("# Half\nwri");
    expect(repoState(A).run).toBeNull();
    expect(repoState(A).versions[0]?.status).toBe("incomplete");
  });
  it("글이 없으면 저장하지 않고 빈 화면(view 에 버전 없음)으로 돌아간다", async () => {
    const p = startRun(A, req);
    stopRun(A);
    await p;
    expect(ipc.docPut).not.toHaveBeenCalled();
    expect(repoState(A).run).toBeNull();
    expect(repoState(A).view.versionId).toBeNull();
    expect(repoState(A).notice).toBeNull();
  });
});

describe("S-1983 한도·S-1984 막힘", () => {
  it("timeout + 글 있음 → Incomplete 저장", async () => {
    const p = startRun(A, req);
    held[0]!.done({ timeout: true, text: "# Slow\npartial" });
    await p;
    expect(vi.mocked(ipc.docPut).mock.calls[0]![1].status).toBe("incomplete");
  });
  it("timeout + 글 없음 → 저장 없이 오류 띠", async () => {
    const p = startRun(A, req);
    held[0]!.done({ timeout: true, text: "" });
    await p;
    expect(ipc.docPut).not.toHaveBeenCalled();
    expect(repoState(A).notice).toBe(NOTHING);
    expect(NOTHING).toBe("Nothing came back. Try Quick, or a narrower ask.");
    dismissNotice(A);
    expect(repoState(A).notice).toBeNull();
  });
  it("blocked → 저장 없이 막힘 문구(에이전트 이름 포함)", async () => {
    const p = startRun(A, req);
    held[0]!.done({ blocked: true, why: "Do you trust this folder?" });
    await p;
    expect(ipc.docPut).not.toHaveBeenCalled();
    expect(repoState(A).run).toBeNull();
    expect(repoState(A).notice).toBe("Claude Code is asking a question Symvibe will not answer for you. Open a console in this repo, answer it there, and try again.");
  });
  it("blocked 권한 질문 → 질문 줄과 설정 안내", async () => {
    const p = startRun(A, req);
    held[0]!.done({ blocked: true, why: "Bash command\n git push\nDo you want to proceed?\n 1. Yes" });
    await p;
    expect(repoState(A).notice).toContain("Claude Code asked for permission to use a tool:");
    expect(repoState(A).notice).not.toContain("Open a console");
  });
  it("blocked(Codex)는 Codex 이름", async () => {
    const p = startRun(A, { ...req, agentId: "codex" });
    held[0]!.done({ blocked: true, why: "x" });
    await p;
    expect(repoState(A).notice).toMatch(/^Codex is asking a question/);
  });
  it("error → 그 문구가 띠에 나온다, 저장 없음", async () => {
    const p = startRun(A, req);
    held[0]!.done({ error: "claude 를 찾을 수 없다" });
    await p;
    expect(repoState(A).notice).toContain("claude 를 찾을 수 없다");
    expect(ipc.docPut).not.toHaveBeenCalled();
  });
  it("새 실행을 시작하면 이전 띠는 사라진다", async () => {
    const p = startRun(A, req);
    held[0]!.done({ timeout: true, text: "" });
    await p;
    void startRun(A, req);
    expect(repoState(A).notice).toBeNull();
  });
});

describe("S-1994 스튜디오를 닫아도·워크스페이스를 바꿔도 실행 유지", () => {
  it("구독하는 컴포넌트가 없어도 끝나면 저장된다", async () => {
    const p = startRun(A, req); // 구독자 없음 = 스튜디오 닫힘
    held[0]!.done({ ok: true, text: "# Later" });
    await p;
    expect(ipc.docPut).toHaveBeenCalledTimes(1);
  });
  it("repo 마다 따로: A 가 도는 중에도 B 는 시작할 수 있고, 서로의 상태가 섞이지 않는다", async () => {
    void startRun(A, req);
    const pb = startRun(B, { ...req, docId: "readme" });
    expect(studioRun).toHaveBeenCalledTimes(2);
    expect(repoState(A).run?.docId).toBe("architecture");
    expect(repoState(B).run?.docId).toBe("readme");
    held[1]!.done({ ok: true, text: "# B" });
    await pb;
    expect(repoState(A).run).not.toBeNull();
    expect(repoState(B).versions).toHaveLength(1);
    expect(repoState(A).versions).toHaveLength(0);
  });
});

describe("S-1976·S-1988·S-1990 버전", () => {
  const meta = (id: string, at: number, docId = "architecture"): DocMeta => ({ id, docId, title: "t", agent: "claude", effort: "balanced", startedAt: at, durationMs: 1, status: "complete" });
  it("loadVersions: 최신 먼저로 가져온다", async () => {
    store[A] = [meta("old", 1), meta("new", 2)];
    await loadVersions(A);
    expect(repoState(A).versions.map((v) => v.id)).toEqual(["new", "old"]);
    expect(repoState(A).loaded).toBe(true);
  });
  it("select: 저장된 버전이 있는 항목은 가장 새것을 연다, 없으면 빈 화면", async () => {
    store[A] = [meta("old", 1), meta("new", 2), meta("other", 9, "readme")];
    await loadVersions(A);
    select(A, { docId: "architecture" });
    await flush();
    expect(repoState(A).view).toMatchObject({ docId: "architecture", versionId: "new" });
    select(A, { docId: "api" });
    expect(repoState(A).view).toMatchObject({ docId: "api", versionId: null });
  });
  it("select ask(새 요청)는 항상 빈 화면에서 시작", async () => {
    store[A] = [meta("a1", 5, "ask")];
    await loadVersions(A);
    select(A, { docId: "ask", ask: "something new" });
    expect(repoState(A).view).toMatchObject({ docId: "ask", ask: "something new", versionId: null });
  });
  it("showVersion: 본문을 docGet 으로 가져와 캐시한다", async () => {
    store[A] = [meta("v1", 1)];
    await loadVersions(A);
    await showVersion(A, "v1");
    expect(ipc.docGet).toHaveBeenCalledWith(A, "v1");
    expect(repoState(A).md.v1).toBe("# saved");
    expect(repoState(A).view.versionId).toBe("v1");
  });
  it("removeVersion: doc_delete 를 부르고 목록에서 빼며, 보고 있던 버전이면 다음 버전을 연다", async () => {
    store[A] = [meta("v1", 1), meta("v2", 2)];
    await loadVersions(A);
    select(A, { docId: "architecture" });
    await flush();
    await removeVersion(A, "v2");
    expect(ipc.docDelete).toHaveBeenCalledWith(A, "v2");
    expect(repoState(A).versions.map((v) => v.id)).toEqual(["v1"]);
    expect(repoState(A).view.versionId).toBe("v1");
    await removeVersion(A, "v1");
    expect(repoState(A).view.versionId).toBeNull();
  });
});
