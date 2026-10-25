// D10 S-1512·S-1516·S-1519·S-1521·S-1523: usage popover(헤더 탭·아이콘·뷰 전환·풋노트) + 리셋 chime 스케줄 연결
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useT } from "../i18n";
import { agentsList, defaultAgent, type AgentInfo } from "../agents/api";
import { getStore } from "../board/boards";
import { isTauri, type ProfileAgent } from "../lib/ipc";
import { useProfiles } from "../profiles/useProfiles";
import { useSettings } from "../settings/useSettings";
import { BAR_H } from "../shell/TopBar";
import { useShell } from "../shell/useShell";
import { useUi } from "../ui/useUi";
import AccountsView from "./AccountsView";
import ClaudeView from "./ClaudeView";
import CodexView from "./CodexView";
import { createChimes, playSound, type ChimeCfg } from "./chime";
import { OPEN_MAX_AGE, USAGE_AGENTS } from "./probe";
import { parseOpenCodeStats } from "./parse";
import { Bar, Stat } from "./parts";
import { boardKey, checkOnBoardOpen } from "./boardCheck";
import RawView from "./RawView";
import { realClock } from "../hidden/screen";
import TokensView from "./TokensView";
import { useUsage, usageKey } from "./useUsage";

const icon: CSSProperties = { width: 26, height: 26, border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel-2)", color: "var(--text)", cursor: "pointer", font: "13px system-ui" };
const chipCss = (on: boolean): CSSProperties => ({ ...icon, width: "auto", padding: "0 10px", font: "12px system-ui", ...(on ? { background: "var(--accent)", color: "var(--accent-text)", borderColor: "var(--accent)" } : {}) });

const chimeCfg = (): ChimeCfg => {
  const s = useSettings.getState().get();
  return { enabled: s.usageChime !== false, play: s.chimePlay === "always" ? "always" : "only100", sound: typeof s.chimeSound === "string" ? s.chimeSound : "Glass" };
};
/** S-1531: 결과가 바뀌거나 설정이 바뀔 때마다 타이머를 다시 맞춘다(창이 뒤에 있어도 울린다) */
function useChimes() {
  useEffect(() => {
    const c = createChimes({ clock: realClock, now: () => Date.now(), play: playSound, cfg: chimeCfg });
    const sync = () => c.sync(useUsage.getState().results);
    sync();
    const offs = [useUsage.subscribe(sync), useSettings.subscribe(sync)];
    return () => (offs.forEach((f) => f()), c.dispose());
  }, []);
}

