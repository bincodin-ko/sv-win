// S-028 되돌리기 스택 (순수 함수). 상태 T 의 통째 사본을 쌓는다
export const MAX_HISTORY = 80;
export interface History<T> { past: T[]; future: T[] }
export const emptyHistory = <T,>(): History<T> => ({ past: [], future: [] });

/** 바꾸기 직전 상태(before)를 한 단계로 쌓는다. 다시 하기 칸은 끊긴다 */
export const record = <T,>(h: History<T>, before: T): History<T> => ({ past: [...h.past, before].slice(-MAX_HISTORY), future: [] });

export function undo<T>(h: History<T>, current: T): { h: History<T>; state: T } | null {
  if (!h.past.length) return null;
  return { state: h.past[h.past.length - 1]!, h: { past: h.past.slice(0, -1), future: [...h.future, current] } };
}

export function redo<T>(h: History<T>, current: T): { h: History<T>; state: T } | null {
  if (!h.future.length) return null;
  return { state: h.future[h.future.length - 1]!, h: { past: [...h.past, current].slice(-MAX_HISTORY), future: h.future.slice(0, -1) } };
}
