// S-1300~S-1315 Mission Map: 모달 · 요약 · 필터 칩 · 검색 · 3열 트리와 곡선 · 오른쪽 패널(집계·STRUCTURE·검사창)
import { useEffect, useMemo, useRef, useState } from "react";
import { tm, tp, useT } from "../i18n";
import { agentsList } from "../agents/api";
import { DEFAULT_SCOPE, registry } from "../board/boards";
import { GROUP_PAD, groupBounds, membersOf } from "../board/groups";
import { getSession } from "../console/session";
import { fitBounds } from "../board/viewport";
import { runningLoops } from "../loops/store";
import { useSettings } from "../settings/useSettings";
import { useShell } from "../shell/useShell";
import { openSettings, useUi } from "../ui/useUi";
import Inspector, { STATE_COLOR, STATE_LABEL, type Sel } from "./Inspector";
import Lines from "./lines";
import { missionModel, type Filter, type MModel, type MState } from "./model";

const FILTERS: [Filter, string][] = [["all", tm("All")], ["working", tm("Working")], ["needs", tm("Needs you")], ["idle", tm("Idle")], ["done", tm("Done")]];
const STATES: MState[] = ["working", "needs", "idle", "done"];

/** 지금 보고 있는 워크스페이스의 보드(S-1300). 없으면 기본 저장소 */
function world() {
  const sh = useShell.getState();
  const wsId = sh.openRepos.find((r) => r.path === sh.activeRepo)?.activeWs ?? "";
  return { wsId, store: (wsId ? registry.get(wsId) : undefined) ?? DEFAULT_SCOPE.store };
}
function compute(filter: Filter, query: string, names: Record<string, string>): { m: MModel; wsId: string } {
  const { wsId, store } = world();
  const { nodes, groups } = store.getState();
  const sess = (id: string) => {
    const s = getSession(wsId, id);
    if (!s) return undefined;
    const st = s.status();
    // 끝난 세션(끄기 포함)은 Done. 시작 실패 ERROR 는 그대로
    return { status: !s.isRunning() && st !== "DONE" && st !== "ERROR" ? ("DONE" as const) : st, hooked: s.hooked(), lastOut: s.lastDataAt() };
  };
  return { m: missionModel(nodes, groups ?? [], sess, runningLoops(), { filter, query, now: Date.now(), agentName: (id) => names[id] ?? id }), wsId };
}

/** S-1306: 지도를 닫고 보드 카메라를 그 콘솔(그룹이면 그룹 전체, 카드면 카드)로 옮기고 선택 */
function goTo(s: NonNullable<Sel>) {
  const { store } = world();
  const st = store.getState();
  const n = st.nodes[s.id];
  const ids = s.kind === "group" ? membersOf(st.nodes, s.id).map((x) => x.id) : n ? [s.id] : [];
  const b = s.kind === "group" ? groupBounds(membersOf(st.nodes, s.id), GROUP_PAD) : n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null;
  useUi.getState().closeMission();
  if (!b) return;
  st.select(ids);
  st.setViewport(fitBounds(b, { w: window.innerWidth, h: window.innerHeight }));
}

