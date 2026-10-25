import { describe, expect, it } from "vitest";
import { quit } from "./quit";

const mk = (running: number, ok = true, flushFails = false) => {
  const log: string[] = [];
  return {
    log,
    deps: {
      running: () => running,
      confirm: async (n: number) => (log.push(`confirm ${n}`), ok),
      flush: async () => {
        log.push("flush");
        if (flushFails) throw new Error("디스크 오류");
      },
      appQuit: async () => void log.push("quit"),
    },
  };
};

describe("S-230·S-231 종료 순서", () => {
  it("실행 중 콘솔이 있으면 확인 → 저장 → 종료", async () => {
    const m = mk(2);
    expect(await quit(m.deps)).toBe(true);
    expect(m.log).toEqual(["confirm 2", "flush", "quit"]);
  });
  it("Cancel 이면 아무것도 안 한다", async () => {
    const m = mk(2, false);
    expect(await quit(m.deps)).toBe(false);
    expect(m.log).toEqual(["confirm 2"]);
  });
  it("실행 중 콘솔이 없으면 확인 없이 저장 후 바로 끈다", async () => {
    const m = mk(0);
    expect(await quit(m.deps)).toBe(true);
    expect(m.log).toEqual(["flush", "quit"]);
  });
  it("저장이 실패해도 종료는 막지 않는다(사용자가 이미 확정)", async () => {
    const m = mk(1, true, true);
    expect(await quit(m.deps)).toBe(true);
    expect(m.log).toEqual(["confirm 1", "flush", "quit"]);
  });
});
