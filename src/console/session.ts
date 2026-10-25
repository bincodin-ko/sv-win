// 콘솔 1개의 PTY 수명: spawn spec → pty_spawn → 출력·종료 처리, Restart, 에이전트 종료 시 셸로 떨어지기(S-070),
// 셸 종료 코드(S-071), 슬립 감지(S-072), 못 찾음 글(S-165). 화면(xterm)은 board/ConsoleNode 가 만들어 넘긴다.
// A9: 복원 메모(S-233), Resume 제안 받아들이기(S-234), 대화 id 기록(S-237·S-238), 마지막 대화 시각(S-239), 8초 규칙(S-240).
import { limitSpawn } from "./spawnQueue";
import type { Terminal } from "@xterm/xterm";
import { agentSpawnSpec, agentsList, settingsGet, type Resume } from "../agents/api";
import { DEFAULT_SCOPE, type Scope } from "../board/boards";
import { isConsole } from "../board/store";
import { hoverText, liveStatusOf, type LiveAgent } from "../livestatus/events";
import { consoleId, forget, parseConsoleId, setDetail, setReply, startLive, stopLive, trackNeeds } from "../livestatus/useLive";
import { useSettings } from "../settings/useSettings";
import type { IMarker } from "@xterm/xterm";
import { screenReply } from "../output/reply";
import { setReply as setOutput } from "../output/useOutputs";
import { pendingWriter } from "./pendingWriter";
import { codexFindSession, debugTerms, isTauri, lastReply, ptyBatch, ptyKill, ptyPause, ptyResize, ptyResume, ptySpawn, ptyWrite } from "../lib/ipc";
import { writeDim } from "../terminal/TerminalView";
import { addTick } from "./ticker";
import { GESTURE_QUIET_MS, createBatchWriter } from "../terminal/perf";
import { isLowSpec } from "../perf/lowSpec";
import { feed as autoFeed } from "../web/autoHost";
import { confirmClose } from "./ConfirmClose";
import { consoleProfile } from "../profiles/env";
import { consoleCwd, takeResumeFirst, takeRestored, useOffers } from "./offers";
import { pauseAll, resumeAll } from "./pause";
import { sessionKey } from "./sessionKey";
import { markSince } from "../mission/since";
import { exitedQuickly, pickingMemo, restoredMemo, type Offer } from "./resume";
import { didSleep, initial, reduce, type Ev, type Status, type St } from "./status";

export interface Session {
  /** PTY 프로세스가 살아 있다(시작 중 포함) */
  isRunning(): boolean;
  /** 비우고 다시 시작. agentId 를 주면 그 에이전트로 */
  restart(agentId?: string): void;
  /** 이 콘솔의 Resume 제안을 받아들여 resume 인자로 다시 시작(S-234) */
  resumeNow(): void;
  /** S-620: 프로세스 트리를 멈춘다(헤더 pill = PAUSED) */
  pause(): void;
  /** S-621: 다시 돌린다 */
  resume(): void;
  isPaused(): boolean;
  /** B16 S-685: 에이전트 hook 이벤트(라이브 상태가 켜져 있고 내장 Claude·Codex 일 때만 받는다) */
  agentEvent(event: string, payload?: Record<string, unknown>): void;
  /** B15 S-668: PTY 에 그대로 쓴다(타이핑과 같은 길 — Enter 가 들면 상태·대화 시각도 갱신) */
  write(data: string): void;
  /** 콘솔이 bracketed paste 모드인가(S-605) */
  bracketedPaste(): boolean;
  /** B15 S-661·S-662: 마지막 답 — Claude/Codex 는 transcript, 못 읽거나 그 밖 에이전트는 화면에서 마지막 입력 줄 뒤 */
  fetchReply(): Promise<string | null>;
  /** D7 S-1304: live status(hook)가 상태를 정하고 있다 */
  hooked(): boolean;
  /** B12: 상태 pill 의 지금 값 */
  status(): Status;
  /** B12: 에이전트 프로그램이 돌고 있다(셸 콘솔·에이전트가 끝나 셸로 떨어진 콘솔은 false) — 주문은 여기에만 간다(S-604) */
  isAgent(): boolean;
  /** F3 S-2275: 새 PTY 마다 +1(받아쓰는 사이 다시 시작됐는지 본다) */
  epoch(): number;
  /** B12: 이번 시작 뒤 출력이 한 번이라도 있었다(S-606) */
  hasOutput(): boolean;
  /** B12: 마지막 출력 시각(ms, 없으면 0) */
  lastDataAt(): number;
  /** B12: 화면 아래쪽의 비어 있지 않은 마지막 n 줄(S-607 프롬프트 인식) */
  tail(n: number): string[];
  /** 끝낸다(S-105 절차는 Rust). 이후 콜백은 무시 */
  kill(): void;
  dispose(): void;
}

