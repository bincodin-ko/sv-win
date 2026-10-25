import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n";
import { statusLabel } from "./statusLabel";

const ALL = ["IDLE", "STARTING", "WORKING", "RUNNING", "DONE", "ERROR", "PAUSED", "NEEDS YOU", "READY"] as const;
afterEach(() => setLang("en"));

describe("콘솔 상태 표시 글자", () => {
  it("영어는 상태 값 그대로", () => {
    for (const s of ALL) expect(statusLabel(s)).toBe(s);
  });
  it("한국어: 용어 표(§0) NEEDS YOU·WORKING·READY·PAUSED + 나머지 상태 모두 번역", () => {
    setLang("ko");
    expect(statusLabel("NEEDS YOU")).toBe("확인 필요");
    expect(statusLabel("WORKING")).toBe("작업 중");
    expect(statusLabel("READY")).toBe("준비됨");
    expect(statusLabel("PAUSED")).toBe("일시 중지");
    for (const s of ALL) expect(statusLabel(s), s).not.toBe(s);
  });
});
