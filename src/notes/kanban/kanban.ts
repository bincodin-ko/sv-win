// C8 칸반 순수 reducer (S-930~S-945). 화면 코드는 이 함수들만 부른다. 입력은 바꾸지 않고 새 배열을 돌려준다.
import { getLang, t } from "../../i18n";
export type Priority = "none" | "low" | "med" | "high";
export type Card = { id: string; title: string; notes: string; due: string | null; priority: Priority; done: boolean };
export type Column = { id: string; name: string; color: string | null; cards: Card[] };
export type MoveDir = "left" | "right" | "start" | "end";
export type DueKind = "today" | "tomorrow" | "nextweek";
export const NAME_MAX = 24;

const clean = (name: string) => name.trim().slice(0, NAME_MAX);
const col = (id: string, name: string, color: string | null): Column => ({ id, name, color, cards: [] });
/** prefix + 가장 큰 번호 + 1 (카드·열 id) */
const nextId = (prefix: string, ids: string[]) => prefix + (ids.reduce((m, i) => Math.max(m, i.startsWith(prefix) ? Number(i.slice(prefix.length)) || 0 : 0), 0) + 1);
const allCards = (cols: Column[]) => cols.flatMap((c) => c.cards);
const mapCol = (cols: Column[], id: string, f: (c: Column) => Column) => cols.map((c) => (c.id === id ? f(c) : c));

/** 화면에 그릴 열 이름: 기본 열(영어로 저장됨)만 번역, 사용자가 바꾼 이름은 그대로 (S-2460) */
export const columnLabel = (name: string): string => (DEFAULT_NAMES.includes(name) ? t(name) : name);
const DEFAULT_NAMES = ["Backlog", "To do", "In progress", "Done"];

export function initialColumns(): Column[] {
  return [col("c1", "Backlog", null), col("c2", "To do", "sky"), col("c3", "In progress", "amber"), col("c4", "Done", "sage")];
}
export function addColumn(cols: Column[], name: string): Column[] {
  const n = clean(name);
  return n ? [...cols, col(nextId("c", cols.map((c) => c.id)), n, null)] : cols;
}
export function renameColumn(cols: Column[], id: string, name: string): Column[] {
  const n = clean(name);
  return n ? mapCol(cols, id, (c) => ({ ...c, name: n })) : cols;
}
export function setColumnColor(cols: Column[], id: string, color: string | null): Column[] {
  return mapCol(cols, id, (c) => ({ ...c, color }));
}
export function moveDirs(cols: Column[], id: string): MoveDir[] {
  const i = cols.findIndex((c) => c.id === id);
  if (i < 0) return [];
  const last = cols.length - 1;
  return [...(i > 0 ? (["left", "start"] as const) : []), ...(i < last ? (["right", "end"] as const) : [])];
}
/** 한 항목을 slot(옮기기 전 목록 기준 끼울 자리)으로 */
function reinsert<T extends { id: string }>(list: T[], id: string, slot: number): T[] {
  const from = list.findIndex((x) => x.id === id);
  if (from < 0) return list;
  const to = Math.min(Math.max(slot, 0), list.length) - (from < slot ? 1 : 0);
  if (to === from) return list;
  const rest = list.filter((x) => x.id !== id);
  rest.splice(to, 0, list[from]!);
  return rest;
}
export function moveColumnTo(cols: Column[], id: string, slot: number): Column[] { return reinsert(cols, id, slot); }
export function moveColumn(cols: Column[], id: string, dir: MoveDir): Column[] {
  const i = cols.findIndex((c) => c.id === id);
  if (i < 0) return cols;
  return reinsert(cols, id, dir === "left" ? i - 1 : dir === "right" ? i + 2 : dir === "start" ? 0 : cols.length);
}
export function deleteColumn(cols: Column[], id: string): Column[] { return cols.filter((c) => c.id !== id); }

