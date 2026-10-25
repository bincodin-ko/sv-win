// S-1700~S-1704: forward 대기 목록 + 발동. 끝났는지는 2묶음 보고 규칙(주문의 verdict)을 그대로 쓴다.
import { t } from "../i18n";
import { isIdle, pickTargets, type Cand } from "../commandbar/pick";
import type { Verdict } from "../commandbar/report";
import { buildDigest, divide } from "./digest";
import type { Base } from "./types";

export const NO_ORDER_MS = 4 * 3_600_000; // 아직 주문 전 소스
export const ORDER_MS = 30 * 60_000; // 주문 뒤 한도 = 끝난 뒤 유효 시간
export const MAX_PENDING = 5;
const POLL_MS = 5_000;

export type FOrder = { sentAt: number; verdict: Verdict };
export type Dest = { label: string; cli?: boolean; cands: Cand[] };
export interface ForwardDeps extends Base {
  /** 이 콘솔의 가장 최근 주문(2묶음 recentOrders) */
  orders(id: string): FOrder | undefined;
  reply(id: string): Promise<string | null>;
  nameOf(id: string): string;
  send(id: string, text: string): Promise<unknown>;
}

type Req = { cancelled: boolean };

export function createForward(d: ForwardDeps) {
  const pending = new Set<Req>();

  /** ready = 보고함, wait = 더 기다림, skip = 포기 */
  function look(id: string, t0: number): "ready" | "wait" | "skip" {
    const o = d.orders(id);
    const now = d.now();
    const v = o?.verdict;
    const finishedAt = o && v && (v.state === "finished" || v.state === "failed") ? o.sentAt + v.secs * 1000 : 0;
    if (o && finishedAt && now - finishedAt <= ORDER_MS) return "ready"; // 끝난 뒤 30분 유효
    if (o && v && (v.state === "working" || v.state === "expired")) return now - o.sentAt >= ORDER_MS ? "skip" : "wait";
    return now - t0 >= NO_ORDER_MS ? "skip" : "wait"; // 주문 없음(또는 너무 오래된 결과)
  }

  async function add(o: { sources: string[]; dests: Dest[]; everyone?: boolean }): Promise<void> {
    if (pending.size >= MAX_PENDING) return d.say(t("Too many forwards are waiting."));
    const req: Req = { cancelled: false };
    pending.add(req);
    try {
      const t0 = d.now();
      let ready: string[];
      const got0 = new Map<string, "ready" | "skip">(); // 한 번 정해진 소스는 그대로(보고한 결과가 기다리는 사이 30분이 지나도 유효)
      for (;;) {
        const st = o.sources.map((id) => {
          const s = got0.get(id) ?? look(id, t0);
          if (s !== "wait") got0.set(id, s);
          return s;
        });
        if (!st.includes("wait")) { ready = o.sources.filter((_, i) => st[i] === "ready"); break; }
        await d.sleep(POLL_MS);
        if (req.cancelled) return;
      }
      if (!ready.length) return d.say(t("Nothing to forward."));
      const replies = await Promise.all(ready.map(async (id) => ({ name: d.nameOf(id), text: (await d.reply(id).catch(() => null)) ?? "(no reply)" })));
      const { parts } = buildDigest(replies);
      // 목적지마다 받을 콘솔 정하기(CLI 는 한가한 것만, 새로 만들지 않는다)
      const live = o.dests
        .map((dest) => {
          const to = dest.cli ? dest.cands.find((c) => c.agent && isIdle(c.status)) : pickTargets({ named: dest.cands, all: dest.cands }).to[0];
          if (!to) d.say(dest.cli ? t("No {label} console to forward to.", { label: dest.label }) : t("No agent in {label} to forward to.", { label: dest.label }));
          return { to, label: dest.label };
        })
        .filter((x) => x.to);
      if (!live.length) return;
      const texts = divide(parts, live.length, !!o.everyone);
      const got: string[] = [];
      for (let i = 0; i < live.length; i++) {
        if (texts[i] == null) continue;
        await d.send(live[i]!.to!.id, texts[i]!);
        got.push(live[i]!.label);
      }
      d.say(t("Forwarded {n} result(s) to {to}.", { n: ready.length, to: got.join(", ") }));
    } finally {
      pending.delete(req);
    }
  }

  return {
    add,
    cancel(): number {
      const n = pending.size;
      for (const r of pending) r.cancelled = true;
      return n;
    },
    pending: (): number => pending.size,
  };
}
