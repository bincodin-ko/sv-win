import { describe, expect, it } from "vitest";
import { addDays, daysInMonth, duplicateEvent, eventsOn, monthGrid, monthTitle, moveEvent, shiftMonth, todayStr, visibleIn, type CalEvent } from "./calendar";

const E = (id: string, date: string, extra: Partial<CalEvent> = {}): CalEvent => ({ id, title: `t${id}`, date, allDay: true, notes: "", color: "Amber", ...extra });

describe("캘린더 순수 함수 (S-911~S-917)", () => {
  it("S-911 2026-09 격자: 일요일 시작, 6주 42칸, 9월 1일(화)은 세 번째 칸", () => {
    const g = monthGrid(2026, 9);
    expect(g).toHaveLength(42);
    expect(g[0]).toBe("2026-08-30");
    expect(g[2]).toBe("2026-09-01");
    expect(g[31]).toBe("2026-09-30");
    expect(g[41]).toBe("2026-10-10");
  });
  it("윤년 2월: 2024는 29일, 2026·2100은 28일, 격자에 2월 29일이 있다", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2026, 12)).toBe(31);
    const g = monthGrid(2024, 2);
    expect(g[0]).toBe("2024-01-28");
    expect(g).toContain("2024-02-29");
    expect(g).not.toContain("2024-02-30");
  });
  it("S-912 달 이동은 연도를 넘긴다", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 3, -14)).toEqual({ year: 2025, month: 1 });
    expect(shiftMonth(2026, 9, 0)).toEqual({ year: 2026, month: 9 });
  });
  it("날짜 문자열 더하기(월·연·윤일 경계), 머리 글자, 오늘", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(monthTitle(2026, 9)).toBe("September 2026");
    expect(monthTitle(2027, 1)).toBe("January 2027");
    expect(todayStr(new Date(2026, 8, 5, 23, 59))).toBe("2026-09-05");
  });
  it("S-916 이벤트 날짜 이동은 날짜만 바꾸고 시간·색·제목은 그대로, 다른 이벤트는 건드리지 않는다", () => {
    const l = [E("a", "2026-09-01", { allDay: false, time: "14:30", color: "Teal", notes: "n" }), E("b", "2026-09-02")];
    const r = moveEvent(l, "a", "2026-09-20");
    expect(r[0]).toEqual({ ...l[0], date: "2026-09-20" });
    expect(r[1]).toBe(l[1]);
    expect(l[0]!.date).toBe("2026-09-01");
  });
  it("S-917 복제: 같은 날·같은 제목·시간·색, 새 id", () => {
    const l = [E("a", "2026-09-01", { allDay: false, time: "09:00", color: "Rose" })];
    const r = duplicateEvent(l, "a", "z");
    expect(r).toHaveLength(2);
    expect(r.find((e) => e.id === "z")).toEqual({ ...l[0], id: "z" });
    expect(r.find((e) => e.id === "a")).toEqual(l[0]);
  });
  it("S-915 칸당 3개까지 보이고 나머지는 +N, 시간 있는 것은 시간순", () => {
    const d = "2026-09-10";
    const five = ["a", "b", "c", "d", "e"].map((i) => E(i, d));
    expect(visibleIn(five, d)).toMatchObject({ more: 2 });
    expect(visibleIn(five, d).shown.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(visibleIn(five.slice(0, 3), d)).toMatchObject({ more: 0 });
    expect(visibleIn([...five, E("x", "2026-09-11")], d).more).toBe(2);
    const t = [E("late", d, { allDay: false, time: "18:00" }), E("early", d, { allDay: false, time: "08:00" })];
    expect(eventsOn(t, d).map((e) => e.id)).toEqual(["early", "late"]);
  });
});
