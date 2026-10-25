// D2 S-1200~1205·1209·1210: 창 없는 ConPTY 세션
import { agentSpawnSpec } from "../agents/api";
import { pendingWriter } from "../console/pendingWriter";
import { typeAndSubmit } from "../console/submit";
import { ptyKill, ptySpawn, ptyWrite } from "../lib/ipc";
import { detectBlocked, detectTrust } from "./detect";
import { hiddenQueue } from "./queue";
import { createScreen, realClock, type Clock } from "./screen";

export interface HiddenOpts {
  agentId?: string; // 에이전트 카탈로그 id (program 을 주면 무시)
  program?: string;
  args?: string[];
  cwd: string;
  env?: [string, string][]; // S-1210: 프로필 환경 변수 통로
  timeoutMs: number;
  manual?: boolean; // 사용자가 직접 시작한 확인인가
  emptyFolder?: boolean; // cwd 가 앱이 만든 빈 폴더(UsageProbe)인가
  clock?: Clock;
  /** 입력칸 표지가 보일 때까지 최대 15초 기다린 뒤 보낸다(planner 처럼 오래 띄워 두는 Claude 세션). 기본은 끄고 기존 '조용하면 보낸다' */
  waitPrompt?: boolean;
  /** 막힘 화면에 대신 보낼 키(예: Codex 업데이트 건너뛰기). null 이면 막힘으로 끝낸다 (E3 S-1985) */
  answerBlocked?: (screen: string) => string | null;
}
export type Settled = { blocked: false } | { blocked: true; screen: string };
export interface HiddenSession {
  id: number;
  agentId?: string;
  cwd: string;
  sessionId?: string;
  startedAt: number;
  lastOutputAt(): number;
  type(text: string): Promise<Settled>;
  /** Enter 만 보낸다 */
  enter(): void;
  waitQuiet(ms: number, maxMs: number): Promise<Settled>;
  screenText(): Promise<string>;
  close(): void;
}

