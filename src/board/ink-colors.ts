// S-826·S-865: 펜·도형 공용 색 8개(이름만 저장, 값은 tokens.css 의 --ink-<이름>)
export const INK_COLORS = ["red", "orange", "yellow", "green", "blue", "violet", "white", "black"] as const;
export type InkColor = (typeof INK_COLORS)[number];
/** 색 이름 → CSS 값. 모르는 이름("default" 포함)은 글자색 --fg, "transparent"는 "none" */
export function inkVar(name: unknown): string {
  if (name === "transparent") return "none";
  return typeof name === "string" && (INK_COLORS as readonly string[]).includes(name) ? `var(--ink-${name})` : "var(--fg)";
}
