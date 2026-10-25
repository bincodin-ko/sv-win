// S-1100~S-1115: 웹 타일. 머리줄(끌기·기기 크기) + 탭 줄 + 툴바 + 본문(iframe 들) + 덮개.
import { useCallback, useEffect, useRef, useState } from "react";
import { useScope } from "../board/BoardScope";
import { openUrl } from "../lib/ipc";
import { DeviceMenu, MoreMenu } from "./menus";
import { DEVICES } from "./devices";
import { backHist, canBack, canForward, curHist, forwardHist, newHist, pushHist, type Hist } from "./history";
import TabPane, { type Cmd } from "./TabPane";
import { inspectTile } from "./inspect";
import { normalizeUrl } from "./url";
import { useT } from "../i18n";

export type Tab = { id: string; url: string };
export const MAX_TABS = 12;
export const newTabId = () => `t${Math.random().toString(36).slice(2, 8)}`;
const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };
const bar: React.CSSProperties = { flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 6px", borderBottom: "1px solid var(--bd)", font: "12px system-ui" };
const tb: React.CSSProperties = { width: 24, height: 24, border: 0, borderRadius: 4, background: "none", color: "var(--fg-2)", cursor: "pointer", font: "14px system-ui", padding: 0 };

export default function WebTile({ id }: { id: string }) {
  const t = useT();
  const { store: useBoard } = useScope();
  const n = useBoard((s) => s.nodes[id]) as unknown as { w: number; tabs?: Tab[]; active?: string; zoom?: number; device?: string | null; auto?: boolean } | undefined;
  const selected = useBoard((s) => s.selection.includes(id));
  const tool = useBoard((s) => s.tool);
  const vz = useBoard((s) => s.viewport.zoom);
  const tabs = n?.tabs?.length ? n.tabs : [{ id: "t0", url: "" }];
  const active = tabs.find((t) => t.id === n?.active) ?? tabs[0]!;
  const zoom = n?.zoom ?? 100;
  const device = DEVICES.find((d) => d.id === n?.device) ?? null;
  const patch = (p: Record<string, unknown>) => useBoard.getState().updateNode(id, p);

  const [hist, setHist] = useState<Record<string, Hist>>({});
  const [cmds, setCmds] = useState<Record<string, Cmd>>({});
  const [loadingTabs, setLoadingTabs] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [menu, setMenu] = useState<null | "device" | "more">(null);
  const [live, setLive] = useState(false); // 덮개가 걷힌 상태(S-1112)
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const onLoading = useCallback((t: string, v: boolean) => setLoadingTabs((m) => (m[t] === v ? m : { ...m, [t]: v })), []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setAvail({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setDraft(null); setErr(""); }, [active.id, active.url]);
  useEffect(() => { if (!selected) setLive(false); }, [selected]);
  useEffect(() => {
    if (!live) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setLive(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [live]);
  if (!n) return null;

  const setTabs = (next: Tab[], act: string) => patch({ tabs: next, active: act });
  const h = (t: Tab) => hist[t.id] ?? newHist(t.url);
  // 주소를 옮기면 auto 해제(S-1141)
  const setUrl = (t: Tab, u: string) => patch({ tabs: tabs.map((x) => (x.id === t.id ? { ...x, url: u } : x)), active: active.id, ...(n.auto ? { auto: undefined } : {}) });
  const navigate = (u: string) => { setHist({ ...hist, [active.id]: pushHist(h(active), u) }); setUrl(active, u); };
  const move = (f: (x: Hist) => Hist) => { const nh = f(h(active)); setHist({ ...hist, [active.id]: nh }); setUrl(active, curHist(nh)); };
  const submit = (text: string) => {
    const r = normalizeUrl(text);
    if (!r.ok) return setErr(r.error);
    setErr("");
    navigate(r.url);
  };
  const addTab = () => { const t = { id: newTabId(), url: "" }; setTabs([...tabs, t], t.id); };
  const closeTab = (t: Tab) => {
    if (tabs.length === 1) { const f = { id: newTabId(), url: "" }; return setTabs([f], f.id); }
    const i = tabs.indexOf(t), rest = tabs.filter((x) => x !== t);
    setTabs(rest, t.id === active.id ? rest[Math.min(i, rest.length - 1)]!.id : active.id);
  };
  const cmd = (kind: Cmd["kind"]) => setCmds((m) => ({ ...m, [active.id]: { kind, n: (m[active.id]?.n ?? 0) + 1 } }));
  const inspect = () => inspectTile(useBoard, id); // S-1130
  const loading = !!loadingTabs[active.id];
  const covered = !live || tool !== "select";
  const tiny = n.w * vz < 100; // S-1114: 줌 아웃으로 너무 작으면 회색 자리 표시
  const urlShown = draft ?? active.url;

  return (
    <div data-testid="web-tile" data-id={id} onPointerDown={(e) => { if (!selected && !(e.target as Element).closest("[data-node-handle]")) useBoard.getState().select([id]); }}
      style={{ position: "relative", boxSizing: "border-box", width: "100%", height: "100%", display: "flex", flexDirection: "column", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--bd)", color: "var(--fg)" }}>
      <div data-node-handle data-testid="web-head" style={{ ...bar, height: 26, cursor: "grab", justifyContent: "space-between", padding: "0 8px", borderRadius: "10px 10px 0 0" }}>
        <span style={{ font: "600 11px system-ui", color: "var(--mute)" }}>{t("WEB")}</span>
        <span style={{ position: "relative" }}>
          <button data-testid="web-device" aria-haspopup="menu" title={t("Device size")} style={{ ...tb, width: "auto", padding: "0 6px", font: "11px system-ui" }} onClick={() => setMenu(menu === "device" ? null : "device")}>
            {device ? `${device.w}×${device.h}` : t("Fit tile")} ▾
          </button>
          {menu === "device" && <DeviceMenu device={device?.id ?? null} onPick={(d) => patch({ device: d })} onClose={closeMenu} />}
        </span>
      </div>
      <div style={{ ...bar, height: 28, gap: 2 }}>
        <div style={{ display: "flex", gap: 2, flex: 1, minWidth: 0, overflow: "hidden" }}>
          {tabs.map((tab) => (
            <div key={tab.id} data-testid="web-tab" data-tab-id={tab.id} data-active={tab.id === active.id} onClick={() => setTabs(tabs, tab.id)}
              style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: 140, minWidth: 0, padding: "2px 6px", borderRadius: 5, cursor: "pointer", background: tab.id === active.id ? "var(--panel-2)" : "none", color: tab.id === active.id ? "var(--fg)" : "var(--mute)" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tab.url ? hostOf(tab.url) : t("New tab")}</span>
              <button data-testid="web-tab-close" aria-label={t("Close tab")} style={{ ...tb, width: 16, height: 16, font: "11px system-ui" }} onClick={(e) => (e.stopPropagation(), closeTab(tab))}>×</button>
            </div>
          ))}
        </div>
        <button data-testid="web-tab-add" aria-label={t("New tab")} disabled={tabs.length >= MAX_TABS} style={{ ...tb, opacity: tabs.length >= MAX_TABS ? 0.4 : 1 }} onClick={addTab}>+</button>
      </div>
      <div style={{ ...bar, height: 34 }}>
        <button data-testid="web-back" aria-label={t("Back")} style={{ ...tb, opacity: canBack(h(active)) ? 1 : 0.4 }} disabled={!canBack(h(active))} onClick={() => move(backHist)}>‹</button>
        <button data-testid="web-forward" aria-label={t("Forward")} style={{ ...tb, opacity: canForward(h(active)) ? 1 : 0.4 }} disabled={!canForward(h(active))} onClick={() => move(forwardHist)}>›</button>
        {loading
          ? <button data-testid="web-stop" aria-label={t("Stop")} style={tb} onClick={() => cmd("stop")}>✕</button>
          : <button data-testid="web-reload" aria-label={t("Reload")} style={tb} onClick={() => cmd("reload")}>⟳</button>}
        <input data-testid="web-url" value={urlShown} placeholder={t("Search or enter address")} spellCheck={false} onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(e.currentTarget.value); else if (e.key === "Escape") { setDraft(null); setErr(""); } e.stopPropagation(); }}
          style={{ flex: 1, minWidth: 0, height: 24, padding: "0 8px", borderRadius: 6, border: `1px solid ${err ? "var(--danger)" : "var(--bd)"}`, background: "var(--well)", color: "var(--fg)", font: "12px system-ui" }} />
        {zoom !== 100 && <button data-testid="web-zoom-pill" title={t("Reset zoom")} style={{ ...tb, width: "auto", padding: "0 6px", font: "11px system-ui" }} onClick={() => patch({ zoom: 100 })}>{zoom}%</button>}
        <button data-testid="web-inspect" aria-label={t("Inspect")} title={t("Inspect on board")} style={tb} onClick={inspect}>{"{}"}</button>
        <span style={{ position: "relative" }}>
          <button data-testid="web-more" aria-label={t("More")} aria-haspopup="menu" style={tb} onClick={() => setMenu(menu === "more" ? null : "more")}>⋯</button>
          {menu === "more" && (
            <MoreMenu zoom={zoom} onClose={closeMenu} onZoom={(z) => patch({ zoom: z })} onInspect={inspect}
              onHard={() => cmd("reload")} /* ponytail: iframe 은 캐시를 건너뛸 방법이 없어 Reload 와 같다(S-1106) */
              onCopy={() => void navigator.clipboard?.writeText(active.url).catch(() => {})} onOpen={() => active.url && void openUrl(active.url).catch(() => {})} />
          )}
        </span>
      </div>
      {err && <div data-testid="web-url-error" style={{ flex: "none", padding: "3px 10px", font: "11px system-ui", color: "var(--err-text)", borderBottom: "1px solid var(--bd)" }}>{t(err)}</div>}
      <div ref={bodyRef} data-testid="web-body" style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", borderRadius: "0 0 10px 10px", background: "var(--well)" }}>
        <div style={{ position: "absolute", inset: 0, display: tiny ? "none" : "block" }}>
          {tabs.map((t) => (
            <TabPane key={t.id} nodeId={id} tab={t} active={t.id === active.id} avail={avail} device={device} zoom={zoom} cmd={cmds[t.id]} covered={covered}
              onCover={() => (selected ? setLive(true) : useBoard.getState().select([id]))} onLoading={onLoading} onOpen={navigate} />
          ))}
        </div>
        {tiny && <div data-testid="web-placeholder" style={{ position: "absolute", inset: 0, background: "var(--panel-2)" }} />}
      </div>
    </div>
  );
}
