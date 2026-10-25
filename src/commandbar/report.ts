import { t } from "../i18n";

// S-611: 주문 추적 — 끝남 판정(READY 또는 출력 3초 정지), 30분 폐기, 소요 시간.
export const QUIET_MS = 3000;
export const EXPIRE_MS = 30 * 60_000;
export const POLL_MS = 500;
const MAX_LOG = 50;

/** blocked = 멈춤(PAUSED)이거나 권한 프롬프트를 기다리는 중 — 조용해도 끝난 게 아니다 */
export type Snap = { status: string; lastOut: number; agent: boolean; blocked: boolean };
export type Verdict = { state: "working" } | { state: "finished"; secs: number } | { state: "failed"; secs: number; reason: string } | { state: "expired" };
export type Order = { id: number; repo: string; name: string; nodeId: string; wsId: string; sentAt: number; sawWorking: boolean; verdict: Verdict; /** D7 S-1311: 보낸 주문 글 */ text?: string };

/** 2m 10s / 45s / 1h 2m */
export function fmtDuration(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  if (s >= 3600) return t("{h}h {m}m", { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) });
  return s >= 60 ? t("{m}m {s}s", { m: Math.floor(s / 60), s: s % 60 }) : t("{s}s", { s });
}

export function judge(o: { sentAt: number; sawWorking: boolean }, s: Snap, now: number): Verdict {
  const secs = (t: number) => Math.max(0, Math.round((t - o.sentAt) / 1000));
  if (s.status === "ERROR" || s.status === "DONE") return { state: "failed", secs: secs(now), reason: s.status === "ERROR" ? "it failed to start" : "the agent exited" };
  if (!s.agent) return { state: "failed", secs: secs(Math.max(s.lastOut, o.sentAt)), reason: "the agent exited" }; // 에이전트가 끝나 셸로 떨어짐
  if (!s.blocked) {
    if (s.status === "READY" && o.sawWorking) return { state: "finished", secs: secs(now) };
    if (s.lastOut > o.sentAt && now - s.lastOut >= QUIET_MS) return { state: "finished", secs: secs(s.lastOut) };
  }
  return now - o.sentAt >= EXPIRE_MS ? { state: "expired" } : { state: "working" };
}

let seq = 0;
let log: Order[] = [];
export const recentOrders = (repo: string): Order[] => log.filter((o) => o.repo === repo).slice().reverse();
export function clearOrders(): void {
  log = [];
}

/** 주문 하나를 추적한다. snap 이 null 이면 콘솔이 사라진 것(failed). 끝나면 onEnd 를 한 번 부른다 */
export function track(o: Omit<Order, "id" | "sawWorking" | "verdict" | "sentAt">, snap: () => Snap | null, onEnd: (o: Order) => void): Order {
  const order: Order = { ...o, id: ++seq, sentAt: Date.now(), sawWorking: false, verdict: { state: "working" } };
  log = [...log, order].slice(-MAX_LOG);
  const timer = setInterval(() => {
    const s = snap();
    const now = Date.now();
    if (s?.status === "WORKING") order.sawWorking = true;
    order.verdict = s ? judge(order, s, now) : { state: "failed", secs: Math.round((now - order.sentAt) / 1000), reason: "the console is gone" };
    if (order.verdict.state === "working") return;
    clearInterval(timer);
    onEnd(order);
  }, POLL_MS);
  return order;
}
