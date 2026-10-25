// D5 실제 앱 연결: 열린 repo 의 정의 불러오기, 대상 = 보드 저장소 + 세션, 보임 = 셸 상태, 1초 타이머(S-1418).
// 목표 실행은 주입: setGoalDeps({ goalRun: ipc.goalRun(D3), judge: judgeGoal(D9·D13) }) — 합칠 때 메인이 연결. 그 전에는 "판단 못 함"(실행 진행).
import { registry } from "../board/boards";
import { getSession } from "../console/session";
import { sessionKey } from "../console/sessionKey";
import { typeAndSubmit } from "../console/submit";
import { isTauri } from "../lib/ipc";
import { useShell } from "../shell/useShell";
import type { LConsole } from "./deliver";
import { createEngine } from "./engine";
import { createGoalQueue, type GoalDeps } from "./goal";
import { judgeGoal } from "./judge";
import { notify } from "./notify";
import { useLoops } from "./store";
import { targetNodeIds } from "./targets";
import { loopNow } from "./trigger";
import type { Loop } from "./types";
import { goalRun } from "../lib/ipc";

// D3 ipc.goalRun 연결(합칠 때 메인): D3 는 not_met·tail, 엔진은 notMet·output
const d3GoalRun: GoalDeps["goalRun"] = async (cmd, cwd, secs) => {
  const r = await goalRun(cmd, cwd, secs);
  return { status: r.status === "not_met" ? "notMet" : r.status, output: r.tail };
};
const goalDeps: Pick<GoalDeps, "goalRun" | "judge"> = { goalRun: d3GoalRun, judge: (l) => judgeGoal(l, l.repo) };
export const setGoalDeps = (p: Partial<Pick<GoalDeps, "goalRun" | "judge">>) => void Object.assign(goalDeps, p);

function targets(l: Loop): LConsole[] {
  const repo = useShell.getState().openRepos.find((r) => r.path === l.repo);
  if (!repo?.workspaces.some((w) => w.id === l.wsId)) return [];
  const wss = l.target.kind === "all" && l.keepBehind ? repo.workspaces.map((w) => w.id) : [l.wsId];
  const out: LConsole[] = [];
  for (const ws of wss) {
    const st = registry.get(ws)?.getState();
    if (!st) continue;
    const nodes = st.nodes;
    for (const id of targetNodeIds(l.target, nodes, st.groups)) {
      const s = getSession(ws, id);
      if (!s) continue;
      out.push({
        key: sessionKey(ws, id), name: String(nodes[id]!.name ?? id),
        isAgent: () => s.isAgent(), status: () => s.status(), isPaused: () => s.isPaused(), tail: (n) => s.tail(n), write: (x) => s.write(x), bracketedPaste: () => s.bracketedPaste(),
      });
    }
  }
  return out;
}

function visible(wsId: string): boolean {
  const sh = useShell.getState();
  return sh.view === "board" && sh.openRepos.find((r) => r.path === sh.activeRepo)?.activeWs === wsId;
}

let active: ReturnType<typeof createEngine> | null = null;
/** ▶ (S-1417) */
export const runNow = (id: string): Promise<void> => active?.runNow(id) ?? Promise.resolve();

/** 앱 시작 때 한 번. 끄는 함수를 돌려준다 */
export function startLoops(): () => void {
  const goal = createGoalQueue({ now: loopNow, goalRun: (...a) => goalDeps.goalRun(...a), judge: (l) => goalDeps.judge(l), log: (l, text) => useLoops.getState().log({ at: loopNow(), loop: l.id, kind: "goal", text }) });
  const e = (active = createEngine({ now: loopNow, targets, visible, send: (c, t) => typeAndSubmit(c, t), notify, checkGoal: (l) => goal.check(l) }));
  const loaded = new Set<string>();
  // tick 이 겹쳐도 된다: loop 마다 busy 표시가 있어 같은 loop 의 일(목표 확인 최대 5분 포함)은 겹치지 않는다
  const tick = () => {
    for (const r of useShell.getState().openRepos) if (!loaded.has(r.path)) { loaded.add(r.path); void useLoops.getState().load(r.path); }
    return e.tick();
  };
  const h = setInterval(() => void tick(), 1000);
  if (!isTauri()) Object.assign(window, { __loops: { tick, runNow } }); // e2e(D9): 시계 window.__loopNow 를 옮긴 뒤 바로 한 번 돌린다
  return () => { clearInterval(h); active = null; };
}
