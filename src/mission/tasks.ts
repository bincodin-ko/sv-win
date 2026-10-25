// S-1311 작업 라벨 저장소(메모리만): 콘솔·그룹·카드 id → 마지막으로 받은 주문
export const TASK_MAX = 600;
export type Task = { text: string; at: number };
const m = new Map<string, Task>();

export function recordTask(keys: (string | undefined)[], text: string, at: number = Date.now()): void {
  const t = { text: text.slice(0, TASK_MAX), at };
  for (const k of keys) if (k) m.set(k, t);
}
export const taskOf = (key: string): Task | undefined => m.get(key);
export const clearTasks = (): void => m.clear();
