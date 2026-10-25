import { describe, expect, it } from "vitest";
import { initial, reduce, type Ev, type St } from "./status";

const run = (evs: Ev[], from: St = initial) => evs.reduce(reduce, from);
const s = (evs: Ev[]) => run(evs).status;

describe("S-064 상태 pill 6종", () => {
  it("에이전트 spawn 직후 STARTING", () => {
    expect(s([{ type: "spawn", mode: "agent" }])).toBe("STARTING");
  });
  it("첫 출력이 오면 WORKING", () => {
    expect(s([{ type: "spawn", mode: "agent" }, { type: "firstOutput", t: 100 }])).toBe("WORKING");
  });
  it("WORKING 창은 1.5초: 1499ms 는 WORKING, 1500ms 는 RUNNING", () => {
    const base: Ev[] = [{ type: "spawn", mode: "agent" }, { type: "firstOutput", t: 1000 }];
    expect(s([...base, { type: "tick", t: 2499 }])).toBe("WORKING");
    expect(s([...base, { type: "tick", t: 2500 }])).toBe("RUNNING");
  });
  it("출력이 계속 오면 창이 밀린다", () => {
    expect(s([{ type: "spawn", mode: "agent" }, { type: "firstOutput", t: 0 }, { type: "output", t: 1400 }, { type: "tick", t: 2800 }])).toBe("WORKING");
  });
  it("조용하던 RUNNING 에 출력이 오면 다시 WORKING", () => {
    expect(s([{ type: "spawn", mode: "agent" }, { type: "output", t: 0 }, { type: "tick", t: 5000 }, { type: "output", t: 5100 }])).toBe("WORKING");
  });
  it("STARTING 은 tick 만으로는 안 바뀐다(첫 출력 전)", () => {
    expect(s([{ type: "spawn", mode: "agent" }, { type: "tick", t: 99999 }])).toBe("STARTING");
  });
  it("Shell 콘솔은 사용자 Enter 전 IDLE, 출력이 와도 IDLE, Enter 뒤 RUNNING", () => {
    expect(s([{ type: "spawn", mode: "shell" }])).toBe("IDLE");
    expect(s([{ type: "spawn", mode: "shell" }, { type: "output", t: 10 }, { type: "tick", t: 9999 }])).toBe("IDLE");
    expect(s([{ type: "spawn", mode: "shell" }, { type: "userEnter" }])).toBe("RUNNING");
  });
  it("에이전트 콘솔의 Enter 는 상태를 바꾸지 않는다", () => {
    expect(s([{ type: "spawn", mode: "agent" }, { type: "userEnter" }])).toBe("STARTING");
  });
  it("S-070 에이전트가 끝나 셸로 떨어지면 RUNNING", () => {
    expect(s([{ type: "spawn", mode: "agent" }, { type: "output", t: 0 }, { type: "spawn", mode: "fallback" }])).toBe("RUNNING");
  });
  it("프로세스가 끝나면 DONE, 시작 실패는 ERROR", () => {
    expect(s([{ type: "spawn", mode: "agent" }, { type: "exit", code: 0 }])).toBe("DONE");
    expect(s([{ type: "spawn", mode: "agent" }, { type: "spawnError" }])).toBe("ERROR");
  });
  it("DONE·ERROR 는 늦게 온 출력·tick 에 안 바뀐다", () => {
    expect(s([{ type: "spawn", mode: "agent" }, { type: "exit", code: 1 }, { type: "output", t: 5 }, { type: "tick", t: 9 }])).toBe("DONE");
    expect(s([{ type: "spawn", mode: "agent" }, { type: "spawnError" }, { type: "output", t: 5 }])).toBe("ERROR");
  });
  it("Restart(다시 spawn) 하면 DONE 에서 STARTING 으로", () => {
    expect(s([{ type: "spawn", mode: "agent" }, { type: "exit", code: 0 }, { type: "spawn", mode: "agent" }])).toBe("STARTING");
  });
});

