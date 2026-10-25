// D10 S-1522: 리셋 시각 글자 → 시각. 순수 함수
import { t } from "../i18n";
export type Level = "ok" | "amber" | "red";
const MON = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const DAY_MON = new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(" + MON + ")[a-z]*\\b", "i"); // 14 Sep
const MON_DAY = new RegExp("\\b(" + MON + ")[a-z]*\\.?\\s+(\\d{1,2})\\b", "i"); // Oct 28
const TIME = /(\d{1,2}):(\d{2})\s*(am|pm)?|\b(\d{1,2})\s*(am|pm)\b/i; // 4:09pm · 08:37 · 6pm

/** "4:09pm"·"6pm"·"08:37 on 14 Sep"·"Oct 28, 6pm" 에서 now 이후 가장 가까운 시각(현지). 못 읽으면 null */
export function parseReset(text: string, now: Date): Date | null {
  let t = text.replace(/\([^)]*\)/g, " ").replace(/\b(resets?|on|at)\b/gi, " ");
  let month = -1;
  let day = 0;
  const d1 = DAY_MON.exec(t);
  const d2 = d1 ?? MON_DAY.exec(t);
  if (d2) {
    [month, day] = d1 ? [MON.split("|").indexOf(d1[2]!.toLowerCase()), +d1[1]!] : [MON.split("|").indexOf(d2[1]!.toLowerCase()), +d2[2]!];
    t = t.replace(d2[0], " ");
  }
  const m = TIME.exec(t);
  if (!m) return null;
  let h = +(m[1] ?? m[4]!);
  const mi = +(m[2] ?? 0);
  const ap = (m[3] ?? m[5])?.toLowerCase();
  if (mi > 59 || (ap ? h < 1 || h > 12 : h > 23)) return null;
  if (ap) h = (h % 12) + (ap === "pm" ? 12 : 0);
  const y = now.getFullYear();
  if (month >= 0) {
    const c = new Date(y, month, day, h, mi);
    if (c.getMonth() !== month) return null; // 2월 30일 같은 날
    return c > now ? c : new Date(y + 1, month, day, h, mi);
  }
  const c = new Date(y, now.getMonth(), now.getDate(), h, mi);
  return c > now ? c : new Date(y, now.getMonth(), now.getDate() + 1, h, mi);
}

/** 75% 이상 amber, 90% 이상 red (S-1513) */
export function levelOf(pct: number): Level {
  return pct >= 90 ? "red" : pct >= 75 ? "amber" : "ok";
}

/** 남은 시간 글자 (S-2481): 2h 15m left / 45m left / 1d 2h left → 2시간 15분 남음 / 45분 남음 / 1일 2시간 남음 */
export function leftText(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d > 0 ? t("{d}d {h}h left", { d, h }) : h > 0 ? t("{h}h {m}m left", { h, m }) : t("{m}m left", { m });
}
