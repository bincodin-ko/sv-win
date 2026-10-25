// D5 Loops 엔진: 1초 타이머 하나(S-1418)가 부르는 tick. 세션 파일은 고치지 않고 매 tick 상태·꼬리를 읽어 비교한다.
// ponytail: 1초 간격 비교라 상태 전이·새 출력 감지가 최대 1초 늦다 — 더 빨라야 하면 세션 onData/onStatus 구독으로
import { isIdle } from "../commandbar/pick";
import { t, tm, tp } from "../i18n";
import { sortTargets, type LConsole } from "./deliver";
import type { Verdict } from "./goal";
import { useLoops } from "./store";
import { cooled, idleEdge, newLines, outputMatch } from "./trigger";
import type { Loop } from "./types";

const SKIP_WHY = { "needs you": tm("needs you"), paused: tm("paused") }; // 기록 줄 글(그릴 때가 아니라 기록할 때의 언어)

export type Deps = {
  now(): number;
  /** 대상 해석(S-1409) 결과 콘솔들 */
  targets(l: Loop): LConsole[];
  /** 그 워크스페이스가 지금 보이는가(S-1410) */
  visible(wsId: string): boolean;
  /** 한 줄 붙여넣고 150ms 뒤 Enter(typeAndSubmit) */
  send(c: LConsole, text: string): Promise<void>;
  notify(title: string, body: string): void;
  checkGoal(l: Loop): Promise<Verdict | "skipped">;
};

const TAIL_N = 40;
const RETRY_MS = 60_000;
type Inner = { startedAt: number; busy: boolean; last: Map<string, number>; tails: Map<string, string[]>; stats: Map<string, string>; pending: Set<string> };

