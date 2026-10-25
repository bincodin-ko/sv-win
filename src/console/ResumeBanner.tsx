import { useScope } from "../board/BoardScope";
import { useT } from "../i18n";
import { getSession } from "./session";
import { sessionKey } from "./sessionKey";
import { useOffers } from "./offers";

// S-234: 콘솔 헤더 아래 "Resume last conversation?" 배너. 타이핑하면 session 이 닫는다
export default function ResumeBanner({ id }: { id: string }) {
  const t = useT();
  const { wsId } = useScope();
  const key = sessionKey(wsId, id);
  const offer = useOffers((s) => s.offers[key]);
  if (!offer) return null;
  return (
    <div data-testid="resume-banner" style={{ display: "flex", alignItems: "center", gap: 8, height: 28, padding: "0 10px", background: "var(--surface)", borderBottom: "1px solid var(--surface-2)", color: "var(--fg-3)", font: "12px system-ui", flex: "none" }}>
      <span>{t("Resume last conversation?")}</span>
      <button onClick={() => getSession(wsId, id)?.resumeNow()} style={{ padding: "1px 10px", borderRadius: 5, border: 0, background: "var(--accent-2)", color: "var(--accent-text)", font: "600 11px system-ui", cursor: "pointer" }}>{t("Resume")}</button>
      <span style={{ flex: 1 }} />
      <button aria-label={t("Dismiss")} title={t("Dismiss")} onClick={() => useOffers.getState().drop(key)} style={{ background: "none", border: 0, color: "var(--mute-2)", cursor: "pointer", font: "12px system-ui" }}>✕</button>
    </div>
  );
}
