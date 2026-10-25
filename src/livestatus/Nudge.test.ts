import { describe, expect, it } from "vitest";
import { NUDGE_GRACE_MS, shouldNudge } from "./Nudge";

// S-2667: 에이전트 콘솔이 0 → 1 이상이 되는 첫 순간(복원 직후 제외) + liveStatus 꺼짐 + liveStatusAsked 없음
const base = { prev: 0, now: 1, sinceStartMs: NUDGE_GRACE_MS + 1, liveStatus: false, asked: undefined };
describe("S-2667 shouldNudge", () => {
  it("0 → 1, 꺼짐, 묻지 않음 → 안내", () => expect(shouldNudge(base)).toBe(true));
  it("앱 시작 직후(복원 보드)는 제외", () => expect(shouldNudge({ ...base, sinceStartMs: 500 })).toBe(false));
  it("이미 1개 이상이면(1 → 2) 안 뜸", () => expect(shouldNudge({ ...base, prev: 1, now: 2 })).toBe(false));
  it("늘지 않으면 안 뜸", () => expect(shouldNudge({ ...base, now: 0 })).toBe(false));
  it("liveStatus 가 켜져 있으면 안 뜸", () => expect(shouldNudge({ ...base, liveStatus: true })).toBe(false));
  it("이미 물었으면(liveStatusAsked) 안 뜸", () => expect(shouldNudge({ ...base, asked: true })).toBe(false));
});
