// S-844·S-845·S-848: 텍스트 상자 순수 부분 (글꼴·크기·정렬 표, 빈 글 판정). 글꼴·크기 표는 C5 shapes/textStyle.ts 와 같은 것을 쓴다
import { FONTS, SIZES } from "../board/shapes/textStyle";

export const TEXT_FONTS = FONTS;
export const TEXT_SIZES: Record<string, number> = SIZES;
export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export const TEXT_MIN_W = 40; // 추측(S-848)
export const TEXT_DEFAULT_W = 240; // 추측

/** 공백·줄바꿈뿐이면 빈 글 → 떠날 때 상자가 사라진다(S-844) */
export const isEmptyText = (t: unknown): boolean => typeof t !== "string" || t.trim() === "";

/** 새 텍스트 상자 노드의 종류별 필드. 글자색 = stroke(S-846) */
export function makeText(text = ""): Record<string, unknown> {
  return { text, stroke: "default", font: "clean", size: "M", align: "left", opacity: 100 };
}
