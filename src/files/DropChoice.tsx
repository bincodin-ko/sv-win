// S-951: repo 밖 경로를 놓았을 때의 선택창. Esc·바깥 클릭 = null(아무것도 놓지 않음). 폴더만 있으면 Copy 항목이 없다(S-952)
import { useRef } from "react";
import { tp, useT } from "../i18n";
import { useModal } from "../ui/useModal";

export type Choice = "copy" | "keep";
const btn: React.CSSProperties = { border: "1px solid var(--border)", background: "transparent", color: "var(--text)", borderRadius: 6, padding: "6px 12px", cursor: "pointer", font: "13px system-ui" };

export default function DropChoice({ canCopy, count, onPick }: { canCopy: boolean; count: number; onPick: (c: Choice | null) => void }) {
  const t = useT();
  const first = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useModal(box, { onClose: () => onPick(null), initialFocus: () => first.current });
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onPick(null); }} style={{ position: "fixed", inset: 0, zIndex: 20000, display: "grid", placeItems: "center", background: "var(--scrim)" }}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={t("Add files")} style={{ minWidth: 320, maxWidth: 440, padding: 20, borderRadius: 10, background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)" }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>{t("Add files")}</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13 }}>{tp("This item is outside the repo.", "{n} items are outside the repo.", count)}</p>
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {canCopy && <button ref={first} style={{ ...btn, background: "var(--accent)", color: "var(--accent-text)", border: 0 }} onClick={() => onPick("copy")}>{t("Copy into repo")}</button>}
          <button ref={canCopy ? undefined : first} style={btn} onClick={() => onPick("keep")}>{t("Keep original location")}</button>
        </div>
      </div>
    </div>
  );
}
