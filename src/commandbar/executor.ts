import { mk, useThread } from "./thread";

// 명령 바와 실행기의 연결점. B12 가 setExecutor 로 진짜 실행기를 등록한다.
/** scope = Orchestrator 카드에서 보낸 명령의 범위(sessionKey 목록, S-1260). 없으면 제한 없음 */
export type ExecCtx = { repo: string; wsId: string; scope?: { consoles: string[]; groups: string[]; card?: string } };
export type Executor = (text: string, ctx: ExecCtx) => void | Promise<void>;

let exec: Executor | null = null;
export function setExecutor(fn: Executor | null): void {
  exec = fn;
}
/** 사용자가 보낸 글. 스레드에 내 메시지를 남기고(항상 submit 이 한다) 등록된 실행기를 부른다. 기본은 거기까지 */
export function submit(text: string, ctx: ExecCtx): void {
  const t = useThread.getState();
  t.add(ctx.repo, mk("user", text));
  const fail = (e: unknown) => t.add(ctx.repo, mk("bot", `Something went wrong: ${e instanceof Error ? e.message : String(e)}`));
  try {
    void Promise.resolve(exec?.(text, ctx)).catch(fail);
  } catch (e) {
    fail(e);
  }
}
