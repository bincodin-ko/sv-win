// xterm -> PTY 쓰기. pty id 가 생기기 전 것은 모아 두었다가 id 가 생기면 순서대로 보낸다
export interface PendingWriter {
  send(d: string): void;
  setId(id: number | null): void;
  /** 모아 둔 것을 버린다(새 프로세스를 띄우기 전: 옛 프로세스용 입력이 새 것에 가지 않게) */
  clear(): void;
}
export function pendingWriter(write: (id: number, d: string) => unknown): PendingWriter {
  let cur: number | null = null;
  let q: string[] = [];
  return {
    send(d) {
      if (cur === null) q.push(d);
      else void write(cur, d);
    },
    setId(id) {
      cur = id;
      if (id === null) return;
      const flush = q;
      q = [];
      for (const d of flush) void write(id, d);
    },
    clear() {
      q = [];
    },
  };
}
