// H2 S-2820~S-2832: 'All conversations' 겹 화면(앱 창을 덮되 상단 바 아래). 가상 스크롤 — 행·머리줄 높이 44 고정.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useUi } from "../ui/useUi";
import { BAR_H } from "../shell/TopBar";
import { tp, useLang, useT } from "../i18n";
import { relTime } from "../home/dateFmt";
import { initials } from "../profiles/profiles";
import { useProfiles } from "../profiles/useProfiles";
import type { Conversation } from "../lib/ipc";
import { useConvs } from "./useConvs";
import { canPlace, filterConvs, groupRows, type CliFilter, type GroupMode } from "./group";

let placeHandler: (conv: Conversation) => void = () => {};
/** H3 가 실제 놓기를 건다. 기본은 아무것도 안 함 */
export const setPlaceHandler = (fn: (conv: Conversation) => void) => { placeHandler = fn; };

const ROW_H = 44, PAD = 10, GROUP_KEY = "symvibe.convGroup";
const CLI_NAME = { claude: "Claude Code", codex: "Codex" } as const; // 에이전트 이름이라 번역 안 함
const readMode = (): GroupMode => (localStorage.getItem(GROUP_KEY) === "date" ? "date" : "folder");
const chip = (on: boolean) => ({ height: 26, padding: "0 10px", borderRadius: 6, border: "1px solid var(--border)", background: on ? "var(--accent)" : "var(--panel-2)", color: on ? "var(--accent-text)" : "var(--text)", font: "12px system-ui", cursor: "pointer" }) as const;
const dim = { color: "var(--text-dim)", fontSize: 12 } as const;
const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

export default function ConversationsScreen() {
  const open = useUi((s) => s.conversationsOpen);
  return open ? <Screen /> : null;
}

