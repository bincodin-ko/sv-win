// S-133: "Paste N lines as commands?" — 터미널(순수 TS)에서 부르도록 명령형 askPasteCheck 로 띄운다. 모양은 4B.
import { useRef } from "react";
import { createRoot } from "react-dom/client";
import { useT } from "../i18n";
import { useModal } from "../ui/useModal";

export type PasteChoice = "cancel" | "oneLine" | "lines";

export function PasteCheck({ n, onChoose }: { n: number; onChoose: (c: PasteChoice) => void }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useModal(box, { onClose: () => onChoose("cancel"), initialFocus: () => cancel.current });
  const btn: React.CSSProperties = { padding: "6px 12px", borderRadius: 6, border: "1px solid var(--bd-2)", background: "var(--surface-2)", color: "var(--fg)", font: "13px system-ui", cursor: "pointer" };
  return (
    <div ref={box} role="dialog" aria-modal="true" data-testid="paste-check"
      style={{ position: "fixed", inset: 0, background: "var(--scrim-45)", display: "grid", placeItems: "center", zIndex: 10000 }}
      onKeyDown={(e) => e.stopPropagation()}>
      <div style={{ background: "var(--surface)", color: "var(--fg)", border: "1px solid var(--bd)", borderRadius: 10, padding: 20, minWidth: 320, font: "14px system-ui" }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>{t("Paste {n} lines as commands?", { n })}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={{ ...btn, background: "var(--info)", borderColor: "var(--info)" }} onClick={() => onChoose("lines")}>{t("Paste Lines")}</button>
          <button style={btn} onClick={() => onChoose("oneLine")}>{t("Paste as One Line")}</button>
          <button ref={cancel} style={btn} onClick={() => onChoose("cancel")}>{t("Cancel")}</button>
        </div>
      </div>
    </div>
  );
}

export function askPasteCheck(n: number): Promise<PasteChoice> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (c: PasteChoice) => {
      root.unmount();
      host.remove();
      resolve(c);
    };
    root.render(<PasteCheck n={n} onChoose={done} />);
  });
}