export default function UsagePanel() {
  const t = useT();
  useChimes();
  const { open, view, agent: wanted } = useUi((s) => s.usage);
  const results = useUsage((s) => s.results);
  const busy = useUsage((s) => s.busy);
  const [infos, setInfos] = useState<AgentInfo[]>([]);
  const [def, setDef] = useState("");
  const [picked, setPicked] = useState("");
  const [raw, setRaw] = useState(false);
  const profiles = useProfiles((s) => s.list);
  const [acct, setAcct] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // 보드가 열릴 때마다(앱 시작·워크스페이스 전환) 기본 에이전트를 백그라운드로(S-1518). 가짜(브라우저) 모드에서는 하지 않는다
  const bKey = useShell((s) => boardKey(s));
  useEffect(() => {
    if (!isTauri() || !bKey) return;
    void checkOnBoardOpen();
  }, [bKey]);

  const tabs = infos.filter((a) => a.installed && USAGE_AGENTS.includes(a.id));
  useEffect(() => {
    if (!open) return;
    void useProfiles.getState().load();
    void Promise.all([agentsList(), defaultAgent()]).then(([l, d]) => {
      setInfos(l);
      setDef(d);
    });
    ref.current?.focus();
  }, [open]);
  const tab = tabs.find((a) => a.id === (wanted ?? picked))?.id ?? (tabs.find((a) => a.id === def) ?? tabs[0])?.id ?? "";
  // D12 S-1620: accounts 뷰의 탭은 Claude·Codex 두 개 고정(설치 안 되면 흐리게)
  const accTabs = (["claude", "codex"] as const).map((id) => ({ id, name: infos.find((a) => a.id === id)?.name ?? (id === "claude" ? "Claude Code" : "Codex"), installed: tabs.some((a) => a.id === id) }));
  const accAgent: ProfileAgent = tab === "codex" ? "codex" : "claude";
  const agentProfiles = profiles.filter((p) => p.agent === tab);
  const account = agentProfiles.some((p) => p.id === acct) ? acct : null;
  const key = usageKey(tab, account);
  useEffect(() => {
    if (open && tab) void useUsage.getState().ensureFresh(tab, OPEN_MAX_AGE, true, account);
  }, [open, tab, account]);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (open && !ref.current?.contains(t) && !t.closest('[data-testid="usage-pill"]')) useUi.getState().closeUsage();
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  if (!open) return null;

  const r = results[key];
  const name = tabs.find((a) => a.id === tab)?.name ?? tab;
  const setView = (v: "usage" | "tokens" | "accounts") => useUi.setState((s) => ({ usage: { ...s.usage, view: s.usage.view === v ? "usage" : v } }));
  const pick = (id: string) => (setPicked(id), setRaw(false), setAcct(null), useUi.setState((s) => ({ usage: { ...s.usage, agent: undefined } })));
  const openConsole = () => {
    const sh = useShell.getState();
    const ws = sh.openRepos.find((x) => x.path === sh.activeRepo)?.activeWs;
    if (ws) getStore(ws).getState().spawnConsole(tab);
    useUi.getState().closeUsage();
  };
  const useForNew = () => useSettings.getState().patch({ profileUse: { ...((useSettings.getState().get().profileUse as object) ?? {}), [tab]: account } });
  const usedNow = ((useSettings.getState().get().profileUse as Record<string, string | null> | undefined) ?? {})[tab] ?? null;

  const body = () => {
    if (!r) return <div style={{ color: "var(--text-dim)" }}>{busy[key] ? t("Reading usage…") : ""}</div>;
    if (r.state === "blocked")
      return (
        <div style={{ display: "grid", gap: 8 }}>
          <div data-testid="usage-msg">{t("{name} needs an answer. Open a console of it, answer, and ask again.", { name })}</div>
          <button data-testid="usage-open-console" onClick={openConsole} style={{ ...chipCss(false), justifySelf: "start" }}>{t("Open console")}</button>
        </div>
      );
    if (r.state === "failed")
      return (
        <div style={{ display: "grid", gap: 8 }}>
          <div data-testid="usage-msg">{t("Couldn't read usage.")}</div>
          <RawView text={r.raw} />
        </div>
      );
    if (r.parsed && !raw && tab === "claude") return <ClaudeView parsed={r.parsed} at={r.at} />;
    if (r.parsed && !raw && tab === "codex") return <CodexView parsed={r.parsed} at={r.at} />;
    if (r.parsed && !raw && tab === "gemini")
      return <div style={{ display: "grid", gap: 14 }}>{r.parsed.windows.map((w) => <Bar key={w.label} w={w.label === "Daily limit" ? { ...w, label: t("Daily limit") } : w} showUsed />)}</div>;
    const oc = !raw && tab === "opencode" ? parseOpenCodeStats(r.raw) : null;
    if (oc)
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <div data-testid="usage-oc-summary" style={{ display: "grid", gap: 4 }}>
            <Stat k={t("Sessions")} v={String(oc.sessions ?? "–")} />
            <Stat k={t("Messages")} v={oc.messages?.toLocaleString("en-US") ?? "–"} />
            <Stat k={t("Total Cost")} v={oc.cost === undefined ? "–" : `$${oc.cost.toFixed(2)}`} />
            <Stat k={t("Avg Cost/Day")} v={oc.costPerDay === undefined ? "–" : `$${oc.costPerDay.toFixed(2)}`} />
          </div>
          <div data-testid="usage-oc-note" style={{ color: "var(--text-dim)", fontSize: 11 }}>{t("OpenCode has no plan limits here — totals from `opencode stats`")}</div>
        </div>
      );
    return <RawView text={r.raw} />;
  };

  return (
    <div ref={ref} data-testid="usage-panel" tabIndex={-1} onKeyDown={(e) => e.key === "Escape" && !e.defaultPrevented && (e.stopPropagation(), useUi.getState().closeUsage())} // S-1229: 보드(캡처)가 이 Esc 로 이미 다른 패널을 닫았으면(preventDefault) 하나만
      style={{ position: "fixed", top: BAR_H + 4, right: 8, width: 480, maxHeight: `calc(100vh - ${BAR_H + 20}px)`, overflow: "auto", zIndex: 9600, padding: 12, display: "grid", gap: 12, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 30px var(--scrim)", color: "var(--text)", font: "13px system-ui", outline: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <b data-testid="usage-title" style={{ marginRight: 4 }}>{view === "accounts" ? t("accounts") : t("usage")}</b>
        {(view === "accounts" ? accTabs : tabs.map((a) => ({ ...a, installed: true }))).map((a) => (
          <button key={a.id} data-testid={`usage-tab-${a.id}`} data-installed={String(a.installed)} role="tab" aria-selected={a.id === (view === "accounts" ? accAgent : tab)} onClick={() => pick(a.id)} style={{ ...chipCss(a.id === (view === "accounts" ? accAgent : tab)), opacity: a.installed ? 1 : 0.5 }}>
            <b style={{ marginRight: 4 }}>{a.name[0]}</b>{a.name}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button data-testid="usage-raw-toggle" aria-label={t("Screen as the CLI printed it")} aria-pressed={raw} onClick={() => setRaw(!raw)} style={icon}>⌨</button>
        <button data-testid="usage-view-tokens" aria-label={t("Tokens")} aria-pressed={view === "tokens"} onClick={() => setView("tokens")} style={icon}>▥</button>
        <button data-testid="usage-view-accounts" aria-label={t("Accounts")} aria-pressed={view === "accounts"} onClick={() => setView("accounts")} style={icon}>☺</button>
        <button data-testid="usage-refresh" aria-label={t("Ask again")} disabled={!tab || !!busy[key]} onClick={() => void useUsage.getState().check(tab, { manual: true, account })} style={icon}>↻</button>
        <button data-testid="usage-close" aria-label={t("Close")} onClick={() => useUi.getState().closeUsage()} style={icon}>✕</button>
      </div>
      {view === "tokens" ? <TokensView /> : view === "accounts" ? <AccountsView agent={accAgent} /> : (
        <>
          {agentProfiles.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <button data-testid="usage-chip-default" aria-pressed={!account} onClick={() => setAcct(null)} style={chipCss(!account)}>{t("Your sign-in")}</button>
              {agentProfiles.map((p) => <button key={p.id} data-testid={`usage-chip-${p.id}`} aria-pressed={account === p.id} onClick={() => setAcct(p.id)} style={chipCss(account === p.id)}>{p.name}</button>)}
              <button data-testid="usage-use-for-new" disabled={usedNow === account} onClick={useForNew} style={chipCss(false)}>{t("Use for new lanes")}</button>
            </div>
          )}
          {body()}
          <button data-testid="usage-manage-accounts" onClick={() => setView("accounts")} style={{ ...chipCss(false), justifySelf: "start" }}>{t("Manage accounts")}</button>
        </>
      )}
      <div data-testid="usage-footnote" style={{ color: "var(--text-dim)", fontSize: 11 }}>{t("Snapshots from the CLI. Your provider's dashboard is the source of truth for billing and limits.")}</div>
    </div>
  );
}