const sessions = new Map<string, Session>();
export const getSession = (wsId: string, nodeId: string) => sessions.get(sessionKey(wsId, nodeId));
export const getSessionByKey = (key: string) => sessions.get(key);
export const allSessions = () => [...sessions.values()];

const isLiveAgent = (id: string): id is LiveAgent => id === "claude" || id === "codex";
const liveOn = () => useSettings.getState().s.liveStatus === true;
/** hook 수신기 이벤트 → 그 콘솔의 세션 */
function dispatchLive(e: { console: string; event: string; payload?: Record<string, unknown> }) {
  const { wsId, nodeId } = parseConsoleId(e.console);
  // 워크스페이스 id 없이 노드 id 만 온 것(시험용 가짜 발생기)은 노드 id 가 같은 세션을 찾는다
  const s = sessions.get(sessionKey(wsId, nodeId)) ?? (wsId ? undefined : [...sessions].find(([k]) => (JSON.parse(k) as string[])[1] === nodeId)?.[1]);
  s?.agentEvent(e.event, e.payload);
}
/** 설정 창이 켠 직후 부른다: 수신 구독 시작(이미 시작했으면 그대로). 주소를 돌려준다 */
export const startLiveStatus = () => startLive(dispatchLive);
export { stopLive as stopLiveStatus };
// 시험 후크(가짜 PTY 모드만): B9 칩·B12 가 부르는 pauseAll/resumeAll 을 e2e 가 직접 부른다
if (typeof window !== "undefined" && !isTauri()) Object.assign(window, { __pause: { pauseAll: () => pauseAll(allSessions()), resumeAll: () => resumeAll(allSessions()) } });
/** 실행 중인 콘솔 수 (종료 확인창, S-230) */
export const runningCount = () => [...sessions.values()].filter((s) => s.isRunning()).length;

