// D2 S-1208: 동시에 max개만 돌리는 줄
export interface Queue {
  run<T>(job: () => Promise<T>): Promise<T>;
  active(): number;
  waiting(): number;
}
export function createQueue(max = 3): Queue {
  let active = 0;
  const wait: (() => void)[] = [];
  return {
    async run(job) {
      if (active >= max) await new Promise<void>((r) => wait.push(r)); // 자리를 넘겨받으면 active 는 그대로
      else active++;
      try {
        return await job();
      } finally {
        const next = wait.shift();
        if (next) next();
        else active--;
      }
    },
    active: () => active,
    waiting: () => wait.length,
  };
}
export const hiddenQueue: Queue = createQueue(3);
