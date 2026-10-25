// S-2427: 날짜·시간·상대 시간 표기를 화면 언어에 맞춘다 (순수 함수).
import type { Lang } from "../i18n";

const loc = (l: Lang) => (l === "ko" ? "ko-KR" : "en-US");
export const fmtDate = (d: Date, lang: Lang): string => d.toLocaleDateString(loc(lang));
export const fmtTime = (d: Date, lang: Lang): string => d.toLocaleTimeString(loc(lang), { hour: "numeric", minute: "2-digit" });
/** 영어는 기존 표기("5m ago"), 한국어는 Intl.RelativeTimeFormat("5분 전") */
export const relTime = (s: number, lang: Lang): string => {
  if (s < 60) return lang === "ko" ? "방금 전" : "just now";
  const [n, u, a] = s < 3600 ? [Math.floor(s / 60), "minute", "m"] as const : s < 86400 ? [Math.floor(s / 3600), "hour", "h"] as const : [Math.floor(s / 86400), "day", "d"] as const;
  return lang === "ko" ? new Intl.RelativeTimeFormat("ko", { numeric: "always" }).format(-n, u) : `${n}${a} ago`;
};
