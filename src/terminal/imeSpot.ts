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

type Helper = { _isComposing?: boolean; _compositionView?: HTMLElement; _textarea?: HTMLTextAreaElement; updateCompositionElements?: (dontRecurse?: boolean) => void };

/** xterm 의 조합 글자 자리 잡기(CompositionHelper.updateCompositionElements)를 감싼다. xterm 내부에 기대므로 버전 올릴 때 e2e 로 확인 */
export function fixImeSpot(term: Terminal): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (term as any)._core;
  const h: Helper | undefined = core?._compositionHelper;
  const orig = h?.updateCompositionElements;
  if (!h || !orig) return;
  h.updateCompositionElements = function (dontRecurse?: boolean) {
    orig.call(this, dontRecurse);
    if (!h._isComposing || !core.coreService?.isCursorHidden) return;
    const at = promptCaret(term.buffer.active, term.rows);
    const cell = core._renderService?.dimensions?.css?.cell;
    if (!at || !cell?.width || !h._compositionView || !h._textarea) return;
    const left = Math.min(at.x, term.cols - 1) * cell.width + "px";
    const top = at.y * cell.height + "px";
    for (const el of [h._compositionView, h._textarea]) { el.style.left = left; el.style.top = top; }
  };
}
