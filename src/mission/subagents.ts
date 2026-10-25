// 12묶음 Q5 S-3172~S-3175: 하위 에이전트 폴링·보이는 목록·시간 글자
import { useEffect, useState } from "react";
import type { BoardNode } from "../board/store";
import { t } from "../i18n";
import { claudeSubagents, type Sub } from "../lib/ipc";
import { consoleProfile } from "../profiles/env";

export type { Sub };
export type SubTarget = { id: string; sessionId: string; cwd: string; profile?: string };
export const POLL_MS = 3000;
export const MAX_TARGETS = 40;
export const MAX_ROWS = 5;
export const HIDE_AFTER_MS = 10 * 60 * 1000;

const p2 = (n: number) => String(n).padStart(2, "0");
/** 12s · 3m 05s · 1h 02m */
export function fmtDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${p2(Math.floor((s % 3600) / 60))}m`;
  return s >= 60 ? `${Math.floor(s / 60)}m ${p2(s % 60)}s` : `${s}s`;
}

/** S-3173·S-3175: 상태 글 — Running 12s / Done in 3m 05s / Failed */
export function subStateText(s: Sub, now: number): string {
  if (s.state === "running") return t("Running {d}", { d: fmtDur(now - s.startedAt) });
  if (s.state === "unknown") return t("Unknown");
  return s.state === "done" ? t("Done in {d}", { d: fmtDur((s.endedAt ?? now) - s.startedAt) }) : t("Failed");
}

/** S-3174: 끝난 지 10분 넘은 것은 숨김. 최근 시작이 먼저 */
export function visibleSubs(list: Sub[], now: number): Sub[] {
  return list.filter((s) => s.endedAt === undefined || now - s.endedAt < HIDE_AFTER_MS).sort((a, b) => b.startedAt - a.startedAt);
}

/** S-3173: 최대 5줄 + 남은 수 */
export function capSubs(list: Sub[], max = MAX_ROWS): { rows: Sub[]; more: number } {
  return { rows: list.slice(0, max), more: Math.max(0, list.length - max) };
}

/** S-3172·S-3177: Claude 콘솔 중 claudeSessionId 가 있고 폴더를 아는 것, 최대 40개 */
export function subTargets(nodes: Record<string, BoardNode>, cwdOf: (n: BoardNode) => string | undefined): SubTarget[] {
  const out: SubTarget[] = [];
  for (const n of Object.values(nodes)) {
    const sessionId = n.kind === "console" && n.agentId === "claude" ? (n.resume as { claudeSessionId?: string } | undefined)?.claudeSessionId : undefined;
    const cwd = sessionId ? cwdOf(n) : undefined;
    if (sessionId && cwd) out.push({ id: n.id, sessionId, cwd, ...(typeof n.profile === "string" && n.profile ? { profile: n.profile } : {}) });
    if (out.length >= MAX_TARGETS) break;
  }
  return out;
}

/** 3초마다 부른다(시작 즉시 1번). 앞 호출이 안 끝났으면 건너뜀. 반환 = 멈추기 */
export function startSubPolling(getTargets: () => SubTarget[], fetchOne: (t: SubTarget) => Promise<Sub[]>, onData: (m: Record<string, Sub[]>) => void): () => void {
  let busy = false, dead = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const ts = getTargets().slice(0, MAX_TARGETS);
      const res = await Promise.all(ts.map((t) => fetchOne(t).catch(() => [] as Sub[])));
      if (!dead) onData(Object.fromEntries(ts.map((t, i) => [t.id, res[i]!])));
    } finally {
      busy = false;
    }
  };
  void tick();
  const iv = setInterval(() => void tick(), POLL_MS);
  return () => { dead = true; clearInterval(iv); };
}

const fetchOne = async (t: SubTarget) => claudeSubagents(t.cwd, t.sessionId, (await consoleProfile("claude", t.profile)).dir);

/** 열려 있는 동안만 폴링. 결과 = 콘솔 노드 id → 하위 목록 */
export function useSubagents(open: boolean, targets: SubTarget[]): Record<string, Sub[]> {
  const [map, setMap] = useState<Record<string, Sub[]>>({});
  const key = JSON.stringify(targets);
  useEffect(() => {
    if (!open) return;
    const ts = JSON.parse(key) as SubTarget[];
    return startSubPolling(() => ts, fetchOne, setMap);
  }, [open, key]);
  return open ? map : {};
}
