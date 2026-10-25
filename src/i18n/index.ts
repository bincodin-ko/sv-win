// 화면 언어 틀(S-2400~S-2404). 영어 문장 자체가 키: t("Open settings") → 사전(ko)에 있으면 한국어, 없으면 영어 그대로.
// 규칙: 키는 큰따옴표/작은따옴표 리터럴만(템플릿·이어붙이기 금지, src/i18n/ko.test.ts 가 읽는다). 모듈을 불러와도 언어는 en.
import { create } from "zustand";
import ko from "./ko";

export type Lang = "en" | "ko";
export type Vars = Record<string, string | number>;

const useStore = create<{ lang: Lang }>(() => ({ lang: "en" }));
const DICTS: Record<Lang, Record<string, string>> = { en: {}, ko };

export const getLang = (): Lang => useStore.getState().lang;
export const setLang = (l: Lang): void => {
  if (typeof document !== "undefined") document.documentElement.lang = l; // S-2406
  useStore.setState({ lang: l });
};
export const subscribeLang = (cb: (l: Lang) => void): (() => void) => useStore.subscribe((s, p) => { if (s.lang !== p.lang) cb(s.lang); });
export const useLang = (): Lang => useStore((s) => s.lang);

/** {name} 을 한 번만 바꾼다(값 안의 {x} 는 그대로). 빠진 변수는 {name} 유지 */
const fill = (s: string, vars?: Vars): string => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

export const t = (en: string, vars?: Vars): string => fill(DICTS[getLang()][en] ?? en, vars);
/** 영어는 n===1 이면 one, 아니면 other. 한국어는 사전의 other 키 값. {n} 은 자동으로 채운다 */
export const tp = (one: string, other: string, n: number, vars?: Vars): string =>
  fill(getLang() === "en" || !(other in ko) ? (n === 1 ? one : other) : ko[other]!, { n, ...vars });
/** 선언 자리용: 영어 그대로 돌려주고(사전 점검 시험이 키를 읽음) 그릴 때 t(label) */
export const tm = (en: string): string => en;

export const langFromNavigator = (nav?: string): Lang => (nav?.toLowerCase().startsWith("ko") ? "ko" : "en");
/** 시작 흐름에서 한 번: 저장값(en|ko)이 있으면 그것, 없거나 모르는 값이면 navigator.language. 저장하지는 않는다 */
export const initLang = (settings: Record<string, unknown>): void => {
  const v = settings.language;
  setLang(v === "en" || v === "ko" ? v : langFromNavigator(typeof navigator === "undefined" ? undefined : navigator.language));
};

/** 컴포넌트용: 언어가 바뀌면 다시 그린다(마운트는 유지). 반환 t 는 모듈 t 와 같다 */
export const useT = (): typeof t => {
  useLang();
  return t;
};
