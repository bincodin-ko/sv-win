// D2 S-1206·S-1207: transcript 에서 답을 읽고 기다린다(화면 글자는 대답으로 쓰지 않는다)
import { agentFindSession, codexFindSession, lastReply } from "../lib/ipc";
import { realClock, type Clock } from "./screen";

export interface ReplyTarget {
  agentId: string;
  cwd: string;
  /** Claude: 시작 때 준 --session-id. Codex: 모르면 비운다(cwd+시작 시각으로 찾는다) */
  sessionId?: string;
  startedAtMs: number;
  /** 프로필 설정 폴더(CLAUDE_CONFIG_DIR·CODEX_HOME 값). 없으면 기본 ~/.claude·~/.codex */
  configDir?: string;
}
// Gemini·OpenCode: 찾은 세션 id 기억(같은 콘솔의 다음 읽기에 다시 안 찾음). ponytail: 앱 실행 중만, 안 비움(키가 시작 시각이라 자라는 양이 작다)
const found = new Map<string, string>();
async function findAgentSession(t: ReplyTarget): Promise<string | null> {
  const key = `${t.agentId}|${t.cwd}|${t.startedAtMs}`;
  const hit = found.get(key);
  if (hit) return hit;
  const id = await agentFindSession(t.agentId, t.cwd, t.startedAtMs, []).catch(() => null);
  if (id) found.set(key, id);
  return id;
}
export async function readReply(t: ReplyTarget): Promise<string | null> {
  const sid = t.sessionId ?? (t.agentId === "codex" ? await codexFindSession(t.cwd, t.startedAtMs, [], t.configDir).catch(() => null) : t.agentId === "gemini" || t.agentId === "opencode" ? await findAgentSession(t) : null);
  return sid ? await lastReply(t.agentId, t.cwd, sid, t.configDir).catch(() => null) : null;
}
export interface WaitReplyOpts extends ReplyTarget {
  /** 질문하기 전의 마지막 답(같으면 아직 새 답이 아님) */
  baseline: string | null;
  lastOutputAt(): number;
  quietMs?: number; // 기본 8000
  timeoutMs?: number; // 기본 10분
  clock?: Clock;
}
const POLL_MS = 500;
export async function waitReply(o: WaitReplyOpts): Promise<string> {
  const clock = o.clock ?? realClock;
  const t0 = clock.now();
  for (;;) {
    const r = await readReply(o);
    if (r && r !== o.baseline && clock.now() - o.lastOutputAt() >= (o.quietMs ?? 8000)) return r;
    if (clock.now() - t0 >= (o.timeoutMs ?? 600000)) throw new Error("timeout");
    await clock.sleep(POLL_MS);
  }
}
