// S-2235·S-2234: 어떤 Thread 메시지를 소리 내어 읽을까 (순수)
import { t } from "../i18n";
import type { Msg } from "../commandbar/thread";

export const MAX_SPOKEN = 200;
const clean = (s: string) =>
  s.replace(/[\p{Extended_Pictographic}‍️@*_`#>~[\]]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_SPOKEN).trim();

/** 읽을 말, 읽지 않으면 null. 에이전트 보고는 이름과 상태만(내용은 절대 안 읽는다) */
export function speakable(m: Msg): string | null {
  let txt: string;
  if (m.role === "report") {
    const r = m.report;
    if (!r) return null;
    // 보고 result 는 저장 시점의 화면 언어("finished · 12s" / "끝남 · 12초")
    txt = /^(finished|끝남)/.test(r.result) ? t("{name} finished.", { name: r.console }) : /^(failed|실패)/.test(r.result) ? t("{name} failed.", { name: r.console }) : "";
  } else if (m.role === "bot") txt = /^(Something went wrong|문제가 생겼어요)/.test(m.text) ? "" : m.text; // 오류 상세는 안 읽는다 (영어·한국어)
  else txt = ""; // plan·user
  return clean(txt) || null;
}