export function addCard(cols: Column[], colId: string, init: { title: string; notes?: string; due?: string | null; priority?: Priority }): Column[] {
  const title = init.title.trim();
  if (!title || !cols.some((c) => c.id === colId)) return cols;
  const k: Card = { id: nextId("k", allCards(cols).map((x) => x.id)), title, notes: init.notes ?? "", due: init.due ?? null, priority: init.priority ?? "none", done: false };
  return mapCol(cols, colId, (c) => ({ ...c, cards: [...c.cards, k] }));
}
const mapCard = (cols: Column[], id: string, f: (k: Card) => Card) => cols.map((c) => (c.cards.some((k) => k.id === id) ? { ...c, cards: c.cards.map((k) => (k.id === id ? f(k) : k)) } : c));
export function editCard(cols: Column[], cardId: string, patch: Partial<Omit<Card, "id">>): Column[] {
  if (patch.title !== undefined && !patch.title.trim()) return cols;
  return mapCard(cols, cardId, (k) => ({ ...k, ...patch, ...(patch.title !== undefined ? { title: patch.title.trim() } : {}) }));
}
export function duplicateCard(cols: Column[], cardId: string): Column[] {
  const id = nextId("k", allCards(cols).map((x) => x.id));
  return cols.map((c) => {
    const i = c.cards.findIndex((k) => k.id === cardId);
    return i < 0 ? c : { ...c, cards: [...c.cards.slice(0, i + 1), { ...c.cards[i]!, id }, ...c.cards.slice(i + 1)] };
  });
}
export function moveCard(cols: Column[], cardId: string, toColId: string, slot: number): Column[] {
  const from = cols.find((c) => c.cards.some((k) => k.id === cardId));
  const to = cols.find((c) => c.id === toColId);
  if (!from || !to) return cols;
  if (from === to) return mapCol(cols, to.id, (c) => ({ ...c, cards: reinsert(c.cards, cardId, slot) }));
  const k = from.cards.find((x) => x.id === cardId)!;
  const at = Math.min(Math.max(slot, 0), to.cards.length);
  return cols.map((c) => (c === from ? { ...c, cards: c.cards.filter((x) => x.id !== cardId) } : c === to ? { ...c, cards: [...c.cards.slice(0, at), k, ...c.cards.slice(at)] } : c));
}
export function toggleDone(cols: Column[], cardId: string): Column[] { return mapCard(cols, cardId, (k) => ({ ...k, done: !k.done })); }
export function deleteCard(cols: Column[], cardId: string): Column[] {
  return cols.map((c) => (c.cards.some((k) => k.id === cardId) ? { ...c, cards: c.cards.filter((k) => k.id !== cardId) } : c));
}
const RANK: Record<Priority, number> = { high: 0, med: 1, low: 2, none: 3 };
export function sortByPriority(cols: Column[], colId: string): Column[] {
  // Array.prototype.sort 는 안정 정렬(ES2019)
  return mapCol(cols, colId, (c) => ({ ...c, cards: [...c.cards].sort((a, b) => RANK[a.priority] - RANK[b.priority]) }));
}
export function clearDone(cols: Column[], colId: string): Column[] {
  return mapCol(cols, colId, (c) => ({ ...c, cards: c.cards.filter((k) => !k.done) }));
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plus = (now: Date, days: number) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
/** "YYYY-MM-DD" (지역 시간). kind 가 날짜 문자열이면 그대로 */
export function dueFrom(kind: DueKind | string, now: Date): string {
  return kind === "today" ? plus(now, 0) : kind === "tomorrow" ? plus(now, 1) : kind === "nextweek" ? plus(now, 7) : kind;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dueLabel(due: string, now: Date): { text: string; overdue: boolean } {
  if (due === plus(now, 0)) return { text: t("Today"), overdue: false };
  if (due === plus(now, 1)) return { text: t("Tomorrow"), overdue: false };
  const [, m, d] = due.split("-").map(Number);
  return { text: getLang() === "ko" ? `${m}월 ${d}일` : `${MONTHS[(m ?? 1) - 1]} ${d}`, overdue: due < plus(now, 0) };
}
