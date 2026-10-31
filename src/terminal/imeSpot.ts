import type { IBuffer, Terminal } from "@xterm/xterm";

// 녹화 rec_1026_235106: Claude 가 일하는 중(훅 실행 등)엔 커서를 숨기고 화면 오른쪽 아래에 둔다.
// xterm 은 한글 조합 글자를 실제 커서 자리에 띄우므로 조합 중인 글자가 오른쪽 아래에 떴다(확정돼야 입력 줄에 보임).
// 커서가 숨어 있으면 Claude 입력 줄(위 테두리 "───" 바로 아래 "❯ ")의 글 끝을 찾아 그 자리에 띄운다.

/** 화면(뷰포트) 안 Claude 입력 줄의 글 끝 칸. 없으면 null */
export function promptCaret(buf: IBuffer, rows: number): { x: number; y: number } | null {
  const text = (y: number) => buf.getLine(buf.viewportY + y)?.translateToString(true) ?? "";
  const border = (y: number) => text(y).trimStart().startsWith("─");
  for (let p = rows - 1; p > 0; p--) {
    if (!/^\s*[❯>](\s|$)/.test(text(p)) || !border(p - 1)) continue;
    let y = p; // 여러 줄 입력이면 아래 테두리 전까지의 마지막 글 줄
    for (let r = p + 1; r < rows && !border(r) && text(r).trim(); r++) y = r;
    const line = buf.getLine(buf.viewportY + y);
    if (!line) return null;
    let x = 0;
    for (let c = 0; c < line.length; c++) {
      const cell = line.getCell(c);
      const ch = cell?.getChars() ?? "";
      if (ch.trim() && !cell?.isDim()) x = c + (cell?.getWidth() || 1); // 흐린 글(빈 입력 안내문)은 건너뛴다
    }
    return { x: y === p ? Math.max(x, 2) : x, y }; // 빈 입력이면 "❯ " 뒤
  }
  return null;
}

/** 조합 글자 자리(화면 칸): 커서가 보이고 화면 안이면 커서, 아니면 Claude 입력 줄, 없으면 마지막 자리, 그것도 없으면 커서를 화면 안으로 당긴 자리.
 * 대기열 3번: 커서가 화면 밖(위로 스크롤 등)일 때 xterm 은 자리를 안 잡아 조합 상자가 콘솔 왼쪽 위(기본 자리)에 떴다 */
export function imeSpot(buf: IBuffer, rows: number, cols: number, hidden: boolean, last: { x: number; y: number } | null): { x: number; y: number } {
  const y = buf.baseY + buf.cursorY - buf.viewportY;
  if (!hidden && y >= 0 && y < rows) return { x: Math.min(buf.cursorX, cols - 1), y };
  return promptCaret(buf, rows) ?? last ?? { x: Math.min(buf.cursorX, cols - 1), y: Math.max(0, Math.min(rows - 1, y)) };
}

type Helper = { _isComposing?: boolean; _compositionView?: HTMLElement; _textarea?: HTMLTextAreaElement; updateCompositionElements?: (dontRecurse?: boolean) => void };

/** xterm 의 조합 글자 자리 잡기(CompositionHelper.updateCompositionElements)를 감싼다. xterm 내부에 기대므로 버전 올릴 때 e2e 로 확인.
 * 자리는 imeSpot 으로 언제나 잡고, 모양은 바탕화면 터미널처럼 글줄 위에 밑줄 친 글자(검은 상자 아님) */
export function fixImeSpot(term: Terminal): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (term as any)._core;
  const h: Helper | undefined = core?._compositionHelper;
  const orig = h?.updateCompositionElements;
  if (!h || !orig) return;
  let last: { x: number; y: number } | null = null;
  h.updateCompositionElements = function (dontRecurse?: boolean) {
    orig.call(this, dontRecurse);
    const v = h._compositionView, ta = h._textarea, cell = core._renderService?.dimensions?.css?.cell;
    if (!h._isComposing || !v || !ta || !cell?.width) return;
    const at = (last = imeSpot(term.buffer.active, term.rows, term.cols, !!core.coreService?.isCursorHidden, last));
    const left = at.x * cell.width + "px", top = at.y * cell.height + "px";
    for (const el of [v, ta]) { el.style.left = left; el.style.top = top; }
    const th = term.options.theme ?? {};
    Object.assign(v.style, { height: cell.height + "px", lineHeight: cell.height + "px", fontFamily: term.options.fontFamily ?? "", fontSize: term.options.fontSize + "px",
      background: th.background ?? "", color: th.foreground ?? "", textDecoration: "underline" });
  };
}
