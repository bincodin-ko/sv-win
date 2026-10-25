// 5묶음 E5 S-1921~S-1925: 왼쪽 vault. 위에 "Search files" 와 `+`, 아래 트리(Agent memory 가 맨 위 가상 폴더). 줄을 오른쪽 클릭하거나 ⋯ 를 누르면 파일 메뉴.
import { useEffect, useRef, useState } from "react";
import { tm, useT } from "../../i18n";
import type { TreeNode } from "./vault";

export type FileAction = "open" | "board" | "rename" | "duplicate" | "reveal" | "trash";
export type NewPlace = "repo" | "docs" | "memory";
const MENU: [FileAction, string][] = [["open", tm("Open")], ["board", tm("Add to Board")], ["rename", tm("Rename")], ["duplicate", tm("Duplicate")], ["reveal", tm("Reveal in Explorer")], ["trash", tm("Move to Recycle Bin")]];
const NEW: [NewPlace, string][] = [["repo", tm("New note — repo")], ["docs", tm("New note — docs")], ["memory", tm("New note — Agent memory")]];
const item: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "6px 12px", border: 0, background: "transparent", color: "var(--fg)", font: "13px system-ui", cursor: "pointer" };

function Menu({ x, y, items, onPick, onClose }: { x: number; y: number; items: [string, string][]; onPick: (k: string) => void; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [onClose]);
  return (
    <div ref={ref} role="menu" data-testid="md-menu" onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }}
      style={{ position: "fixed", left: x, top: y, zIndex: 9500, minWidth: 190, padding: 4, background: "var(--surface)", border: "1px solid var(--bd-2)", borderRadius: 8, boxShadow: "0 8px 24px var(--scrim-50)" }}>
      {items.map(([k, label]) => <button key={k} role="menuitem" style={item} onClick={() => { onClose(); onPick(k); }}>{t(label)}</button>)}
    </div>
  );
}

export interface VaultTreeProps {
  tree: TreeNode[];
  results: { path: string; rel: string }[] | null; // 검색어가 있으면 평평한 결과
  query: string;
  setQuery: (q: string) => void;
  openPath: string;
  truncated: boolean;
  renaming: string | null;
  onOpen: (path: string) => void;
  onAction: (a: FileAction, path: string) => void;
  onRename: (path: string, input: string | null) => void;
  onNew: (place: NewPlace) => void;
  creating: NewPlace | null;
  onCreate: (name: string | null) => void;
}

export default function VaultTree(p: VaultTreeProps) {
  const t = useT();
  const [shut, setShut] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; kind: "file" | "new"; path: string } | null>(null);
  const toggle = (path: string) => setShut((s) => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; });
  const openMenu = (e: React.MouseEvent, path: string) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, kind: "file", path }); };

  const row = (path: string, label: string, depth: number, dir?: boolean, virtual?: boolean) => (
    <div key={path} data-testid="md-row" data-path={path} data-virtual={virtual ? "1" : undefined} onContextMenu={dir ? undefined : (e) => openMenu(e, path)}
      onClick={() => (dir ? toggle(path) : p.onOpen(path))}
      style={{ display: "flex", alignItems: "center", gap: 4, padding: `3px 8px 3px ${8 + depth * 14}px`, cursor: "pointer", background: path === p.openPath ? "var(--studio-sel)" : "transparent", whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 12, color: "var(--mute-2)", flex: "none" }}>{dir ? (shut.has(path) ? "▸" : "▾") : ""}</span>
      {p.renaming === path ? (
        <input data-testid="md-rename" autoFocus defaultValue={label} onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) p.onRename(path, e.currentTarget.value); else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); p.onRename(path, null); } }}
          onBlur={() => p.onRename(path, null)} style={{ flex: 1, minWidth: 0, font: "13px system-ui", background: "var(--well)", color: "var(--fg)", border: "1px solid var(--bd-2)", borderRadius: 4 }} />
      ) : <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontWeight: dir ? 600 : 400 }} title={path}>{label}</span>}
      {!dir && <button aria-label={t("More")} title={t("More")} onClick={(e) => openMenu(e, path)} style={{ border: 0, background: "transparent", color: "var(--mute-2)", cursor: "pointer", padding: "0 4px" }}>⋯</button>}
    </div>
  );
  const nodes = (list: TreeNode[], depth: number): React.ReactNode[] => list.flatMap((n) => [
    row(n.path, n.virtual ? t(n.name) : n.name, depth, n.isDir, n.virtual),
    ...(n.isDir && !shut.has(n.path) ? (n.children?.length ? nodes(n.children, depth + 1) : n.empty ? [<div key={n.path + "/empty"} style={{ padding: `3px 8px 3px ${34 + depth * 14}px`, color: "var(--mute-3)" }}>{t(n.empty)}</div>] : []) : []),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 6, padding: 8 }}>
        <input data-testid="md-search" placeholder={t("Search files")} aria-label={t("Search files")} value={p.query} onChange={(e) => p.setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && p.query) { e.preventDefault(); e.stopPropagation(); p.setQuery(""); } }}
          style={{ flex: 1, minWidth: 0, padding: "5px 8px", font: "13px system-ui", background: "var(--well)", color: "var(--fg)", border: "1px solid var(--bd-2)", borderRadius: 6 }} />
        <button data-testid="md-new" aria-label={t("New note")} title={t("New note")} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4, kind: "new", path: "" }); }}
          style={{ width: 28, border: "1px solid var(--bd-2)", borderRadius: 6, background: "var(--surface-2)", color: "var(--fg)", cursor: "pointer", font: "16px/1 system-ui" }}>+</button>
      </div>
      {p.creating && (
        <div style={{ padding: "0 8px 8px" }}>
          <input data-testid="md-new-name" autoFocus placeholder={t("New note name ({place})", { place: p.creating })} onBlur={() => p.onCreate(null)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) p.onCreate(e.currentTarget.value); else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); p.onCreate(null); } }}
            style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", font: "13px system-ui", background: "var(--well)", color: "var(--fg)", border: "1px solid var(--accent)", borderRadius: 6 }} />
        </div>
      )}
      <div data-testid="md-tree" style={{ flex: 1, minHeight: 0, overflow: "auto", paddingBottom: 8 }}>
        {p.results
          ? p.results.length ? p.results.map((r) => row(r.path, r.rel, 0)) : <div style={{ padding: 12, color: "var(--mute-3)" }}>{t("No matches")}</div>
          : nodes(p.tree, 0)}
        {!p.results && p.truncated && <div style={{ padding: "8px 12px", color: "var(--mute-3)" }}>{t("Showing the first 2,000 notes.")}</div>}
      </div>
      {menu && <Menu x={menu.x} y={menu.y} items={menu.kind === "new" ? NEW : MENU} onClose={() => setMenu(null)}
        onPick={(k) => (menu.kind === "new" ? p.onNew(k as NewPlace) : p.onAction(k as FileAction, menu.path))} />}
    </div>
  );
}
