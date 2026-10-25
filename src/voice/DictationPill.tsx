// S-2276·S-2279: 받아쓰는 동안 대상 가까이에 뜨는 알약 "Dictating → Otto" + 경과 시간. 준비 안 됨·마이크 오류 안내도 여기
import { fsOpen } from "../lib/ipc";
import { useListen } from "./listen";
import { useVoice } from "./status";

export default function DictationPill() {
  const { src, secs, label, anchor, notice } = useListen();
  const recog = useVoice((s) => s.recog);
  const dict = src === "dict";
  const note = notice?.where === "pill" ? notice : null;
  if (!dict && !note) return null;
  const x = Math.min(Math.max(anchor?.x ?? innerWidth / 2, 120), innerWidth - 120);
  const y = Math.max(anchor?.y ?? innerHeight - 80, 40) - 34;
  const body = dict ? label : note!.preparing && recog.kind === "downloading" ? `${note!.text} ${recog.pct ?? 0}%` : note!.text;
  return (
    <div data-testid="dict-pill" role="status" onClick={note?.fix ? () => void fsOpen("ms-settings:privacy-microphone").catch(() => {}) : undefined}
      style={{ position: "fixed", left: x, top: y, transform: "translateX(-50%)", zIndex: 950, display: "flex", gap: 8, alignItems: "center", padding: "4px 12px", borderRadius: 14, background: "var(--voice-pill-bg)", color: "var(--text)", border: "1px solid var(--border)", font: "12px system-ui", pointerEvents: note?.fix ? "auto" : "none", whiteSpace: "nowrap" }}>
      {dict && <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--voice-rec)" }} />}
      <span>{body}</span>
      {dict && <span data-testid="dict-secs" style={{ color: "var(--text-dim)" }}>{secs}s</span>}
    </div>
  );
}
