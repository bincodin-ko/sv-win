// D11 S-1570~S-1576: Tokens 화면(usage popover 의 차트 아이콘)
import { useEffect, useState, type CSSProperties } from "react";
import { tm, useT } from "../i18n";
import { useUi } from "../ui/useUi";
import TokenChart from "./TokenChart";
import TokenTiles from "./TokenTiles";
import { AGENT_NAME, agentTotals, dayColumns, fmtTokens, tiles } from "./tokens";
import { tokensCancel, tokensScan, type ScanResult, type TokenMode } from "./tokensApi";

const MODES: [TokenMode, string][] = [["all", tm("All tokens")], ["inOut", tm("In + out")], ["output", tm("Output")]];
const chip = (on: boolean): CSSProperties => ({ border: "1px solid " + (on ? "var(--accent)" : "var(--border)"), borderRadius: 6, background: on ? "var(--accent)" : "var(--panel-2)", color: on ? "var(--accent-text)" : "var(--text)", padding: "3px 10px", font: "12px system-ui", cursor: "pointer" });

export default function TokensView() {
  const t = useT();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [mode, setMode] = useState<TokenMode>("all");
  const [range, setRange] = useState<"30" | "all">("30");
  const [allScan, setAllScan] = useState<ScanResult | null>(null);
  const [failed, setFailed] = useState(false); // S-1575: 읽기가 거절됐다

  useEffect(() => {
    let live = true;
    void tokensScan(30).then((s) => live && setScan(s), () => live && setFailed(true));
    return () => ((live = false), void tokensCancel());
  }, []);
  // All time 은 처음 누를 때 한 번만 읽는다
  useEffect(() => {
    if (range !== "all" || allScan) return;
    let live = true;
    void tokensScan(36500).then((s) => live && setAllScan(s), () => live && setFailed(true));
    return () => { live = false; };
  }, [range, allScan]);

  const back = () => useUi.setState((s) => ({ usage: { ...s.usage, view: "usage" } }));
  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button data-testid="tokens-back" aria-label={t("Back to usage")} onClick={back} style={chip(false)}>←</button>
      <b data-testid="tokens-title">{t("tokens")}</b>
    </div>
  );
  if (failed) return <div style={{ display: "grid", gap: 12 }}>{head}<div data-testid="tokens-error" style={{ color: "var(--danger)" }}>{t("Couldn't read local session logs.")}</div></div>;
  if (!scan) return <div style={{ display: "grid", gap: 12 }}>{head}<div data-testid="tokens-loading" style={{ color: "var(--text-dim)" }}>{t("Reading local session logs…")}</div></div>;

  const rows = scan.days;
  const cols = dayColumns(rows, mode);
  const byAgent = agentTotals(range === "all" ? (allScan ?? scan).days : rows, mode, range);
  const sub: CSSProperties = { color: "var(--text-dim)", fontSize: 11 };
  return (
    <div data-testid="tokens-view" style={{ display: "grid", gap: 12 }}>
      {head}
      {rows.length === 0 ? <div data-testid="tokens-empty">{t("No session logs found.")}</div> : (
        <>
          <TokenTiles t={tiles(cols)} />
          <div style={{ display: "flex", gap: 6 }}>
            {MODES.map(([m, label]) => <button key={m} data-testid={`tokens-mode-${m}`} aria-pressed={mode === m} onClick={() => setMode(m)} style={chip(mode === m)}>{t(label)}</button>)}
          </div>
          <TokenChart cols={cols} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ ...sub, letterSpacing: 1, flex: 1 }}>{t("BY AGENT")}</span>
            {([["30", tm("Last 30 days")], ["all", tm("All time")]] as const).map(([r, label]) => <button key={r} data-testid={`tokens-range-${r}`} aria-pressed={range === r} onClick={() => setRange(r)} style={chip(range === r)}>{t(label)}</button>)}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {byAgent.map((a) => (
              <div key={a.agent} data-testid={`tokens-agent-${a.agent}`} style={{ display: "grid", gap: 3 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>{AGENT_NAME[a.agent]}</span><span data-testid="tokens-agent-total">{fmtTokens(a.total)}</span></div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--panel-2)" }}><div data-testid="tokens-agent-bar" style={{ width: `${a.pct}%`, height: "100%", borderRadius: 3, background: `var(--tok-${a.agent})` }} /></div>
              </div>
            ))}
          </div>
        </>
      )}
      {scan.partial && <div data-testid="tokens-partial" style={sub}>{t("Showing what could be read in 30 s.")}</div>}
      <div data-testid="tokens-footnote" style={sub}>{t("Counted from local session logs. Not a bill. Account profiles are not included.")}</div>
    </div>
  );
}
