// S-1109: 서버 대기 상태기계(타이머는 밖에서 1초마다 onProbe 를 부른다).
export const MAX_RETRIES = 10;
export type Wait = { phase: "waiting" | "failed" | "ready"; tries: number };
const LOCAL = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"];
export const isLocalUrl = (url: string): boolean => { try { return LOCAL.includes(new URL(url).hostname); } catch { return false; } };
/** w = 이전 상태(첫 확인이면 null). 돌려주는 값이 다음 상태. 처음 실패는 tries 0, 다시 시도가 실패할 때마다 +1, 10번째 실패에서 failed */
export function onProbe(w: Wait | null, reachable: boolean, local: boolean): Wait {
  if (reachable) return { phase: "ready", tries: 0 };
  if (!local) return { phase: "failed", tries: w?.tries ?? 0 };
  const tries = w ? w.tries + 1 : 0;
  return { phase: tries >= MAX_RETRIES ? "failed" : "waiting", tries };
}
