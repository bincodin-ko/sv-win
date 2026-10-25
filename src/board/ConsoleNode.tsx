import { memo, useEffect, useRef, useState } from "react";
import AgentPicker from "../console/AgentPicker";
import { getRepoPath } from "../console/offers";
import ResumeBanner from "../console/ResumeBanner";
import { editName } from "../console/names";
import { createSession, requestClose, requestRestart, type Session } from "../console/session";
import type { Status } from "../console/status";
import { shouldOffer } from "../output/reply";
import { setReply, useOutputs } from "../output/useOutputs";
import { sessionKey } from "../console/sessionKey";
import { useUi } from "../ui/useUi";
import { createTerminal, type TermHandle } from "../terminal/TerminalView";
import { useScope } from "./BoardScope";
import { CONSOLE_MIN_H, CONSOLE_MIN_W, isConsole } from "./store";
import { GAP } from "./placement";
import { useSettings } from "../settings/useSettings";
import { useLive } from "../livestatus/useLive";
import { useT } from "../i18n";
import { isImeEvent } from "../commandbar/ime";
import { statusLabel } from "./statusLabel";
import { initials } from "../profiles/profiles";
import { useProfiles } from "../profiles/useProfiles";
import { bump } from "../perf/renderCount";
import { useLowSpec } from "../perf/lowSpec";

export const PILL: Record<Status, string> = { IDLE: "#6b7280", STARTING: "#d4a017", WORKING: "#3b82f6", RUNNING: "#22a55b", DONE: "#6b7280", ERROR: "#dc2626", PAUSED: "#a855f7", "NEEDS YOU": "#f59e0b", READY: "#14b8a6" }; // theme-fixed
/** S-2662: pill 글자색(배경 위 대비 4.5 이상). 흰 글자 = IDLE·DONE·ERROR, 나머지는 어두운 글자 */
export const PILL_FG: Record<Status, string> = { IDLE: "#fff", STARTING: "#111", WORKING: "#111", RUNNING: "#111", DONE: "#fff", ERROR: "#fff", PAUSED: "#111", "NEEDS YOU": "#111", READY: "#111" }; // theme-fixed
const HANDLES = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
const handleStyle = (h: string): React.CSSProperties => {
  const S = 10;
  const st: React.CSSProperties = { position: "absolute", width: S, height: S, zIndex: 5, touchAction: "none" };
  const c = h.length === 2;
  if (h.includes("n")) st.top = -S / 2; else if (h.includes("s")) st.bottom = -S / 2; else { st.top = S / 2; st.bottom = S / 2; st.height = "auto"; }
  if (h.includes("w")) st.left = -S / 2; else if (h.includes("e")) st.right = -S / 2; else { st.left = S / 2; st.right = S / 2; st.width = "auto"; }
  st.cursor = h === "n" || h === "s" ? "ns-resize" : h === "e" || h === "w" ? "ew-resize" : h === "ne" || h === "sw" ? "nesw-resize" : "nwse-resize";
  if (c) { st.width = S * 1.6; st.height = S * 1.6; if (h.includes("n")) st.top = -S * 0.8; else st.bottom = -S * 0.8; if (h.includes("w")) st.left = -S * 0.8; else st.right = -S * 0.8; }
  return st;
};
const iconBtn: React.CSSProperties = { background: "none", border: 0, color: "var(--fg-4)", cursor: "pointer", padding: "2px 6px", font: "13px system-ui" };

