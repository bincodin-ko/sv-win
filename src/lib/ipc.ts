// PTY IPC: Tauri 안이면 Rust(pty.rs), 밖(vite dev 브라우저·Playwright·vitest)이면 가짜 PTY
import { Channel, invoke } from "@tauri-apps/api/core";
import { fakeGitCall, fakeGitInit } from "../git/fake";
import type { PiperKind, PiperStatus } from "../voice/piper";

export interface SpawnOpts {
  program?: string; // 비우면 Rust가 %COMSPEC%
  args?: string[];
  env?: [string, string][]; // 자식 환경에 더할 변수(yoloEnv 등)
  cwd?: string; // 비우면 사용자 홈
  cols: number;
  rows: number;
  onData: (bytes: Uint8Array) => void;
  onExit: (code: number | null) => void;
}

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ---- 가짜 PTY: 입력 되울림 + 시험용 대량 출력 ----
const BATCH = 64 * 1024;
const enc = new TextEncoder();
const fakes = new Map<number, Pick<SpawnOpts, "onData" | "onExit">>();
const fakeResizes = new Map<number, [number, number][]>();
const fakeWrites = new Map<number, string[]>();
let nextId = 0;
const fakeCtl: { id: number; op: "pause" | "resume" | "kill" }[] = [];
const spawnLog: { id: number; program?: string; args: string[]; env?: [string, string][]; cwd?: string }[] = [];

export const fakePty = {
  /** id 터미널에 bytes 이상을 64KB 이하 묶음으로(16ms 간격, 실제 Rust 묶음과 같게) 보내고 `DONE-<id>`로 끝낸다 */
  async flood(id: number, bytes: number): Promise<void> {
    let line = 0;
    let sent = 0;
    while (sent < bytes && fakes.has(id)) {
      let s = "";
      while (s.length < BATCH - 100 && sent + s.length < bytes)
        s += `${id} ${String(line++).padStart(8)} abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ\r\n`;
      const b = enc.encode(s);
      sent += b.length;
      fakes.get(id)?.onData(b);
      await new Promise((r) => setTimeout(r, 16));
    }
    fakes.get(id)?.onData(enc.encode(`DONE-${id}\r\n`));
  },
  ids(): number[] {
    return [...fakes.keys()];
  },
  /** 시험용: pty_spawn 요청 기록(A9: --session-id / --resume 인자를 본다) */
  spawns(): { id: number; program?: string; args: string[]; env?: [string, string][]; cwd?: string }[] {
    return spawnLog;
  },
  /** 시험용: 프로그램이 text 를 출력한 것처럼 */
  emit(id: number, text: string): void {
    fakes.get(id)?.onData(enc.encode(text));
  },
  /** 시험용: 프로세스가 code 로 끝난 것처럼 */
  exit(id: number, code: number | null): void {
    const f = fakes.get(id);
    fakes.delete(id);
    f?.onExit(code);
  },
  /** 시험용: pty_write 로 받은 입력 기록(되울림 전 원문) */
  writes(id: number): string[] {
    return fakeWrites.get(id) ?? [];
  },
  /** 시험용: pause·resume·kill 요청이 온 순서 */
  ctl(): { id: number; op: "pause" | "resume" | "kill" }[] {
    return fakeCtl;
  },
  /** 시험용: pty_resize 로 받은 [cols, rows] 기록 */
  resizes(id: number): [number, number][] {
    return fakeResizes.get(id) ?? [];
  },
};

// 시험(Playwright)이 xterm 버퍼를 읽도록 가짜 모드에서만 노출
type TermLike = { buffer: unknown; cols: number; rows: number; getSelection(): string };
export const debugTerms = new Map<number, TermLike>();
if (typeof window !== "undefined" && !isTauri()) Object.assign(window, { __fakePty: fakePty, __terms: debugTerms });

// ---- 공개 API ----
export async function ptySpawn(o: SpawnOpts): Promise<number> {
  if (!isTauri()) {
    const id = ++nextId;
    const slow = (window as unknown as { __fakeSpawnMs?: number }).__fakeSpawnMs; // 시험용: 실제 spawn 처럼 id 가 늦게 오게
    if (slow) await new Promise((r) => setTimeout(r, slow));
    fakes.set(id, { onData: o.onData, onExit: o.onExit });
    spawnLog.push({ id, program: o.program, args: o.args ?? [], env: o.env, cwd: o.cwd });
    return id;
  }
  const onData = new Channel<ArrayBuffer>();
  onData.onmessage = (buf) => o.onData(new Uint8Array(buf));
  const onExit = new Channel<{ code: number | null }>();
  onExit.onmessage = (m) => o.onExit(m.code);
  return invoke<number>("pty_spawn", {
    program: o.program ?? null,
    args: o.args ?? null,
    env: o.env ?? null,
    cwd: o.cwd ?? null,
    cols: o.cols,
    rows: o.rows,
    onData,
    onExit,
  });
}

export async function ptyWrite(id: number, data: string): Promise<void> {
  if (!isTauri()) {
    if (fakes.has(id)) fakeWrites.set(id, [...(fakeWrites.get(id) ?? []), data]);
    fakes.get(id)?.onData(enc.encode(data.replace(/\r/g, "\r\n")));
    return;
  }
  await invoke("pty_write", { id, data });
}

export async function ptyResize(id: number, cols: number, rows: number): Promise<void> {
  if (!isTauri()) {
    if (fakes.has(id)) fakeResizes.set(id, [...(fakeResizes.get(id) ?? []), [cols, rows]]);
    return;
  }
  await invoke("pty_resize", { id, cols, rows });
}

/** P2: Rust 출력 묶음 간격을 저사양·보임 여부에 맞춘다(16ms / 50ms / 안 보이면 100ms). 브라우저(가짜 PTY)에서는 할 일 없음 */
export async function ptyBatch(id: number, lowSpec: boolean, visible: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("pty_set_batch", { id, lowSpec, visible }).catch(() => {});
}

export async function ptyKill(id: number): Promise<void> {
  if (!isTauri()) {
    fakeCtl.push({ id, op: "kill" });
    const f = fakes.get(id);
    fakes.delete(id);
    f?.onExit(null);
    return;
  }
  await invoke("pty_kill", { id }).catch(() => {}); // 이미 끝난 터미널
}

/** S-620: 프로세스 트리를 멈춘다. 가짜: 기록만 */
export async function ptyPause(id: number): Promise<void> {
  if (!isTauri()) return void fakeCtl.push({ id, op: "pause" });
  await invoke("pty_pause", { id }).catch(() => {}); // 이미 끝난 터미널
}
/** S-621: 다시 돌린다 */
export async function ptyResume(id: number): Promise<void> {
  if (!isTauri()) return void fakeCtl.push({ id, op: "resume" });
  await invoke("pty_resume", { id }).catch(() => {});
}

// ---- A8 보드 저장 IPC: Tauri 밖에서는 메모리 저장(가짜 repo 하나가 기본) ----
import type { LoadResult, Repos } from "../board/persist";


// B3 시험: __symSeed.repos 로 repo 목록을 심는다
let fakeRepos: Repos = (typeof window !== "undefined" && (window as never as { __symSeed?: { repos?: Repos } }).__symSeed?.repos) || {
  repos: [{ path: "C:/fake/repo", name: "repo", workspaces: [{ id: "ws-fake", name: "Workspace 1" }] }],
  lastRepo: "C:/fake/repo",
  lastWorkspace: {},
};
// A9 시험: Playwright 가 addInitScript 로 window.__symSeed = { boards, transcripts } 를 심어 저장된 보드·transcript 가 있는 상태로 연다
const seed: { boards?: Record<string, string>; transcripts?: string[] } = (typeof window !== "undefined" && (window as never as { __symSeed?: never }).__symSeed) || {};
const fakeBoards = new Map<string, string>(Object.entries(seed.boards ?? {}));

export async function reposGet(): Promise<Repos> {
  return isTauri() ? invoke<Repos>("repos_get") : fakeRepos;
}
export async function reposSet(r: Repos): Promise<void> {
  if (isTauri()) await invoke("repos_set", { repos: r });
  else fakeRepos = r;
}
export async function boardLoad(id: string): Promise<LoadResult> {
  if (isTauri()) return invoke<LoadResult>("board_load", { id });
  const json = fakeBoards.get(id);
  return json === undefined ? { json: null, source: "empty", archived: false } : { json, source: "main", archived: false };
}
export async function boardSave(id: string, json: string): Promise<void> {
  if (isTauri()) await invoke("board_save", { id, json });
  else {
    fakeBoards.set(id, json);
    ((window as unknown as { __savedBoards?: Record<string, string> }).__savedBoards ??= {})[id] = json; // C16 시험: 마지막 저장본
  }
}
export async function boardArchive(id: string): Promise<void> {
  if (isTauri()) await invoke("board_archive", { id });
  else {
    fakeBoards.delete(id);
    ((window as unknown as { __archived?: string[] }).__archived ??= []).push(id); // B4 시험: Archive 호출 기록
  }
}
export async function dirExists(path: string): Promise<boolean> {
  // 가짜: window.__fakeMissing 에 든 경로만 없는 폴더(B3 시험)
  return isTauri() ? invoke<boolean>("dir_exists", { path }) : !((window as never as { __fakeMissing?: string[] }).__fakeMissing ?? []).includes(path);
}
/** 폴더 선택창(S-208). 취소하면 null. Tauri 밖(가짜)에는 선택창이 없어 null */
export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) return (window as unknown as { __fakePickFolder?: string }).__fakePickFolder ?? null; // 가짜: 시험이 정한 경로
  const { open } = await import("@tauri-apps/plugin-dialog");
  const p = await open({ directory: true, multiple: false });
  return typeof p === "string" ? p : null;
}

