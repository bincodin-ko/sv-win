// D11 S-1571: 상단 타일 3개
import { tm, useT } from "../i18n";
import { AGENT_NAME, fmtTokens, type tiles } from "./tokens";

export default function TokenTiles({ t }: { t: ReturnType<typeof tiles> }) {
  const tr = useT();
  const items: [string, string, string][] = [
    [tm("last 30 days"), fmtTokens(t.total), "tile-total"],
    [tm("Busiest day"), t.busiest, "tile-busiest"],
    [tm("Top agent"), t.top ? `${AGENT_NAME[t.top.agent]} · ${t.top.pct}%` : "—", "tile-top"],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {items.map(([k, v, id]) => (
        <div key={id} data-testid={id} style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-2)", padding: "8px 10px", display: "grid", gap: 2 }}>
          <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{tr(k)}</span>
          <b style={{ fontSize: 15 }}>{v}</b>
        </div>
      ))}
    </div>
  );
}
