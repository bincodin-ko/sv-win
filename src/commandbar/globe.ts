// S-2271 지구본 메뉴 선택지·코드 글자
import { tm } from "../i18n";
import { LANGUAGES, langArg } from "../voice/languages";

export const GLOBE_CHOICES: { code: string; name: string }[] = [{ code: "auto", name: tm("Automatic") }, ...LANGUAGES];
/** 지구본 옆 글자: Automatic(모르는 값 포함)이면 비움 */
export const globeCode = (speechLanguage: unknown): string => {
  const c = langArg(String(speechLanguage ?? "auto"));
  return c === "auto" ? "" : c.toUpperCase();
};