function Screen() {
  const t = useT();
  const lang = useLang();
  const { list, loading, error, load } = useConvs();
  const profiles = useProfiles((s) => s.list);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [cli, setCli] = useState<CliFilter>("all");
  const [mode, setMode] = useState<GroupMode>(readMode);
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState({ top: 0, h: 800 });
  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const raf = useRef(0);
  const composing = useRef(false);

  useEffect(() => { void load(false); void useProfiles.getState().load(); search.current?.focus(); }, [load]);
  useEffect(() => { if (composing.current) return; const id = setTimeout(() => setDq(q), 150); return () => clearTimeout(id); }, [q]); // S-2825: 150ms 지연, 조합 중엔 거르지 않음
  useLayoutEffect(() => {
    const el = scroller.current!;
    const measure = () => setView((v) => (v.h === el.clientHeight ? v : { ...v, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const now = useMemo(() => Date.now(), [list]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => {
    const s = filterConvs(list ?? [], { q: dq, cli: "all" });
    return { all: s.length, claude: s.filter((c) => c.cli === "claude").length, codex: s.filter((c) => c.cli === "codex").length };
  }, [list, dq]);
  const rows = useMemo(() => groupRows(filterConvs(list ?? [], { q: dq, cli }), mode, now, lang), [list, dq, cli, mode, now, lang]);
  const convIdx = useMemo(() => rows.flatMap((r, i) => (r.kind === "conv" ? [i] : [])), [rows]);
  const rowsRef = useRef({ rows, convIdx, sel });
  rowsRef.current = { rows, convIdx, sel };

  const pick = (conv: Conversation) => { if (!canPlace(conv)) placeHandler(conv); };
  const move = (dir: 1 | -1) => {
    const { rows, convIdx, sel } = rowsRef.current;
    if (!convIdx.length) return;
    const cur = convIdx.findIndex((i) => { const r = rows[i]!; return r.kind === "conv" && r.conv.sessionId === sel; });
    const to = convIdx[cur < 0 ? (dir === 1 ? 0 : convIdx.length - 1) : Math.min(convIdx.length - 1, Math.max(0, cur + dir))]!;
    const r = rows[to]!;
    if (r.kind !== "conv") return;
    setSel(r.conv.sessionId);
    const el = scroller.current!;
    const lo = to * ROW_H, hi = lo + ROW_H;
    if (lo < el.scrollTop + (to > 0 && rows[to - 1]!.kind === "head" ? ROW_H : 0)) el.scrollTop = Math.max(0, to > 0 && rows[to - 1]!.kind === "head" ? lo - ROW_H : lo);
    else if (hi > el.scrollTop + el.clientHeight) el.scrollTop = hi - el.clientHeight;
  };

  // ↑↓ Enter Esc. 확인창이 떠 있으면 무시(HomeScreen 과 같은 검사), 단추에 포커스가 있으면 Enter 는 그 단추 몫
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
      if (document.querySelector('[role="dialog"]:not([data-testid="conversations"])')) return;
      if (e.key === "Escape") { e.preventDefault(); useUi.getState().closeConversations(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); move(e.key === "ArrowDown" ? 1 : -1); }
      else if (e.key === "Enter" && !(e.target as HTMLElement | null)?.closest("button")) {
        const { rows, sel } = rowsRef.current;
        const r = rows.find((x) => x.kind === "conv" && x.conv.sessionId === sel);
        if (r?.kind === "conv") { e.preventDefault(); pick(r.conv); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setGroup = (m: GroupMode) => { setMode(m); localStorage.setItem(GROUP_KEY, m); scroller.current!.scrollTop = 0; };
  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => { raf.current = 0; const el = scroller.current; if (el) setView({ top: el.scrollTop, h: el.clientHeight }); });
  };
  const first = Math.max(0, Math.floor(view.top / ROW_H) - PAD), last = Math.min(rows.length - 1, Math.ceil((view.top + view.h) / ROW_H) + PAD);
  const profName = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.name : undefined);
  const msg = error && !list ? t("Couldn't read conversations: {reason}", { reason: error }) : list === null ? (loading ? t("Loading conversations…") : "") : list.length === 0 ? t("No conversations yet") : rows.length === 0 ? t("No conversations match") : "";

  return (
    <div data-testid="conversations" role="dialog" aria-label={t("All conversations")}
      style={{ position: "fixed", top: BAR_H, left: 0, right: 0, bottom: 0, zIndex: 9400, display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)", font: "13px system-ui" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15, marginRight: 8 }}>{t("All conversations")}</b>
        <input ref={search} data-testid="conv-search" value={q} placeholder={t("Search conversations")} aria-label={t("Search conversations")}
          onChange={(e) => setQ(e.target.value)}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={(e) => { composing.current = false; setQ(e.currentTarget.value); setDq(e.currentTarget.value); }}
          style={{ flex: "1 1 220px", minWidth: 160, height: 28, padding: "0 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)" }} />
        {(["all", "claude", "codex"] as const).map((k) => (
          <button key={k} data-testid={`conv-cli-${k}`} aria-pressed={cli === k} onClick={() => setCli(k)} style={chip(cli === k)}>{k === "all" ? t("All") : CLI_NAME[k]} {counts[k]}</button>
        ))}
        {(["folder", "date"] as const).map((m) => (
          <button key={m} data-testid={`conv-group-${m}`} aria-pressed={mode === m} onClick={() => setGroup(m)} style={chip(mode === m)}>{m === "folder" ? t("By folder") : t("By date")}</button>
        ))}
        <button data-testid="conv-refresh" onClick={() => void load(true)} style={chip(false)}>{t("Refresh")}</button>
        <button data-testid="conv-close" aria-label={t("Close")} title={t("Close")} onClick={() => useUi.getState().closeConversations()} style={{ ...chip(false), fontSize: 16 }}>×</button>
      </div>
      {error && list && <div style={{ ...dim, padding: "6px 16px", color: "var(--warn)" }}>{t("Couldn't read conversations: {reason}", { reason: error })}</div>}
      {msg && <div style={{ ...dim, padding: 24, textAlign: "center", fontSize: 13 }}>{msg}</div>}
      <div ref={scroller} data-testid="conv-scroll" onScroll={onScroll} style={{ flex: 1, overflow: "auto", position: "relative" }}>
        <div style={{ height: rows.length * ROW_H, position: "relative" }}>
          {rows.slice(first, last + 1).map((r, k) => {
            const i = first + k;
            const pos = { position: "absolute", top: i * ROW_H, left: 0, right: 0, height: ROW_H, boxSizing: "border-box", padding: "0 16px", display: "flex", alignItems: "center", gap: 10 } as const;
            if (r.kind === "head") {
              return (
                <div key={`h${r.key}`} data-testid="conv-head" style={{ ...pos, borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
                  <b style={ellipsis}>{r.label}</b>
                  {r.sub && <span style={{ ...dim, ...ellipsis, flex: 1, minWidth: 0 }}>{r.sub}</span>}
                  <span style={{ ...dim, marginLeft: "auto" }}>{r.count}</span>
                </div>
              );
            }
            const c = r.conv, on = c.sessionId === sel, why = canPlace(c);
            const folder = mode === "date" && c.cwd ? c.cwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop() : "";
            const second = [folder, c.firstPrompt && c.firstPrompt !== c.title ? c.firstPrompt : ""].filter(Boolean).join(" · ");
            const pn = profName(c.profile);
            return (
              <div key={`${c.cli}${c.sessionId}`} data-testid="conv-row" data-sid={c.sessionId} data-selected={on ? "true" : "false"}
                onClick={() => setSel(c.sessionId)} onDoubleClick={() => pick(c)}
                style={{ ...pos, cursor: "pointer", background: on ? "var(--panel-2)" : "transparent" }}>
                <div style={{ flex: 1, minWidth: 0, display: "grid" }}>
                  <span style={ellipsis}>{c.title}</span>
                  {second && <span style={{ ...dim, ...ellipsis }}>{second}</span>}
                </div>
                {!c.cwd ? null : !c.cwdExists && <span style={{ ...dim, color: "var(--warn)", whiteSpace: "nowrap" }}>{t("Folder missing")}</span>}
                <span style={{ ...dim, whiteSpace: "nowrap" }}>{CLI_NAME[c.cli]}</span>
                {pn && <span title={pn} style={{ ...dim, border: "1px solid var(--border)", borderRadius: 8, padding: "0 5px" }}>{initials(pn)}</span>}
                <span style={{ ...dim, whiteSpace: "nowrap" }}>{relTime(Math.max(0, (now - c.lastAt) / 1000), lang)}</span>
                <span style={{ ...dim, whiteSpace: "nowrap" }}>{tp("{n} message", "{n} messages", c.messages)}</span>
                {on && (
                  <button data-testid="conv-place" disabled={!!why} onClick={(e) => { e.stopPropagation(); pick(c); }}
                    title={why === "missing" ? t("The original folder is missing, so this conversation can't be resumed") : why === "noFolder" ? t("This conversation has no folder") : undefined}
                    style={{ ...chip(true), opacity: why ? 0.5 : 1, cursor: why ? "not-allowed" : "pointer" }}>{t("Place on board")}</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
