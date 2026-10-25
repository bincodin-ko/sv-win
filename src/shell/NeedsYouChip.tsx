// S-339·S-689: 라이브 상태가 켜져 있고 NEEDS YOU·ERROR 콘솔이 1개 이상일 때만. 누르면 그런 콘솔로 차례로 간다
import { useLive } from "../livestatus/useLive";
import { useSettings } from "../settings/useSettings";
import { jumpToNext } from "./needsYou";
import { useT } from "../i18n";

export default function NeedsYouChip() {
  const t = useT();
  const n = useLive((s) => s.needs.length);
  const on = useSettings((s) => s.s.liveStatus === true);
  if (!on || n < 1) return null;
  return (
    <button data-testid="needs-you-chip" onClick={() => jumpToNext()} style={{ height: 26, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 10px", borderRadius: 13, background: "var(--panel-2)", border: "1px solid var(--border)", font: "12px system-ui", color: "var(--text)", cursor: "pointer" }}>
      <i style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--warn-2)" }} />{t("{n} needs you", { n })}
    </button>
  );
}
