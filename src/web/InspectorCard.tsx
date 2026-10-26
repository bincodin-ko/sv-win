// S-1130·S-1131: 웹 인스펙터 카드. 개발자 도구는 카드 안에 박지 않고(WebView2 한계) 별도 창으로 연다.
import { useEffect, useRef, useState } from "react";
import { useScope } from "../board/BoardScope";
import { onWebWindowClosed, webWindowClose, webWindowOpen } from "../lib/ipc";
import { inspectWindow } from "./inspect";
import type { Tab } from "./WebTile";
import { tm, useT } from "../i18n";

export const DOCK_NOTE = tm("Docking isn't available here. DevTools opens in its own window."); // 화면에서 t(DOCK_NOTE)
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return u; } };
const btn: React.CSSProperties = { height: 26, padding: "0 10px", borderRadius: 6, border: "1px solid var(--bd)", background: "var(--panel-2)", color: "var(--fg)", font: "12px system-ui", cursor: "pointer" };

export default function InspectorCard({ id }: { id: string }) {
  const t = useT();
  const { store: useBoard } = useScope();
  const n = useBoard((s) => s.nodes[id]) as unknown as { wireTo?: string; tab?: string } | undefined;
  const tile = useBoard((s) => (n?.wireTo ? s.nodes[n.wireTo] : undefined)) as unknown as { tabs?: Tab[]; active?: string } | undefined;
  const selected = useBoard((s) => s.selection.includes(id));
  const [opened, setOpened] = useState(false);
  const win = useRef("");
  win.current = n?.wireTo ? inspectWindow(n.wireTo) : "";
  // 카드가 지워지면(타일 삭제의 연쇄 포함) 앱이 연 창도 닫는다. 워크스페이스 전환 같은 그냥 사라짐은 노드가 남아 있어 닫지 않는다
  useEffect(() => () => { if (win.current && !useBoard.getState().nodes[id]) void webWindowClose(win.current).catch(() => {}); }, [id, useBoard]);
  // 검사 창을 X 로 닫으면 "열려 있음" 표시도 지운다(Rust window_label 과 같은 이름 규칙)
  useEffect(() => onWebWindowClosed((l) => { if (win.current && l === `inspect-${win.current.replace(/[^A-Za-z0-9_-]/g, "_")}`) setOpened(false); }), []);
  if (!n) return null;
  const tab = tile?.tabs?.find((t) => t.id === n.tab);
  const reattach = () => tile?.active && useBoard.getState().updateNode(id, { tab: tile.active });
  const open = async () => {
    if (!tab?.url || !n.wireTo) return;
    try { await webWindowOpen(inspectWindow(n.wireTo), tab.url); setOpened(true); } catch { /* 창을 못 열면 표시도 안 한다 */ }
  };
  return (
    <div data-testid="inspector-card" data-id={id} onPointerDown={(e) => { if (!selected && !(e.target as Element).closest("[data-node-handle]")) useBoard.getState().select([id]); }}
      style={{ boxSizing: "border-box", width: "100%", height: "100%", display: "flex", flexDirection: "column", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--bd)", color: "var(--fg)", font: "12px system-ui" }}>
      <div data-node-handle style={{ flex: "none", height: 26, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", cursor: "grab", borderBottom: "1px solid var(--bd)" }}>
        <span style={{ font: "600 11px system-ui", color: "var(--mute)" }}>{t("INSPECTOR")}</span>
        <span data-testid="inspector-tab" style={{ color: "var(--mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tab ? hostOf(tab.url) || t("New tab") : t("Tab closed")}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        <div data-testid="inspector-note" style={{ color: "var(--fg-2)" }}>{t(DOCK_NOTE)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button data-testid="inspector-open" disabled={!tab?.url} style={{ ...btn, opacity: tab?.url ? 1 : 0.4 }} onClick={open}>{t("Open in window")}</button>
          {!tab && <button data-testid="inspector-reattach" style={btn} onClick={reattach}>{t("Re-attach")}</button>}
        </div>
        {opened && <div data-testid="inspector-opened" style={{ color: "var(--mute)" }}>{t("DevTools window is open")}</div>}
      </div>
    </div>
  );
}
