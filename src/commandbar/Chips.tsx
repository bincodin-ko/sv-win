// S-542·S-544~S-547: 입력란 위 칩 줄
import { useEffect, useRef, useState } from "react";
import { agentsList } from "../agents/api";
import { registry } from "../board/boards";
import { isConsole } from "../board/store";
import { getSession } from "../console/session";
import { pauseAll, resumeAll, type Pausable } from "../console/pause";
import { tp, useT } from "../i18n";
import { isTauri } from "../lib/ipc";
import { useShell } from "../shell/useShell";
import { confirmDialog } from "../ui/ConfirmDialog";
import { useUi } from "../ui/useUi";
import { hasStudio, requestOpenStudio } from "../studio/useStudio";
import { chipLabel, click, CONFIRM_MS, idle } from "./killAll";

const NEW_CONSOLE_ORDER = ["claude", "codex", "gemini", "grok", "opencode", "shell"]; // S-544: 내장 5 + Shell

const chipStyle = (c?: string): React.CSSProperties => ({ background: "none", border: `1px solid ${c ?? "var(--bd-3)"}`, color: c ?? "var(--fg-2)", borderRadius: 999, padding: "3px 11px", font: "12px system-ui", cursor: "pointer", whiteSpace: "nowrap" });
const ORANGE = "#f97316"; // theme-fixed

/** 시험용(가짜 모드만): 칩이 뒤 일감의 화면(composer·Presets)을 불렀다는 기록 */
const log = (s: string) => { if (!isTauri()) ((window as unknown as { __barLog?: string[] }).__barLog ??= []).push(s); };

function openComposer(n: number) {
  useUi.getState().openComposer(n);
  log(`composer:${n}`);
}

export default function Chips({ wsId, repo, threadOpen }: { wsId: string; repo: string; threadOpen: boolean }) {
  const t = useT();
  const [menu, setMenu] = useState<{ id: string; name: string }[] | null>(null);
  const [ks, setKs] = useState(idle);
  const [, tick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  // 메뉴 밖을 누르거나 Esc 면 닫는다
  useEffect(() => {
    if (!menu) return;
    const off = (e: Event) => { if (!(e.target instanceof Node) || !wrap.current?.contains(e.target)) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(null); } };
    window.addEventListener("pointerdown", off, true);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", off, true); window.removeEventListener("keydown", esc, true); };
  }, [menu]);

  // 현재 repo 의 열린 모든 워크스페이스의 콘솔(S-546·S-547)
  const consoles = () =>
    (useShell.getState().openRepos.find((r) => r.path === repo)?.workspaces.map((w) => w.id) ?? [wsId]).flatMap((ws) => {
      const st = registry.get(ws);
      return st ? Object.values(st.getState().nodes).filter(isConsole).map((n) => ({ ws, id: n.id })) : [];
    });
  const sessions = (): Pausable[] => consoles().flatMap((c) => getSession(c.ws, c.id) ?? []);

  const openMenu = async () => {
    if (menu) return setMenu(null);
    const l = await agentsList();
    setMenu(NEW_CONSOLE_ORDER.flatMap((id) => l.filter((a) => a.id === id && a.builtin).map((a) => ({ id, name: a.name }))));
  };

  const onKill = async () => {
    const r = click(ks, Date.now());
    setKs(r.state);
    clearTimeout(timer.current);
    if (r.state.armedAt !== null) timer.current = setTimeout(() => tick((n) => n + 1), CONFIRM_MS + 20);
    if (!r.ask) return;
    const all = consoles();
    if (!all.length) return;
    const ok = await confirmDialog({ title: tp("Kill all {n} console?", "Kill all {n} consoles?", all.length), message: t("Every console on this repo's boards will be closed and removed."), confirmLabel: t("Kill all"), danger: true });
    if (!ok) return;
    for (const ws of new Set(all.map((c) => c.ws))) {
      const ids = all.filter((c) => c.ws === ws).map((c) => c.id);
      for (const id of ids) getSession(ws, id)?.kill(); // S-105
      registry.get(ws)?.getState().removeNodes(ids);
    }
  };

  const plain = (id: string, label: string, f: () => void) => <button key={id} data-testid={`chip-${id}`} style={chipStyle()} onClick={f}>{label}</button>;
  return (
    <div ref={wrap} style={{ position: "relative", display: "flex", gap: 6, flexWrap: "wrap" }}>
      {menu && (
        <div role="menu" aria-label={t("New console")} data-testid="new-console-menu" style={{ position: "absolute", left: 0, bottom: "calc(100% + 6px)", minWidth: 160, background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 10, boxShadow: "0 8px 28px var(--scrim)", padding: 4, font: "13px system-ui", zIndex: 5 }}>
          {menu.map((a) => (
            <div key={a.id} role="menuitem" tabIndex={0} style={{ padding: "5px 10px", borderRadius: 6, cursor: "pointer", color: "var(--fg-2)" }}
              onClick={() => { registry.get(wsId)?.getState().spawnAgent(a.id); setMenu(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}>{a.name}</div>
          ))}
        </div>
      )}
      {plain("new-console", t("New console"), () => void openMenu())}
      {plain("spawn-4", t("Spawn 4…"), () => openComposer(4))}
      {plain("group", t("Group"), () => openComposer(6))}
      {plain("presets", t("Presets"), () => { useUi.setState({ presetsOpen: true }); log("presets"); })}
      {plain("pause-all", t("Pause all"), () => void pauseAll(sessions()))}
      {plain("resume-all", t("Resume all"), () => void resumeAll(sessions()))}
      {plain("memory", t("Memory"), () => useUi.getState().openMemory())}
      {threadOpen && plain("loops", t("Loops"), () => useUi.getState().openLoops())}
      {threadOpen && hasStudio("documents") && plain("docs", t("Docs"), () => void requestOpenStudio("documents"))}
      {threadOpen && hasStudio("code") && plain("code", t("Code"), () => void requestOpenStudio("code"))}
      {threadOpen && hasStudio("skills") && plain("skills", t("Skills"), () => void requestOpenStudio("skills"))}
      {threadOpen && plain("mission-map", t("Mission Map"), () => useUi.getState().openMission())}
      {threadOpen && <button data-testid="chip-kill-all" style={chipStyle(ORANGE)} onClick={() => void onKill()}>{t(chipLabel(ks, Date.now()))}</button>}
    </div>
  );
}
