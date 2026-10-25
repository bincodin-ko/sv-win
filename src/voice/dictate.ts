// S-2274·S-2277 받아쓰기 글 다듬기·넣기
import { applySpokenPunctuation } from "./punct";

export const DICT_KEYS = ["CtrlSpace", "ControlRight", "AltRight", "ShiftRight"] as const;
export const dictKey = (setting: unknown): string => (DICT_KEYS as readonly unknown[]).includes(setting) ? (setting as string) : "CtrlSpace";
export const DICT_NAME: Record<string, string> = { CtrlSpace: "Ctrl+Space", ControlRight: "Right Ctrl", AltRight: "Right Alt", ShiftRight: "Right Shift" };
/** 구두점 말 → 기호, 줄바꿈은 공백으로 */
export const dictText = (raw: string): string => applySpokenPunctuation(raw).replace(/\s*[\r\n]+\s*/g, " ").trim();

/** 콘솔에는 붙여넣기로만(Enter 없음). bracketedPaste 면 \x1b[200~…\x1b[201~ */
export const insertConsole = (s: { write(d: string): void; bracketedPaste(): boolean }, text: string): void =>
  s.write(s.bracketedPaste() ? `\x1b[200~${text}\x1b[201~` : text);

/** 입력란·텍스트 영역·편집 영역: 커서 자리에 넣고 input 이벤트(execCommand 가 React 입력란도 깨운다) */
export function insertField(el: HTMLElement, text: string): void {
  el.focus();
  if (document.execCommand("insertText", false, text)) return;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.setRangeText(text, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/** S-2720·S-2721: 이 keydown 이 설정된 받아쓰기 키인가 */
export const isDictKey = (e: KeyboardEvent, setting: unknown): boolean => {
  const k = dictKey(setting);
  return k === "CtrlSpace" ? e.code === "Space" && e.ctrlKey && !e.altKey && !e.metaKey : e.code === k;
};
