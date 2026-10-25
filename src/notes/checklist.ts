// S-900~S-906 체크리스트 순수 함수.
export type Item = { id: string; text: string; done: boolean };
export const TITLE_MAX = 40;

export const addItem = (items: Item[], text: string, id: string): Item[] => (text.trim() ? [...items, { id, text: text.trim(), done: false }] : items);
export const toggleItem = (items: Item[], id: string): Item[] => items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
export const removeItem = (items: Item[], id: string): Item[] => items.filter((i) => i.id !== id);
export const editItem = (items: Item[], id: string, text: string): Item[] => (text.trim() ? items.map((i) => (i.id === id ? { ...i, text: text.trim() } : i)) : items);
/** 되돌리기는 보드 store 의 commit 이 한다. prev 는 시험·호출자가 이전 상태를 바로 쓰게 돌려준다 */
export const clearDone = (items: Item[]): { items: Item[]; prev: Item[] } => ({ items: items.filter((i) => !i.done), prev: items });
export function progress(items: Item[]): { done: number; total: number; label: string; ratio: number } {
  const done = items.filter((i) => i.done).length, total = items.length;
  return { done, total, label: `${done}/${total}`, ratio: total ? done / total : 0 };
}
/** 빈 값은 취소(이전 제목 유지), 최대 40자(S-905) */
export const cleanTitle = (input: string, current: string): string => input.trim().slice(0, TITLE_MAX) || current;
