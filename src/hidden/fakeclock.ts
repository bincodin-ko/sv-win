// 시험용 시계: advance(ms)로만 시간이 간다
import type { Clock } from "./screen";
const flush = async () => {
  await new Promise((r) => setTimeout(r, 0)); // xterm 쓰기 타이머까지
  await new Promise((r) => setTimeout(r, 0));
};
export function fakeClock(start = 1000): Clock & { advance(ms: number): Promise<void> } {
  let t = start;
  const q: { at: number; fn: () => void }[] = [];
  const after: Clock["after"] = (ms, fn) => {
    const e = { at: t + ms, fn };
    q.push(e);
    return () => {
      const i = q.indexOf(e);
      if (i >= 0) q.splice(i, 1);
    };
  };
  return {
    now: () => t,
    after,
    sleep: (ms) => new Promise<void>((r) => void after(ms, r)),
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at);
        const e = q[0];
        if (!e || e.at > end) break;
        q.shift();
        t = e.at;
        e.fn();
        await flush();
      }
      t = end;
      await flush();
    },
  };
}
