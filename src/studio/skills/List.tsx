// 5묶음 E7 S-2070·S-2073: 왼쪽 목록 — 탭, 필터 칩, 한 줄(이름·범위 배지·설명 한 줄·경고 점), 이름순. 진 쪽은 흐리게(S-2075).
import { useT } from "../../i18n";
import { CATS, badgeOf, btn, type Cat, type Row } from "./view";

export type Tab = "installed" | "starters";
const tabBtn = (on: boolean) => ({ ...btn, flex: 1, border: 0, borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`, borderRadius: 0, background: "transparent", color: on ? "var(--fg)" : "var(--text-dim)" });
const chipStyle = (on: boolean, disabled: boolean) => ({ padding: "2px 9px", borderRadius: 999, border: "1px solid var(--bd-2)", font: "12px system-ui", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, background: on ? "var(--accent)" : "transparent", color: on ? "var(--accent-text)" : "var(--fg-3)" });
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const t = useT();
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--studio-line)" }}>
      <button data-testid="skills-tab-installed" style={tabBtn(tab === "installed")} onClick={() => onTab("installed")}>{t("Installed")}</button>
      <button data-testid="skills-tab-starters" style={tabBtn(tab === "starters")} onClick={() => onTab("starters")}>{t("Starters")}</button>
    </div>
  );
}

interface Props { rows: Row[]; chips: Set<Cat>; hasRepo: boolean; selected: string | null; truncated: boolean; onChip: (c: Cat) => void; onSelect: (r: Row) => void }

export default function List({ rows, chips, hasRepo, selected, truncated, onChip, onSelect }: Props) {
  const t = useT();
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 10px" }}>
        {CATS.map((c) => {
          const disabled = c.id === "project" && !hasRepo;
          return (
            <button key={c.id} data-testid={`skills-chip-${c.id}`} aria-pressed={chips.has(c.id)} disabled={disabled} title={disabled ? t("Open a repo to see project skills") : undefined}
              style={chipStyle(chips.has(c.id), disabled)} onClick={() => onChip(c.id)}>{t(c.label)}</button>
          );
        })}
      </div>
      {rows.length === 0 && <div style={{ padding: "12px 14px", color: "var(--text-dim)" }}>{t("No skills here yet.")}</div>}
      {rows.map((r) => (
        <button key={r.id} data-testid="skill-row" data-name={r.p.name} data-scope={r.e.scope} data-selected={r.id === selected} data-dim={!!r.loser}
          onClick={() => onSelect(r)}
          style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", border: 0, borderBottom: "1px solid var(--studio-line)", background: r.id === selected ? "var(--studio-sel)" : "transparent", color: "var(--fg)", font: "13px system-ui", cursor: "pointer", opacity: r.loser ? "var(--skill-dim-opacity)" : 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.p.name}</span>
            {r.findings.length > 0 && <span data-testid="skill-warn" title={t("{n} to look at", { n: r.findings.length })} style={{ width: 7, height: 7, borderRadius: 4, background: "var(--skill-warn)" }} />}
            <span style={{ fontSize: 11, color: "var(--text-dim)", border: "1px solid var(--bd-3)", borderRadius: 4, padding: "0 5px" }}>{badgeOf(r.e)}</span>
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{clip(r.p.description.replace(/\s+/g, " "))}</div>
        </button>
      ))}
      {truncated && <div data-testid="skills-truncated" style={{ padding: "8px 12px", color: "var(--text-dim)" }}>{t("Showing the first 400.")}</div>}
    </>
  );
}
