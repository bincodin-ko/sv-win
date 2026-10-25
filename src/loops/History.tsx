// D9 S-1414 기록 목록 (이번 실행 중 최근 20개, 새것이 위)
import { useT } from "../i18n";
import type { Entry } from "./store";

const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function History({ entries, nameOf }: { entries: Entry[]; nameOf: (id: string) => string }) {
  const t = useT();
  return (
    <div data-testid="loops-history" style={{ padding: "12px 16px" }}>
      <div style={{ font: "600 11px system-ui", color: "var(--mute)", letterSpacing: 0.6, marginBottom: 6 }}>{t("HISTORY")}</div>
      {entries.length === 0 && <div style={{ font: "12px system-ui", color: "var(--mute)" }}>{t("Nothing yet this session.")}</div>}
      {[...entries].reverse().map((e, i) => (
        <div key={`${e.at}-${i}`} data-testid="history-entry" data-kind={e.kind} style={{ font: "12px system-ui", color: "var(--fg-2)", padding: "2px 0" }}>
          <span style={{ color: "var(--mute)" }}>{hhmm(e.at)}</span> {nameOf(e.loop)} · {e.text}
        </div>
      ))}
    </div>
  );
}
