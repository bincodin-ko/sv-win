import { describe, expect, it } from "vitest";
import { isLocalUrl, MAX_RETRIES, nextDelay, onProbe, type Wait } from "./waitState";

// S-1109: localhost 연결 실패 → 1초 간격 10번 다시 시도 → "Couldn't load". localhost 아닌 주소는 바로 실패. 서버가 뜨면 즉시 로드.
describe("isLocalUrl", () => {
  it("localhost·127.0.0.1·0.0.0.0·[::1]", () => {
    for (const u of ["http://localhost:3000", "http://127.0.0.1", "http://0.0.0.0:80/x", "http://[::1]:3000", "https://localhost"]) expect(isLocalUrl(u), u).toBe(true);
    for (const u of ["https://example.com", "http://localhost.evil.com", "http://192.168.0.5", "http://127.0.0.1.nip.io"]) expect(isLocalUrl(u), u).toBe(false);
  });
});
describe("waitState (S-1109)", () => {
  it("한 번에 연결되면 바로 ready", () => {
    expect(onProbe(null, true, true)).toEqual({ phase: "ready", tries: 0 });
  });
  it("localhost 아닌 주소는 연결 실패면 바로 failed", () => {
    expect(onProbe(null, false, false).phase).toBe("failed");
  });
  it("localhost: 처음 실패 → waiting, 다시 시도 10번이 모두 실패해야 failed", () => {
    expect(MAX_RETRIES).toBe(10);
    let w: Wait | null = onProbe(null, false, true);
    expect(w).toEqual({ phase: "waiting", tries: 0 });
    for (let retry = 1; retry <= 9; retry++) {
      w = onProbe(w, false, true);
      expect(w).toEqual({ phase: "waiting", tries: retry });
    }
    w = onProbe(w, false, true); // 10번째 다시 시도도 실패
    expect(w.phase).toBe("failed");
  });
  it("기다리는 중 연결되면 즉시 ready", () => {
    let w: Wait | null = onProbe(null, false, true);
    w = onProbe(w, false, true);
    expect(onProbe(w, true, true).phase).toBe("ready");
  });
  it("Retry now = 상태를 null 로 되돌려 처음부터", () => {
    expect(onProbe(null, false, true)).toEqual({ phase: "waiting", tries: 0 });
  });
});
describe("nextDelay (perf-real 4)", () => {
  it("확인에 걸린 시간만큼 덜 기다려 시작 간격이 1초", () => {
    expect(nextDelay(0, 300)).toBe(700);
    expect(nextDelay(0, 0)).toBe(1000);
  });
  it("1초 넘게 걸렸으면 바로(0)", () => { expect(nextDelay(0, 4000)).toBe(0); });
});