function ConsoleNode({ id }: { id: string }) {
  bump("ConsoleNode");
  const low = useLowSpec(); // 저사양: 흐린 그림자 끔(줌마다 다시 래스터하는 비용)
  const t = useT();
  const { wsId, store: useBoard } = useScope();
  const sc = { wsId, store: useBoard };
  const node = useBoard((s) => s.nodes[id]);
  const body = useRef<HTMLDivElement>(null);
  const term = useRef<TermHandle | null>(null);
  const session = useRef<Session | null>(null);
  const [status, setStatus] = useState<Status>("STARTING");
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const detail = useLive((s) => s.detail[sessionKey(wsId, id)]); // B16 S-687: hook 이 알려 준 하는 일
  const reply = useOutputs((s) => s.replies[sessionKey(wsId, id)]); // B15 S-660
  const prevStatus = useRef<Status>("STARTING");
  // D12 S-1627: 계정(프로필)을 쓰는 콘솔의 배지에 이니셜 1~2자
  const profileId = isConsole(node) ? node.profile : undefined;
  const profileName = useProfiles((s) => s.list.find((p) => p.id === profileId && p.agent === (isConsole(node) ? node.agentId : ""))?.name);
  const profileTag = profileName ? initials(profileName) : "";
  useEffect(() => {
    if (profileId) void useProfiles.getState().load();
  }, [profileId]);

  useEffect(() => {
    const el = body.current!;
    const n = useBoard.getState().nodes[id];
    const t = createTerminal(el);
    term.current = t;
    session.current = createSession({ nodeId: id, term: t.term, agentId: isConsole(n) ? n.agentId : "shell", cwd: getRepoPath(wsId), onStatus: setStatus, wsId, store: useBoard });
    return () => {
      session.current?.dispose();
      t.dispose();
      session.current = term.current = null;
      setReply(wsId, id, null);
    };
  }, [id, wsId, useBoard]);

  // B15 S-660: 일하는 동안(WORKING)은 숨기고, WORKING 을 벗어나 쉬면 마친 답을 가져온다. 다시 시작하면 지운다
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (status === "STARTING" || status === "WORKING") return setReply(wsId, id, null);
    if (status === "READY" && useOutputs.getState().replies[sessionKey(wsId, id)]) return; // D4: Stop 이 준 답이 이미 있다
    if (was !== "WORKING" || (status !== "RUNNING" && status !== "DONE" && status !== "READY")) return; // D4: 라이브 상태면 READY
    let live = true;
    void session.current?.fetchReply().then((t) => live && setReply(wsId, id, t));
    return () => void (live = false);
  }, [status, wsId, id]);

  // S-2660: F2(Board 가 보내는 이벤트)가 자기 id 면 더블클릭과 같은 이름 입력을 연다
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent<{ id: string }>).detail?.id === id) setEditing(true); };
    window.addEventListener("symvibe:rename-console", on);
    return () => window.removeEventListener("symvibe:rename-console", on);
  }, [id]);

  const textSize = node && isConsole(node) ? node.textSize : null;
  const globalSize = useSettings((s) => s.s.textSize);
  useEffect(() => term.current?.setTextSize(textSize), [textSize, globalSize]); // S-073·S-363

  if (!isConsole(node)) return null;

  // S-063: 가장자리·모서리 끌기
  const startResize = (h: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const z = useBoard.getState().viewport.zoom;
    const s0 = { x: node.x, y: node.y, w: node.w, h: node.h, px: e.clientX, py: e.clientY };
    let began = false;
    const move = (m: PointerEvent) => {
      if (!began) { began = true; useBoard.getState().commit(); } // 되돌리기: 끌기 1번 = 1단계
      const dx = (m.clientX - s0.px) / z, dy = (m.clientY - s0.py) / z;
      let { x, y, w, h: hh } = s0;
      if (h.includes("e")) w = Math.max(CONSOLE_MIN_W, s0.w + dx);
      if (h.includes("w")) { w = Math.max(CONSOLE_MIN_W, s0.w - dx); x = s0.x + s0.w - w; }
      if (h.includes("s")) hh = Math.max(CONSOLE_MIN_H, s0.h + dy);
      if (h.includes("n")) { hh = Math.max(CONSOLE_MIN_H, s0.h - dy); y = s0.y + s0.h - hh; }
      useBoard.getState().updateNode(id, { x, y, w, h: hh });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      requestAnimationFrame(() => term.current?.fit()); // 놓을 때 1번 확정
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const commitName = (v: string) => {
    const used = Object.values(useBoard.getState().nodes).flatMap((n) => (isConsole(n) && n.id !== id ? [n.name] : []));
    const next = editName(v, used);
    if (next) {
      if (next !== node.name) useBoard.getState().commit();
      useBoard.getState().updateNode(id, { name: next });
    }
    setEditing(false);
  };

  const duplicate = () => useBoard.getState().spawnConsole(node.agentId, { x: node.x + node.w + GAP, y: node.y }, { textSize: node.textSize, profile: node.profile }); // S-067: 기준점 = 원본 오른쪽

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "var(--well)", border: "1px solid var(--bd)", borderRadius: 10, boxShadow: low ? "none" : "0 6px 24px var(--scrim-50)", font: "12px system-ui", color: "var(--fg-2)" }} data-testid="console">
      <div data-node-handle style={{ display: "flex", alignItems: "center", gap: 8, height: 32, padding: "0 8px", borderBottom: "1px solid var(--surface-2)", flex: "none", userSelect: "none", position: "relative" }}>
        <button data-testid="console-badge" title={node.agentId} onClick={() => setPicker((p) => !p)}
          style={{ position: "relative", width: 20, height: 20, borderRadius: 6, border: 0, background: "var(--chip)", color: "var(--on-fill)", font: "600 11px system-ui", cursor: "pointer" }}>
          {node.agentId.charAt(0).toUpperCase()}
          {profileTag && <span data-testid="console-badge-initials" style={{ position: "absolute", right: -5, bottom: -5, padding: "0 2px", borderRadius: 4, background: "var(--surface-2)", color: "var(--fg)", font: "600 8px/11px system-ui" }}>{profileTag}</span>}
        </button>
        {picker && (
          <AgentPicker current={node.agentId} profile={node.profile} onClose={() => setPicker(false)}
            onPick={(a) => { setPicker(false); void requestRestart(id, a, sc); }}
            onAccount={(p) => { setPicker(false); if ((p ?? undefined) !== node.profile) void requestRestart(id, undefined, sc, p); }} />
        )}
        {editing ? (
          <input data-testid="console-name-input" autoFocus maxLength={23} defaultValue={node.name}
            style={{ width: 140, background: "var(--surface)", color: "var(--fg)", border: "1px solid var(--bd-2)", borderRadius: 4, font: "inherit", padding: "1px 4px" }}
            onKeyDown={(e) => { e.stopPropagation(); if (isImeEvent(e)) return; if (e.key === "Enter") commitName(e.currentTarget.value); else if (e.key === "Escape") setEditing(false); }}
            onBlur={(e) => editing && commitName(e.currentTarget.value)} />
        ) : (
          <span data-testid="console-name" style={{ fontWeight: 600 }}
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>{node.name}</span>
        )}
        {node.yolo && <span data-testid="console-yolo" style={{ background: "var(--danger-2)", color: "var(--on-fill)", borderRadius: 4, padding: "0 5px", font: "700 10px system-ui" }}>YOLO</span>}
        <span style={{ flex: 1 }} />
        {reply && shouldOffer(reply) && status !== "WORKING" && (
          <button data-testid="console-output" title={t("See output")} aria-label={t("See output")} style={iconBtn}
            onClick={() => useUi.setState({ outputViewer: { open: true, nodeId: id, wsId } })}>▤</button>
        )}
        <span data-testid="console-status" data-status={status} title={status === "PAUSED" ? t("Paused") : detail} style={{ background: PILL[status], color: PILL_FG[status], borderRadius: 999, padding: "1px 8px", font: "600 10px system-ui", letterSpacing: ".04em" }}>{statusLabel(status)}</span>
        <button data-testid="console-restart" title={t("Restart")} aria-label={t("Restart")} style={iconBtn} onClick={() => void requestRestart(id, undefined, sc)}>↻</button>
        <button data-testid="console-duplicate" title={t("Duplicate")} aria-label={t("Duplicate")} style={iconBtn} onClick={duplicate}>⧉</button>
        <button data-testid="console-close" title={t("Close")} aria-label={t("Close")} style={iconBtn} onClick={() => void requestClose([id], sc)}>✕</button>
      </div>
      <ResumeBanner id={id} />
      <div ref={body} data-wheel-own style={{ flex: 1, minHeight: 0, overflow: "hidden", borderRadius: "0 0 10px 10px" }}
        onDoubleClick={() => term.current?.term.focus()} />
      {HANDLES.map((h) => <div key={h} data-handle={h} style={handleStyle(h)} onPointerDown={startResize(h)} />)}
    </div>
  );
}

export default memo(ConsoleNode); // P1: Board 가 다시 그려져도 id 가 같으면 건너뜀
