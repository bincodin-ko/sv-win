import { describe, expect, it } from "vitest";
import { pauseAll, pauseSession, resumeAll, resumeSession } from "./pause";

function fake(running = true, paused = false) {
  const log: string[] = [];
  return {
    log,
    isRunning: () => running,
    isPaused: () => paused,
    pause() { paused = true; log.push("pause"); },
    resume() { paused = false; log.push("resume"); },
  };
}

describe("S-546 pauseAll / resumeAll", () => {
  it("여러 세션을 모두 멈추고 멈춘 수를 돌려준다", () => {
    const a = [fake(), fake(), fake()];
    expect(pauseAll(a)).toBe(3);
    expect(a.every((x) => x.isPaused())).toBe(true);
  });
  it("이미 PAUSED 인 세션은 건너뛴다(pause 를 다시 부르지 않는다)", () => {
    const [a, b] = [fake(true, true), fake()];
    expect(pauseAll([a, b])).toBe(1);
    expect(a.log).toEqual([]);
    expect(b.log).toEqual(["pause"]);
  });
  it("끝난(돌고 있지 않은) 세션은 건너뛴다", () => {
    const [a, b] = [fake(false), fake()];
    expect(pauseAll([a, b])).toBe(1);
    expect(a.log).toEqual([]);
  });
  it("resumeAll 은 멈춰 있는 세션만 재개한다", () => {
    const [a, b, c] = [fake(true, true), fake(), fake(true, true)];
    expect(resumeAll([a, b, c])).toBe(2);
    expect(b.log).toEqual([]);
    expect([a, c].every((x) => !x.isPaused())).toBe(true);
  });
  it("빈 목록은 0", () => {
    expect(pauseAll([])).toBe(0);
    expect(resumeAll([])).toBe(0);
  });
  it("pauseSession·resumeSession 은 한 개에 같은 규칙", () => {
    const a = fake();
    expect(pauseSession(a)).toBe(true);
    expect(pauseSession(a)).toBe(false);
    expect(resumeSession(a)).toBe(true);
    expect(resumeSession(a)).toBe(false);
    expect(a.log).toEqual(["pause", "resume"]);
  });
});
