import { keyFor, type Keymap } from "./keymap";
// 보드가 키보드를 가졌는지: 입력란·편집 영역·콘솔(.xterm) 안이면 아니다. A7이 넓힌다.
export function boardHasKeyboard(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.closest) return true;
  if (el.isContentEditable) return false;
  return !el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], .xterm");
}

/** 열린 메뉴·대화상자가 있으면 보드 키는 쉰다(Esc 는 그쪽이 먼저 닫는다, S-031) */
export const overlayOpen = (): boolean => !!document.querySelector('[role="dialog"], [role="menu"]');

export interface KeyIn {
  boardFocused: boolean; key: string; ctrl: boolean; alt: boolean; meta: boolean; shift: boolean;
  selected: number; selectedRunningConsole: boolean;
  /** B16: NEEDS YOU·ERROR 콘솔이 있고 라이브 상태가 켜져 있다 — 그러면 N 은 선택된 콘솔로 가지 않고 순서 돌기가 먼저 */
  needsYouAvailable?: boolean;
}
export type KeyRoute = "toConsole" | "select" | "spawn" | "needsYou" | "pen" | "eraser" | "git" | "memory" | "loops" | "skills" | "markdown" | "none";
/** S-047: 키 하나가 어디로 가는가 */
export function routeKey(i: KeyIn, km?: Keymap): KeyRoute {
  if (!i.boardFocused || i.ctrl || i.alt || i.meta || i.key.length !== 1) return "none";
  const k = i.key.toLowerCase();
  if (i.needsYouAvailable && !i.shift && k === keyFor(km, "needsYou")) return "needsYou";
  if (i.selected === 1 && i.selectedRunningConsole) return "toConsole";
  if (i.shift) return "none";
  return (["select", "spawn", "needsYou", "pen", "eraser", "git", "memory", "loops", "skills", "markdown"] as const).find((a) => k === keyFor(km, a)) ?? "none";
}

/** S-2435: 한글 입력기 등으로 key 가 영문이 아니면(자모·Process) code 의 Key[A-Z] 글자로 바꾼다. 숫자·기호·이름 있는 키는 그대로 */
export function boardKey(e: { key: string; code: string }): string {
  const m = /^Key([A-Z])$/.exec(e.code);
  return m && !/^[a-zA-Z]$/.test(e.key) && (e.key === "Process" || e.key === "Unidentified" || (e.key.length === 1 && e.key.charCodeAt(0) > 127)) ? m[1]!.toLowerCase() : e.key;
}
