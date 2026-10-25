// S-1254~S-1258: 그룹 구역·콘솔 행·호버 아이콘·우클릭 메뉴
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useScope } from "../board/BoardScope";
import { Item, menuBox } from "../board/menus/menuKit";
import { PILL, PILL_FG } from "../board/ConsoleNode";
import { fitBounds } from "../board/viewport";
import { click, idle, isArmed, type KillState } from "../commandbar/killAll";
import { pauseSession, resumeSession } from "../console/pause";
import { getSession, requestRestart } from "../console/session";
import { confirmDialog } from "../ui/ConfirmDialog";
import { useT } from "../i18n";
import { BADGE_LABELS, type Row, type Section } from "./rows";

type Menu = { x: number; y: number; row?: Row; groupId?: string };
const icon: React.CSSProperties = { background: "none", border: 0, color: "var(--fg-4)", cursor: "pointer", padding: "0 5px", font: "12px system-ui" };

export default function Rows({ cardId, sections }: { cardId: string; sections: Section[] }) {
  const t = useT();
  const { wsId, store } = useScope();
  const wired = (store((s) => s.nodes[cardId]?.wired) as string[] | undefined) ?? [];
  const [hover, setHover] = useState<string | null>(null);
  const [kill, setKill] = useState<Record<string, KillState>>({});
  const [menu, setMenu] = useState<Menu | null>(null);
  const close = () => setMenu(null);
  useEffect(() => {
    if (!menu) return;
    const f = (e: PointerEvent) => { if (!(e.target as Element).closest?.('[data-testid^="orch-menu"]')) setMenu(null); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMenu(null); } }; // 메뉴가 열려 있을 때만 Esc 를 가로챈다
    window.addEventListener("pointerdown", f, true);
    window.addEventListener("keydown", k, true);
    return () => { window.removeEventListener("pointerdown", f, true); window.removeEventListener("keydown", k, true); };
  }, [menu]);

  const sess = (id: string) => getSession(wsId, id);
  const focus = (id: string) => {
    const s = store.getState(), n = s.nodes[id];
    if (!n) return;
    const el = document.querySelector<HTMLElement>(`[data-ws="${wsId}"] [data-testid="board"]`);
    s.select([id]);
    s.setViewport(fitBounds({ x: n.x, y: n.y, w: n.w, h: n.h }, { w: el?.clientWidth || window.innerWidth, h: el?.clientHeight || window.innerHeight }));
  };
  const killClick = async (r: Row) => {
    const c = click(kill[r.id] ?? idle, Date.now());
    setKill((k) => ({ ...k, [r.id]: c.state }));
    if (c.ask && (await confirmDialog({ title: t("Kill {name}'s session?", { name: r.name }), confirmLabel: t("Kill"), danger: true }))) sess(r.id)?.kill(); // 콘솔은 보드에 남아 DONE
  };
  const toggleWire = (id: string) => store.getState().toggleWired(cardId, id);
  const toggleGroup = (gid: string, collapsed: boolean) => {
    const cur = (store.getState().nodes[cardId]?.collapsed as string[] | undefined) ?? [];
    store.getState().updateNode(cardId, { collapsed: collapsed ? cur.filter((x) => x !== gid) : [...cur, gid] });
  };
  const openMenu = (e: React.MouseEvent, m: Omit<Menu, "x" | "y">) => {
    e.preventDefault(); e.stopPropagation();
    setMenu({ ...m, x: e.clientX, y: e.clientY });
  };

  const rowView = (r: Row) => {
    const s = sess(r.id);
    const paused = !!s?.isPaused(), running = !!s?.isRunning();
    const armed = isArmed(kill[r.id] ?? idle, Date.now());
    const show = hover === r.id || armed;
    return (
      <div key={r.id} data-testid="orch-row" data-id={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover((h) => (h === r.id ? null : h))}
        onContextMenu={(e) => openMenu(e, { row: r })}
        style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28, padding: "0 8px", borderRadius: 8, background: "var(--surface-2)" }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--fg)" }}>{r.name} <span style={{ color: "var(--fg-4)" }}>· {r.agentName}</span></span>
        {show && (
          <span style={{ display: "flex", alignItems: "center" }}>
            <button data-testid={`orch-focus-${r.id}`} title={t("Focus")} style={icon} onClick={() => focus(r.id)}>◎</button>
            {running && !paused && <button data-testid={`orch-pause-${r.id}`} title={t("Pause")} style={icon} onClick={() => sess(r.id) && pauseSession(sess(r.id)!)}>❚❚</button>}
            {paused && <button data-testid={`orch-resume-${r.id}`} title={t("Resume")} style={icon} onClick={() => sess(r.id) && resumeSession(sess(r.id)!)}>▶</button>}
            {!running && !paused && (r.badge === "done" || r.badge === "error") && <button data-testid={`orch-restart-${r.id}`} title={t("Restart")} style={icon} onClick={() => void requestRestart(r.id, undefined, { wsId, store })}>↻</button>}
            {(running || paused) && <button data-testid={`orch-kill-${r.id}`} title={armed ? t("Confirm?") : t("Kill session")} style={{ ...icon, color: armed ? "var(--danger)" : icon.color }} onClick={() => void killClick(r)}>{armed ? t("Confirm?") : "✕"}</button>}
          </span>
        )}
        <span data-testid="orch-badge" style={{ background: PILL[r.status], color: PILL_FG[r.status], borderRadius: 999, padding: "1px 8px", font: "600 10px system-ui" }}>{t(BADGE_LABELS[r.badge])}</span>
      </div>
    );
  };

  return (
    <>
      {sections.map((sec) => (
        <div key={sec.groupId ?? "loose"} style={{ display: "flex", flexDirection: "column", rowGap: 6 }}>
          {sec.groupId !== null && (
            <button data-testid={`orch-group-${sec.groupId}`} onClick={() => toggleGroup(sec.groupId!, sec.collapsed)} onContextMenu={(e) => openMenu(e, { groupId: sec.groupId! })}
              style={{ textAlign: "left", background: "none", border: 0, padding: "4px 4px 0", color: "var(--fg-4)", font: "600 10px system-ui", letterSpacing: ".06em", cursor: "pointer" }}>
              {sec.collapsed ? "▸" : "▾"} {sec.title}
            </button>
          )}
          {!sec.collapsed && sec.rows.map(rowView)}
        </div>
      ))}
      {menu && createPortal(
        <div role="menu" data-testid="orch-menu" style={{ ...menuBox, left: menu.x, top: menu.y, position: "fixed", zIndex: 20000 }}>
          {menu.row && <Item label={t("Restart session")} data-testid="orch-menu-restart" onClick={() => { void requestRestart(menu.row!.id, undefined, { wsId, store }); close(); }} />}
          {menu.row && wired.includes(menu.row.id) && <Item label={t("Disconnect")} data-testid="orch-menu-disconnect" onClick={() => { toggleWire(menu.row!.id); close(); }} />}
          {menu.groupId && <Item label={t("Disconnect group")} data-testid="orch-menu-disconnect-group" onClick={() => { toggleWire(menu.groupId!); close(); }} />}
        </div>,
        document.body,
      )}
    </>
  );
}
