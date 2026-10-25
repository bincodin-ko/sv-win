// D10 S-1513~S-1515 공용 조각: 게이지·막대·히트맵·통계 줄
import { useEffect, useState, type CSSProperties } from "react";
import { t, useT } from "../i18n";
import { usageStats, type Agent, type UsageStats } from "./tokensApi";
import type { Win } from "./parse";
import { levelOf } from "./reset";
import { fmtTokens } from "./tokens";

export const LEVEL_COLOR = { ok: "var(--accent)", amber: "var(--usage-amber)", red: "var(--usage-red)" } as const;
const dim: CSSProperties = { color: "var(--text-dim)", fontSize: 11 };

export function Gauge({ w }: { w: Win }) {
  useT();
  const lv = levelOf(w.pct);
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div data-testid="usage-gauge" data-level={lv} style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={84} height={84} viewBox="0 0 84 84">
        <circle cx={42} cy={42} r={R} fill="none" stroke="var(--panel-2)" strokeWidth={8} />
        <circle cx={42} cy={42} r={R} fill="none" stroke={LEVEL_COLOR[lv]} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${(C * Math.min(100, w.pct)) / 100} ${C}`} transform="rotate(-90 42 42)" />
      </svg>
      <div>
        <div style={{ font: "600 20px system-ui" }}>{t("{pct}% used", { pct: w.pct })}</div>
        <div style={dim}>{w.label}{w.resetText ? ` · ${t("Resets {text}", { text: w.resetText })}` : ""}</div>
      </div>
    </div>
  );
}

export function Bar({ w, showUsed }: { w: Win; showUsed?: boolean }) {
  useT();
  const lv = levelOf(w.pct);
  return (
    <div data-testid="usage-bar" data-level={lv} style={{ display: "grid", gap: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", font: "12px system-ui" }}>
        <span>{w.label}</span>
        <span>{showUsed ? t("{pct}% used", { pct: w.pct }) : `${w.pct}%`}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--panel-2)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, w.pct)}%`, height: "100%", background: LEVEL_COLOR[lv] }} />
      </div>
      {w.resetText && <div style={dim}>{t("Resets {text}", { text: w.resetText })}</div>}
    </div>
  );
}

/** S-1514·S-1564: 활동 있는 날만 온 목록 → 마지막 날 기준 52주 달력(일요일 시작, 없는 날은 level 0) */
export function heatGrid(cells: { date: string; level: number }[]): { date: string; level: number }[] {
  if (!cells.length) return [];
  const last = cells.reduce((m, c) => (c.date > m ? c.date : m), cells[0]!.date);
  const end = new Date(`${last}T00:00:00`);
  const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - end.getDay() - 51 * 7);
  const lv = new Map(cells.map((c) => [c.date, c.level]));
  const out: { date: string; level: number }[] = [];
  for (; d <= end; d.setDate(d.getDate() + 1)) {
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ date, level: lv.get(date) ?? 0 });
  }
  return out;
}

/** 지난 52주 히트맵(주 단위 열, 위가 일요일). 4단계 색 */
export function Heat({ cells, tone }: { cells: { date: string; level: number }[]; tone: "claude" | "codex" }) {
  const grid = heatGrid(cells); // 첫 칸이 일요일이라 앞 패딩이 필요 없다
  return (
    <div style={{ display: "grid", gridAutoFlow: "column", gridTemplateRows: "repeat(7, 7px)", gridAutoColumns: "7px", gap: 1, overflowX: "auto" }}>
      {grid.map((c) => (
        <span key={c.date} data-testid="usage-heat-cell" data-level={c.level} title={c.date} style={{ background: `var(--heat-${tone}-${c.level})`, borderRadius: 1 }} />
      ))}
    </div>
  );
}

export const compact = fmtTokens; // S-1574: 통계 줄도 같은 규칙
export const duration = (secs: number) => {
  const m = Math.round(secs / 60);
  return m >= 60 ? t("{h}h {m}m", { h: Math.floor(m / 60), m: m % 60 }) : t("{m}m", { m });
};

export function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div data-testid="usage-stat" style={{ display: "flex", justifyContent: "space-between", font: "12px system-ui" }}>
      <span style={{ color: "var(--text-dim)" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

/** 로컬 로그에서 온 히트맵·통계(D4 usage_stats). 결과가 새로 오면 다시 읽는다 */
export function useStats(agent: Agent, at: number): UsageStats | null {
  const [s, set] = useState<UsageStats | null>(null);
  useEffect(() => {
    let live = true;
    usageStats(agent).then((v) => live && set(v)).catch(() => live && set(null));
    return () => void (live = false);
  }, [agent, at]);
  return s;
}
