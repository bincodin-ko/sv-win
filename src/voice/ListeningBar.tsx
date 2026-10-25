// S-2262 듣는 중 명령 바(입력란 자리) + S-2263·S-2264·S-2265·S-2266 바 안내 줄
import { useT } from "../i18n";
import { fsOpen } from "../lib/ipc";
import { useListen } from "./listen";
import { useVoice } from "./status";
import Waveform from "./Waveform";

const text: React.CSSProperties = { font: "13px system-ui", color: "var(--voice-notice)" };

/** 입력란 자리에 들어간다. 듣는 중(Space·마이크 버튼)일 때만 */
export function ListeningBar() {
  const t = useT();
  const { src, level, secs, partial } = useListen();
  if (src !== "space" && src !== "mic") return null;
  return (
    <div data-testid="listen-bar" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
      <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--voice-rec)", flex: "none" }} />
      <span data-testid="listen-label" style={{ font: "14px system-ui", color: "var(--voice-rec)" }}>{t("listening")}</span>
      <Waveform level={level} />
      {partial && <span data-testid="listen-partial" style={{ font: "14px system-ui", color: "var(--text-dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{partial}</span>}
      <span data-testid="listen-secs" style={{ font: "12px system-ui", color: "var(--text-dim)", flex: "none" }}>{secs}s</span>
    </div>
  );
}

/** 바 위의 한 줄 안내(1.5~4초). 마이크 막힘은 누르면 Windows 마이크 설정이 열린다 */
export function BarNotice() {
  const n = useListen((s) => s.notice);
  const recog = useVoice((s) => s.recog);
  if (!n || n.where !== "bar") return null;
  const label = n.preparing && recog.kind === "downloading" ? `${n.text} ${recog.pct ?? 0}%` : n.text;
  return n.fix === "mic" ? (
    <button data-testid="bar-notice" onClick={() => void fsOpen("ms-settings:privacy-microphone").catch(() => {})} style={{ ...text, background: "none", border: 0, textAlign: "left", cursor: "pointer", padding: "0 4px" }}>{label}</button>
  ) : (
    <div data-testid="bar-notice" role="status" style={{ ...text, padding: "0 4px" }}>{label}</div>
  );
}