/** 실행 파일 선택창(S-375). 취소하면 null. 가짜: window.__fakePickFile */
export async function pickFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (!isTauri()) return ((window as unknown as { __fakePickFile?: string }).__fakePickFile ?? null);
  const { open } = await import("@tauri-apps/plugin-dialog");
  const p = await open({ directory: false, multiple: false, filters });
  return typeof p === "string" ? p : null;
}

// ---- A9 Resume·종료 IPC ----
export async function claudeTranscriptExists(repo: string, sessionId: string, configDir?: string): Promise<boolean> {
  return isTauri() ? invoke<boolean>("claude_transcript_exists_cmd", { repo, sessionId, configDir: configDir ?? null }) : (seed.transcripts ?? []).includes(sessionId);
}
/** 콘솔 시작 뒤 생긴 Codex rollout 의 세션 id (S-238). Tauri 밖(가짜)에는 없음 */
export async function codexFindSession(repo: string, startedAfterMs: number, claimed: string[], configDir?: string): Promise<string | null> {
  return isTauri() ? invoke<string | null>("codex_find_session_cmd", { repo, startedAfterMs, claimed, configDir: configDir ?? null }) : null;
}
/** 모든 PTY 를 끝내고 앱을 끈다(S-231). 가짜: 가짜 PTY 를 모두 없애고 window.__fakeQuit 를 켠다 */
export async function appQuit(): Promise<void> {
  if (isTauri()) return void (await invoke("app_quit"));
  fakes.clear(); // 앱이 끝나므로 종료 콜백(셸로 떨어지기)은 돌지 않는다
  Object.assign(window, { __fakeQuit: true });
}
/** 창 닫기(X·Alt+F4)를 Rust 가 가로챘다는 알림(S-230). 해제 함수를 돌려준다 */
export function onQuitRequested(cb: () => void): () => void {
  if (!isTauri()) return () => {};
  const un = import("@tauri-apps/api/event").then((m) => m.listen("quit-requested", cb));
  return () => void un.then((f) => f());
}

// ---- B3 홈 화면 IPC ----
/** repo 행의 git 브랜치(S-315). git 저장소가 아니면 null. 가짜: window.__fakeBranches[path] ?? "main" */
export async function repoBranch(path: string): Promise<string | null> {
  if (isTauri()) return invoke<string | null>("repo_branch", { path });
  return (window as never as { __fakeBranches?: Record<string, string | null> }).__fakeBranches?.[path] ?? "main";
}

/** 창에 폴더(여러 개)를 끌어놓았다는 알림(S-317). 해제 함수를 돌려준다. 가짜: window.__dropFolders(paths) */
const fakeDrops = new Set<(paths: string[]) => void>();
if (typeof window !== "undefined" && !isTauri()) Object.assign(window, { __dropFolders: (paths: string[]) => fakeDrops.forEach((f) => f(paths)) });
export function onFolderDrop(cb: (paths: string[]) => void): () => void {
  if (!isTauri()) {
    fakeDrops.add(cb);
    return () => void fakeDrops.delete(cb);
  }
  const un = import("@tauri-apps/api/webview").then((m) =>
    m.getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop") cb(e.payload.paths);
    }),
  );
  return () => void un.then((f) => f());
}

/** 창 드롭(파일·폴더)과 놓은 위치(창 기준 물리 픽셀, 모르면 null). 보드 화면의 파일 카드용(C15). 가짜: window.__dropFiles(paths, {x,y}) */
export type DropPos = { x: number; y: number } | null;
const fakeFileDrops = new Set<(paths: string[], pos: DropPos) => void>();
if (typeof window !== "undefined" && !isTauri()) Object.assign(window, { __dropFiles: (paths: string[], pos?: DropPos) => fakeFileDrops.forEach((f) => f(paths, pos ?? null)) });
export function onFileDrop(cb: (paths: string[], pos: DropPos) => void): () => void {
  if (!isTauri()) {
    fakeFileDrops.add(cb);
    return () => void fakeFileDrops.delete(cb);
  }
  const un = import("@tauri-apps/api/webview").then((m) =>
    m.getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop") cb(e.payload.paths, e.payload.position);
    }),
  );
  return () => void un.then((f) => f());
}

// ---- B6 GitHub CLI 연결(S-384~S-387). 가짜: window.__fakeGh {installed,user}, 로그아웃 요청 기록 window.__fakeGhLog ----
export interface GhStatus { installed: boolean; user: string | null }
type FakeWin = { __fakeGh?: { installed: boolean; user?: string | null }; __fakeGhLog?: string[] };
export async function ghStatus(): Promise<GhStatus> {
  if (isTauri()) return invoke<GhStatus>("gh_status");
  const f = (window as unknown as FakeWin).__fakeGh;
  return { installed: f?.installed ?? true, user: f?.user ?? null };
}
export async function ghLogout(): Promise<void> {
  if (isTauri()) return invoke("gh_logout");
  const w = window as unknown as FakeWin;
  (w.__fakeGhLog ??= []).push("logout");
  w.__fakeGh = { installed: true, user: null };
}

// ---- B9 명령 바 스레드(S-554·S-555). 가짜: localStorage(새로고침을 견딘다, 시험용) ----
const fakeThreadsKey = "symvibe.fakeThreads";
const fakeThreads = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(fakeThreadsKey) ?? "{}"); } catch { return {}; }
};
/** repo 식별자(경로)의 저장된 스레드 JSON. 없거나 읽지 못하면 "[]" */
export async function threadLoad(repoKey: string): Promise<string> {
  return isTauri() ? invoke<string>("thread_load", { repoKey }) : (fakeThreads()[repoKey] ?? "[]");
}
export async function threadSave(repoKey: string, json: string): Promise<void> {
  if (isTauri()) return invoke("thread_save", { repoKey, json });
  try { localStorage.setItem(fakeThreadsKey, JSON.stringify({ ...fakeThreads(), [repoKey]: json })); } catch { /* 저장소 막힘 */ }
}

// ---- B15 출력 viewer(S-661·S-665). 가짜: window.__fakeReply(문자열) = transcript 의 마지막 답, window.__savedOutputs = 저장 기록 ----
// D2 S-1211: __fakeReply 가 객체면 세션 id 별 답, 문자열이면 전부 같은 답
function fakeReplyFor(sessionId: string): string | null {
  const r = (window as unknown as { __fakeReply?: string | Record<string, string> | null }).__fakeReply;
  return typeof r === "object" && r ? (r[sessionId] ?? null) : (r ?? null);
}
/** Claude/Codex transcript 의 마지막 답. 없으면 null(호출한 쪽이 화면 방식으로 대신한다, S-662) */
export async function lastReply(agent: string, repo: string, sessionId: string, configDir?: string): Promise<string | null> {
  return isTauri() ? invoke<string | null>("last_reply_cmd", { agent, repo, sessionId, configDir: configDir ?? null }) : fakeReplyFor(sessionId);
}
/** `<repo>/outputs/<name>-<stamp>.md` 로 저장하고 경로를 돌려준다 */
export async function outputsSave(repo: string, name: string, stamp: string, content: string): Promise<string> {
  if (isTauri()) return invoke<string>("outputs_save_cmd", { repo, name, stamp, content });
  const log = ((window as unknown as { __savedOutputs?: Record<string, string>[] }).__savedOutputs ??= []);
  const n = log.filter((x) => x.repo === repo && x.name === name && x.stamp === stamp).length;
  const path = `${repo}/outputs/${name}-${stamp}${n ? `-${n + 1}` : ""}.md`;
  log.push({ repo, name, stamp, content, path });
  return path;
}

// ---- B13 내가 저장한 layout 목록(S-647). 가짜: 메모리 ----
import type { SavedLayout } from "../presets/saved";
let fakePresets: SavedLayout[] = [];
export async function presetsGet(): Promise<SavedLayout[]> {
  return isTauri() ? invoke<SavedLayout[]>("presets_get") : fakePresets;
}
export async function presetsSet(list: SavedLayout[]): Promise<void> {
  if (isTauri()) await invoke("presets_set", { list });
  else fakePresets = list;
}

