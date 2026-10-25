// P2: 상태 시계는 콘솔마다 타이머를 두지 않고 하나로 돈다. 보이면 250ms, 창이 숨겨지면(최소화) 1000ms — NEEDS YOU·완료 알림이 계속 나가야 한다.
const ticks = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | undefined;
let last = 0;
export function addTick(fn: () => void, hidden: () => boolean = () => typeof document !== "undefined" && document.hidden): () => void {
  ticks.add(fn);
  ticker ??= setInterval(() => {
    const now = Date.now();
    if (hidden() && now - last < 900) return; // 250ms 간격 4번 중 1번(타이머 오차 여유)
    last = now;
    [...ticks].forEach((f) => f());
  }, 250);
  return () => {
    ticks.delete(fn);
    if (!ticks.size) (clearInterval(ticker), (ticker = undefined));
  };
}
