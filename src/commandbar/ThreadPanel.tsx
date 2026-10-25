// S-553: 바 위로 열리는 Thread 패널 — THREAD 머리, Clear, 내 메시지(오른쪽)·답(왼쪽)·Plan 노트·에이전트 보고 행
import { useEffect, useRef } from "react";
import { useT } from "../i18n";
import { useUi } from "../ui/useUi";
import { clickConfirm, useConfirm } from "./confirm";
import Globe from "../voice/Globe";
import { usePlanner } from "../planner/state";
import { useThread, type Msg } from "./thread";

const bubble: React.CSSProperties = { maxWidth: "82%", padding: "6px 10px", borderRadius: 12, font: "13px/1.4 system-ui", whiteSpace: "pre-wrap", overflowWrap: "anywhere" };

function Row({ m }: { m: Msg }) {
  const t = useT();
  const askedHere = useConfirm((s) => s.pending?.msgId === m.id); // S-601: 확인 질문에는 Confirm 버튼
  if (m.role === "report" && m.report) {
    const r = m.report;
    return (
      <div data-testid="thread-msg" data-role="report" style={{ ...bubble, alignSelf: "flex-start", background: "var(--surface-2)", border: "1px solid var(--bd)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <b>{r.console}</b>
          <span>{r.result}</span>
        </div>
        {r.reply && <div style={{ color: "var(--mute-2)", marginTop: 2 }}>{r.reply}</div>}
        {r.nodeId && (
          <button data-testid="see-output" style={{ marginTop: 4, background: "none", border: 0, color: "var(--info)", cursor: "pointer", padding: 0, font: "12px system-ui" }}
            onClick={() => useUi.setState({ outputViewer: { open: true, nodeId: r.nodeId!, wsId: r.wsId } })}>{t("See output")}</button>
        )}
      </div>
    );
  }
  const user = m.role === "user";
  return (
    <div data-testid="thread-msg" data-role={m.role}
      style={{ ...bubble, alignSelf: user ? "flex-end" : "flex-start", background: user ? "var(--surface-2)" : m.role === "plan" ? "transparent" : "var(--surface-2)", color: m.role === "plan" ? "var(--mute-2)" : "var(--fg-2)", fontStyle: m.role === "plan" ? "italic" : undefined, border: m.role === "plan" ? "1px dashed var(--bd-2)" : undefined }}>
      {m.text}
      {askedHere && <button data-testid="confirm-btn" onClick={clickConfirm} style={{ marginLeft: 8, padding: "1px 10px", borderRadius: 10, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-text)", cursor: "pointer", font: "12px system-ui" }}>{t("Confirm")}</button>}
    </div>
  );
}

export default function ThreadPanel({ repo }: { repo: string }) {
  const t = useT();
  const msgs = useThread((s) => s.byRepo[repo]) ?? NONE;
  const busy = usePlanner((s) => (s.busy?.repo === repo ? s.busy.phase : null));
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [msgs.length]);
  return (
    <div data-testid="thread-panel" style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", maxHeight: "min(360px, 50vh)", background: "var(--surface)", color: "var(--fg-2)", border: "1px solid var(--bd)", borderRadius: 14, boxShadow: "0 8px 28px var(--scrim)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--bd)" }}>
        <span data-testid="thread-title" style={{ font: "600 11px system-ui", letterSpacing: ".08em", color: "var(--mute)" }}>{t("THREAD")}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Globe />
          <button data-testid="thread-clear" onClick={() => useThread.getState().clear(repo)} style={{ background: "none", border: 0, color: "var(--mute)", cursor: "pointer", font: "12px system-ui" }}>{t("Clear")}</button>
        </span>
      </div>
      <div style={{ overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.map((m) => <Row key={m.id} m={m} />)}
        {busy && <div data-testid="planner-busy" style={{ ...bubble, alignSelf: "flex-start", background: "transparent", color: "var(--mute-2)", fontStyle: "italic", border: "1px dashed var(--bd-2)" }}>{busy === "starting" ? t("Starting the planner…") : t("Thinking…")}<Dots /></div>}
        <div ref={end} />
      </div>
    </div>
  );
}
const NONE: Msg[] = [];

// 점 세 개가 차례로 깜빡인다
function Dots() {
  return <span aria-hidden>{[0, 1, 2].map((i) => <span key={i} style={{ animation: `planner-dot 1.2s ${i * 0.2}s infinite` }}>.</span>)}<style>{"@keyframes planner-dot{0%,60%,100%{opacity:.2}30%{opacity:1}}"}</style></span>;
}
