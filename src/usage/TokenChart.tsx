// D11 S-1572: 지난 30일 막대(에이전트별 색 누적) SVG
import { useT } from "../i18n";
import { AGENTS, type Col } from "./tokens";

const W = 440, H = 120, GAP = 3;
export default function TokenChart({ cols }: { cols: Col[] }) {
  const t = useT();
  const max = Math.max(1, ...cols.map((c) => c.total));
  const bw = (W - GAP * (cols.length - 1)) / cols.length;
  return (
    <svg data-testid="tokens-chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t("Tokens per day, last 30 days")}>
      {cols.map((c, i) => {
        let y = H;
        return (
          <g key={c.date} data-testid="tokens-bar" data-date={c.date} data-total={c.total} transform={`translate(${i * (bw + GAP)} 0)`}>
            <title>{c.date}</title>
            {AGENTS.map((a) => {
              const h = (c.parts[a] / max) * (H - 2);
              y -= h;
              return h > 0 ? <rect key={a} data-agent={a} x={0} y={y} width={bw} height={h} rx={1.5} fill={`var(--tok-${a})`} /> : null;
            })}
            <rect x={0} y={H - 1} width={bw} height={1} fill="var(--border)" />
          </g>
        );
      })}
    </svg>
  );
}
