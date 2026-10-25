import { describe, expect, it } from "vitest";
import { pendingWriter } from "./pendingWriter";

describe("id 늦게 오는 PTY 쓰기 (perf-real 1번)", () => {
  it("id 전 쓰기는 모아 두었다가 id 생기면 순서대로 한 번씩", () => {
    const log: [number, string][] = [];
    const w = pendingWriter((id, d) => log.push([id, d]));
    w.send("\x1b[1;1R");
    w.send("a");
    expect(log).toEqual([]);
    w.setId(7);
    w.send("b");
    expect(log).toEqual([[7, "\x1b[1;1R"], [7, "a"], [7, "b"]]);
  });
  it("id 없애면(null) 이후 쓰기는 다시 모으고 새 id 로 보낸다", () => {
    const log: [number, string][] = [];
    const w = pendingWriter((id, d) => log.push([id, d]));
    w.setId(1);
    w.setId(null);
    w.send("x");
    w.setId(2);
    expect(log).toEqual([[2, "x"]]);
  });
});
