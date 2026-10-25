import { describe, expect, it } from "vitest";
import { levelOf, parseReset } from "./reset";

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0);
const NOW = at(2026, 10, 24, 15, 0); // 2026-10-24 15:00 (현지)

describe("S-1522 parseReset", () => {
  it("12시간 표기: 4:09pm 은 오늘 16:09", () => {
    expect(parseReset("4:09pm", NOW)).toEqual(at(2026, 10, 24, 16, 9));
    expect(parseReset("Resets 4:09pm", NOW)).toEqual(at(2026, 10, 24, 16, 9));
  });
  it("6pm 은 18:00, 12am 은 0시, 12pm 은 정오", () => {
    expect(parseReset("6pm", NOW)).toEqual(at(2026, 10, 24, 18, 0));
    expect(parseReset("12am", at(2026, 10, 24, 1))).toEqual(at(2026, 10, 25, 0, 0));
    expect(parseReset("12pm", NOW)).toEqual(at(2026, 10, 25, 12, 0));
  });
  it("24시간 표기 + 날짜: 08:37 on 14 Sep 은 이미 지났으니 내년", () => {
    expect(parseReset("08:37 on 14 Sep", NOW)).toEqual(at(2027, 9, 14, 8, 37));
    expect(parseReset("Resets 08:37 on 14 Sep", at(2026, 8, 1, 0))).toEqual(at(2026, 9, 14, 8, 37));
  });
  it("월 먼저 표기: Oct 28, 6pm / Oct 28 at 6pm", () => {
    expect(parseReset("Oct 28, 6pm", NOW)).toEqual(at(2026, 10, 28, 18, 0));
    expect(parseReset("Oct 28 at 6:30pm", NOW)).toEqual(at(2026, 10, 28, 18, 30));
  });
  it("시간대 괄호는 무시한다", () => {
    expect(parseReset("4:09pm (Asia/Seoul)", NOW)).toEqual(at(2026, 10, 24, 16, 9));
  });
  it("이미 지난 시각(날짜 없음)은 다음 날", () => {
    expect(parseReset("2:30pm", NOW)).toEqual(at(2026, 10, 25, 14, 30));
    expect(parseReset("08:37", NOW)).toEqual(at(2026, 10, 25, 8, 37));
  });
  it("못 읽으면 null", () => {
    for (const t of ["", "soon", "Resets someday", "25:99", "13pm"]) expect(parseReset(t, NOW)).toBeNull();
  });
});

describe("S-1513 levelOf 경계: 75 amber, 90 red", () => {
  it("경계", () => {
    expect([0, 74, 74.9].map(levelOf)).toEqual(["ok", "ok", "ok"]);
    expect([75, 89, 89.9].map(levelOf)).toEqual(["amber", "amber", "amber"]);
    expect([90, 100].map(levelOf)).toEqual(["red", "red"]);
  });
});
