import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n";
import { monthTitle, weekdayNames } from "./calendar";
import { columnLabel, dueLabel, initialColumns } from "./kanban/kanban";

afterEach(() => setLang("en"));

describe("K5 날짜 표기 (S-2463)", () => {
  it("영어: October 2026 · Sun..Sat 그대로", () => {
    expect(monthTitle(2026, 10)).toBe("October 2026");
    expect(weekdayNames()).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
  it("한국어: 2026년 10월 · 일 월 화 수 목 금 토", () => {
    setLang("ko");
    expect(monthTitle(2026, 10)).toBe("2026년 10월");
    expect(monthTitle(2027, 1)).toBe("2027년 1월");
    expect(weekdayNames()).toEqual(["일", "월", "화", "수", "목", "금", "토"]);
  });
});

describe("K5 칸반 기본 열 이름 표시 (S-2460)", () => {
  it("영어는 그대로", () => {
    expect(initialColumns().map((c) => columnLabel(c.name))).toEqual(["Backlog", "To do", "In progress", "Done"]);
  });
  it("한국어: 기본 열만 번역, 사용자가 바꾼 이름은 그대로, 저장값은 영어", () => {
    setLang("ko");
    expect(columnLabel("To do")).toBe("할 일");
    expect(columnLabel("In progress")).toBe("진행 중");
    expect(columnLabel("Done")).toBe("완료");
    expect(columnLabel("Backlog")).toBe("백로그");
    expect(columnLabel("Review")).toBe("Review");
    expect(columnLabel("할 일 목록")).toBe("할 일 목록");
    expect(initialColumns().map((c) => c.name)).toEqual(["Backlog", "To do", "In progress", "Done"]);
  });
});

describe("K5 카드 마감일 표기", () => {
  it("한국어: 오늘·내일·9월 12일, 영어는 그대로", () => {
    const now = new Date(2026, 8, 10);
    expect(dueLabel("2026-09-12", now).text).toBe("Sep 12");
    setLang("ko");
    expect(dueLabel("2026-09-10", now).text).toBe("오늘");
    expect(dueLabel("2026-09-11", now).text).toBe("내일");
    expect(dueLabel("2026-09-12", now)).toEqual({ text: "9월 12일", overdue: false });
  });
});
