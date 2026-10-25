import { useEffect, useState, type RefObject } from "react";
import { useT } from "../../i18n";
import { menuNavKey } from "../../shell/Menu";

// 메뉴·flyout 공용: role="menu"(Esc 순서 S-031), 항목 모양, Esc 로 닫기
export const menuBox: React.CSSProperties = { position: "absolute", zIndex: 30, minWidth: 170, background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 8, padding: 4, font: "12px system-ui", color: "var(--fg-2)", boxShadow: "0 6px 24px var(--scrim-50)" };
export const itemStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, width: "100%", textAlign: "left", padding: "5px 8px", border: 0, borderRadius: 4, background: "none", color: "inherit", font: "inherit", cursor: "pointer" };

type ItemProps = { label: string; title?: string; onClick: () => void; extra?: React.ReactNode; style?: React.CSSProperties; [k: `data-${string}`]: string | undefined };
// label 은 영어 문장 — 그릴 때 번역한다(사전에 없으면 에이전트 이름처럼 그대로)
export function Item({ label, title, onClick, extra, style, ...rest }: ItemProps) {
  const t = useT();
  return (
    <button role="menuitem" title={title} {...rest} style={{ ...itemStyle, ...style }} onClick={onClick}>
      <span>{t(label)}</span>
      {extra != null && <span aria-hidden>{extra}</span>}
    </button>
  );
}

/** Esc 하나 = 메뉴 닫기. 콘솔이 키보드를 가졌어도 셸로 새지 않게 막는다 */
export function useEscClose(onClose: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
}

/**
 * S-2640·S-2641: 열면 첫 항목에 포커스(again 이 바뀌면 다시 — 하위 메뉴로 들어갔을 때), 키로 항목 이동(menuNavKey),
 * Esc 로 닫으면 열기 전 포커스 요소로 복원. ring = 링 메뉴(←→ 도 이전/다음)
 */
export function useMenuKeys(ref: RefObject<HTMLElement | null>, again: unknown = null, ring = false) {
  const [prev] = useState(() => { return document.activeElement as HTMLElement | null; }); // 그리는 때 잡는다(StrictMode 가 효과를 두 번 돌려도 첫 항목이 아니라 열기 전 요소)
  useEffect(() => {
    let esc = false;
    const mark = (e: KeyboardEvent) => { if (e.key === "Escape") esc = true; };
    const nav = (e: KeyboardEvent) => ref.current && void menuNavKey(e, ref.current, ring);
    window.addEventListener("keydown", mark, true);
    const el = ref.current;
    el?.addEventListener("keydown", nav);
    return () => {
      window.removeEventListener("keydown", mark, true);
      el?.removeEventListener("keydown", nav);
      if (esc && prev && prev !== document.body && prev.isConnected) prev.focus();
    };
  }, []);
  useEffect(() => void ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }), [again]);
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
