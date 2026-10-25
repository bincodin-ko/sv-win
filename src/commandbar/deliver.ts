// S-604~S-608: 콘솔별 주문 전달 큐. 규칙은 여기 한 곳: 셸 제외, 시작 중 10초, 프롬프트 15분, cancel.
import { typeAndSubmit, type Writable } from "../console/submit";
import { showsPrompt } from "./prompts";

export interface DTarget extends Writable {
  isAgent(): boolean;
  status(): string;
  hasOutput(): boolean;
  tail(n: number): string[];
}
export type Outcome = "sent" | "cancelled" | "shell" | "noOutput" | "promptTimeout";
export const START_WAIT_MS = 10_000;
export const PROMPT_WAIT_MS = 15 * 60_000;
export const POLL_MS = 200;

type Entry = { key: string; cancelled: boolean; wake?: () => void };
const waiting = new Set<Entry>();
const chains = new Map<string, Promise<unknown>>();

async function run(e: Entry, t: DTarget, text: string): Promise<Outcome> {
  const start = Date.now();
  for (;;) {
    if (e.cancelled) return "cancelled";
    if (!t.isAgent()) return "shell"; // S-604: 기다리는 사이 셸로 떨어져도 입력하지 않는다
    const waited = Date.now() - start;
    if (!t.hasOutput()) { if (waited >= START_WAIT_MS) return "noOutput"; }
    else if (t.status() !== "NEEDS YOU" && !showsPrompt(t.tail(12))) break; // 라이브 상태가 켜져 있으면 NEEDS YOU 도 같은 뜻
    else if (waited >= PROMPT_WAIT_MS) return "promptTimeout";
    await new Promise<void>((r) => { e.wake = r; setTimeout(r, POLL_MS); }); // cancel 이면 바로 깨운다
  }
  // 이미 붙여 넣은 글은 입력창에 남고, 그 사이 cancel 이면 Enter 만 막는다(S-608)
  await typeAndSubmit({ write: (d) => (d === "\r" && e.cancelled ? undefined : t.write(d)), bracketedPaste: () => t.bracketedPaste() }, text);
  return e.cancelled ? "cancelled" : "sent";
}

export function deliver(key: string, t: DTarget, text: string): Promise<Outcome> {
  const e: Entry = { key, cancelled: false };
  waiting.add(e);
  const p = (chains.get(key) ?? Promise.resolve()).then(() => run(e, t, text)).finally(() => waiting.delete(e));
  chains.set(key, p.catch(() => {}));
  return p;
}

/** 대기 중인 주문을 버린다(keys 가 없으면 전부). 버린 개수 */
export function cancelPending(keys?: string[]): number {
  let n = 0;
  for (const e of waiting) if (!keys || keys.includes(e.key)) { e.cancelled = true; e.wake?.(); n++; }
  return n;
}
