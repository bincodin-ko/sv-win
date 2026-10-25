// 노트류(체크리스트·캘린더·칸반)가 같이 쓰는 색 6개. 값은 theme/tokens.css 의 --note-*. 저장 값은 소문자 id("amber").
export const NOTE_COLORS = ["Amber", "Sage", "Sky", "Violet", "Rose", "Teal"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];
export type NoteColorId = Lowercase<NoteColor>;
export const noteVar = (name: string | null | undefined): string | undefined =>
  name && NOTE_COLORS.some((c) => c.toLowerCase() === name.toLowerCase()) ? `var(--note-${name.toLowerCase()})` : undefined;
