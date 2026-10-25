// S-064 상태 기계 (순수 함수)
export type Status = "IDLE" | "STARTING" | "WORKING" | "RUNNING" | "DONE" | "ERROR" | "PAUSED" | "NEEDS YOU" | "READY";
export const WORKING_MS = 1500;
/** S-693: hook 이 이만큼 조용하면 출력 기준으로 돌아간다 */
export const HOOK_STALE_MS = 30 * 60_000;
export interface St {
  status: Status;
  lastOut: number;
  /** PAUSED 가 되기 전 상태(재개하면 여기로 돌아간다) */
  prev?: Status;
  /** B16: 마지막 hook 이벤트 시각. 있으면 상태는 hook 기준(출력은 상태를 못 바꾼다) */
  hookAt?: number;
  /** hook ERROR(턴 실패): 다음 hook 이벤트가 오면 풀린다(시작 실패 ERROR 와 다르다) */
  soft?: boolean;
}
export type Ev =
  | { type: "spawn"; mode: "agent" | "shell" | "fallback" } // agent=STARTING, shell=IDLE(Enter 전), fallback=에이전트가 끝나 셸로 떨어짐(RUNNING)
  | { type: "firstOutput"; t: number }
  | { type: "output"; t: number }
  | { type: "tick"; t: number }
  | { type: "exit"; code: number | null }
  | { type: "spawnError" }
  | { type: "userEnter" }
  | { type: "pause" } // S-620
  | { type: "resume" } // S-621
  | { type: "hookOff" } // 라이브 상태를 껐다: hook 기준 상태를 출력 기준으로 되돌린다
  | { type: "agentEvent"; status: "WORKING" | "NEEDS YOU" | "READY" | "ERROR"; t: number }; // B16 S-685: 에이전트 hook

export const initial: St = { status: "STARTING", lastOut: 0 };

export function reduce(st: St, ev: Ev): St {
  const { status } = st;
  switch (ev.type) {
    case "spawn":
      return { status: ev.mode === "agent" ? "STARTING" : ev.mode === "shell" ? "IDLE" : "RUNNING", lastOut: 0 };
    case "firstOutput":
    case "output":
      if (st.hookAt !== undefined) return st;
      return status === "STARTING" || status === "WORKING" || status === "RUNNING" ? { status: "WORKING", lastOut: ev.t } : st;
    case "tick":
      if (st.hookAt !== undefined) {
        if (ev.t - st.hookAt < HOOK_STALE_MS || status === "PAUSED") return st;
        const { hookAt: _h, soft: _s, ...rest } = st;
        return status === "DONE" || (status === "ERROR" && !st.soft) ? rest : { ...rest, status: "RUNNING" }; // S-693
      }
      return status === "WORKING" && ev.t - st.lastOut >= WORKING_MS ? { ...st, status: "RUNNING" } : st;
    case "userEnter":
      return status === "IDLE" ? { ...st, status: "RUNNING" } : st;
    case "exit":
      return { ...st, status: "DONE", prev: undefined };
    case "spawnError":
      return { ...st, status: "ERROR", prev: undefined };
    case "pause":
      // 이미 끝난(DONE·ERROR) 콘솔은 멈출 게 없다. 멈춘 상태를 또 멈추면 prev 를 덮지 않는다
      return status === "PAUSED" || status === "DONE" || status === "ERROR" ? st : { ...st, status: "PAUSED", prev: status };
    case "hookOff": {
      if (st.hookAt === undefined) return st;
      const { hookAt: _h, soft: _s, ...rest } = st;
      const hooked = (x?: Status) => x === "WORKING" || x === "NEEDS YOU" || x === "READY" || x === "ERROR";
      if (status === "DONE" || (status === "ERROR" && !st.soft)) return rest;
      return { ...rest, status: hooked(status) ? "RUNNING" : status, prev: hooked(st.prev) ? "RUNNING" : st.prev };
    }
    case "agentEvent": {
      // S-625: PAUSED > DONE/ERROR(시작 실패) > hook 상태. 멈춘 동안 온 것은 재개 때 나타난다
      if (status === "DONE" || (status === "ERROR" && !st.soft)) return st;
      const hook = { hookAt: ev.t, soft: ev.status === "ERROR" };
      return status === "PAUSED" ? { ...st, ...hook, prev: ev.status } : { ...st, ...hook, status: ev.status };
    }
    case "resume":
      return status === "PAUSED" ? { ...st, status: st.prev ?? "RUNNING", prev: undefined } : st;
  }
}

/** S-072: 10초 타이머의 벽시계 간격이 90초를 넘으면 PC 가 잠들었다 깬 것 */
export const SLEEP_MS = 90_000;
export const didSleep = (prevWall: number, nowWall: number): boolean => nowWall - prevWall > SLEEP_MS;
