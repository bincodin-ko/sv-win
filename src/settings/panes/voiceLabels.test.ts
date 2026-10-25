import { describe, expect, it } from "vitest";
import { recogButton, recogLabel } from "./voiceLabels";

// F3 S-2290: Recognition 상태 글자 + 버튼
describe("Recognition", () => {
  it("상태 글자", () => {
    expect(recogLabel({ kind: "ready" })).toBe("Ready");
    expect(recogLabel({ kind: "downloading", pct: 37 })).toBe("Downloading 37%");
    expect(recogLabel({ kind: "none" })).toBe("Not downloaded");
    expect(recogLabel({ kind: "failed", why: "net" })).toBe("Failed: net");
  });
  it("버튼: 없으면 Download, 실패면 Retry, 받는 중·준비됨은 없음", () => {
    expect(recogButton({ kind: "none" })).toBe("Download");
    expect(recogButton({ kind: "failed", why: "x" })).toBe("Retry");
    expect(recogButton({ kind: "ready" })).toBeNull();
    expect(recogButton({ kind: "downloading", pct: 1 })).toBeNull();
  });
});