describe("S-620·S-621·S-625 PAUSED", () => {
  const base: Ev[] = [{ type: "spawn", mode: "agent" }, { type: "output", t: 0 }, { type: "tick", t: 5000 }]; // RUNNING
  it("pause → PAUSED", () => {
    expect(s([...base, { type: "pause" }])).toBe("PAUSED");
  });
  it("PAUSED 중에는 출력·tick·Enter 가 와도 PAUSED 유지", () => {
    expect(s([...base, { type: "pause" }, { type: "output", t: 6000 }, { type: "firstOutput", t: 6001 }, { type: "tick", t: 99999 }, { type: "userEnter" }])).toBe("PAUSED");
  });
  it("resume → 이전 상태(RUNNING) 복귀, 그 뒤 출력이 오면 WORKING", () => {
    const back: Ev[] = [...base, { type: "pause" }, { type: "resume" }];
    expect(s(back)).toBe("RUNNING");
    expect(s([...back, { type: "output", t: 7000 }])).toBe("WORKING");
  });
  it("WORKING 에서 멈췄다 재개하면 WORKING 으로 돌아간다", () => {
    expect(s([{ type: "spawn", mode: "agent" }, { type: "output", t: 100 }, { type: "pause" }, { type: "resume" }])).toBe("WORKING");
  });
  it("STARTING·IDLE 에서 멈췄다 재개해도 그 상태로 돌아간다", () => {
    expect(s([{ type: "spawn", mode: "agent" }, { type: "pause" }, { type: "resume" }])).toBe("STARTING");
    expect(s([{ type: "spawn", mode: "shell" }, { type: "pause" }, { type: "resume" }])).toBe("IDLE");
  });
  it("PAUSED 중 프로세스가 끝나면 DONE, 시작 실패는 ERROR", () => {
    expect(s([...base, { type: "pause" }, { type: "exit", code: 0 }])).toBe("DONE");
    expect(s([...base, { type: "pause" }, { type: "spawnError" }])).toBe("ERROR");
  });
  it("S-625 PAUSED > DONE/ERROR 는 살아 있는 프로세스에만: 이미 끝난 콘솔은 멈춰지지 않고, 재개가 DONE 을 되살리지 않는다", () => {
    expect(s([...base, { type: "exit", code: 0 }, { type: "pause" }])).toBe("DONE");
    expect(s([{ type: "spawn", mode: "agent" }, { type: "spawnError" }, { type: "pause" }])).toBe("ERROR");
    expect(s([...base, { type: "pause" }, { type: "exit", code: 0 }, { type: "resume" }])).toBe("DONE");
  });
  it("PAUSED 아닌 상태의 resume 은 아무 일 없다", () => {
    expect(s([...base, { type: "resume" }])).toBe("RUNNING");
  });
  it("PAUSED 중 다시 시작(spawn)하면 새 상태로 간다", () => {
    expect(s([...base, { type: "pause" }, { type: "spawn", mode: "agent" }])).toBe("STARTING");
  });
});

// B16 S-625·S-685·S-693: hook 이벤트(agentEvent)
describe("B16 agentEvent", () => {
  const up: Ev[] = [{ type: "spawn", mode: "agent" }];
  const ev = (status: "WORKING" | "NEEDS YOU" | "READY" | "ERROR", t = 0): Ev => ({ type: "agentEvent", status, t });
  it("WORKING → NEEDS YOU → READY 로 간다", () => {
    expect(s([...up, ev("WORKING")])).toBe("WORKING");
    expect(s([...up, ev("WORKING"), ev("NEEDS YOU")])).toBe("NEEDS YOU");
    expect(s([...up, ev("NEEDS YOU"), ev("READY")])).toBe("READY");
  });
  it("hook 이 오기 시작하면 출력·tick 은 상태를 바꾸지 않는다(출력 기준 WORKING→RUNNING 도 없다)", () => {
    expect(s([...up, ev("READY", 0), { type: "output", t: 10 }])).toBe("READY");
    expect(s([...up, ev("NEEDS YOU", 0), { type: "output", t: 10 }, { type: "tick", t: 60_000 }])).toBe("NEEDS YOU");
    expect(s([...up, ev("WORKING", 0), { type: "tick", t: 60_000 }])).toBe("WORKING");
  });
  it("S-625 우선순위: PAUSED 와 DONE 은 hook 으로 덮이지 않는다", () => {
    expect(s([...up, ev("WORKING"), { type: "pause" }, ev("READY")])).toBe("PAUSED");
    expect(s([...up, ev("WORKING"), { type: "exit", code: 0 }, ev("NEEDS YOU")])).toBe("DONE");
    expect(s([...up, { type: "spawnError" }, ev("READY")])).toBe("ERROR"); // 시작 실패는 hook 으로 안 지워진다
  });
  it("PAUSED 중에 온 hook 상태는 재개하면 나타난다", () => {
    expect(s([...up, ev("WORKING"), { type: "pause" }, ev("NEEDS YOU"), { type: "resume" }])).toBe("NEEDS YOU");
  });
  it("hook ERROR(턴 실패)는 다음 hook 이벤트가 오면 풀린다", () => {
    expect(s([...up, ev("WORKING"), ev("ERROR")])).toBe("ERROR");
    expect(s([...up, ev("ERROR"), ev("WORKING")])).toBe("WORKING");
  });
  it("S-693 30분 무소식이면 출력 기준으로 되돌아간다", () => {
    const m30 = 30 * 60_000;
    expect(s([...up, ev("READY", 0), { type: "tick", t: m30 - 1 }])).toBe("READY");
    expect(s([...up, ev("READY", 0), { type: "tick", t: m30 }])).toBe("RUNNING");
    expect(s([...up, ev("READY", 0), { type: "tick", t: m30 }, { type: "output", t: m30 + 5 }])).toBe("WORKING");
  });
  it("라이브 상태를 끄면(hookOff) hook 기준 상태가 출력 기준으로 돌아간다", () => {
    expect(s([...up, ev("NEEDS YOU"), { type: "hookOff" }])).toBe("RUNNING");
    expect(s([...up, ev("READY"), { type: "hookOff" }, { type: "output", t: 5 }])).toBe("WORKING");
    expect(s([...up, ev("WORKING"), { type: "exit", code: 0 }, { type: "hookOff" }])).toBe("DONE");
  });
  it("S-688 hook 이 없으면 NEEDS YOU·READY 는 나오지 않는다(기존 규칙 그대로)", () => {
    const st = run([...up, { type: "output", t: 0 }, { type: "tick", t: 5000 }]).status;
    expect(["NEEDS YOU", "READY"]).not.toContain(st);
  });
});
