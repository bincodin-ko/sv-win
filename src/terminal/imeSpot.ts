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
 * 대기열 3번: 커서가 화면 밖(위로 스크롤 등)일 때 xterm 은 자리를 안 잡아 조합 상자가 콘솔 왼쪽 위(기본 자리)에 떴다.
 * exact = 그 줄이 실제 입력 줄이다(뒤 글을 밀어 보여 줘도 된다) */
export function imeSpot(buf: IBuffer, rows: number, cols: number, hidden: boolean, last: { x: number; y: number } | null): { x: number; y: number; exact: boolean } {
  const y = buf.baseY + buf.cursorY - buf.viewportY;
  if (!hidden && y >= 0 && y < rows) return { x: Math.min(buf.cursorX, cols - 1), y, exact: true };
  const p = promptCaret(buf, rows);
  if (p) return { ...p, exact: true };
  return { ...(last ?? { x: Math.min(buf.cursorX, cols - 1), y: Math.max(0, Math.min(rows - 1, y)) }), exact: false };
}

/** 화면 y 줄의 x 칸부터 끝(뒤 빈칸 뺌)까지 글자. 넓은 글자는 w=2, 흐린 글은 dim */
export function restCells(buf: IBuffer, x: number, y: number): { ch: string; w: number; dim: boolean }[] {
  const line = buf.getLine(buf.viewportY + y);
  if (!line) return [];
  const out: { ch: string; w: number; dim: boolean }[] = [];
  let end = 0;
  for (let c = x; c < line.length; c++) {
    const cell = line.getCell(c);
    const w = cell?.getWidth() ?? 1;
    if (!cell || w === 0) continue; // 넓은 글자의 뒤 칸
    const ch = cell.getChars() || " ";
    out.push({ ch, w, dim: !!cell.isDim() });
    if (ch.trim()) end = out.length;
  }
  return out.slice(0, end);
}

type Helper = { _isComposing?: boolean; _compositionView?: HTMLElement; _textarea?: HTMLTextAreaElement; updateCompositionElements?: (dontRecurse?: boolean) => void };
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
let blinkCss = false;

/** xterm 의 조합 글자 자리 잡기(CompositionHelper.updateCompositionElements)를 감싼다. xterm 내부에 기대므로 버전 올릴 때 e2e 로 확인.
 * 자리는 imeSpot 으로 언제나 잡고, 모양은 바탕화면 터미널처럼: [밑줄 친 조합 글자][깜박이는 ㅣ][오른쪽 글을 뒤로 민 것].
 * 사용자 지적: 막대가 조합 글자 앞에 보였고(안ㅣ녕), 글 중간에서 조합하면 오른쪽 글이 가려져 사라져 보였다 */
export function fixImeSpot(term: Terminal): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (term as any)._core;
  const h: Helper | undefined = core?._compositionHelper;
  const orig = h?.updateCompositionElements;
  if (!h || !orig) return;
  if (!blinkCss) {
    blinkCss = true;
    const st = document.createElement("style");
    st.textContent = "@keyframes sv-ime-blink{50%{opacity:0}}.sv-ime-caret{animation:sv-ime-blink 1s step-end infinite}";
    document.head.append(st);
  }
  let last: { x: number; y: number } | null = null, data = "";
  h._textarea?.addEventListener("compositionupdate", (e) => { data = (e as CompositionEvent).data ?? ""; });
  h._textarea?.addEventListener("compositionstart", () => { data = ""; });
  h.updateCompositionElements = function (dontRecurse?: boolean) {
    orig.call(this, dontRecurse);
    const v = h._compositionView, ta = h._textarea, cell = core._renderService?.dimensions?.css?.cell;
    if (!h._isComposing || !v || !ta || !cell?.width) return;
    const buf = term.buffer.active;
    const at = imeSpot(buf, term.rows, term.cols, !!core.coreService?.isCursorHidden, last);
    last = { x: at.x, y: at.y };
    const cw = cell.width, th = term.options.theme ?? {};
    const box = (ch: string, w: number, extra = "") => `<span style="display:inline-block;width:${w * cw}px;text-align:center${extra}">${esc(ch)}</span>`;
    const text = v.children.length === 0 ? (v.textContent ?? "") : data; // xterm 이 방금 넣은 글(아직 우리 칸이 없음)이 가장 새것
    const comp = [...text].map((ch) => box(ch, core.unicodeService?.getStringCellWidth?.(ch) || 1, ";text-decoration:underline")).join("");
    const rest = at.exact ? restCells(buf, at.x, at.y).map((r) => box(r.ch, r.w, r.dim ? ";opacity:.5" : "")).join("") : "";
    v.innerHTML = `${comp}<span class="sv-ime-caret" style="display:inline-block;width:0;height:${cell.height}px;vertical-align:top;border-left:1px solid ${th.cursor ?? th.foreground ?? "currentColor"}"></span>${rest}`;
    // 왼쪽 2px 더 덮어 원래 막대 커서를 가린다
    const left = at.x * cw - 2 + "px", top = at.y * cell.height + "px";
    for (const el of [v, ta]) { el.style.left = left; el.style.top = top; }
    Object.assign(v.style, { height: cell.height + "px", lineHeight: cell.height + "px", fontFamily: term.options.fontFamily ?? "", fontSize: term.options.fontSize + "px",
      background: th.background ?? "", color: th.foreground ?? "", textDecoration: "none", paddingLeft: "2px", whiteSpace: "pre", overflow: "hidden", maxWidth: (term.cols - at.x) * cw + 2 + "px" });
  };
}