export function createEngine(d: Deps) {
  const inner = new Map<string, Inner>();
  const st = () => useLoops.getState();
  const innerOf = (id: string, startedAt: number) => {
    let x = inner.get(id);
    if (!x || x.startedAt !== startedAt) inner.set(id, (x = { startedAt, busy: false, last: new Map(), tails: new Map(), stats: new Map(), pending: new Set() }));
    return x;
  };
  const log = (l: Loop, kind: "run" | "skip" | "stop", text: string) => st().log({ at: d.now(), loop: l.id, kind, text });
  const on = (l: Loop, startedAt: number) => st().loops.find((x) => x.id === l.id)?.enabled === true && st().rt[l.id]?.startedAt === startedAt;
  const setNext = (id: string, nextAt: number) => useLoops.setState((s) => (s.rt[id] ? { rt: { ...s.rt, [id]: { ...s.rt[id]!, nextAt } } } : s));

  function finish(l: Loop, reason: string) {
    st().setEnabled(l.id, false);
    const shown = t(reason); // 화면·알림 글만 번역(판정은 영어 값)
    log(l, "stop", shown);
    d.notify(l.name, shown); // S-1413 ②
  }

  /** 보낸 콘솔 수. 한 곳 이상 가면 실행 1회(S-1408) */
  async function deliverTo(l: Loop, cs: LConsole[], scheduled: boolean): Promise<number> {
    const { send, skipped } = sortTargets(cs);
    if (!send.length && !skipped.length) log(l, "skip", t("no consoles"));
    for (const s of skipped) log(l, "skip", `${s.c.name} ${t(SKIP_WHY[s.why])}`);
    if (scheduled && skipped.some((s) => s.why === "needs you")) d.notify(l.name, t("A console needs you, so the instruction is on hold")); // S-1413 ①
    await Promise.all(send.map((c) => d.send(c, l.instruction)));
    if (!send.length) return 0;
    const rt = st().rt[l.id];
    if (rt) {
      const runs = rt.runs + 1;
      useLoops.setState((s) => ({ rt: { ...s.rt, [l.id]: { ...rt, runs } } }));
      log(l, "run", tp("sent to {n} console", "sent to {n} consoles", send.length));
      if (l.stop.runs != null && runs >= l.stop.runs) finish(l, tm("run cap reached"));
    } else log(l, "run", tp("sent to {n} console", "sent to {n} consoles", send.length));
    return send.length;
  }

  /** 목표가 있으면 먼저 확인(S-1411). 달성 = 끔. 그 밖(못 함·건너뜀 포함)은 진행. 진행해도 되면 true */
  async function goalGate(l: Loop, startedAt: number): Promise<boolean> {
    if (!l.stop.goal) return true;
    const v = await d.checkGoal(l);
    if (!on(l, startedAt)) return false;
    if (v === "met") { finish(l, tm("goal met")); return false; }
    return true;
  }

  async function job(x: Inner, f: () => Promise<void>) {
    x.busy = true;
    try { await f(); } finally { x.busy = false; }
  }

  async function tick(): Promise<void> {
    const now = d.now();
    const jobs: Promise<void>[] = [];
    for (const l of st().loops) {
      const rt = st().rt[l.id];
      if (!l.enabled || !rt) continue;
      const x = innerOf(l.id, rt.startedAt);
      if (l.stop.minutes != null && now - rt.startedAt >= l.stop.minutes * 60_000) { finish(l, tm("time limit reached")); continue; }
      const vis = l.keepBehind || d.visible(l.wsId);
      const cs = d.targets(l);
      const ended: LConsole[] = [];
      for (const c of cs) {
        const s = c.status();
        if (idleEdge(x.stats.get(c.key), s)) ended.push(c);
        x.stats.set(c.key, s);
        if (l.trigger.kind !== "output") continue;
        const tail = c.tail(TAIL_N);
        const prev = x.tails.get(c.key);
        x.tails.set(c.key, tail); // 처음 본 꼬리는 기준일 뿐(켤 때 있던 출력은 새것이 아님)
        if (prev && vis && cooled(x.last.get(c.key), now) && outputMatch(l.trigger.text, newLines(prev, tail))) { x.last.set(c.key, now); x.pending.add(c.key); }
      }
      if (x.busy) continue;
      const t = l.trigger;
      if (!vis) { // S-1410: 안 보이는 동안의 예약 시각은 기록 없이 건너뜀
        if (t.kind === "schedule" && rt.nextAt != null && now >= rt.nextAt) setNext(l.id, now + t.everyMin * 60_000);
        continue;
      }
      if (t.kind === "idle") {
        const fire = ended.filter((c) => cooled(x.last.get(c.key), now));
        if (!fire.length) continue;
        for (const c of fire) x.last.set(c.key, now);
        jobs.push(job(x, async () => { if (await goalGate(l, rt.startedAt)) await deliverTo(l, fire, false); }));
        continue;
      }
      if (ended.length && l.stop.goal) jobs.push(job(x, async () => void (await goalGate(l, rt.startedAt)))); // 턴이 끝났을 때 확인(S-1411)
      if (t.kind === "schedule") {
        if (rt.nextAt == null || now < rt.nextAt) continue;
        jobs.push(job(x, async () => {
          if (!(await goalGate(l, rt.startedAt))) return;
          const n = await deliverTo(l, cs, true);
          setNext(l.id, now + (n ? t.everyMin * 60_000 : RETRY_MS)); // 늦게 깨도 한 번만, 아무 데도 못 가면 1분 뒤
        }));
      } else {
        for (const k of x.pending) if (!cs.some((c) => c.key === k && c.isAgent())) x.pending.delete(k);
        const ready = cs.filter((c) => x.pending.has(c.key) && !c.isPaused() && isIdle(c.status())); // 한가해지면 전달
        if (!ready.length) continue;
        for (const c of ready) x.pending.delete(c.key);
        jobs.push(job(x, async () => void (await deliverTo(l, ready, false))));
      }
    }
    await Promise.all(jobs);
  }

  /** ▶: 트리거와 상관없이 한 번, 횟수에 센다(S-1417) */
  async function runNow(id: string): Promise<void> {
    const l = st().loops.find((x) => x.id === id);
    if (l) await deliverTo(l, d.targets(l), false);
  }

  return { tick, runNow };
}
