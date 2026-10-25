// 5묶음 E4 S-1878: 찾기 줄(입력·현재/전체·다음·이전). Enter 다음, Shift+Enter 이전, Esc 닫고 편집기로.
import type { RefObject } from "react";
import { useT } from "../../i18n";

export interface FindBarProps { q: string; cur: number; count: number; inputRef: RefObject<HTMLInputElement | null>; onQ: (q: string) => void; onStep: (dir: 1 | -1) => void; onClose: () => void }
const nb: React.CSSProperties = { width: 24, height: 24, border: 0, borderRadius: 6, background: "transparent", color: "var(--text-dim)", font: "13px system-ui", cursor: "pointer" };

export default function FindBar({ q, cur, count, inputRef, onQ, onStep, onClose }: FindBarProps) {
  const t = useT();
  return (
    <div data-testid="find-bar" style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderBottom: "1px solid var(--studio-line)", background: "var(--panel-2)" }}>
      <input data-testid="find-input" ref={inputRef} value={q} autoFocus spellCheck={false} placeholder={t("Find")} aria-label={t("Find")} onChange={(e) => onQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
          else if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); onStep(e.shiftKey ? -1 : 1); }
        }}
        style={{ width: 220, height: 24, padding: "0 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", font: "12px system-ui", outline: "none" }} />
      <span data-testid="find-count" style={{ minWidth: 44, color: "var(--text-dim)", font: "12px system-ui" }}>{count ? `${cur + 1}/${count}` : "0/0"}</span>
      <button aria-label={t("Previous match")} title={t("Previous (Shift+Enter)")} style={nb} onClick={() => onStep(-1)}>↑</button>
      <button aria-label={t("Next match")} title={t("Next (Enter)")} style={nb} onClick={() => onStep(1)}>↓</button>
    </div>
  );
}