// ---- B16 라이브 에이전트 상태(S-680~S-684). 가짜: 호출 기록 window.__liveLog, hook 이벤트 발생기 window.__agentEvent(console, event, payload?) ----
export interface LivePaths { claude: string; codex: string; script: string }
export interface AgentStatusEvent { console: string; event: string; payload?: Record<string, unknown> }
const liveListeners = new Set<(e: AgentStatusEvent) => void>();
if (typeof window !== "undefined" && !isTauri()) {
  Object.assign(window, { __agentEvent: (console: string, event: string, payload?: Record<string, unknown>) => liveListeners.forEach((f) => f({ console, event, payload })) });
}
const liveLog = (what: string) => ((window as unknown as { __liveLog?: string[] }).__liveLog ??= []).push(what);
export async function livePaths(): Promise<LivePaths> {
  return isTauri() ? invoke<LivePaths>("live_status_paths") : { claude: "%USERPROFILE%/.claude/settings.json", codex: "%USERPROFILE%/.codex/hooks.json", script: "%USERPROFILE%/.hypervibe/agent-hooks/hypervibe-hook.cmd" };
}
/** 설정 파일에 항목을 더하고 수신기를 연다. 돌려주는 값 = SYMVIBE_HOOK_URL */
export async function liveEnable(): Promise<string> {
  if (isTauri()) return invoke<string>("live_status_enable");
  liveLog("enable");
  return "http://127.0.0.1:1/fake-token";
}
export async function liveDisable(): Promise<void> {
  if (isTauri()) return invoke("live_status_disable");
  liveLog("disable");
}
/** D12 S-1629: 라이브 상태가 켜져 있을 때 새 프로필 폴더에도 항목을 넣는다 */
export async function liveInstallProfile(agent: ProfileAgent, id: string): Promise<void> {
  if (isTauri()) return invoke("live_status_install_profile", { agent, id });
  liveLog(`install-profile:${agent}/${id}`);
}
/** 설정은 건드리지 않고 수신기 주소만(이미 켜져 있던 앱을 다시 열었을 때) */
export async function liveUrl(): Promise<string> {
  return isTauri() ? invoke<string>("live_status_url") : "http://127.0.0.1:1/fake-token";
}
export function onAgentStatus(cb: (e: AgentStatusEvent) => void): () => void {
  if (!isTauri()) {
    liveListeners.add(cb);
    return () => void liveListeners.delete(cb);
  }
  const un = import("@tauri-apps/api/event").then((m) => m.listen<AgentStatusEvent>("agent-status", (e) => cb(e.payload)));
  return () => void un.then((f) => f());
}

// ---- B17 첫 실행 카드: clone·new repo (S-394~S-396). 가짜: window.__fakeGit {clone?: 오류 줄(없으면 성공), taken?: 이미 있는 경로[]}, 호출 기록 window.__fakeGitLog ----
export interface CloneState { state: "Running" | "Done" | "Failed"; message?: string }
type FakeGit = { __fakeGit?: { clone?: string; taken?: string[] }; __fakeGitLog?: string[] };
const fg = () => window as unknown as FakeGit;
const fakeJobs = new Map<number, CloneState>();
/** %USERPROFILE% 와 그 아래 hypervibe 폴더 유무(S-394). 가짜: C:\Users\fake */
export async function homeDirs(): Promise<{ home: string; hasHypervibe: boolean }> {
  return isTauri() ? invoke("home_dirs") : { home: "C:\Users\fake", hasHypervibe: false };
}
/** 같은 이름의 폴더·파일이 이미 있는지(S-394) */
export async function pathTaken(path: string): Promise<boolean> {
  return isTauri() ? invoke<boolean>("dir_exists", { path }) : (fg().__fakeGit?.taken ?? []).includes(path);
}
/** git clone 을 시작해 job id 를 돌려준다. git 이 없거나 dest 가 있으면 reject(문구 그대로) */
export async function gitClone(url: string, dest: string): Promise<number> {
  if (isTauri()) return invoke<number>("git_clone", { url, dest });
  (fg().__fakeGitLog ??= []).push(`clone ${url} ${dest}`);
  const err = fg().__fakeGit?.clone;
  if (err === "git not found") throw "git not found";
  const id = fakeJobs.size + 1;
  fakeJobs.set(id, err ? { state: "Failed", message: err } : { state: "Done" });
  return id;
}
export async function gitCloneStatus(job: number): Promise<CloneState> {
  return isTauri() ? ((await invoke<CloneState | null>("git_clone_status", { job })) ?? { state: "Failed", message: "Unknown job" }) : (fakeJobs.get(job) ?? { state: "Failed", message: "Unknown job" });
}
/** 그 clone 의 프로세스만 끈다 */
export async function gitCancel(job: number): Promise<void> {
  if (isTauri()) await invoke("git_cancel", { job });
}
/** 폴더를 만들고 git init (branchMain 이면 -b main) */
export async function gitInit(path: string, branchMain: boolean): Promise<void> {
  if (isTauri()) return invoke("git_init", { path, branchMain });
  if ((fg().__fakeGit as { repos?: Record<string, unknown> } | undefined)?.repos?.[path]) throw `${path} already exists`; // Rust git_init 계약: 폴더가 이미 있으면 거절
  (fg().__fakeGitLog ??= []).push(`init ${path} ${branchMain ? "main" : "plain"}`);
  fakeGitInit(path);
}

// ---- FX3 ----
/** S-1009: 이미 있는 폴더에서 git init (branchMain 이면 -b main). 폴더가 없거나 이미 저장소면 실패 */
export async function gitInitHere(path: string, branchMain: boolean): Promise<void> {
  if (isTauri()) return invoke("git_init_here", { path, branchMain });
  const repos = (fg().__fakeGit as { repos?: Record<string, { notRepo?: boolean }> } | undefined)?.repos;
  const r = repos?.[path];
  if (!r) throw `${path} not found`; // Rust 계약: 폴더가 있어야만 성공 (가짜에서는 repos 항목 = 있는 폴더)
  if (!r.notRepo) throw "already a repository";
  (fg().__fakeGitLog ??= []).push(`init ${path} ${branchMain ? "main" : "plain"}`);
  fakeGitInit(path);
}

// ---- 3묶음 C3: git 명령(S-1002~S-1016). 실패는 예외가 아니라 { ok:false, message } ----
export type GitResult = { ok: boolean; message: string; notGit: boolean; gitMissing: boolean; diverged: boolean; oversize: boolean };
export type GitFile = { path: string; status: "M" | "A" | "D" | "R" | "?"; add: number; del: number };
export type GitStatus = GitResult & {
  branch: string;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  remoteUrl: string | null;
  webUrl: string | null;
  files: GitFile[];
  total: number;
  conflict: boolean;
};
export type GitCommit = { hash: string; subject: string; author: string; time: string };
export type GitBranch = { name: string; current: boolean };
export type GitBigFile = { path: string; size: number };

/** 브라우저(시험)에서는 window.__fakeGit.call(명령, 인자)가 있으면 거기로, 없으면 가짜 구현 */
async function gitCall<T extends GitResult>(cmd: string, args: Record<string, unknown>): Promise<T> {
  if (isTauri()) return invoke<T>(cmd, args);
  const call = (window as unknown as { __fakeGit?: { call?: (c: string, a: Record<string, unknown>) => unknown } }).__fakeGit?.call;
  return (call ? await call(cmd, args) : await fakeGitCall(cmd, args)) as T; // 시험이 call 을 심지 않으면 src/git/fake.ts(C9)
}
export const gitStatus = (repo: string) => gitCall<GitStatus>("git_status", { repo });
export const gitLog = (repo: string, n = 100) => gitCall<GitResult & { commits: GitCommit[] }>("git_log", { repo, n });
export const gitCommit = (repo: string, paths: string[], message: string) => gitCall<GitResult>("git_commit", { repo, paths, message });
export const gitPush = (repo: string) => gitCall<GitResult>("git_push", { repo });
export const gitPull = (repo: string) => gitCall<GitResult>("git_pull", { repo });
export const gitDiscard = (repo: string, path: string, tracked: boolean) => gitCall<GitResult>("git_discard", { repo, path, tracked });
export const gitOversize = (repo: string, paths: string[]) => gitCall<GitResult & { files: GitBigFile[] }>("git_oversize", { repo, paths });
export const gitKeepOff = (repo: string, paths: string[]) => gitCall<GitResult>("git_keep_off", { repo, paths });
export const gitRemoveOversize = (repo: string) => gitCall<GitResult>("git_remove_oversize", { repo });
export const gitPublish = (repo: string, name: string, isPrivate: boolean) => gitCall<GitResult>("git_publish", { repo, name, private: isPrivate });
export const gitBranches = (repo: string) => gitCall<GitResult & { branches: GitBranch[] }>("git_branches", { repo });
export const gitSwitch = (repo: string, name: string) => gitCall<GitResult>("git_switch", { repo, name });
export const gitBranchNew = (repo: string, name: string) => gitCall<GitResult>("git_branch_new", { repo, name });
export const gitBranchDelete = (repo: string, name: string) => gitCall<GitResult>("git_branch_delete", { repo, name });

