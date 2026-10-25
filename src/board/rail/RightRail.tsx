// B14 S-652: 우측 레일 — 2묶음에서는 Presets 버튼 하나. 팝오버: Open the full library · Save current layout · 저장된 Set 들(클릭 = 화면 가운데에 찍기, 우클릭 = Delete preset). 모양은 추측.
import { useEffect, useRef, useState } from "react";
import { useBoardStore, useScope } from "../BoardScope";
import { stampSaved, viewCenter } from "../../presets/deploy";
import SavedItem from "../../presets/SavedItem";
import { captureLayout, nextSetName } from "../../presets/saved";
import { useSaved } from "../../presets/useSaved";
import { useLoops } from "../../loops/store";
import { useShell } from "../../shell/useShell";
import { useUi } from "../../ui/useUi";
import { kindsWith, placeNew } from "../kinds/registry";
import { hasStudio, requestOpenStudio } from "../../studio/useStudio";
import { tm, useT } from "../../i18n";

const itemStyle: React.CSSProperties = { pointerEvents: "auto", textAlign: "left", padding: "6px 10px", border: 0, borderRadius: 6, background: "transparent", color: "var(--text)", font: "13px system-ui", cursor: "pointer" };

export default function RightRail() {
  const t = useT();
  const { visible } = useScope(); // 숨은 워크스페이스의 레일은 그리지 않는다
  const store = useBoardStore();
  const saved = useSaved((s) => s.list);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => void useSaved.getState().load(), []);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", away), document.removeEventListener("keydown", esc));
  }, [open]);
  if (!visible) return null;
  const save = () => {
    const nodes = captureLayout(Object.values(store.getState().nodes));
    if (nodes.length) void useSaved.getState().add({ name: nextSetName(saved), nodes });
  };
  return (
    <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, pointerEvents: "none" }}
      onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      <div ref={ref} style={{ position: "relative", pointerEvents: "auto" }}>
      <button data-testid="rail-presets" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        style={railBtn}>{t("Presets")}</button>
      {open && (
        <div data-testid="rail-presets-menu" role="menu" style={{ position: "absolute", right: "100%", top: 0, marginRight: 8, minWidth: 200, padding: 4, display: "grid", borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 8px 24px var(--scrim-40)" }}>
          <button role="menuitem" style={itemStyle} onClick={() => (setOpen(false), useUi.setState({ presetsOpen: true }))}>{t("Open the full library")}</button>
          <button role="menuitem" style={itemStyle} onClick={() => (setOpen(false), save())}>{t("Save current layout")}</button>
          {saved.map((l) => (
            <SavedItem key={l.name} name={l.name} role="menuitem"
              onPick={() => (setOpen(false), stampSaved(store, l, viewCenter(store)))}
              onDelete={() => (setOpen(false), void useSaved.getState().remove(l.name))} />
          ))}
        </div>
      )}
      </div>
      <InsertTodo />
      <StudioButtons />
      {kindsWith("rail").map((k) => (
        <button key={k.id} data-testid={`rail-insert-${k.id}`} onClick={() => void placeNew(store, k.id)}
          style={railBtn}>{t("Insert {label}", { label: t(k.rail!.label) })}</button>
      ))}
      <LoopsButton />
    </div>
  );
}

// D9 S-1450: 맨 아래 Loops 버튼 + 이 repo 의 켜진 loop 수 배지(0이면 없음)
function LoopsButton() {
  const t = useT();
  const repo = useShell((s) => s.activeRepo);
  const n = useLoops((s) => s.loops.filter((l) => l.enabled && l.repo === repo).length);
  return (
    <button data-testid="rail-loops" onClick={() => useUi.getState().toggleLoops()}
      style={{ ...railBtn, position: "relative" }}>
      {t("Loops")}
      {n > 0 && <span data-testid="rail-loops-badge" style={{ position: "absolute", top: -6, right: -6, minWidth: 16, height: 16, padding: "0 4px", boxSizing: "border-box", borderRadius: 8, background: "var(--accent)", color: "var(--accent-text)", font: "600 10px/16px system-ui", textAlign: "center" }}>{n}</span>}
    </button>
  );
}

// S-807: Presets 아래 "Insert to-do" — 등록된 종류(Checklist·Board·Calendar)만. 없으면 버튼 자체를 안 그린다
function InsertTodo() {
  const t = useT();
  const store = useBoardStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", away), document.removeEventListener("keydown", esc));
  }, [open]);
  const list = kindsWith("insertTodo");
  if (!list.length) return null;
  return (
    <div ref={ref} style={{ position: "relative", pointerEvents: "auto" }}>
      <button data-testid="rail-insert-todo" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        style={railBtn}>{t("Insert to-do")}</button>
      {open && (
        <div data-testid="insert-todo-menu" role="menu" style={{ position: "absolute", right: "100%", top: 0, marginRight: 8, minWidth: 160, padding: 4, display: "grid", borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 8px 24px var(--scrim-40)" }}>
          {list.map((k) => (
            <button key={k.id} role="menuitem" style={itemStyle} onClick={() => (setOpen(false), void placeNew(store, k.id))}>{t(k.insertTodo!.label)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// 5묶음 E1 S-1805: Insert to-do 아래 — Browse project code · Browse markdown docs · Generate PDF(고르면 Documents 를 열고 그 항목만 선택, 만들기는 시작 안 함).
// 버튼은 그 스튜디오가 등록돼 있을 때만 그린다(눌러도 안 되는 UI 금지)
const railBtn: React.CSSProperties = { pointerEvents: "auto", padding: "8px 12px", borderRadius: 8, background: "var(--surface)", color: "var(--fg-2)", border: "1px solid var(--bd)", font: "12px system-ui", cursor: "pointer" };
const PDF_ITEMS = [["overview", tm("Project overview")], ["onboarding", tm("Onboarding guide")], ["architecture", tm("Architecture")], ["ask", tm("Ask for anything")]] as const;
function StudioButtons() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.preventDefault(), setOpen(false));
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", away), document.removeEventListener("keydown", esc));
  }, [open]);
  return (
    <>
      {hasStudio("code") && <button data-testid="rail-code" onClick={() => void requestOpenStudio("code")} style={railBtn}>{t("Browse project code")}</button>}
      {hasStudio("markdown") && <button data-testid="rail-markdown" onClick={() => void requestOpenStudio("markdown")} style={railBtn}>{t("Browse markdown docs")}</button>}
      {hasStudio("documents") && (
        <div ref={ref} style={{ position: "relative", pointerEvents: "auto" }}>
          <button data-testid="rail-pdf" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} style={railBtn}>{t("Generate PDF")}</button>
          {open && (
            <div data-testid="rail-pdf-menu" role="menu" style={{ position: "absolute", right: "100%", top: 0, marginRight: 8, minWidth: 180, padding: 4, display: "grid", borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 8px 24px var(--scrim-40)" }}>
              {PDF_ITEMS.map(([id, label]) => (
                <button key={id} role="menuitem" style={itemStyle} onClick={() => (setOpen(false), void requestOpenStudio("documents", id))}>{t(label)}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
