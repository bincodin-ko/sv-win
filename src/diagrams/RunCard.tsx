// E3 S-2025·S-2030: 만들기 진행 카드. 보드 화면 가운데에 뜨는 카드(보드 노드가 아님, 저장 안 함)
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useScope } from "../board/BoardScope";
import { agentName, closeRun, retryRun, useRun } from "./runner";

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const card: React.CSSProperties = { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "var(--dia-card-w)", zIndex: 25, background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 12, padding: 16, color: "var(--fg-2)", font: "13px system-ui", boxShadow: "0 8px 32px var(--scrim-50)" };

/** 점선 상자 3개와 화살표가 차례로 그려지는 손그림풍 미리보기 */
function Preview() {
  const box = (y: number, delay: number) => <rect x="70" y={y} width="100" height="26" rx="6" pathLength={1} className="dia-draw" style={{ animationDelay: `${delay}s` }} />;
  const arrow = (y: number, delay: number) => <path d={`M120 ${y}v18`} pathLength={1} className="dia-draw" style={{ animationDelay: `${delay}s` }} />;
  return (
    <svg data-testid="dia-preview" width="240" height="120" viewBox="0 0 240 120" fill="none" stroke="var(--dia-dash)" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" style={{ display: "block", margin: "12px auto 4px" }}>
      <style>{`.dia-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:dia-draw 3s ease-in-out infinite}@keyframes dia-draw{0%{stroke-dashoffset:1}40%,100%{stroke-dashoffset:0}}`}</style>
      {box(4, 0)}{arrow(30, 0.4)}{box(48, 0.8)}{arrow(74, 1.2)}{box(92, 1.6)}
    </svg>
  );
}

export default function RunCard() {
  const t = useT();
  const { wsId } = useScope();
  const run = useRun((s) => s.run);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!run || run.error) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run?.ac, run?.error]);
  if (!run || run.wsId !== wsId) return null;
  const name = agentName(run.agentId);
  return (
    <div data-testid="dia-card" role="status" onPointerDown={(e) => e.stopPropagation()} style={card}>
      <button data-testid="dia-card-close" aria-label={t("Close")} onClick={closeRun} style={{ position: "absolute", right: 8, top: 8, border: 0, background: "none", color: "inherit", font: "16px system-ui", cursor: "pointer" }}>×</button>
      {run.error ? (
        <>
          <div data-testid="dia-card-error" style={{ color: "var(--fg)", fontWeight: 600, paddingRight: 20 }}>{t(run.error)}</div>
          <button data-testid="dia-card-retry" onClick={retryRun} style={{ marginTop: 12, padding: "6px 14px", border: 0, borderRadius: 8, background: "var(--accent)", color: "var(--accent-ink)", font: "inherit", fontWeight: 600, cursor: "pointer" }}>{t("Try again")}</button>
          {run.hint && <div data-testid="dia-card-hint" style={{ marginTop: 8, fontSize: 11, color: "var(--fg-3)" }}>{t("Try another model if it keeps failing.")}</div>}
        </>
      ) : (
        <>
          <div style={{ color: "var(--fg)", fontWeight: 600 }}>{t("{name} is drawing…", { name })}</div>
          <div data-testid="dia-card-status" style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 2 }}>{name} · {t(run.status)} · {fmt(now - run.startedAt)}</div>
          <Preview />
        </>
      )}
    </div>
  );
}
