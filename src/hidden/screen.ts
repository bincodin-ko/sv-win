// D2 S-1201: 화면 밖 xterm 래퍼 + 시계 (S-1200~1208 공용)
import { Terminal } from "@xterm/xterm";

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** ms 뒤 fn 실행. 취소 함수를 돌려준다 */
  after(ms: number, fn: () => void): () => void;
}
export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  after: (ms, fn) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

export interface Screen {
  write(data: Uint8Array | string): void;
  /** 스크롤백 포함 전체 줄, 줄 끝 공백·끝의 빈 줄 제거 */
  text(): Promise<string>;
  dispose(): void;
}
export function createScreen(onData?: (d: string) => void): Screen {
  const term = new Terminal({ cols: 200, rows: 50, scrollback: 5000, allowProposedApi: true });
  if (onData) term.onData(onData); // 커서 위치 질문(CPR) 등에 대한 터미널의 답을 PTY 로 보낸다
  let last: Promise<void> = Promise.resolve();
  return {
    write(data) {
      last = new Promise<void>((r) => term.write(data, r));
    },
    async text() {
      await last;
      const b = term.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < b.length; i++) {
        const l = b.getLine(i);
        const s = (l?.translateToString(true) ?? "").trimEnd(); // 쓴 공백도 줄 끝이면 지운다
        if (l?.isWrapped && lines.length) lines[lines.length - 1] += s; // 200칸을 넘어 이어진 줄은 한 줄로
        else lines.push(s);
      }
      while (lines.length && !lines[lines.length - 1]) lines.pop();
      return lines.join("\n");
    },
    dispose: () => term.dispose(),
  };
}
