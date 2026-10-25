// 5묶음 E5 S-1930: 열려 있는 파일을 3초마다 보고, 고친 게 없으면 조용히 갱신·고치는 중이면 띠(순수, 전역 setInterval).
export const POLL_EVERY = 3000; // docs_markdown "every few seconds"
export type PollOpts<T extends { mtimeMs: number }> = {
  read: () => Promise<T>;
  isDirty: () => boolean;
  onSilent: (f: T) => void | Promise<void>;
  onConflict: (f: T) => void;
};

export function createPoll<T extends { mtimeMs: number }>(o: PollOpts<T>) {
  let known: number | null = null, conflict = -1, busy = false;
  let id: ReturnType<typeof setInterval> | undefined;
  async function tick(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const f = await o.read();
      if (known === null) known = f.mtimeMs;
      if (f.mtimeMs === known) return;
      if (o.isDirty()) {
        if (f.mtimeMs !== conflict) { conflict = f.mtimeMs; o.onConflict(f); }
        return;
      }
      known = f.mtimeMs;
      await o.onSilent(f);
    } catch { /* 지워졌거나 못 읽음: 다음 주기에 다시 */ } finally { busy = false; }
  }
  return {
    tick,
    /** 지금 화면이 아는 디스크 시각(열 때·저장했을 때·Reload 했을 때) */
    setKnown: (m: number): void => void (known = m),
    start: (): void => void (id = setInterval(() => void tick(), POLL_EVERY)),
    stop: (): void => clearInterval(id),
  };
}
