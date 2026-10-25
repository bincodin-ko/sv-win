// 5묶음 E4 S-1871·S-1873·S-1874: 왼쪽 파일 트리(그리기만) + 우클릭/+ 메뉴 + 새 이름 입력줄. 상태는 CodeStudio 가 가진다.
import { useEffect, useRef, type CSSProperties } from "react";
import { useT } from "../../i18n";
import { langOf } from "../../files/highlight";
import type { StudioEntry } from "../../lib/ipc";

export const slash = (p: string) => p.replace(/\\/g, "/");
export const relOf = (root: string, p: string) => slash(p).slice(slash(root).replace(/\/+$/, "").length + 1);

export interface TreeProps {
  root: string;
  dirs: Record<string, StudioEntry[]>;
  open: Set<string>;
  active: string | null;
  sel: { path: string; isDir: boolean } | null;
  onClick: (e: StudioEntry) => void;
  onMenu: (e: StudioEntry, x: number, y: number) => void;
  onPlus: (x: number, y: number) => void;
}

export default function Tree({ root, dirs, open, active, sel, onClick, onMenu, onPlus }: TreeProps) {
  const t = useT();
  const rows = (dir: string, depth: number): React.ReactNode[] =>
    (dirs[dir] ?? []).flatMap((e) => {
      const isOpen = e.isDir && open.has(e.path);
      const on = !e.isDir && e.path === active;
      const style: CSSProperties = {
        display: "flex", alignItems: "center", gap: 6, height: 50, padding: `0 8px 0 ${8 + depth * 14}px`, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        background: on ? "var(--studio-sel)" : "transparent", color: on ? "var(--text)" : "var(--text-dim)", fontWeight: on ? 600 : 400,
        boxShadow: sel?.path === e.path && !on ? "inset 0 0 0 1px var(--studio-line)" : "none",
      };
      return [
        <div key={e.path} data-testid={`tree-${relOf(root, e.path)}`} data-active={on ? "true" : "false"} aria-expanded={e.isDir ? isOpen : undefined} title={e.path}
          style={style} onClick={() => onClick(e)} onContextMenu={(ev) => { ev.preventDefault(); onMenu(e, ev.clientX, ev.clientY); }}>
          <span aria-hidden style={{ width: 12, flex: "none", textAlign: "center", fontSize: 10 }}>{e.isDir ? (isOpen ? "▾" : "▸") : ""}</span>
          <span aria-hidden style={{ flex: "none", width: 20, fontSize: 10, color: "var(--text-dim)" }}>{e.isDir ? "" : langOf(e.name) === "plain" ? "▤" : "</>"}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
        </div>,
        ...(isOpen ? rows(e.path, depth + 1) : []),
      ];
    });
  return (
    <div style={{ font: "13px system-ui", paddingBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "8px 8px 4px 12px", color: "var(--text-dim)", font: "11px system-ui" }}>
        <span style={{ flex: 1, textTransform: "uppercase", letterSpacing: 0.4 }}>{t("Files")}</span>
        <button data-testid="tree-plus" aria-label={t("New")} title={t("New")} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onPlus(r.left, r.bottom + 2); }}
          style={{ width: 24, height: 24, border: 0, borderRadius: 6, background: "transparent", color: "var(--text-dim)", font: "16px/1 system-ui", cursor: "pointer" }}>+</button>
      </div>
      {rows(root, 0)}
    </div>
  );
}

/** 우클릭·+ 메뉴(바깥 누름·Esc 로 닫힘. Esc 는 스튜디오보다 먼저 받는다) */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: { label: string; run: () => void }[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [onClose]);
  return (
    <div ref={ref} role="menu" style={{ position: "fixed", left: x, top: y, zIndex: 9500, minWidth: 190, padding: 4, borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 8px 24px var(--scrim-40)", display: "grid" }}>
      {items.map((it) => (
        <button key={it.label} role="menuitem" onClick={() => { onClose(); it.run(); }}
          style={{ textAlign: "left", padding: "6px 10px", border: 0, borderRadius: 6, background: "transparent", color: "var(--text)", font: "13px system-ui", cursor: "pointer" }}>{it.label}</button>
      ))}
    </div>
  );
}

/** 새 파일·폴더 이름 입력줄(트리 위). Enter 만들기, Esc 취소 */
export function NameInput({ label, error, onSubmit, onCancel }: { label: string; error: string | null; onSubmit: (name: string) => void; onCancel: () => void }) {
  useT();
  return (
    <div style={{ padding: "6px 12px", display: "grid", gap: 4, borderBottom: "1px solid var(--studio-line)" }}>
      <div style={{ color: "var(--text-dim)", font: "11px system-ui", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <input data-testid="new-name" autoFocus spellCheck={false} aria-label={label}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
          else if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit(e.currentTarget.value); }
        }}
        style={{ height: 26, padding: "0 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", font: "13px system-ui", outline: "none" }} />
      {error && <div data-testid="new-name-error" role="alert" style={{ color: "var(--danger)", font: "11px system-ui" }}>{error}</div>}
    </div>
  );
}