// ---- 3묶음 C2 파일·웹 바탕 IPC (S-966, S-1099, S-1132) ----
export type FileStat = { exists: boolean; isDir: boolean; size: number; mtime: number };
export type FileTextResult = { kind: "text"; text: string } | { kind: "binary" } | { kind: "tooLarge" } | { kind: "error"; message: string };
export type WebProbe = { reachable: boolean; frameBlocked: boolean; status: number | null };
type FakeFile = { text?: string; bytes?: number[]; stat?: Partial<FileStat> };
type C2Win = {
  /** 경로 → 가짜 파일(text 또는 bytes). 폴더는 stat.isDir. 시험이 심는다 */
  __fakeFiles?: Record<string, FakeFile>;
  /** ports: {3000:true} 열린 포트, probe: {url:{reachable,frameBlocked}} */
  __fakeWeb?: { ports?: Record<number, boolean>; probe?: Record<string, Partial<WebProbe>> };
  __fakeFsLog?: string[];
  __fakePortCalls?: number;
  __fakeWebLog?: string[];
};
const c2 = () => window as unknown as C2Win;
const fsLog = (s: string) => (c2().__fakeFsLog ??= []).push(s);
const webLog = (s: string) => (c2().__fakeWebLog ??= []).push(s);
const fakeFile = (p: string) => c2().__fakeFiles?.[p];
const fakeBytes = (f: FakeFile) => new Uint8Array(f.bytes ?? Array.from(new TextEncoder().encode(f.text ?? "")));

