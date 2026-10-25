import { t } from "../i18n";

// S-1066: open 뒤의 글 -> 웹 주소. http/https 만 연다.
export type OpenResult = { url: string } | { error: string } | null;
export const ONLY_HTTP = "I can only open http and https pages.";

/** 화면 언어로 (ONLY_HTTP 는 영어 기본 문구) */
export const onlyHttpText = (): string => t("I can only open http and https pages.");

const HOST = /^(localhost|127\.0\.0\.1)(?:(?::|\s+)(\d{1,5}))?(\/\S*)?$/i;

export function parseOpen(text: string): OpenResult {
  const t = text.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return { url: t };
  const h = t.match(HOST);
  if (h) return { url: `http://${h[1]!.toLowerCase()}${h[2] ? `:${h[2]}` : ""}${h[3] ?? ""}` };
  if (/^\d{2,5}$/.test(t)) return { url: `http://localhost:${t}` };
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return { error: ONLY_HTTP }; // ftp:// file:/// javascript: data: chrome://
  return null;
}
