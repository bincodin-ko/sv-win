// S-957·S-958: 코드 카드 글 자르기(순수)
import { tm } from "../i18n";
export const MAX_LINES = 5000;
export const CUT_NOTICE = tm("Showing the first 5,000 lines"); // 화면에서 t(CUT_NOTICE)
export type Clipped = { text: string; total: number; cut: boolean };

/** 앞 max 줄만. 끝의 줄바꿈 하나는 줄로 세지 않는다 */
export function clipLines(text: string, max = MAX_LINES): Clipped {
  if (!text) return { text, total: 0, cut: false };
  const lines = text.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length <= max) return { text, total: lines.length, cut: false };
  return { text: lines.slice(0, max).join("\n"), total: lines.length, cut: true };
}

/** 보드에 저장하는 글(S-958): 앞 5,000줄까지 */
export function clipForStore(text: string): { text: string; truncated: boolean } {
  const c = clipLines(text);
  return { text: c.text, truncated: c.cut };
}
