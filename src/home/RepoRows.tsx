// S-310·S-316·S-318·S-319: repo 행 목록. 행 = 이름·브랜치·경로·active 뱃지·⋯ 메뉴. 상태는 HomeScreen 이 갖고 여기는 그리기만.
import { useEffect, useRef, useState } from "react";
import { Item, menuBox, useEscClose, useMenuKeys } from "../board/menus/menuKit";
import type { RepoInfo } from "../board/persist";
import { NAME_MAX, clampName, editResult } from "./repoList";
import { useT } from "../i18n";

export type RowInfo = { branch: string | null; exists: boolean };
type P = {
  repos: RepoInfo[];
  info: Record<string, RowInfo | undefined>;
  selected: string | null;
  active: string | null;
  editing: string | null;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
  onEdit: (path: string | null) => void;
  onRename: (path: string, name: string) => void;
  onRemove: (path: string) => void;
};

function RenameInput({ repo, onDone }: { repo: RepoInfo; onDone: (name: string | null) => void }) {
  const [v, setV] = useState(repo.name);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      data-testid="repo-rename"
      autoFocus
      maxLength={NAME_MAX}
      value={v}
      onChange={(e) => setV(clampName(e.target.value))}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter" || e.key === "Escape") finish(editResult(e.key, v, repo.name));
      }}
      onBlur={() => finish(editResult("Enter", v, repo.name))}
      style={{ font: "inherit", fontWeight: 600, background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--accent)", borderRadius: 4, padding: "1px 4px", width: 220 }}
    />
  );
}

// S-2706: ⋯ 와 우클릭이 같이 쓰는 메뉴. 열면 첫 항목, ↑↓ 이동, Esc 닫기(U3 menuKit)
function RowMenu({ at, onClose, children }: { at: { x: number; y: number }; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref);
  useEscClose(onClose);
  return (
    <div ref={ref} role="menu" onClick={(e) => e.stopPropagation()} style={{ ...menuBox, left: at.x, top: at.y }}>
      {children}
    </div>
  );
}

export default function RepoList(p: P) {
  const t = useT();
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div role="listbox" aria-label={t("Repos")} style={{ display: "grid", gap: 4, width: "100%", minWidth: 0 }}>
      {p.repos.map((r) => {
        const i = p.info[r.path];
        const missing = i?.exists === false;
        const sel = p.selected === r.path;
        return (
          <div
            key={r.path}
            role="option"
            aria-selected={sel}
            data-testid="repo-row"
            data-path={r.path}
            onClick={() => {
              p.onSelect(r.path);
              p.onOpen(r.path);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              const b = e.currentTarget.getBoundingClientRect();
              p.onSelect(r.path);
              setMenu({ path: r.path, x: e.clientX - b.left, y: e.clientY - b.top });
            }}
            style={{
              position: "relative", minWidth: 0, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: missing ? "default" : "pointer",
              background: sel ? "var(--panel-2)" : "var(--panel)", border: `1px solid ${sel ? "var(--accent)" : "var(--border)"}`, opacity: missing ? 0.5 : 1,
            }}
          >
            {p.editing === r.path ? (
              <RenameInput
                repo={r}
                onDone={(n) => {
                  if (n && n !== r.name) p.onRename(r.path, n);
                  p.onEdit(null);
                }}
              />
            ) : (
              <span
                data-testid="repo-name"
                title={t("Double-click to rename")}
                style={{ fontWeight: 600 }}
                onClick={(e) => {
                  // 더블클릭(이름 바꾸기)이 열기에 먼저 먹히지 않게 이름 위 클릭만 잠깐 기다린다
                  e.stopPropagation();
                  p.onSelect(r.path);
                  window.clearTimeout(timer.current);
                  timer.current = window.setTimeout(() => p.onOpen(r.path), 250);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  window.clearTimeout(timer.current);
                  p.onEdit(r.path);
                }}
              >
                {r.name}
              </span>
            )}
            {i?.branch && (
              <span data-testid="repo-branch" style={{ fontSize: 12, padding: "1px 6px", borderRadius: 4, background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}>
                {i.branch}
              </span>
            )}
            {p.active === r.path && (
              <span data-testid="repo-active" style={{ fontSize: 11, padding: "1px 6px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-text)" }}>
                {t("active")}
              </span>
            )}
            {missing && <span style={{ fontSize: 12, color: "var(--warn)" }}>{t("Folder missing")}</span>}
            <span title={r.path} style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.path}</span>
            <button
              data-testid="row-menu"
              className="row-menu"
              aria-label={t("{name} menu", { name: r.name })}
              onClick={(e) => {
                e.stopPropagation();
                const b = e.currentTarget.parentElement!.getBoundingClientRect();
                const c = e.currentTarget.getBoundingClientRect();
                setMenu(menu?.path === r.path ? null : { path: r.path, x: c.right - b.left - 170, y: c.bottom - b.top });
              }}
              style={{ all: "unset", cursor: "pointer", padding: "0 6px", color: "var(--text-dim)", opacity: sel || menu?.path === r.path ? 1 : 0 }}
            >
              ⋯
            </button>
            {menu?.path === r.path && (
              <RowMenu at={menu} onClose={() => setMenu(null)}>
                <Item label="Open" onClick={() => { setMenu(null); p.onOpen(r.path); }} />
                <Item label="Rename" onClick={() => { setMenu(null); p.onEdit(r.path); }} />
                <Item label="Remove" style={{ color: "var(--danger)" }} onClick={() => { setMenu(null); p.onRemove(r.path); }} />
              </RowMenu>
            )}
          </div>
        );
      })}
      <style>{"[data-testid=repo-row]:hover .row-menu,.row-menu:focus-visible{opacity:1 !important}"}</style>
    </div>
  );
}
