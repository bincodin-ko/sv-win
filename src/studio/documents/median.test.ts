import { describe, expect, it } from "vitest";
import type { DocMeta } from "../../lib/ipc";
import { fmtMedian, medianMs } from "./median";

// S-1973: 선택한 에이전트로 끝낸 최근 5번 시간의 중앙값, 없으면 "not timed". S-1986: incomplete 는 안 센다
const v = (startedAt: number, durationMs: number, o: Partial<DocMeta> = {}): DocMeta =>
  ({ id: `v${startedAt}`, docId: "readme", title: "t", agent: "claude", effort: "balanced", startedAt, durationMs, status: "complete", ...o });

describe("medianMs", () => {
  it("최근 5번만: 6번 중 가장 오래된 것은 뺀다", () => {
    const list = [v(1, 999000), v(2, 10000), v(3, 20000), v(4, 30000), v(5, 40000), v(6, 50000)];
    expect(medianMs(list, "claude", "balanced")).toBe(30000);
  });
  it("순서가 뒤섞여도 startedAt 으로 최근을 고른다", () => {
    const list = [v(6, 50000), v(1, 999000), v(3, 20000), v(2, 10000), v(5, 40000), v(4, 30000)];
    expect(medianMs(list, "claude", "balanced")).toBe(30000);
  });
  it("incomplete·다른 에이전트·다른 노력은 안 센다", () => {
    const list = [v(1, 10000), v(2, 700000, { status: "incomplete" }), v(3, 800000, { agent: "codex" }), v(4, 900000, { effort: "quick" }), v(5, 30000)];
    expect(medianMs(list, "claude", "balanced")).toBe(20000); // (10000+30000)/2
  });
  it("하나도 없으면 null", () => {
    expect(medianMs([], "claude", "balanced")).toBeNull();
    expect(medianMs([v(1, 5000, { status: "incomplete" })], "claude", "balanced")).toBeNull();
  });
  it("incomplete 가 최근 5개 자리를 차지하지 않는다", () => {
    const list = [v(1, 10000), v(2, 20000), v(3, 30000), v(4, 40000), v(5, 50000), v(6, 1, { status: "incomplete" })];
    expect(medianMs(list, "claude", "balanced")).toBe(30000);
  });
});

describe("fmtMedian", () => {
  it("~2m 10s · ~45s · ~2m · not timed", () => {
    expect(fmtMedian(130000)).toBe("~2m 10s");
    expect(fmtMedian(45000)).toBe("~45s");
    expect(fmtMedian(120000)).toBe("~2m");
    expect(fmtMedian(null)).toBe("not timed");
  });
});
