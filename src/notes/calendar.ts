// S-910~S-919 캘린더 순수 함수. month 는 1~12, 날짜는 로컬 "YYYY-MM-DD" 문자열(S-918, 시간대 변환 없음).
import { getLang, t } from "../i18n";
export type CalEvent = { id: string; title: string; date: string; allDay: boolean; time?: string; notes: string; color: string };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const p2 = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; // 날짜 계산은 UTC 로 해 서머타임에 흔들리지 않게
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y!, m! - 1, d!)); };

export const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const addDays = (date: string, n: number): string => { const d = parse(date); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
/** 일요일 시작 6주 = 42칸 */
export function monthGrid(y: number, m: number): string[] {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = addDays(fmt(first), -first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function shiftMonth(y: number, m: number, delta: number): { year: number; month: number } {
  const i = y * 12 + (m - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12 + 12) % 12 + 1 };
}
export const monthTitle = (y: number, m: number): string => (getLang() === "ko" ? `${y}년 ${m}월` : `${MONTHS[m - 1]} ${y}`);
/** 요일 머리 7칸(일요일 시작). 한국어는 일 월 화 수 목 금 토 (S-2463) */
export const weekdayNames = (): string[] => [t("Sun"), t("Mon"), t("Tue"), t("Wed"), t("Thu"), t("Fri"), t("Sat")];
export const todayStr = (now: Date = new Date()): string => `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;

/** 그날 이벤트: 시간 없는 것 먼저, 그다음 시간순(같으면 입력 순서) */
const key = (e: CalEvent) => (e.allDay ? "" : e.time ?? "");
export const eventsOn = (events: CalEvent[], date: string): CalEvent[] =>
  events.filter((e) => e.date === date).map((e, i) => ({ e, i })).sort((a, b) => key(a.e).localeCompare(key(b.e)) || a.i - b.i).map((x) => x.e);
export function visibleIn(events: CalEvent[], date: string, max = 3): { shown: CalEvent[]; more: number } {
  const all = eventsOn(events, date);
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max) };
}
export const moveEvent = (events: CalEvent[], id: string, date: string): CalEvent[] => events.map((e) => (e.id === id ? { ...e, date } : e));
export function duplicateEvent(events: CalEvent[], id: string, newId: string): CalEvent[] {
  const e = events.find((x) => x.id === id);
  return e ? [...events, { ...e, id: newId }] : events;
}