// 숨은 claude 가 사용자 전역 훅·MCP 를 읽어 대상 repo 를 더럽히지 않게 한다(로그인은 그대로)
export const CLAUDE_LIGHT_ARGS = ["--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "project"];

// 숨은 claude 기본: 사용자 설정(권한 허용 목록)은 두고 훅·MCP 만 끈다. 실측(y4): project 만 읽으면 Bash 가 거부/질문돼 멈춘다
export const CLAUDE_HOOKLESS_ARGS = ["--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--settings", '{"disableAllHooks":true}'];

const READY_QUIET_MS = 1500; // S-1202 추측
const POLL_MS = 250;
const PROMPT_WAIT_MS = 15_000;
const TAIL_LINES = 20; // 막힘·신뢰 질문은 화면 아래쪽에서만 본다(위쪽 알림 배너 무시)
const live = new Set<HiddenSession>();

export async function hiddenSession(o: HiddenOpts): Promise<HiddenSession> {
  const clock = o.clock ?? realClock;
  const sessionId = !o.program && o.agentId === "claude" ? crypto.randomUUID() : undefined;
  let program = o.program;
  let args = o.args ?? [];
  let env = o.env ?? [];
  if (!program) {
    if (!o.agentId) throw new Error("agentId 나 program 이 필요하다");
    const spec = await agentSpawnSpec(o.agentId, sessionId ? { resume: { kind: "new", sessionId }, noYolo: true } : { noYolo: true }); // 숨은 세션은 Yolo 를 받지 않는다(S-1978)
    if (spec.notFound) throw new Error(`${o.agentId} 를 찾을 수 없다`);
    program = spec.program;
    args = [...spec.args, ...args];
    if (o.agentId === "claude" && !args.includes("--strict-mcp-config")) args.push(...CLAUDE_HOOKLESS_ARGS); // planner(도구 없음)는 cliArgs 로 이미 넣어 준다
    if (o.agentId === "gemini" && o.emptyFolder) args.push("--skip-trust"); // 앱이 만든 빈 폴더만 신뢰 질문을 건너뛴다(S-3148)
    env = [...spec.env, ...env];
  }

  const pw = pendingWriter(ptyWrite); // ptySpawn 응답(id) 전에 나온 터미널 응답도 순서대로 보낸다
  const screen = createScreen((d) => pw.send(d));
  const dec = new TextDecoder();
  const startedAt = clock.now();
  let lastOut = startedAt;
  let firstOut = false;
  let ready = false;
  let bracketed = false;
  let exited = false;
  let killed = false;
  let timedOut = false;
  let trustAnswered = false;
  let answers = 0;
  let blocked: Settled | null = null;
  let finalText: Promise<string> | null = null;

  const id = await ptySpawn({
    program,
    args,
    env,
    cwd: o.cwd,
    cols: 200,
    rows: 50,
    onData: (b) => {
      screen.write(b);
      firstOut = true;
      lastOut = clock.now();
      const t = dec.decode(b, { stream: true });
      if (t.includes("\x1b[?2004h")) bracketed = true;
      if (t.includes("\x1b[?2004l")) bracketed = false;
    },
    onExit: () => {
      exited = true;
    },
  });

  pw.setId(id);
  const cancelTimer = clock.after(o.timeoutMs, () => {
    timedOut = true;
    s.close();
  });
  const s: HiddenSession = {
    id,
    agentId: o.agentId,
    cwd: o.cwd,
    sessionId,
    startedAt,
    lastOutputAt: () => lastOut,
    close() {
      if (killed) return;
      killed = true;
      cancelTimer();
      live.delete(s);
      finalText = screen.text().finally(() => screen.dispose());
      void ptyKill(id); // 이 PID 만
    },
    screenText: () => finalText ?? screen.text(),
    waitQuiet: (ms, maxMs) => settle(ms, maxMs),
    enter() {
      if (!killed) void ptyWrite(id, "\r"); // 붙여 넣은 글이 입력칸에 남았을 때 Enter 만
    },
    async type(text) {
      const r = await settle(0, Infinity);
      if (r.blocked || killed) return r;
      if (o.waitPrompt && o.agentId === "claude") await promptShown(); // 최종 확인 6번: 조용하다고 바로 보내면 입력칸이 뜨기 전이라 글이 사라질 수 있다
      await typeAndSubmit({ write: (d) => void ptyWrite(id, d), bracketedPaste: () => bracketed }, text);
      return { blocked: false };
    },
  };
  live.add(s);

  /** 준비된 뒤(첫 출력 + 1.5초 조용) 화면 아래쪽을 보고 신뢰 질문엔 답하거나 막힘으로 끈다 */
  async function inspect(): Promise<void> {
    const text = (await screen.text()).split("\n").slice(-TAIL_LINES).join("\n");
    if (!trustAnswered && detectTrust(text)) {
      if (o.manual && o.emptyFolder) {
        trustAnswered = true;
        if (/Yes, I trust this folder/i.test(text)) await ptyWrite(id, "\x1b[B"); // 2.1.310 은 기본 선택이 "No, exit" — Yes 로 내려간 뒤 Enter (옛 문구는 기본이 Yes)
        await ptyWrite(id, "\r"); // S-1204: 앱이 만든 빈 폴더에서 사용자가 직접 시작한 확인만
        return;
      }
      blocked = { blocked: true, screen: text };
    } else if (detectBlocked(text)) {
      const keys = answers < 2 ? o.answerBlocked?.(text) : null;
      if (keys) {
        answers++;
        await ptyWrite(id, keys);
        return;
      }
      blocked = { blocked: true, screen: text };
    }
    if (blocked) s.close();
  }

  /** 입력칸(`>`·`❯`·`? for shortcuts`)이 화면 아래에 보일 때까지 최대 PROMPT_WAIT_MS. 문구가 달라 못 찾아도 그만큼만 기다리고 보낸다 */
  async function promptShown(): Promise<void> {
    for (const t0 = clock.now(); clock.now() - t0 < PROMPT_WAIT_MS && !killed && !exited; await clock.sleep(POLL_MS)) {
      const tail = (await screen.text()).split("\n").slice(-TAIL_LINES).join("\n");
      if (detectTrust(tail)) continue; // 신뢰 질문의 "❯ No, exit" 줄은 입력칸이 아니다
      if (/\? for shortcuts|^[\s│|]*[>❯›](?:\s|$)/m.test(tail)) return;
    }
  }

  async function settle(quietMs: number, maxMs: number): Promise<Settled> {
    const t0 = clock.now();
    for (;;) {
      if (blocked) return blocked;
      if (timedOut) throw new Error("timeout");
      if (exited || killed) return { blocked: false };
      if (clock.now() - t0 >= maxMs) throw new Error("timeout");
      const quiet = clock.now() - lastOut;
      if (firstOut && quiet >= READY_QUIET_MS) ready = true;
      if (ready) {
        const before = lastOut;
        await inspect();
        if (blocked) continue;
        if (lastOut === before && quiet >= quietMs) return { blocked: false };
      }
      await clock.sleep(POLL_MS);
    }
  }
  return s;
}

/** 줄(최대 3개)을 서서 세션을 열고, fn 이 끝나면(실패해도) 닫는다 */
export function runHidden<T>(o: HiddenOpts, fn: (s: HiddenSession) => Promise<T>): Promise<T> {
  return hiddenQueue.run(async () => {
    const s = await hiddenSession(o);
    try {
      return await fn(s);
    } finally {
      s.close();
    }
  });
}
/** S-1209: 앱 끝날 때 열린 숨은 세션 모두 끄기 */
export function closeAllHidden(): void {
  for (const s of [...live]) s.close();
}