export function createSession(o: { nodeId: string; term: Terminal; agentId: string; cwd?: string; onStatus: (s: Status) => void } & Partial<Scope>): Session {
  const { nodeId, term } = o;
  const wsId = o.wsId ?? DEFAULT_SCOPE.wsId;
  const useBoard = o.store ?? DEFAULT_SCOPE.store;
  // P2: 출력 조각은 모아서 한 프레임(저사양 66ms)에 한 번 write. 다른 글(dim)·마커보다 먼저 쓰도록 그 앞에서 flush
  let vpAt = 0;
  const unsubVp = useBoard.subscribe((s, p) => {
    if (s.viewport !== p.viewport) vpAt = Date.now();
  });
  const bw = createBatchWriter((b) => term.write(b), { gesturing: () => Date.now() - vpAt < GESTURE_QUIET_MS });
  // P2: Rust 출력 묶음 간격 — 저사양이면 50ms, 안 보이는 콘솔은 100ms(보임 여부는 화면 교차로)
  let shown = true;
  const applyBatch = () => ptyId !== null && void ptyBatch(ptyId, isLowSpec(), shown);
  const unsubLow = useSettings.subscribe((s, p) => s.s.lowSpec !== p.s.lowSpec && applyBatch());
  const io = typeof IntersectionObserver === "undefined" || !term.element ? null : new IntersectionObserver((es) => {
    shown = es[es.length - 1]?.isIntersecting ?? true;
    applyBatch();
  });
  io?.observe(term.element!);
  const dim = (m: string) => (bw.flush(), writeDim(term, m));
  const key = sessionKey(wsId, nodeId); // S-303: 세션·제안·복원 표시는 (워크스페이스, 노드) 키
  let agentId = o.agentId;
  let gen = 0; // 새 PTY 마다 +1. 지난 PTY 의 콜백은 gen 이 달라 무시된다
  let ptyId: number | null = null;
  const pw = pendingWriter(ptyWrite); // id 오기 전 xterm 응답(CPR 등)을 버리지 않고 모았다 보낸다
  let alive = false; // 시작 중이거나 살아 있음
  let paused = false; // S-620: 프로세스 트리가 멈춰 있음
  let mode: "agent" | "shell" | "fallback" = agentId === "shell" ? "shell" : "agent"; // B12: 지금 돌고 있는 것의 종류
  let gotOutput = false; // B12
  let lastData = 0; // B12
  let st: St = initial;
  let disposed = false;
  // A9: 불러온 보드의 첫 시작이면 "lane restored" 메모(S-233). 제안이 있으면 새 대화 id 는 제안이 정리될 때까지 쥐고 있는다(pend)
  let firstMemo = takeRestored(key);
  let pend: { claude?: string; codex?: string } | null = firstMemo && useOffers.getState().offers[key] ? {} : null;
  let resumedAt: number | null = null; // resume 로 시작한 시각(S-240)
  let lastOffer: Offer | null = null;
  let profDir: string | undefined; // D12 S-1628: 이 콘솔 계정(프로필)의 설정 폴더. 없으면 기본 홈의 .claude·.codex

  const patchResume = (p: Record<string, unknown>) => {
    const n = useBoard.getState().nodes[nodeId];
    if (isConsole(n)) useBoard.getState().updateNode(nodeId, { resume: { ...(n.resume as object | undefined), ...p } });
  };
  const liveIds: { claude?: string; codex?: string } = {}; // B15: 노드에 아직 안 적힌(pend) 대화 id 도 transcript 를 찾는 데 쓴다
  let inputMark: IMarker | null = null; // B15: 마지막으로 Enter 를 보낸 줄(S-661 화면 방식)
  const holdOrSave = (key: "claude" | "codex", id: string) => {
    liveIds[key] = id;
    if (pend) pend[key] = id;
    else patchResume(key === "claude" ? { claudeSessionId: id } : { codexSessionId: id });
  };
  // 제안이 정리되면(타이핑·No) 쥐고 있던 새 대화 id 를 저장한다. 이어가기(resumeNow)는 pend 를 먼저 비워 버려진다
  const unsubOffers = useOffers.subscribe((s) => {
    if (pend && !s.offers[key]) {
      const p = pend;
      pend = null;
      if (p.claude) patchResume({ claudeSessionId: p.claude });
      if (p.codex) patchResume({ codexSessionId: p.codex });
    }
  });

  const send = (ev: Ev) => {
    const next = reduce(st, ev);
    const changed = next.status !== st.status;
    st = next;
    if (changed) {
      trackNeeds(key, st.status);
      markSince(key, st.status); // D7 S-1310
      o.onStatus(st.status);
    }
  };

  const killPty = () => {
    gen++;
    alive = false;
    if (ptyId !== null) {
      if (paused) void ptyResume(ptyId); // S-622: 멈춘 프로세스는 닫힘 신호를 못 받는다. 먼저 재개(Rust kill 도 한 번 더 한다)
      paused = false;
      debugTerms.delete(ptyId);
      void ptyKill(ptyId);
      ptyId = null;
      pw.setId(null);
    }
  };

  async function spawn(spec: { program: string; args: string[]; env?: [string, string][] }, m: "agent" | "shell" | "fallback", asAgent: boolean) {
    const g = ++gen;
    alive = true;
    mode = m;
    pw.clear();
    gotOutput = false;
    send({ type: "spawn", mode: m });
    try {
      const id = await limitSpawn(() => ptySpawn({
        program: spec.program,
        args: spec.args,
        env: spec.env,
        cwd: o.cwd,
        cols: term.cols,
        rows: term.rows,
        onData: (b) => {
          if (g !== gen) return;
          bw.push(b);
          autoFeed({ wsId, store: useBoard }, nodeId, b); // C16 S-1142: 자동 미리보기 주소 찾기
          gotOutput = true;
          lastData = Date.now();
          send({ type: "output", t: lastData });
        },
        onExit: (code) => {
          if (g !== gen) return; // 우리가 끝낸 것
          alive = false;
          paused = false;
          if (resumedAt !== null && lastOffer && exitedQuickly(agentId, resumedAt, Date.now())) {
            useOffers.getState().add(lastOffer); // S-240: resume 프로세스가 8초 안에 끝나면 제안이 다시 뜬다(콘솔은 아래에서 셸로 떨어짐)
          }
          resumedAt = null;
          ptyId = null;
          pw.setId(null); // debugTerms 에는 남겨 둔다(시험이 끝난 터미널의 마지막 화면을 읽는다)
          if (asAgent) void fallToShell(); // S-070
          else {
            dim(`[exited with code ${code ?? "?"}]`); // S-071
            send({ type: "exit", code });
          }
        },
      }));
      if (g !== gen || disposed) return void ptyKill(id);
      ptyId = id;
      pw.setId(id);
      applyBatch();
      debugTerms.set(id, term);
    } catch (e) {
      if (g !== gen) return;
      alive = false;
      dim(`Failed to start: ${String(e)}`);
      send({ type: "spawnError" });
    }
  }

  // S-070: 에이전트가 끝나면 같은 화면 아래에서 로그인 셸. 상태 RUNNING
  async function fallToShell() {
    const g = gen;
    try {
      const spec = await agentSpawnSpec("shell");
      if (g !== gen || disposed) return;
      await spawn(spec, "fallback", false);
    } catch {
      send({ type: "spawnError" });
    }
  }

  const agentName = async () => (await agentsList()).find((a) => a.id === agentId)?.name ?? agentId;

  // o2.resume 가 있으면 이어가기, 없으면 새 시작(Claude 는 UUID 를 --session-id 로 지정해 노드에 기록, S-237)
  async function start(o2: { resume?: Resume; memo?: string } = {}) {
    const g = ++gen;
    alive = true; // 시작 중도 실행 중으로 본다(S-068)
    try {
      const newId = !o2.resume && agentId === "claude" ? crypto.randomUUID() : undefined;
      const spec = await agentSpawnSpec(agentId, { resume: o2.resume ?? (newId ? { kind: "new", sessionId: newId } : undefined) });
      if (g !== gen || disposed) return;
      useBoard.getState().updateNode(nodeId, { yolo: spec.yolo });
      // D12 S-1626: 노드의 계정(profile)이 있으면 그 폴더 환경 한 쌍을 더한다. 폴더가 사라졌으면 기본 로그인으로 시작하고 필드를 지운다
      const node0 = useBoard.getState().nodes[nodeId];
      const cp = await consoleProfile(agentId, isConsole(node0) ? node0.profile : undefined);
      if (g !== gen || disposed) return;
      if (cp.missing) useBoard.getState().updateNode(nodeId, { profile: undefined });
      profDir = cp.dir;
      if (cp.env.length) spec.env = [...(spec.env ?? []), ...cp.env];
      // B16 S-683: 라이브 상태가 켜져 있으면 내장 Claude·Codex 콘솔에 어느 콘솔인지·보낼 곳을 env 로 준다(켠 뒤에 시작한 콘솔부터)
      if (isLiveAgent(agentId) && !spec.notFound && (await settingsGet().catch(() => ({}) as Record<string, unknown>)).liveStatus === true) {
        const url = await startLive(dispatchLive);
        if (url) spec.env = [...(spec.env ?? []), ["SYMVIBE_CONSOLE", consoleId(wsId, nodeId)], ["SYMVIBE_HOOK_URL", url]];
        if (g !== gen || disposed) return;
      }
      const memo = o2.memo ?? (firstMemo ? restoredMemo(await agentName()) : undefined);
      firstMemo = false;
      if (g !== gen || disposed) return;
      if (memo) dim(memo); // S-233·S-234
      if (spec.notFound) {
        // S-165: 못 찾으면 셸. 맨 위에 흐린 글씨 안내
        const info = (await agentsList()).find((a) => a.id === agentId);
        if (g !== gen || disposed) return;
        dim(`${(info?.command ?? agentId).split(" ")[0]} not found on PATH. Opening a shell in this lane`);
        await spawn(spec, "fallback", false);
      } else {
        const startedAt = Date.now();
        if (newId) holdOrSave("claude", newId);
        if (o2.resume) resumedAt = startedAt;
        await spawn(spec, agentId === "shell" ? "shell" : "agent", agentId !== "shell");
        if (agentId === "codex" && !o2.resume) void findCodex(g + 1, startedAt - 1000, 0); // S-238 (spawn 이 gen 을 한 번 올림)
      }
    } catch (e) {
      if (g !== gen) return;
      alive = false;
      dim(`Failed to start: ${String(e)}`);
      send({ type: "spawnError" });
    }
  }

  // S-238: Codex 는 시작 때 id 를 지정하는 플래그를 몰라 rollout 파일로 짝짓는다. 파일이 늦게 생길 수 있어 몇 번 다시 본다
  async function findCodex(g: number, since: number, tries: number) {
    const repo = consoleCwd(wsId, useBoard.getState().nodes[nodeId]);
    if (!repo || g !== gen || disposed) return;
    const claimed = Object.values(useBoard.getState().nodes).flatMap((n) => {
      const id = isConsole(n) && n.id !== nodeId ? (n.resume as { codexSessionId?: string } | undefined)?.codexSessionId : undefined;
      return id ? [id] : [];
    });
    const id = await codexFindSession(repo, since, claimed, profDir).catch(() => null);
    if (g !== gen || disposed) return;
    if (id) holdOrSave("codex", id);
    else if (tries < 4) setTimeout(() => void findCodex(g, since, tries + 1), 2500);
  }

  const input = (d: string) => {
    if (ptyId === null) return void pw.send(d);
    if (d.includes("\r")) {
      bw.flush(); // P2: 쌓인 출력이 먼저 커서를 옮기게
      inputMark?.dispose();
      inputMark = term.registerMarker(0) ?? null; // 되울림이 커서를 옮기기 전에(가짜 PTY 는 되울림이 바로 그려진다)
    }
    pw.send(d);
    if (d.includes("\r")) {
      send({ type: "userEnter" });
      patchResume({ lastChatAt: Date.now() }); // S-239: Enter 가 든 입력 = 대화했다
    }
  };
  async function fetchReply(): Promise<string | null> {
    const n = useBoard.getState().nodes[nodeId];
    const saved = isConsole(n) ? (n.resume as { claudeSessionId?: string; codexSessionId?: string } | undefined) : undefined;
    const sid = agentId === "claude" ? (liveIds.claude ?? saved?.claudeSessionId) : agentId === "codex" ? (liveIds.codex ?? saved?.codexSessionId) : undefined;
    const repo = consoleCwd(wsId, useBoard.getState().nodes[nodeId]);
    if (repo && sid) {
      const t = await lastReply(agentId, repo, sid, profDir).catch(() => null);
      if (t) return t;
    }
    const b = term.buffer.active; // S-662: transcript 가 없으면 화면으로. 줄바꿈으로 이어진(wrapped) 줄은 한 줄로 붙인다
    const lines: string[] = [];
    for (let i = 0; i < b.length; i++) {
      const l = b.getLine(i);
      const s = l?.translateToString(true) ?? "";
      if (l?.isWrapped && lines.length) lines[lines.length - 1] += s;
      else lines.push(s);
    }
    // ponytail: 이어붙인 줄만큼 marker.line 과 어긋난다 — 화면 방식은 추측이라 줄 수 보정은 안 한다
    return screenReply(lines, inputMark && inputMark.line >= 0 ? inputMark.line : -1) || null;
  }

  const subs = [
    term.onData(input),
    // S-234: 배너 대신 콘솔에 타이핑하면 그 배너는 닫히고 새 대화로 간다(터미널이 자동으로 보내는 응답은 onKey 가 아니라 제외)
    term.onKey(() => useOffers.getState().drop(key)),
    term.onResize(({ cols, rows }) => ptyId !== null && void ptyResize(ptyId, cols, rows)),
  ];
  // 상태 시계 + 슬립 감지(S-072): 10초 타이머의 벽시계 간격이 90초를 넘으면 잠들었다 깬 것
  let lastWall = Date.now();
  let sleepAt = lastWall;
  const untick = addTick(() => {
    const now = Date.now();
    send({ type: "tick", t: now });
    if (now - sleepAt < 10_000) return;
    sleepAt = now;
    if (didSleep(lastWall, now) && alive && term.buffer.active.type !== "alternate") dim("Your computer slept — network sessions may have dropped.");
    lastWall = now;
  });

  // B16: 라이브 상태를 끄면 hook 기준 상태를 출력 기준으로 되돌린다
  const unsubLive = useSettings.subscribe((s, p) => {
    if (p.s.liveStatus === true && s.s.liveStatus !== true) {
      setDetail(key, null);
      send({ type: "hookOff" });
    }
  });

  const session: Session = {
    isRunning: () => alive,
    epoch: () => gen,
    restart(next) {
      killPty();
      pend = null; // 새 대화로 간다
      useOffers.getState().drop(key);
      if (next) agentId = next;
      term.reset();
      void start();
    },
    resumeNow() {
      const offer = useOffers.getState().offers[key];
      if (!offer || disposed) return;
      pend = null; // 이어가는 대화가 이 콘솔의 대화다(쥐고 있던 새 id 는 버림)
      lastOffer = offer;
      useOffers.getState().drop(key);
      killPty();
      term.reset();
      void (async () => {
        const memo = pickingMemo(await agentName());
        await start({ resume: { kind: offer.sessionId ? "own" : "latest", sessionId: offer.sessionId }, memo });
      })();
    },
    pause() {
      if (ptyId === null || paused || !alive) return;
      paused = true;
      void ptyPause(ptyId);
      send({ type: "pause" });
    },
    resume() {
      if (ptyId === null || !paused) return;
      paused = false;
      void ptyResume(ptyId);
      send({ type: "resume" });
    },
    isPaused: () => paused,
    agentEvent(event, payload) {
      if (disposed || !isLiveAgent(agentId) || !liveOn()) return;
      const kind = liveStatusOf(agentId, event, payload);
      if (!kind) return;
      setDetail(key, hoverText(agentId, event, payload));
      const reply = payload?.last_assistant_message;
      if (event === "Stop" && typeof reply === "string") { setReply(key, reply); setOutput(wsId, nodeId, reply); } // S-692, S-660 D4: See output 도 바로
      send({ type: "agentEvent", status: kind, t: Date.now() });
    },
    write: input,
    bracketedPaste: () => term.modes.bracketedPasteMode,
    fetchReply,
    status: () => st.status,
    hooked: () => st.hookAt !== undefined,
    isAgent: () => alive && mode === "agent",
    hasOutput: () => gotOutput,
    lastDataAt: () => lastData,
    tail(n) {
      const b = term.buffer.active;
      const out: string[] = [];
      for (let i = b.length - 1; i >= 0 && out.length < n; i--) {
        const t = b.getLine(i)?.translateToString(true) ?? "";
        if (t.trim()) out.unshift(t);
      }
      return out;
    },
    kill: () => { killPty(); send({ type: "exit", code: null }); }, // S-1257: 끈 콘솔은 DONE 으로 남는다
    dispose() {
      disposed = true;
      killPty();
      subs.forEach((s) => s.dispose());
      unsubOffers();
      unsubLive();
      forget(key);
      untick();
      unsubLow();
      io?.disconnect();
      unsubVp();
      bw.dispose();
      if (sessions.get(key) === session) sessions.delete(key);
    },
  };
  sessions.set(key, session);
  const placed = takeResumeFirst(key); // H3 S-2841: 보드에 놓은 대화는 첫 시작부터 이어가기(제안 배너·새 --session-id 없음)
  if (placed) void agentName().then((n) => start({ resume: { kind: "own", sessionId: placed }, memo: pickingMemo(n) }));
  else void start();
  return session;
}

