// 9묶음 P3: 유휴 폴링. 창이 숨으면 멈추고(기본), 저사양이면 간격 3배. 다시 보이면 즉시 한 번.
import { useSyncExternalStore } from "react";
import { isLowSpec } from "./lowSpec";

export const LOW_FACTOR = 3;
/** 홈 오브 애니메이션 상태: 저사양=정지 그림, 창 숨김=일시정지 */
export function orbPlay(hidden: boolean, low: boolean): "none" | "paused" | "running" {
  return low ? "none" : hidden ? "paused" : "running";
}
/** fn 을 즉시 한 번 부르고 ms 마다 부른다(창이 숨은 동안은 타이머 자체를 끈다). 반환값은 멈추는 함수. */
// ponytail: 저사양 여부는 시작할 때만 읽는다. 켜고 끈 뒤 다음 마운트부터 적용
export function startPoll(fn: () => void, ms: number): () => void {
  const every = isLowSpec() ? ms * LOW_FACTOR : ms;
  let id: ReturnType<typeof setInterval> | undefined;
  const on = () => { if (id === undefined) id = setInterval(fn, every); };
  const off = () => { clearInterval(id); id = undefined; };
  const vis = () => { if (document.hidden) off(); else { off(); fn(); on(); } };
  if (!document.hidden) { fn(); on(); }
  document.addEventListener("visibilitychange", vis);
  return () => { off(); document.removeEventListener("visibilitychange", vis); };
}
const sub = (cb: () => void) => { document.addEventListener("visibilitychange", cb); return () => document.removeEventListener("visibilitychange", cb); };
export const useDocHidden = (): boolean => useSyncExternalStore(sub, () => document.hidden);
