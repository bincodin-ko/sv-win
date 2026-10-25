// S-131·S-133·S-135: 터미널 입력 판정(화면과 떼어 둔 순수 함수)
export type KeyAction = { action: "copy" | "paste" | "selectAll" | "clear" | "send"; data?: string };
export interface KeyLike { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }
export interface KeyCtx { hasSelection: boolean; altScreen: boolean }

/** null = xterm 기본/프로그램으로 그대로. 지우기의 data: 'all'(화면+스크롤백) | 'scrollback'(대체 화면이면 스크롤백만) */
export function mapKey(ev: KeyLike, ctx: KeyCtx): KeyAction | null {
  if (!ev.ctrlKey || ev.altKey || ev.metaKey) return null;
  const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  if (k === "c") return ev.shiftKey || ctx.hasSelection ? { action: "copy" } : null;
  if (k === "v") return { action: "paste" };
  if (!ev.shiftKey) return null;
  if (k === "a") return { action: "selectAll" };
  if (k === "k") return { action: "clear", data: ctx.altScreen ? "scrollback" : "all" };
  if (k === "Backspace") return { action: "send", data: "\x15" };
  return null;
}

/**
 * S-374: Alt를 Meta로 쓰지 않을 때(altAsMeta=false) Alt+글자는 Esc 접두 없이 평소 글자로 보낸다.
 * 돌려주는 글자 = 직접 보낼 입력, null = xterm 기본(켜짐이면 Esc+키). Ctrl+Alt(AltGr)·Meta·글자 아닌 키는 건드리지 않는다.
 */
export function altPlain(ev: KeyLike, altAsMeta: boolean): string | null {
  if (altAsMeta || !ev.altKey || ev.ctrlKey || ev.metaKey || ev.key.length !== 1) return null;
  return ev.key;
}

/** 탭·\n·\r 말고 제어문자(C0·DEL)는 지운다 */
export function sanitizePaste(text: string): string {
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

/** 끝의 빈 줄을 뺀 줄 수 */
export function pasteLineCount(text: string): number {
  const lines = text.split(/\r\n|\r|\n/);
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

/** 줄바꿈(연속이어도 하나)을 공백 하나로. 끝의 줄바꿈은 뺀다 */
export function joinOneLine(text: string): string {
  return text.replace(/(\r\n|\r|\n)+$/, "").replace(/(\r\n|\r|\n)+/g, " ");
}
