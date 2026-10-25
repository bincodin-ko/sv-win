// D5 트리거 판정(순수): 카운트다운(S-1402), idle(S-1404), output(S-1405), 시계(S-1418)
import { t } from "../i18n";
import { isTauri } from "../lib/ipc";

/** idle·output 은 콘솔당 2분에 한 번 이하 */
export const COOLDOWN_MS = 120_000;

/** 시계. 비-Tauri 에서는 window.__loopNow(숫자) 로 바꿔 끼운다 */
export const loopNow = (): number => {
  const v = (window as unknown as { __loopNow?: number }).__loopNow;
  return !isTauri() && typeof v === "number" ? v : Date.now();
};

/** "in 14:53" (분:초, 분은 60 을 넘을 수 있다) */
export function countdown(nextAt: number, now: number): string {
  const s = Math.max(0, Math.ceil((nextAt - now) / 1000));
  return t("in {t}", { t: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` });
}

/** 이전 꼬리(prev) 뒤에 새로 붙은 줄. prev 의 뒷부분이 cur 의 앞부분과 같아지는 가장 긴 겹침을 찾는다 */
// ponytail: 같은 줄이 제자리에서 바뀌면(스피너) 겹침이 없어 꼬리 전체가 새 줄로 보인다 — 잘못 발동하면 콘솔 onData 구독으로
export function newLines(prev: string[], cur: string[]): string[] {
  for (let m = 0; m <= prev.length; m++) {
    const rest = prev.slice(m);
    if (rest.length <= cur.length && rest.every((x, i) => x === cur[i])) return cur.slice(rest.length);
  }
  return cur;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)|[\x00-\x08\x0b-\x1f\x7f]/g;
/** 대문자가 하나라도 있으면 대소문자 구분. 줄마다 따로 본다(줄을 걸친 것은 무시) */
export function outputMatch(text: string, lines: string[]): boolean {
  const exact = /[A-Z]/.test(text);
  const t = exact ? text : text.toLowerCase();
  return lines.some((l) => {
    const s = l.replace(ANSI, "");
    return (exact ? s : s.toLowerCase()).includes(t);
  });
}

/** 턴이 끝남 = live status 의 WORKING → READY */
export const idleEdge = (prev: string | undefined, cur: string): boolean => prev === "WORKING" && cur === "READY";

export const cooled = (last: number | undefined, now: number): boolean => last === undefined || now - last >= COOLDOWN_MS;
