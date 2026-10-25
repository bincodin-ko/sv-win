// S-548·S-549: 최근 명령 50개(앱을 켜 둔 동안만). ↑ 는 더 오래된 것, ↓ 는 더 새것, 끝에서 ↓ 는 쓰던 글로 돌아간다.
export const MAX_HISTORY = 50;
export type Hist = { items: string[]; pos: number | null; draft: string };
export const newHist = (): Hist => ({ items: [], pos: null, draft: "" });
/** 보낸 글을 기록한다(빈 글·바로 앞과 같은 글은 건너뛴다) */
export function push(h: Hist, text: string): Hist {
  if (!text.trim() || h.items.at(-1) === text) return { ...h, pos: null };
  return { items: [...h.items, text].slice(-MAX_HISTORY), pos: null, draft: "" };
}
export function up(h: Hist, current: string): { h: Hist; text: string | null } {
  if (!h.items.length) return { h, text: null };
  const pos = h.pos === null ? h.items.length - 1 : Math.max(0, h.pos - 1);
  const n = { ...h, pos, draft: h.pos === null ? current : h.draft };
  return { h: n, text: h.items[pos]! };
}
export function down(h: Hist): { h: Hist; text: string | null } {
  if (h.pos === null) return { h, text: null };
  if (h.pos >= h.items.length - 1) return { h: { ...h, pos: null }, text: h.draft };
  return { h: { ...h, pos: h.pos + 1 }, text: h.items[h.pos + 1]! };
}
