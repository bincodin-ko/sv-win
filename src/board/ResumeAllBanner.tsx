import { useOffers } from "../console/offers";
import { BAR_H } from "../shell/TopBar";
import { needsResumeAll } from "../console/resume";
import { getSessionByKey } from "../console/session";
import { useT } from "../i18n";

// S-235: 제안이 2개 이상이면 우상단 "Resume all conversations?" [Yes(주황)] [No]
export default function ResumeAllBanner() {
  const t = useT();
  const offers = useOffers((s) => s.offers);
  const list = Object.values(offers);
  if (!needsResumeAll(list)) return null;
  const btn: React.CSSProperties = { padding: "3px 12px", borderRadius: 6, border: "1px solid var(--bd-2)", background: "var(--surface-2)", color: "var(--fg)", font: "600 12px system-ui", cursor: "pointer" };
  return (
    <div data-testid="resume-all" role="status" style={{ position: "fixed", top: BAR_H + 8, right: 12, zIndex: 9000, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--surface)", color: "var(--fg)", border: "1px solid var(--bd)", borderRadius: 10, boxShadow: "0 6px 24px var(--scrim-50)", font: "13px system-ui" }}>
      <span>{t("Resume all conversations?")}</span>
      <button data-testid="resume-all-yes" onClick={() => list.forEach((o) => getSessionByKey(o.nodeId)?.resumeNow())} style={{ ...btn, background: "var(--accent-2)", border: 0, color: "var(--accent-text)" }}>{t("Yes")}</button>
      <button data-testid="resume-all-no" onClick={() => useOffers.getState().clear()} style={btn}>{t("No")}</button>
    </div>
  );
}
