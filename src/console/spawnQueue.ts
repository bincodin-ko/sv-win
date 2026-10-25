/** PTY spawn 을 동시에 MAX_SPAWN 개까지만(프리셋 배치·여러 콘솔 동시 생성 때 pty_write 지연 방지). 먼저 요청한 순서대로.
 *  ponytail: 보이는 콘솔 우선 없음(선착순). 필요하면 우선순위 인자를 더한다. */
export const MAX_SPAWN = 3;
let running = 0;
const queue: (() => void)[] = [];
const next = () => { while (running < MAX_SPAWN && queue.length) { running++; queue.shift()!(); } };
export function limitSpawn<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((res, rej) => {
    queue.push(() => { fn().then(res, rej).finally(() => { running--; next(); }); });
    next();
  });
}
