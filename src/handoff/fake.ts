// 시험 도구: 주입 시계(sleep 이 시계를 앞으로 돌린다) + 시각에 거는 훅
export function fakeClock(start = 1_000_000) {
  let t = start;
  const hooks: [number, () => void][] = [];
  return {
    t0: start,
    now: () => t,
    at(ms: number, fn: () => void) { hooks.push([start + ms, fn]); },
    async sleep(ms: number) {
      t += ms;
      for (const h of hooks.splice(0)) (t >= h[0] ? h[1]() : hooks.push(h));
      await Promise.resolve();
    },
  };
}
