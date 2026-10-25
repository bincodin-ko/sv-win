// U3 S-2643: 터미널 우클릭 메뉴용 복사·붙여넣기·전체 선택. TerminalView 는 안 고친다 —
// 열린 xterm 은 ipc 의 debugTerms(세션이 항상 채운다)에서 요소가 대상을 품은 것을 찾는다.
import { debugTerms } from "../lib/ipc";

type Term = { element?: HTMLElement; textarea?: HTMLTextAreaElement; hasSelection(): boolean; getSelection(): string; selectAll(): void; focus(): void };
const find = (from: Element | null): Term | undefined =>
  from ? ([...debugTerms.values()] as unknown as Term[]).find((t) => t.element?.contains(from)) : undefined;

/** 그 요소가 든 터미널의 선택 글(없으면 "") */
export const termSelection = (from: Element | null): string => find(from)?.getSelection() ?? "";

export function termSelectAll(from: Element | null): void {
  const t = find(from);
  t?.selectAll();
  t?.focus();
}

export async function termCopy(from: Element | null): Promise<void> {
  const t = find(from);
  const s = t?.getSelection();
  if (s) await navigator.clipboard?.writeText(s).catch(() => {});
  t?.focus();
}

/** 클립보드 글을 터미널의 paste 이벤트로 흘린다 — TerminalView 가 정리·여러 줄 확인(PasteCheck)을 그대로 한다 */
export async function termPaste(from: Element | null): Promise<void> {
  const t = find(from);
  if (!t?.textarea) return;
  const text = await navigator.clipboard?.readText().catch(() => "");
  if (!text) return;
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  t.textarea.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}