const nameOf = (sc: Scope, id: string) => {
  const n = sc.store.getState().nodes[id];
  return isConsole(n) ? n.name : id;
};

/** Close·Delete 공용(A6 의 Delete 키도 이걸 부른다): 실행 중인 콘솔이 있으면 확인창 먼저(S-068), 확인하면 PTY 끝내고(S-241) 노드를 지운다 */
export async function requestClose(ids: string[], sc: Scope = DEFAULT_SCOPE): Promise<boolean> {
  const running = ids.filter((id) => getSession(sc.wsId, id)?.isRunning());
  if (running.length && !(await confirmClose(running.map((id) => nameOf(sc, id))))) return false;
  for (const id of ids) getSession(sc.wsId, id)?.kill();
  sc.store.getState().removeNodes(ids); // 한 번에 = 되돌리기 1단계(A6)
  return true;
}

/** Restart(S-066)·에이전트 바꾸기(S-069): 실행 중이면 확인 먼저 */
export async function requestRestart(id: string, agentId?: string, sc: Scope = DEFAULT_SCOPE, account?: string | null): Promise<boolean> {
  const s = getSession(sc.wsId, id);
  if (!s) return false;
  if (s.isRunning() && !(await confirmClose([nameOf(sc, id)]))) return false;
  if (agentId) sc.store.getState().updateNode(id, { agentId, resume: undefined, profile: undefined }); // 다른 에이전트의 대화 id·계정은 의미 없다
  if (account !== undefined) sc.store.getState().updateNode(id, { profile: account ?? undefined, resume: undefined }); // D12 S-1627: 다른 계정 = 새로 시작(그 계정의 대화가 아니므로 이어받기 없음)
  s.restart(agentId);
  return true;
}
