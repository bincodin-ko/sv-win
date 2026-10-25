import { useEffect, useRef, type RefObject } from "react";

// S-2600~S-2603: 대화상자 공용 훅. 열 때 이전 포커스 저장 → 안으로 포커스 → Tab 가두기 + window 버블 Esc(맨 위 하나, 안쪽이 처리했으면 무시) → 닫을 때 복원.
const stack: object[] = [];
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const tabbables = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];

export function useModal(ref: RefObject<HTMLElement | null>, o: { onClose: () => void; initialFocus?: () => HTMLElement | null | undefined }): void {
  const cur = useRef(o);
  cur.current = o;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const me = {};
    stack.push(me);
    const root = ref.current;
    if (root) (cur.current.initialFocus?.() ?? tabbables(root)[0] ?? root).focus();
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return; // 맨 위 대화상자만
      if (e.key !== "Tab" || !root) return;
      const list = tabbables(root);
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0]!, last = list[list.length - 1]!, a = document.activeElement;
      if (!root.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && (a === first || a === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    };
    // Esc 는 버블 단계: 안쪽 입력란·키 녹화·메뉴·찾기줄이 먼저 받아 stopPropagation 하면 대화상자는 닫지 않는다
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || stack[stack.length - 1] !== me) return;
      e.preventDefault(); e.stopPropagation(); cur.current.onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keydown", onEsc);
      stack.splice(stack.indexOf(me), 1);
      if (prev?.isConnected) prev.focus();
    };
  }, [ref]);
}
