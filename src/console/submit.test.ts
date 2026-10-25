import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { typeAndSubmit } from "./submit";

// 명세 S-605: 글을 한 줄로(줄바꿈은 공백) 붙여 넣고 150ms 뒤 Enter(\r). bracketed paste 모드면 그것으로 붙인다
const mk = (bp = false) => {
  const w: string[] = [];
  return { w, s: { write: (d: string) => void w.push(d), bracketedPaste: () => bp } };
};
beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("typeAndSubmit", () => {
  it("줄바꿈(\n, \r\n, \r)을 공백 하나로 접어 먼저 쓰고, 150ms 뒤에야 \r 을 보낸다", async () => {
    const { w, s } = mk();
    const p = typeAndSubmit(s, "a\nb\r\nc\rd");
    expect(w).toEqual(["a b c d"]);
    await vi.advanceTimersByTimeAsync(149);
    expect(w).toEqual(["a b c d"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(w).toEqual(["a b c d", "\r"]);
    await p;
  });
  it("bracketed paste 모드면 글을 \x1b[200~ … \x1b[201~ 로 감싼다", async () => {
    const { w, s } = mk(true);
    const p = typeAndSubmit(s, "x\ny");
    expect(w).toEqual(["\x1b[200~x y\x1b[201~"]);
    await vi.advanceTimersByTimeAsync(150);
    await p;
    expect(w).toEqual(["\x1b[200~x y\x1b[201~", "\r"]);
  });
  it("글 안에 \r 이 남지 않는다 (붙여넣기 도중 제출 방지)", async () => {
    const { w, s } = mk();
    const p = typeAndSubmit(s, "one\r\n\r\ntwo");
    await vi.advanceTimersByTimeAsync(150);
    await p;
    expect(w[0]).not.toMatch(/[\r\n]/);
    expect(w[1]).toBe("\r");
  });
});