const box = (selected: boolean, extra: object = {}) => ({ display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", padding: "6px 10px", marginBottom: 8, borderRadius: 8, background: "var(--surface-2)", color: "var(--fg)", font: "12px system-ui", cursor: "pointer", border: `1px solid ${selected ? "var(--accent)" : "var(--bd)"}`, outline: selected ? "1px solid var(--accent)" : "none", ...extra }) as const;
const head = { color: "var(--mute)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 } as const;

export default function MissionMap() {
  const t = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Sel>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [data, setData] = useState(() => compute("all", "", {}));
  const last = useRef(JSON.stringify(data));
  const host = useRef<HTMLDivElement>(null);
  const liveOn = useSettings((s) => s.s.liveStatus === true);
  useEffect(() => void agentsList().then((l) => setNames(Object.fromEntries(l.map((a) => [a.id, a.name])))), []);
  // S-1312: 0.5초마다 다시 읽는다(GroupHalo 와 같은 방식). 달라진 때만 그림을 바꾼다
  useEffect(() => {
    const read = () => {
      const next = compute(filter, query, names);
      const j = JSON.stringify(next);
      if (j !== last.current) { last.current = j; setData(next); }
    };
    read();
    const t = setInterval(read, 500);
    return () => clearInterval(t);
  }, [filter, query, names]);
  const { m, wsId } = data;
  const lines = useMemo(() => m.lines, [m]);
  const pick = (kind: NonNullable<Sel>["kind"], id: string) => setSel({ kind, id });
  const go = (k: NonNullable<Sel>["kind"], id: string) => goTo({ kind: k, id });
  const close = () => useUi.getState().closeMission();

  return (
    <div data-testid="mission-backdrop" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.target === e.currentTarget && close()}
      style={{ position: "fixed", inset: 0, zIndex: 9000, background: "var(--scrim-50)", display: "grid", placeItems: "center", font: "12px system-ui", color: "var(--fg)" }}>
      <div data-testid="mission-map" aria-label={t("Mission Map")} style={{ boxSizing: "border-box", width: "min(1100px, 96vw)", height: "min(720px, 94vh)", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--bd)" }}>
          <span data-testid="mm-summary" style={{ fontWeight: 600, fontSize: 13 }}>{m.summary}</span>
          <span style={{ flex: 1 }} />
          <button data-testid="mm-close" aria-label={t("Close Mission Map")} onClick={close} style={{ background: "none", border: "none", color: "var(--fg)", cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "8px 14px", borderBottom: "1px solid var(--bd)" }}>
          {FILTERS.map(([f, text]) => (
            <button key={f} data-testid={`mm-filter-${f}`} aria-pressed={filter === f} onClick={() => setFilter(f)}
              style={{ padding: "3px 14px", borderRadius: 12, border: "1px solid var(--bd)", background: filter === f ? "var(--accent)" : "var(--surface-2)", color: filter === f ? "var(--accent-text)" : "var(--fg)", cursor: "pointer", font: "12px system-ui" }}>{t(text)}</button>
          ))}
          <input data-testid="mm-search" value={query} placeholder={t("Find a console or team")} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") close(); e.stopPropagation(); }}
            style={{ width: 190, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--bd)", background: "var(--well)", color: "var(--fg)", font: "12px system-ui" }} />
        </div>
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {m.empty ? (
            <div data-testid="mm-empty" style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--mute)" }}>{t("Nothing to map yet")}</div>
          ) : (
            <div data-testid="mm-scroll" style={{ flex: 1, overflow: "auto", padding: 16 }}>
              <div ref={host} style={{ position: "relative", display: "flex", gap: 90, alignItems: "flex-start" }}>
                <Lines lines={lines} host={host} />
                <div style={{ width: 150, flex: "none" }}>
                  <div style={head}>{t("Command bar")}</div>
                  <div data-testid="mm-cmd" data-mm="cmd" style={box(false, { cursor: "default", fontWeight: 600 })}>{t("Command bar")}</div>
                  {m.cards.map((k) => (
                    <button key={k.id} data-testid="mm-card" data-id={k.id} data-mm={`card:${k.id}`} data-selected={sel?.kind === "card" && sel.id === k.id} style={box(sel?.kind === "card" && sel.id === k.id)}
                      onClick={() => pick("card", k.id)} onDoubleClick={() => go("card", k.id)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go("card", k.id); } }}>
                      <div style={{ fontWeight: 600 }}>{k.name}</div><div style={{ color: "var(--mute)" }}>{tp("{n} agent", "{n} agents", k.agents)}</div>
                    </button>
                  ))}
                </div>
                <div style={{ width: 170, flex: "none" }}>
                  <div style={head}>{t("Teams")}</div>
                  {m.groups.map((g) => (
                    <button key={g.id} data-testid="mm-group" data-id={g.id} data-mm={`group:${g.id}`} data-selected={sel?.kind === "group" && sel.id === g.id} style={box(sel?.kind === "group" && sel.id === g.id)}
                      onClick={() => pick("group", g.id)} onDoubleClick={() => go("group", g.id)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go("group", g.id); } }}>
                      <div style={{ fontWeight: 600 }}>{g.name}</div><div style={{ color: "var(--mute)" }}>{g.working}/{g.total}</div>
                    </button>
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={head}>{t("Consoles")}</div>
                  {m.consoles.map((c) => {
                    const on = sel?.kind === "con" && sel.id === c.id;
                    return (
                      <button key={c.id} data-testid="mm-console" data-id={c.id} data-mm={`con:${c.id}`} data-state={c.state} data-selected={on} style={box(on, { display: "flex", alignItems: "center", gap: 8 })}
                        onClick={() => pick("con", c.id)} onDoubleClick={() => go("con", c.id)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go("con", c.id); } }}>
                        <span data-testid="mm-dot" data-glow={c.glow} style={{ width: 8, height: 8, borderRadius: 4, flex: "none", background: STATE_COLOR[c.state], boxShadow: c.glow ? `0 0 0 3px ${STATE_COLOR[c.state]}55` : "none", transition: "box-shadow .3s" }} />
                        <span style={{ minWidth: 0 }}><div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div><div style={{ color: "var(--mute)" }}>{c.sub}</div></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <div data-testid="mm-side" style={{ width: 280, flex: "none", borderLeft: "1px solid var(--bd)", padding: 14, overflow: "auto" }}>
            <div style={{ borderBottom: "1px solid var(--bd)", marginBottom: 14, paddingBottom: 12 }}>
              <Inspector sel={sel} model={m} wsId={wsId} onGo={goTo} />
            </div>
            <div style={head}>{t("Status")}</div>
            {STATES.map((s) => (
              <div key={s} data-testid={`mm-agg-${s}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: STATE_COLOR[s] }} /><span style={{ flex: 1 }}>{t(STATE_LABEL[s])}</span><span>{m.counts[s]}</span>
              </div>
            ))}
            <div style={{ ...head, marginTop: 14 }}>{t("Structure")}</div>
            {([["orchestrators", tm("Orchestrators")], ["teams", tm("Teams")], ["consoles", tm("Consoles")], ["loops", tm("Active loops")]] as const).map(([k, text]) => (
              <div key={k} data-testid={`mm-struct-${k}`} style={{ display: "flex", padding: "3px 0" }}><span style={{ flex: 1 }}>{t(text)}</span><span>{m.structure[k]}</span></div>
            ))}
          </div>
        </div>
        {!liveOn && (
          <div data-testid="mm-live-note" style={{ padding: "6px 14px", borderTop: "1px solid var(--bd)", color: "var(--mute)" }}>
            {t("States come from output. Turn on live agent status for Needs you and Idle.")}{" "}
            <a data-testid="mm-settings-link" href="#" style={{ color: "var(--accent)" }} onClick={(e) => { e.preventDefault(); close(); openSettings("agents"); }}>{t("Open Settings")}</a>
          </div>
        )}
      </div>
    </div>
  );
}
