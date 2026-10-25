// 상단 바 드롭다운 공용: 버튼 + 메뉴(바깥 클릭·Esc 로 닫힘). 항목은 MenuItem.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export const chipStyle: CSSProperties = { height: 26, padding: "0 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", font: "12px system-ui", cursor: "pointer" };

/**
 * S-2640·S-2641: 메뉴 키보드. 항목(role=menuitem) 사이를 옮긴다 — ↑↓(ring 이면 ←→ 도) 이전/다음(끝에서 순환), Home/End.
 * Enter·Space 는 항목이 button 이라 기본 동작이 누른다. 처리했으면 true
 */
export function menuNavKey(e: KeyboardEvent, root: HTMLElement, ring = false): boolean {
  const items = [...root.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  if (!items.length || e.ctrlKey || e.altKey || e.metaKey) return false;
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === "ArrowDown" || (ring && e.key === "ArrowRight");
  const prev = e.key === "ArrowUp" || (ring && e.key === "ArrowLeft");
  const to = next ? (i + 1) % items.length : prev ? (i <= 0 ? items.length - 1 : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
  if (to < 0) return false;
  e.preventDefault();
  e.stopPropagation();
  items[to]!.focus({ preventScroll: true });
  return true;
}

export function Menu({ testId, label, children }: { testId: string; label: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }); // S-2640: 열면 첫 항목
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } // 닫으면 단추로 복원
      else if (ref.current?.contains(e.target as Node)) menuNavKey(e, ref.current);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button ref={btn} data-testid={testId} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} style={chipStyle}>{label}</button>
      {open && (
        <div role="menu" style={{ position: "absolute", top: 30, left: 0, minWidth: 180, padding: 4, borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 8px 24px var(--scrim-40)", display: "grid", zIndex: 1 }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export const MenuItem = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button role="menuitem" onClick={onClick} style={{ textAlign: "left", padding: "6px 10px", border: 0, borderRadius: 6, background: "transparent", color: "var(--text)", font: "13px system-ui", cursor: "pointer" }}>{children}</button>
);
export const MenuHeader = ({ children }: { children: ReactNode }) => (
  <div style={{ padding: "6px 10px 2px", color: "var(--text-dim)", font: "11px system-ui" }}>{children}</div>
);