/** 파일 원시 바이트 */
export async function fileRead(path: string): Promise<Uint8Array> {
  if (isTauri()) return new Uint8Array(await invoke<ArrayBuffer>("file_read", { path }));
  const f = fakeFile(path);
  if (!f) throw "not found";
  return fakeBytes(f);
}
export async function fileStat(path: string): Promise<FileStat> {
  if (isTauri()) return invoke<FileStat>("file_stat", { path });
  const f = fakeFile(path);
  return f ? { exists: true, isDir: false, size: fakeBytes(f).length, mtime: 0, ...f.stat } : { exists: false, isDir: false, size: 0, mtime: 0 };
}
export async function fileText(path: string, maxBytes = 800 * 1024): Promise<FileTextResult> {
  if (isTauri()) return invoke<FileTextResult>("file_text", { path, maxBytes });
  const f = fakeFile(path);
  if (!f) return { kind: "error", message: "not found" };
  if (fakeBytes(f).length > maxBytes) return { kind: "tooLarge" };
  return f.text === undefined ? { kind: "binary" } : { kind: "text", text: f.text };
}
/** 폴더 바로 아래의 글 파일 경로(이름순, 최대 max) */
export async function dirFiles(path: string, max: number): Promise<string[]> {
  if (isTauri()) return invoke<string[]>("dir_files", { path, max });
  const pre = path.replace(/[\\/]+$/, "") + "/";
  const names = Object.entries(c2().__fakeFiles ?? {})
    .filter(([p, f]) => p.startsWith(pre) && !p.slice(pre.length).includes("/") && f.text !== undefined && !f.stat?.isDir)
    .map(([p]) => p);
  return names.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).slice(0, max);
}
/** src 를 destDir 로 복사(덮어쓰지 않음). 만든 경로를 돌려준다. 가짜: 기록만 하고 이름 규칙대로 경로를 만든다 */
export async function fileCopyInto(src: string, destDir: string): Promise<string> {
  if (isTauri()) return invoke<string>("file_copy_into", { src, destDir });
  const files = (c2().__fakeFiles ??= {});
  const name = src.split(/[\\/]/).pop() ?? src;
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let to = `${destDir}/${name}`;
  for (let n = 2; files[to]; n++) to = `${destDir}/${stem}-${n}${ext}`;
  files[to] = files[src] ?? { text: "" };
  fsLog(`copy ${src} -> ${to}`);
  return to;
}
const FAKE_APP_DATA = "C:/fake/AppData/com.symvibe.win";
let appData: Promise<string> | undefined;
/** S-883: 노드 shot(파일 이름, 또는 옛 보드의 전체 경로) → 읽을 전체 경로. 이름은 <앱 데이터>/Screenshots 에서 찾는다 */
export async function shotPath(shot: string): Promise<string> {
  if (/[\\/:]/.test(shot)) return shot; // 경로·주소(ms-settings:)는 그대로
  appData ??= isTauri() ? import("@tauri-apps/api/path").then((m) => m.appDataDir()) : Promise.resolve(FAKE_APP_DATA);
  return `${(await appData).replace(/[\\/]+$/, "")}/Screenshots/${shot}`;
}
/** 이미지를 <앱 데이터>/Screenshots 에 저장하고 파일 이름을 돌려준다 */
export async function imageSave(bytes: Uint8Array, hint: string): Promise<string> {
  if (isTauri()) return invoke<string>("image_save", { bytes: Array.from(bytes), hint });
  const files = (c2().__fakeFiles ??= {});
  const dot = hint.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [hint.slice(0, dot), hint.slice(dot)] : [hint, ""];
  let name = hint;
  for (let n = 2; files[await shotPath(name)]; n++) name = `${stem}-${n}${ext}`;
  const to = await shotPath(name);
  files[to] = { bytes: Array.from(bytes) };
  fsLog(`save ${to}`);
  return name;
}
export async function fsOpen(path: string): Promise<void> {
  if (!/[\\/:]/.test(path)) path = await shotPath(path); // 경로면 await 없이 바로(가짜 로그가 동기로 남는다). 그림 노드 shot 은 파일 이름일 수 있다(경로 문자가 있으면 그대로)
  if (isTauri()) return invoke("fs_open", { path });
  fsLog(`open ${path}`);
}
export async function fsReveal(path: string): Promise<void> {
  if (!/[\\/:]/.test(path)) path = await shotPath(path);
  if (isTauri()) return invoke("fs_reveal", { path });
  fsLog(`reveal ${path}`);
}
export async function trashMove(path: string): Promise<void> {
  if (isTauri()) return invoke("trash_move", { path });
  delete fakeStudio().files[sp(path)]; // 5묶음 E5: 가짜 vault 에서도 사라진다
  fsLog(`trash ${path}`);
  delete c2().__fakeFiles?.[path];
}
/** 기본 브라우저로 연다. http/https 가 아니면 reject */
export async function openUrl(url: string): Promise<void> {
  if (isTauri()) return invoke("open_url", { url });
  if (!/^https?:\/\//i.test(url)) throw "http/https 주소만 열 수 있습니다";
  fsLog(`url ${url}`);
}
/** 각 포트가 127.0.0.1 에서 열려 있는지 */
export async function webPorts(ports: number[]): Promise<boolean[]> {
  if (isTauri()) return invoke<boolean[]>("web_ports", { ports });
  c2().__fakePortCalls = (c2().__fakePortCalls ?? 0) + 1; // 시험: 숨은 워크스페이스 폴링 검사(S-1102)
  return ports.map((p) => !!c2().__fakeWeb?.ports?.[p]);
}
export async function webProbe(url: string): Promise<WebProbe> {
  if (isTauri()) return invoke<WebProbe>("web_probe", { url });
  if (!/^https?:\/\//i.test(url)) throw "http/https 주소만 열 수 있습니다";
  const p = c2().__fakeWeb?.probe?.[url];
  return { reachable: false, frameBlocked: false, status: null, ...p };
}
/** 검사 창 inspect-<id> 를 열고 개발자 도구를 연다(S-1132). 가짜: __fakeWebLog 에 기록 */
export async function webWindowOpen(id: string, url: string): Promise<void> {
  if (isTauri()) return invoke("web_window_open", { id, url });
  webLog(`open ${id} ${url}`);
}
/** 검사 창이 (X 등으로) 닫혔다는 알림. 받는 값 = 창 label(inspect-<id>) */
export function onWebWindowClosed(cb: (label: string) => void): () => void {
  if (!isTauri()) return () => {};
  const un = import("@tauri-apps/api/event").then((m) => m.listen<string>("web-window-closed", (e) => cb(e.payload)));
  return () => void un.then((f) => f());
}
export async function webWindowClose(id: string): Promise<void> {
  if (isTauri()) return invoke("web_window_close", { id });
  webLog(`close ${id}`);
}

// ---- 4묶음 D5 Loops 정의(S-1401). repo 경로별. 가짜: window.__fakeLoops[repo] ----
import type { Loop } from "../loops/types";
const fakeLoops = () => ((window as unknown as { __fakeLoops?: Record<string, Loop[]> }).__fakeLoops ??= {});
export async function loopsGet(repo: string): Promise<Loop[]> {
  if (isTauri()) return invoke<Loop[]>("loops_get", { repo });
  return (fakeLoops()[repo] ?? []).map((l) => ({ ...l, enabled: false }));
}
export async function loopsSet(repo: string, list: Loop[]): Promise<void> {
  if (isTauri()) return invoke("loops_set", { repo, list });
  fakeLoops()[repo] = list;
}
// ---- 4묶음 D4 토큰 집계 (S-1560~S-1566) ----
export { tokensScan, usageStats, tokensCancel, tokenValue } from "../usage/tokensApi";
export type { DayRow as TokenDayRow, ScanResult as TokenScan, UsageStats } from "../usage/tokensApi";
// ---- 4묶음 D3: Memory 저장 · 계정 프로필 · loop 목표 명령 (S-1350~1354, S-1412, S-1610~1616) ----
export type MemoryFact = { id: string; kind: string; title: string; body: string; scope: "repo" | "all"; at: string; refreshedAt?: string };
export type MemoryLoaded = { repo: MemoryFact[]; all: MemoryFact[]; readOnly: boolean };
export type ProfileAgent = "claude" | "codex";
export type Profile = { id: string; agent: ProfileAgent; name: string; createdAt: string };
export type GoalResult = { status: "met" | "not_met" | "timeout"; tail: string };
type D3Win = {
  /** 키: repo 경로 또는 "_all" → 가짜 사실 목록 */
  __fakeMemory?: Record<string, MemoryFact[]>;
  /** 가짜 프로필 목록. 로그인 상태는 signedIn 에 `agent/id` 로 심는다 */
  __fakeProfiles?: { list?: Profile[]; signedIn?: Record<string, boolean> };
  /** cmd → 결과 */
  __fakeGoal?: Record<string, GoalResult>;
};
const d3 = () => window as unknown as D3Win;
const fakeProfiles = () => ((d3().__fakeProfiles ??= {}).list ??= []);
const fakeProfile = (agent: string, id: string) => fakeProfiles().find((p) => p.agent === agent && p.id === id);

export async function memoryLoad(repo: string): Promise<MemoryLoaded> {
  if (isTauri()) return invoke<MemoryLoaded>("memory_load", { repo });
  const m = d3().__fakeMemory ?? {};
  return { repo: m[repo] ?? [], all: m._all ?? [], readOnly: false };
}
export async function memorySave(repo: string, scope: "repo" | "all", facts: MemoryFact[]): Promise<void> {
  if (isTauri()) return invoke("memory_save", { repo, scope, facts });
  if (facts.length > 200) throw new Error("Too many facts (max 200)"); // Rust memory_save 와 같은 상한
  (d3().__fakeMemory ??= {})[scope === "all" ? "_all" : repo] = facts;
}
export async function profileList(): Promise<Profile[]> {
  if (isTauri()) return invoke<Profile[]>("profile_list");
  return [...fakeProfiles()];
}
export async function profileCreate(agent: ProfileAgent, name: string): Promise<Profile> {
  if (isTauri()) return invoke<Profile>("profile_create", { agent, name });
  const list = fakeProfiles();
  const n = name.trim() || `Account ${list.filter((p) => p.agent === agent).length + 1}`;
  if (list.some((p) => p.agent === agent && p.name === n)) throw "a profile with this name already exists";
  const base = n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "account";
  let id = base;
  for (let i = 2; list.some((p) => p.agent === agent && p.id === id); i++) id = `${base}-${i}`;
  const p: Profile = { id, agent, name: n, createdAt: new Date().toISOString() };
  list.push(p);
  return p;
}
export async function profileEnv(agent: ProfileAgent, id: string): Promise<[string, string]> {
  if (isTauri()) return invoke<[string, string]>("profile_env", { agent, id });
  if (!fakeProfile(agent, id)) throw "no such profile";
  return [agent === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME", `C:/fake/Profiles/${agent}/${id}`];
}
export async function profileRemove(agent: ProfileAgent, id: string): Promise<void> {
  if (isTauri()) return invoke("profile_remove", { agent, id });
  if (!fakeProfile(agent, id)) throw "no such profile";
  d3().__fakeProfiles!.list = fakeProfiles().filter((p) => !(p.agent === agent && p.id === id));
}
export async function profileStatus(agent: ProfileAgent, id: string): Promise<boolean> {
  if (isTauri()) return invoke<boolean>("profile_status", { agent, id });
  return !!d3().__fakeProfiles?.signedIn?.[`${agent}/${id}`];
}
export async function profileRename(agent: ProfileAgent, id: string, name: string): Promise<Profile> {
  if (isTauri()) return invoke<Profile>("profile_rename", { agent, id, name });
  const p = fakeProfile(agent, id);
  if (!p) throw "no such profile";
  if (fakeProfiles().some((q) => q.agent === agent && q.id !== id && q.name === name.trim())) throw "a profile with this name already exists";
  p.name = name.trim();
  return p;
}
/** repo 폴더에서 셸 명령을 실행해 종료 코드 0이면 met. 제한 시간(초)이 지나면 timeout (D5 가 loop 목표에서 부른다) */
export async function goalRun(cmd: string, cwd: string, timeoutSecs = 300): Promise<GoalResult> {
  if (isTauri()) return invoke<GoalResult>("goal_run", { cmd, cwd, timeoutSecs });
  return d3().__fakeGoal?.[cmd] ?? { status: "not_met", tail: "" };
}

// ===== 5묶음 E1: 스튜디오 파일 도구 (S-1811~S-1813) =====
// 모든 경로는 root(repo 루트) 안만. 밖(링크가 밖을 가리킴)은 outside:true 로 알리고, 쓰기는 allowOutside 가 있어야 한다.
// root 를 안 주면 setStudioRoot 로 정한 값(스튜디오를 열 때 활성 repo)을 쓴다. 가짜: window.__fakeStudio = { files: { 경로: 글 }, mtimes?, memoryDir?, drafts? }
import { showFile, skipDir } from "../studio/skip";

export interface StudioEntry { name: string; path: string; isDir: boolean; size: number }
export interface StudioFile {
  text?: string; encoding: string; bom: boolean; crlf: boolean; bytes: number; mtimeMs: number; realPath: string; outside: boolean;
  unreadable?: "binary" | "large"; mixedEol?: boolean;
}
export interface StudioDraft { path: string; text: string; savedAt: number; baseMtime: number }
export interface StudioOpts { root?: string; allowOutside?: boolean }
type FakeStudio = { files: Record<string, string>; mtimes?: Record<string, number>; memoryDir?: string; drafts?: Record<string, StudioDraft>; meta?: Record<string, Partial<StudioFile>> }; // meta: 파일별로 Rust read 가 돌려줄 값(bytes·crlf·mixedEol·unreadable)을 덮어쓴다 (FX7)
const fakeStudio = () => ((window as unknown as { __fakeStudio?: FakeStudio }).__fakeStudio ??= { files: {} });
const sp = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
let studioRoot = "";
export const setStudioRoot = (root: string): void => void (studioRoot = root);
const rootOf = (o?: StudioOpts) => o?.root ?? studioRoot;

export async function studioTree(root: string, dir: string): Promise<StudioEntry[]> {
  if (isTauri()) return invoke<StudioEntry[]>("studio_tree", { root, dir });
  const f = fakeStudio().files, d = sp(dir), seen = new Map<string, StudioEntry>();
  for (const k of Object.keys(f)) {
    if (!k.startsWith(d + "/")) continue;
    const [name, ...rest] = k.slice(d.length + 1).split("/");
    if (!name) continue;
    const isDir = rest.length > 0 && !(rest.length === 1 && rest[0] === "");
    if (isDir ? skipDir(name) : !showFile(name) || f[k]!.includes("\0")) continue;
    if (!seen.has(name)) seen.set(name, { name, path: `${d}/${name}`, isDir, size: isDir ? 0 : f[k]!.length });
  }
  return [...seen.values()].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}
export async function studioRead(path: string, o?: StudioOpts): Promise<StudioFile> {
  if (isTauri()) return invoke<StudioFile>("studio_read", { root: rootOf(o), path });
  const fs = fakeStudio(), t = fs.files[sp(path)];
  if (t === undefined) throw "not found";
  const base = { encoding: "utf-8", bom: false, crlf: false, bytes: t.length, mtimeMs: fs.mtimes?.[sp(path)] ?? 1, realPath: sp(path), outside: false };
  const m = { ...base, ...fs.meta?.[sp(path)] }; // FX7: Rust 계약처럼 파일별 메타(크기·줄 끝)를 돌려준다
  return t.includes("\0") || m.unreadable ? { ...m, unreadable: m.unreadable ?? "binary" } : { ...m, text: t };
}
export async function studioWrite(path: string, text: string, encoding: string, bom: boolean, crlf: boolean, expectMtime?: number, force?: boolean, o?: StudioOpts): Promise<{ mtimeMs: number }> {
  if (isTauri()) return { mtimeMs: await invoke<number>("studio_write", { root: rootOf(o), path, text, encoding, bom, crlf, expectMtime, force, allowOutside: o?.allowOutside }) };
  const fs = fakeStudio(), p = sp(path), m = (fs.mtimes ??= {});
  if (!force && expectMtime !== undefined && p in fs.files && (m[p] ?? 1) !== expectMtime) throw "changed";
  fs.files[p] = text;
  return { mtimeMs: (m[p] = Math.max(Date.now(), (m[p] ?? 0) + 1)) };
}
export async function studioCreate(path: string, isDir: boolean, o?: StudioOpts): Promise<void> {
  if (isTauri()) return invoke("studio_create", { root: rootOf(o), path, isDir });
  const f = fakeStudio().files, p = sp(path);
  if (p in f || p + "/" in f) throw "exists";
  // FX7: Rust create 는 파일이면 상위 폴더가 있어야 하고, 폴더는 상위째 만든다(create_dir_all)
  const up = p.slice(0, p.lastIndexOf("/"));
  if (!isDir && up !== sp(rootOf(o)) && !Object.keys(f).some((k) => k.startsWith(up + "/"))) throw "No such file or directory";
  f[isDir ? p + "/" : p] = "";
}
export async function studioRename(path: string, newName: string, o?: StudioOpts): Promise<string> {
  if (isTauri()) return invoke<string>("studio_rename", { root: rootOf(o), path, newName });
  const f = fakeStudio().files, p = sp(path), to = `${p.slice(0, p.lastIndexOf("/"))}/${newName}`;
  if (!newName || /[\\/]/.test(newName) || newName === "." || newName === "..") throw "bad name";
  if (to in f) throw "exists";
  for (const k of Object.keys(f)) if (k === p || k.startsWith(p + "/")) { f[to + k.slice(p.length)] = f[k]!; delete f[k]; }
  return to;
}
export async function studioDuplicate(path: string, o?: StudioOpts): Promise<string> {
  if (isTauri()) return invoke<string>("studio_duplicate", { root: rootOf(o), path });
  const f = fakeStudio().files, p = sp(path);
  if (!(p in f)) throw "not a file";
  const dot = p.lastIndexOf("."), slash = p.lastIndexOf("/");
  const [stem, ext] = dot > slash + 1 ? [p.slice(0, dot), p.slice(dot)] : [p, ""];
  let n = 1, to = `${stem} copy${ext}`;
  while (to in f) to = `${stem} copy ${++n}${ext}`;
  f[to] = f[p]!;
  return to;
}
/** repo 안 마크다운 글 전부(S-1814 건너뛰기), 최대 max 개 */
export async function studioVault(root: string, max = 2000): Promise<{ files: StudioEntry[]; truncated: boolean }> {
  if (isTauri()) return invoke("studio_vault", { root, max });
  const r = sp(root), files: StudioEntry[] = [];
  for (const [k, t] of Object.entries(fakeStudio().files).sort(([a], [b]) => a.localeCompare(b))) {
    if (!k.startsWith(r + "/") || !/\.(md|markdown|mdx)$/i.test(k)) continue;
    const parts = k.slice(r.length + 1).split("/");
    if (parts.slice(0, -1).some(skipDir)) continue;
    if (files.length >= max) return { files, truncated: true };
    files.push({ name: parts.at(-1)!, path: k, isDir: false, size: t.length });
  }
  return { files, truncated: false };
}
/** repo 의 Claude Code memory 폴더 경로(만들지는 않는다) */
export async function studioMemoryDir(repo: string, configDir?: string): Promise<string> {
  if (isTauri()) return invoke<string>("studio_memory_dir", { repo, configDir });
  return fakeStudio().memoryDir ?? `C:/fake/.claude/projects/${repo.replace(/[^A-Za-z0-9]/g, "-")}/memory`;
}
const dk = (p: string) => sp(p).toLowerCase();
export async function draftPut(path: string, text: string, baseMtime: number): Promise<void> {
  if (isTauri()) return invoke("draft_put", { path, text, baseMtime });
  ((fakeStudio().drafts ??= {})[dk(path)] = { path, text, savedAt: Date.now(), baseMtime });
}
export async function draftGet(path: string): Promise<StudioDraft | null> {
  if (isTauri()) return invoke<StudioDraft | null>("draft_get", { path });
  return fakeStudio().drafts?.[dk(path)] ?? null;
}
export async function draftClear(path: string): Promise<void> {
  if (isTauri()) return invoke("draft_clear", { path });
  delete fakeStudio().drafts?.[dk(path)];
}

// ---- 5묶음 E2 PDF·Markdown 내보내기 (S-1849~S-1853) ----
type E2Win = { __fakePdf?: { error?: string; calls?: { html: string; outPath: string; paper: string }[] }; __fakeSavePath?: string | null; __fakeTempDir?: string };
const e2 = () => window as unknown as E2Win & C2Win;
/** html → PDF 파일(Edge 헤드리스). Edge 가 없거나 실패하면 문구(string)로 던진다. 가짜: window.__fakePdf.error 가 있으면 그 문구로 던지고, 아니면 outPath 에 %PDF 가짜 파일을 둔다 */
export async function pdfExport(html: string, outPath: string, paper: string): Promise<void> {
  if (isTauri()) return invoke("pdf_export", { html, outPath, paper });
  const f = (e2().__fakePdf ??= {});
  (f.calls ??= []).push({ html, outPath, paper });
  if (f.error) throw f.error;
  (e2().__fakeFiles ??= {})[outPath] = { text: "%PDF-1.4 fake" };
}
/** 쪽 미리보기 임시 PDF 폴더 */
export async function pdfTempDir(): Promise<string> {
  if (isTauri()) return invoke<string>("pdf_temp_dir");
  return e2().__fakeTempDir ?? "C:/fake/Temp";
}
/** PDF·Markdown 공용 파일 쓰기(부모 폴더가 있어야 한다). 가짜는 __fakeFiles 에 둔다 */
export async function exportWrite(path: string, bytes: Uint8Array): Promise<void> {
  if (isTauri()) return invoke("export_write", { path, bytes: Array.from(bytes) });
  if ((e2() as { __fakeWriteError?: string }).__fakeWriteError) throw (e2() as { __fakeWriteError?: string }).__fakeWriteError; // FX7 e2e: 쓰기 실패
  (e2().__fakeFiles ??= {})[path] = { bytes: Array.from(bytes) };
  fsLog(`write ${path}`);
}
/** Windows 저장 창. 취소하면 null. 가짜: window.__fakeSavePath */
export async function pickSavePath(defaultPath: string, filters: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (!isTauri()) return e2().__fakeSavePath ?? null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return (await save({ defaultPath, filters })) ?? null;
}

// ---- 6묶음 F1: 음성 엔진 (S-2200~S-2215). 밖에서는 window.__fakeVoice (F2·F3 시험도 씀) ----
export type VoicePart = { kind: "none" | "downloading" | "ready" | "failed"; pct?: number; why?: string };
export type VoiceKind = "engine" | "small" | "base" | PiperKind;
export interface FakeVoice {
  parts: Record<"engine" | "small" | "base", VoicePart> & Partial<Record<PiperKind, VoicePart>>; // piper-* 는 12묶음 Q1 (없으면 none)
  calls: { wav: Uint8Array; lang: string; prompt: string; model: string }[];
  downloads: VoiceKind[];
  reply?: string; // 받아쓰기 결과
  error?: string; // 받아쓰기 실패 종류
  hold?: Promise<void>; // 받아쓰기를 잡아 둠(대기 시험)
  failNext?: string; // 다음 내려받기를 이 이유로 실패
  piperCalls?: { text: string; lang: string }[]; // 12묶음 Q1 piperSpeak 호출 기록
  piperFail?: string; // 있으면 piperSpeak 가 이 이유로 reject
}
const fakeVoice = (): FakeVoice =>
  ((window as unknown as { __fakeVoice?: FakeVoice }).__fakeVoice ??= { parts: { engine: { kind: "none" }, small: { kind: "none" }, base: { kind: "none" } }, calls: [], downloads: [] });
const modelKind = (m: string): "small" | "base" => (m === "base" ? "base" : "small");

/** 엔진과 그 모델의 상태(합치기는 voice/status.ts combine) */
export async function voiceStatus(model: string): Promise<{ engine: VoicePart; model: VoicePart }> {
  if (isTauri()) return invoke("voice_status", { model });
  const f = fakeVoice();
  return { engine: f.parts.engine, model: f.parts[modelKind(model)] };
}
/** 고정 핀(pins.rs)의 파일을 받기 시작한다(끝을 기다리지 않음). 사용자가 확인창에서 고른 뒤에만 부른다(S-2202) */
export async function voiceDownload(kind: VoiceKind): Promise<void> {
  if (isTauri()) return invoke("voice_download", { kind });
  const f = fakeVoice();
  f.downloads.push(kind);
  f.parts[kind] = f.failNext ? { kind: "failed", why: f.failNext } : { kind: "ready" };
  f.failNext = undefined;
}
export async function voiceCancel(kind: VoiceKind): Promise<boolean> {
  if (isTauri()) return invoke<boolean>("voice_cancel", { kind });
  const f = fakeVoice();
  const was = f.parts[kind]?.kind === "downloading";
  if (was) f.parts[kind] = { kind: "none" };
  return was;
}
/** S-2290: 엔진·모델이 있는 Voice 폴더 경로 */
export async function voiceFolder(): Promise<string> {
  if (isTauri()) return invoke<string>("voice_folder");
  return "C:/fake/Voice";
}
/** WAV 바이트를 엔진에 준다. 실패는 문자열 종류로 throw: not-ready / timeout / engine / write */
export async function voiceTranscribe(wav: Uint8Array, lang: string, prompt: string, model: string): Promise<string> {
  // ponytail: 바이트를 JSON 숫자 배열로 보냄(30초 ≈ 1MB → 약 4MB JSON). 느리면 raw 본문 invoke 로 바꾼다
  if (isTauri()) return invoke<string>("voice_transcribe", { wav: Array.from(wav), lang, prompt, model });
  const f = fakeVoice();
  if (f.parts.engine.kind !== "ready" || f.parts[modelKind(model)].kind !== "ready") throw "not-ready";
  f.calls.push({ wav, lang, prompt, model });
  await f.hold;
  if (f.error) throw f.error;
  return f.reply ?? "";
}

// ===== 5묶음 E7 Skills 관리자 (S-2071~S-2085) =====
// 실제 홈(SYMVIBE_HOME 또는 %USERPROFILE%)은 Rust 쪽만 안다. 가짜: window.__fakeSkills = { skills: SkillEntry[], importable?: { 폴더경로: { raw: 글|null, bytes } } } — 범위 뿌리는 C:/fake/<scope>
export interface SkillEntry { scope: "personal" | "project" | "plugin"; kind: "skill" | "command"; plugin: string | null; folderName: string; path: string; dir: string; raw: string; mtime: number; sideFiles: string[] }
export interface SkillsScan { skills: SkillEntry[]; truncated: boolean }
export type SkillScope = "personal" | "project";
type FakeSkills = { skills: SkillEntry[]; importable?: Record<string, { raw: string | null; bytes: number }> };
const fakeSk = () => ((window as unknown as { __fakeSkills?: FakeSkills }).__fakeSkills ??= { skills: [] });
const skErr = { changed: "This file changed on disk since you opened it.", noMd: "That folder has no SKILL.md.", big: "That folder is larger than 2 MB.", exists: "A skill with that name already exists.", plugin: "Plugin skills are read-only.", noRepo: "Open a repo first.", name: "Use lowercase letters, numbers and hyphens only (64 characters max)." };
const skFind = (p: string) => { const k = sp(p).toLowerCase(); return fakeSk().skills.find((s) => sp(s.path).toLowerCase() === k || sp(s.dir).toLowerCase() === k); };
const skAdd = (scope: SkillScope, name: string, raw: string, kind: "skill" | "command" = "skill"): string => {
  const dir = kind === "skill" ? `C:/fake/${scope}/${name}` : `C:/fake/${scope}/${name}.md`;
  const path = kind === "skill" ? `${dir}/SKILL.md` : dir;
  fakeSk().skills.push({ scope, kind, plugin: null, folderName: name, path, dir, raw, mtime: 1000, sideFiles: [] });
  return kind === "skill" ? path : dir;
};
const skHas = (scope: SkillScope, name: string, kind = "skill") => fakeSk().skills.some((s) => s.scope === scope && s.kind === kind && s.folderName === name);
const skScopeOk = (scope: SkillScope, repo: string | null) => { if (scope === "project" && !repo) throw skErr.noRepo; };

/** 개인·프로젝트·플러그인 스킬과 명령을 읽는다(400개까지). 플러그인 쪽이 깨져도 나머지는 나온다 */
export async function skillsScan(repo: string | null): Promise<SkillsScan> {
  if (isTauri()) return invoke<SkillsScan>("skills_scan", { repo });
  return JSON.parse(JSON.stringify({ skills: fakeSk().skills.filter((s) => s.scope !== "project" || repo), truncated: false }));
}
/** expectMtime 이 디스크와 다르면 "This file changed on disk since you opened it." 로 던진다. 새 mtime 을 돌려준다 */
export async function skillsWrite(repo: string | null, path: string, text: string, expectMtime?: number): Promise<number> {
  if (isTauri()) return invoke<number>("skills_write", { repo, path, text, expectMtime });
  const s = skFind(path);
  if (!s) throw "That isn't a skill path.";
  if (s.scope === "plugin") throw skErr.plugin;
  if (expectMtime !== undefined && s.mtime !== expectMtime) throw skErr.changed;
  s.raw = text;
  return (s.mtime += 1);
}
/** `<범위 뿌리>/.claude/skills/<이름>/SKILL.md` 를 만든다. 이미 있는 이름은 거절. SKILL.md 경로를 돌려준다 */
export async function skillsCreate(repo: string | null, scope: SkillScope, name: string, text: string): Promise<string> {
  if (isTauri()) return invoke<string>("skills_create", { repo, scope, name, text });
  skScopeOk(scope, repo);
  if (!/^[a-z0-9-]{1,64}$/.test(name)) throw skErr.name;
  if (skHas(scope, name)) throw skErr.exists;
  return skAdd(scope, name, text);
}
/** 폴더 선택 뒤 확인: SKILL.md 가 있고 2MB 이하여야 한다. 스킬 이름(폴더 이름)을 돌려준다 */
export async function skillsImportCheck(src: string): Promise<string> {
  if (isTauri()) return invoke<string>("skills_import_check", { src });
  const f = fakeSk().importable?.[src];
  if (!f?.raw) throw skErr.noMd;
  if (f.bytes > 2 * 1024 * 1024) throw skErr.big;
  return sp(src).split("/").pop() ?? "";
}
/** 폴더를 통째로 복사한다. 같은 이름이 있으면 거절(덮어쓰지 않음). 새 스킬 폴더 경로를 돌려준다 */
export async function skillsImport(repo: string | null, scope: SkillScope, src: string): Promise<string> {
  if (isTauri()) return invoke<string>("skills_import", { repo, scope, src });
  const name = await skillsImportCheck(src);
  skScopeOk(scope, repo);
  if (skHas(scope, name)) throw skErr.exists;
  skAdd(scope, name, fakeSk().importable![src]!.raw!);
  return `C:/fake/${scope}/${name}`;
}
/** 스킬 폴더(명령은 파일)를 Personal·Project 로 복사 — 이름은 -copy, -copy-2 … 새 폴더(파일) 경로를 돌려준다 */
export async function skillsDuplicate(repo: string | null, src: string, scope: SkillScope): Promise<string> {
  if (isTauri()) return invoke<string>("skills_duplicate", { repo, src, scope });
  const s = skFind(src);
  if (!s) throw "That isn't a skill path.";
  skScopeOk(scope, repo);
  let c = `${s.folderName}-copy`;
  for (let i = 2; skHas(scope, c, s.kind); i++) c = `${s.folderName}-copy-${i}`;
  return skAdd(scope, c, s.raw.startsWith("---") ? s.raw.replace(/^name:.*$/m, `name: ${c}`) : s.raw, s.kind).replace(/\/SKILL\.md$/, "");
}
/** 휴지통으로(복구 가능). 플러그인 것은 거절 */
export async function skillsDelete(repo: string | null, path: string): Promise<void> {
  if (isTauri()) return invoke("skills_delete", { repo, path });
  const s = skFind(path);
  if (!s) throw "That isn't a skill path.";
  if (s.scope === "plugin") throw skErr.plugin;
  fakeSk().skills.splice(fakeSk().skills.indexOf(s), 1);
}

// ---- 5묶음 E3 Diagrams 명세 저장·내보내기 쓰기 (S-2035·S-2040). 가짜: window.__fakeDiagrams = { id: json } ----
const fakeDiagrams = () => ((window as unknown as { __fakeDiagrams?: Record<string, string> }).__fakeDiagrams ??= {});
/** %APPDATA%/com.symvibe.win/Diagrams/<id>.json 에 쓴다. id 는 영숫자·하이픈만 */
export async function diagramPut(id: string, json: string): Promise<void> {
  if (isTauri()) return invoke("diagram_put", { id, json });
  fakeDiagrams()[id] = json;
}
/** 없으면 null */
export async function diagramGet(id: string): Promise<string | null> {
  if (isTauri()) return invoke<string | null>("diagram_get", { id });
  return fakeDiagrams()[id] ?? null;
}
export async function diagramDelete(id: string): Promise<void> {
  if (isTauri()) return invoke("diagram_delete", { id });
  delete fakeDiagrams()[id];
}

// ---- 5묶음 E6 Documents 보관 (S-1987) ----
export interface DocMeta { id: string; docId: string; title: string; agent: string; effort: string; startedAt: number; durationMs: number; status: "complete" | "incomplete" }
type FakeLib = Record<string, { metas: DocMeta[]; md: Record<string, string> }>;
const fakeLib = (repo: string) => (((window as unknown as { __fakeLibrary?: FakeLib }).__fakeLibrary ??= {})[repo.replace(/\\/g, "/").toLowerCase()] ??= { metas: [], md: {} });
const okId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);
/** 이 repo 의 저장된 버전(최신 먼저). 가짜: window.__fakeLibrary */
export async function docList(repo: string): Promise<DocMeta[]> {
  if (isTauri()) return invoke<DocMeta[]>("doc_list", { repo });
  return [...fakeLib(repo).metas].sort((a, b) => b.startedAt - a.startedAt);
}
export async function docPut(repo: string, meta: DocMeta, md: string): Promise<void> {
  if (isTauri()) return invoke("doc_put", { repo, meta, md });
  if (!okId(meta.id)) throw "bad id";
  const l = fakeLib(repo);
  l.metas = [meta, ...l.metas.filter((m) => m.id !== meta.id)];
  l.md[meta.id] = md;
}
export async function docGet(repo: string, id: string): Promise<string> {
  if (isTauri()) return invoke<string>("doc_get", { repo, id });
  const t = okId(id) ? fakeLib(repo).md[id] : undefined;
  if (t === undefined) throw "not found";
  return t;
}
/** 영구 삭제(휴지통 아님) */
export async function docDelete(repo: string, id: string): Promise<void> {
  if (isTauri()) return invoke("doc_delete", { repo, id });
  if (!okId(id)) throw "bad id";
  const l = fakeLib(repo);
  l.metas = l.metas.filter((m) => m.id !== id);
  delete l.md[id];
}

// H1 S-2800/S-2811: 모든 대화 목록(Rust conversations_list). 브라우저(시험)는 window.__fakeConvs.
export type Conversation = {
  cli: "claude" | "codex";
  sessionId: string;
  cwd: string | null;
  cwdExists: boolean;
  title: string;
  firstPrompt: string;
  lastAt: number;
  messages: number;
  profile: string | null;
};
export async function conversationsList(force = false): Promise<Conversation[]> {
  if (isTauri()) return invoke<Conversation[]>("conversations_list", { force });
  const w = window as unknown as { __convCalls?: number; __fakeConvs?: Conversation[]; __fakeConvsError?: string };
  w.__convCalls = (w.__convCalls ?? 0) + 1;
  if (w.__fakeConvsError) throw w.__fakeConvsError;
  return w.__fakeConvs ?? [];
}

// 11묶음 P2 S-2968: planner 세션용 빈 폴더(Rust planner_dir). 가짜는 고정 경로
export const plannerDir = (): Promise<string> => (isTauri() ? invoke<string>("planner_dir") : Promise.resolve("C:\fake\PlannerBox"));

// ---- 12묶음 Q3: Gemini·OpenCode 세션 찾기. 가짜: window.__fakeSessions = { gemini: "id", opencode: "id" } ----
export async function agentFindSession(agent: string, cwd: string, startedAfterMs: number, claimed: string[]): Promise<string | null> {
  if (isTauri()) return invoke<string | null>("agent_find_session", { agent, cwd, startedAfterMs, claimed });
  return (window as unknown as { __fakeSessions?: Record<string, string> }).__fakeSessions?.[agent] ?? null;
}

// ---- 12묶음 Q1: Piper 로컬 음성 (S-3105·S-3106). 가짜: window.__fakeVoice.parts["piper-*"] · piperCalls · piperFail ----
const fakePart = (k: PiperKind): VoicePart => fakeVoice().parts[k] ?? { kind: "none" };
const fakeBoth = (a: PiperKind, b: PiperKind): VoicePart => {
  const [x, y] = [fakePart(a), fakePart(b)];
  return x.kind === "failed" ? x : y.kind === "failed" ? y : x.kind === "downloading" ? x : y.kind === "downloading" ? { kind: "downloading", pct: 99 } : x.kind === "ready" && y.kind === "ready" ? x : { kind: "none" };
};
/** 엔진과 화면 언어별 음성(onnx + json 둘 다 준비돼야 ready) */
export async function piperStatus(): Promise<PiperStatus> {
  if (isTauri()) return invoke<PiperStatus>("piper_status");
  return { engine: fakePart("piper-engine"), ko: fakeBoth("piper-ko", "piper-ko-json"), en: fakeBoth("piper-en", "piper-en-json") };
}
/** 글(200자까지)을 Piper 로 읽은 wav 바이트. 실패는 문자열 종류로 throw: not-ready / timeout / engine / write */
export async function piperSpeak(text: string, lang: "ko" | "en"): Promise<Uint8Array> {
  if (isTauri()) return new Uint8Array(await invoke<number[]>("piper_speak", { text, lang }));
  const f = fakeVoice();
  (f.piperCalls ??= []).push({ text, lang });
  if (f.piperFail) throw f.piperFail;
  return new Uint8Array(44); // 44바이트 빈 wav 머리 크기
}

// 12묶음 Q5 S-3171: Claude transcript 의 하위 에이전트(Rust claude_subagents_cmd). 브라우저(시험)는 window.__fakeSubagents[sessionId], 호출 수 __fakeSubCalls.
export type Sub = { id: string; name: string; title: string; state: "running" | "done" | "failed" | "unknown"; startedAt: number; endedAt?: number; agentId?: string; lastAt?: number };
export async function claudeSubagents(cwd: string, sessionId: string, configDir?: string): Promise<Sub[]> {
  if (isTauri()) return invoke<Sub[]>("claude_subagents_cmd", { cwd, sessionId, configDir: configDir ?? null });
  const w = window as unknown as { __fakeSubagents?: Record<string, Sub[]>; __fakeSubCalls?: number };
  w.__fakeSubCalls = (w.__fakeSubCalls ?? 0) + 1;
  return w.__fakeSubagents?.[sessionId] ?? [];
}

// ---- 13묶음 R1: planner API 공급자 (S-3320~S-3343). 키는 Rust(자격 증명 관리자)에만, 웹뷰로 돌려주는 명령 없음.
// 가짜: window.__fakePlannerApi = { keys, calls, cancels, ask?, models? } (키는 이 메모리 객체에만) ----
export type ApiErr = { kind: string; status?: number; detail?: string };
export type PlannerAskArgs = { reqId: string; provider: string; model: string; baseUrl?: string; system: string; user: string; timeoutMs?: number };
export type FakePlannerApi = {
  keys: Record<string, string>;
  calls: Omit<PlannerAskArgs, "timeoutMs">[];
  cancels: string[];
  ask?: (a: PlannerAskArgs) => string | { err: ApiErr } | Promise<string | { err: ApiErr }>;
  models?: (provider: string, baseUrl?: string) => string[] | { err: ApiErr } | Promise<string[] | { err: ApiErr }>;
  pending?: Record<string, (e: ApiErr) => void>;
};

const fakeApi = (): FakePlannerApi =>
  ((window as unknown as { __fakePlannerApi?: FakePlannerApi }).__fakePlannerApi ??= { keys: {}, calls: [], cancels: [] });
const API_IDS = ["api:openai", "api:anthropic", "api:gemini", "api:compat"];

/** 키는 한 번 넘기고 끝(되돌려 받는 명령 없음). 실패 글에 키 없음 */
export async function plannerKeySet(provider: string, key: string): Promise<void> {
  if (isTauri()) return invoke<void>("planner_key_set", { provider, key });
  const k = key.trim(); // 가짜도 Rust 와 같은 검사 (S-3340)
  if (!API_IDS.includes(provider) || !k || k.length > 512 || /[\u0000-\u001f\u007f]/.test(k)) throw "invalid key";
  fakeApi().keys[provider] = k;
}
export async function plannerKeyHas(provider: string): Promise<boolean> {
  if (isTauri()) return invoke<boolean>("planner_key_has", { provider });
  return provider in fakeApi().keys;
}
export async function plannerKeyClear(provider: string): Promise<void> {
  if (isTauri()) return invoke<void>("planner_key_clear", { provider });
  delete fakeApi().keys[provider];
}
/** 답 글만. 실패는 ApiErr 객체로 reject */
export async function plannerApiAsk(a: PlannerAskArgs): Promise<string> {
  if (isTauri()) return invoke<string>("planner_api_ask", { ...a });
  const f = fakeApi();
  const { timeoutMs: _t, ...rec } = a;
  void _t;
  f.calls.push(rec); // 키는 안 담김
  const cancelled = new Promise<never>((_, rej) => ((f.pending ??= {})[a.reqId] = (e) => rej(e)));
  const r = await Promise.race([Promise.resolve(f.ask?.(a)), cancelled]);
  delete f.pending?.[a.reqId];
  if (typeof r === "string") return r;
  throw r && "err" in r ? r.err : ({ kind: "bad" } as ApiErr);
}
export async function plannerApiModels(provider: string, baseUrl?: string): Promise<string[]> {
  if (isTauri()) return invoke<string[]>("planner_api_models", { provider, baseUrl: baseUrl ?? null });
  const r = await fakeApi().models?.(provider, baseUrl);
  if (Array.isArray(r)) return r;
  throw r && "err" in r ? r.err : ({ kind: "bad" } as ApiErr);
}
/** 진행 중인 ask 를 끊는다. 가짜는 cancels 에 id 를 쌓고 기다리던 ask 를 cancelled 로 reject */
export async function plannerApiCancel(reqId: string): Promise<boolean> {
  if (isTauri()) return invoke<boolean>("planner_api_cancel", { reqId });
  const f = fakeApi();
  f.cancels.push(reqId);
  const rej = f.pending?.[reqId];
  if (!rej) return false;
  delete f.pending![reqId];
  rej({ kind: "cancelled" });
  return true;
}
