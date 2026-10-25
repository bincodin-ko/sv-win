// S-335·S-336·S-337: 워크스페이스 탭 — 누르면 전환, 더블클릭 이름 바꾸기(24자), ×로 닫기(하나뿐이면 숨김), + 로 더하기
import { useEffect, useRef, useState } from "react";
import { MenuItem } from "./Menu";
import { useShell } from "./useShell";
import { MAX_NAME, canCloseWorkspace, closeWorkspaceFlow, createWorkspace, renameWorkspace, switchWorkspace, useRepoList } from "./workspaces";
import { useT } from "../i18n";

const EMPTY: never[] = [];

export default function Tabs() {
  const t = useT();
  const path = useShell((s) => s.activeRepo);
  const activeWs = useShell((s) => s.openRepos.find((r) => r.path === s.activeRepo)?.activeWs);
  const list = useRepoList((s) => s.repos.find((r) => r.path === path)?.workspaces ?? EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const refocus = useRef<string | null>(null); // Enter/Esc 로 이름 입력을 끝내면 키보드를 그 탭으로 돌려준다
  useEffect(() => {
    if (editing || !refocus.current) return;
    document.querySelector<HTMLElement>(`[data-testid="tab"][data-tab-id="${refocus.current}"]`)?.focus();
    refocus.current = null;
  }, [editing]);
  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => !(e.target as Element).closest('[data-testid="tab-menu"]') && setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [menu]);
  if (!path) return null;
  const done = (id: string, value: string, save: boolean) => {
    setEditing(null);
    if (save) void renameWorkspace(path, id, value);
  };
  // S-2624: 화살표·Home/End 는 포커스만 옮기고(전환은 Enter/Space), F2 이름 바꾸기, Delete 닫기
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, w: { id: string }) => {
    if (e.target !== e.currentTarget) return;
    const els = [...e.currentTarget.parentElement!.querySelectorAll<HTMLElement>('[role="tab"]')];
    const i = els.indexOf(e.currentTarget);
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? els.length - 1 : null;
    if (to !== null) { e.preventDefault(); els[(to + els.length) % els.length]!.focus(); }
    else if (e.key === "F2") { e.preventDefault(); setEditing(w.id); }
    else if (e.key === "Delete") { e.preventDefault(); void closeWorkspaceFlow(path, w.id); }
  };
  return (
    <div role="tablist" style={{ display: "flex", gap: 4, alignItems: "center", minWidth: 0 }}>
      {list.map((w) => (
        <button key={w.id} data-testid="tab" data-tab-id={w.id} role="tab" aria-selected={w.id === activeWs} tabIndex={w.id === activeWs ? 0 : -1}
          onClick={() => switchWorkspace(path, w)} onDoubleClick={() => setEditing(w.id)} onKeyDown={(e) => onTabKey(e, w)}
          onContextMenu={(e) => { e.preventDefault(); setMenu({ id: w.id, x: e.clientX, y: e.clientY }); }}
          style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 8px", borderRadius: 6, cursor: "pointer", font: "12px system-ui", color: "var(--text)", background: w.id === activeWs ? "var(--panel-2)" : "transparent", border: `1px solid ${w.id === activeWs ? "var(--accent)" : "var(--border)"}` }}>
          {editing === w.id ? (
            <input data-testid="tab-rename" autoFocus defaultValue={w.name} maxLength={MAX_NAME} size={Math.max(8, w.name.length)} onClick={(e) => e.stopPropagation()} onFocus={(e) => e.target.select()}
              onBlur={(e) => done(w.id, e.target.value, true)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.nativeEvent.isComposing) return; if (e.key === "Enter") { refocus.current = w.id; done(w.id, e.currentTarget.value, true); } else if (e.key === "Escape") { refocus.current = w.id; done(w.id, "", false); } }} />
          ) : (
            <span data-testid="tab-name">{w.name}</span>
          )}
          {canCloseWorkspace(list.length) && (
            // button 안의 button 은 못 쓰니 span role=button. 키보드는 탭에서 Delete 로 닫는다. 눌리는 영역 24×24(S-2627)
            <span data-testid="tab-close" role="button" aria-label={t("Close {name}", { name: w.name })} onClick={(e) => { e.stopPropagation(); void closeWorkspaceFlow(path, w.id); }} onDoubleClick={(e) => e.stopPropagation()}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, margin: "-2px -6px -2px -2px", boxSizing: "border-box", color: "var(--text-dim)", cursor: "pointer" }}>×</span>
          )}
        </button>
      ))}
      {menu && (
        <div data-testid="tab-menu" role="menu" style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 9600, minWidth: 140, padding: 4, display: "grid", borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 8px 24px var(--scrim-40)" }}>
          <MenuItem onClick={() => { const id = menu.id; setMenu(null); setEditing(id); }}>{t("Rename")}</MenuItem>
          {canCloseWorkspace(list.length) && <MenuItem onClick={() => { const id = menu.id; setMenu(null); void closeWorkspaceFlow(path, id); }}>{t("Close")}</MenuItem>}
        </div>
      )}
      <button data-testid="tab-add" aria-label={t("New workspace")} onClick={() => void createWorkspace(path)} style={{ height: 26, width: 26, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer" }}>+</button>
    </div>
  );
}
