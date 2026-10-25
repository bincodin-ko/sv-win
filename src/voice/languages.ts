import { t, tm } from "../i18n";
// S-2211·S-2450: 받아쓰기 언어 26개(이름·코드 한 곳). Settings 와 Thread 지구본이 쓴다
export const LANGUAGES: { code: string; name: string }[] = [
  { code: "bg", name: tm("Bulgarian") }, { code: "hr", name: tm("Croatian") }, { code: "cs", name: tm("Czech") }, { code: "da", name: tm("Danish") },
  { code: "nl", name: tm("Dutch") }, { code: "en", name: tm("English") }, { code: "et", name: tm("Estonian") }, { code: "fi", name: tm("Finnish") },
  { code: "fr", name: tm("French") }, { code: "de", name: tm("German") }, { code: "el", name: tm("Greek") }, { code: "hu", name: tm("Hungarian") },
  { code: "it", name: tm("Italian") }, { code: "ko", name: tm("Korean") }, { code: "lv", name: tm("Latvian") }, { code: "lt", name: tm("Lithuanian") }, { code: "mt", name: tm("Maltese") },
  { code: "pl", name: tm("Polish") }, { code: "pt", name: tm("Portuguese") }, { code: "ro", name: tm("Romanian") }, { code: "ru", name: tm("Russian") },
  { code: "sk", name: tm("Slovak") }, { code: "sl", name: tm("Slovenian") }, { code: "es", name: tm("Spanish") }, { code: "sv", name: tm("Swedish") },
  { code: "uk", name: tm("Ukrainian") },
];

/** 설정 값 → whisper `-l` 인자. auto·빈 값·모르는 코드는 auto */
export const langArg = (code: string) => (LANGUAGES.some((l) => l.code === code) ? code : "auto");


/** S-2451: 목록에 보이는 이름은 화면 언어를 따른다(코드는 그대로 저장). auto = 자동/Automatic */
export const languageLabel = (code: string): string => t(code === "auto" ? "Automatic" : (LANGUAGES.find((l) => l.code === code)?.name ?? code));
