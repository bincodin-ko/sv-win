// S-2427: 한국어면 "2026. 10. 24." / "오후 3:05" / "3분 전", 영어는 기존 표기("just now"·"5m ago") 그대로.
import { describe, expect, it } from "vitest";
import { fmtDate, fmtTime, relTime } from "./dateFmt";

const d = new Date(2026, 9, 24, 15, 5);
const sp = (s: string) => s.replace(/\s/g, " ");

describe("dateFmt (S-2427)", () => {
  it("한국어 날짜·시간", () => {
    expect(sp(fmtDate(d, "ko"))).toBe("2026. 10. 24.");
    expect(sp(fmtTime(d, "ko"))).toBe("오후 3:05");
  });
  it("영어 날짜·시간", () => {
    expect(sp(fmtDate(d, "en"))).toBe("10/24/2026");
    expect(sp(fmtTime(d, "en"))).toBe("3:05 PM");
  });
  it("영어 상대 시간은 기존 그대로", () => {
    expect(relTime(10, "en")).toBe("just now");
    expect(relTime(300, "en")).toBe("5m ago");
    expect(relTime(7200, "en")).toBe("2h ago");
    expect(relTime(3 * 86400, "en")).toBe("3d ago");
  });
  it("한국어 상대 시간", () => {
    expect(relTime(10, "ko")).toBe("방금 전");
    expect(relTime(180, "ko")).toBe("3분 전");
    expect(relTime(7200, "ko")).toBe("2시간 전");
    expect(relTime(3 * 86400, "ko")).toBe("3일 전");
  });
});
