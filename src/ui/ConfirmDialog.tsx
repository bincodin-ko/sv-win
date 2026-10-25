// 프라미스형 확인창: `await confirmDialog({...})` → true/false. 앱 어디서든 ConfirmDialogHost 하나가 그린다.
import { useRef } from "react";
import { create } from "zustand";
import { useT } from "../i18n";
import { useModal } from "./useModal";

export interface ConfirmOpts { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
const useAsk = create<{ ask: (ConfirmOpts & { done: (ok: boolean) => void }) | null }>(() => ({ ask: null }));

export const confirmDialog = (o: ConfirmOpts): Promise<boolean> =>
  new Promise((resolve) => useAsk.setState({ ask: { ...o, done: resolve } }));

export function ConfirmDialogHost() {
  const ask = useAsk((s) => s.ask);
  return ask ? <Dlg key={ask.title} ask={ask} /> : null;
}

// S-2605·S-2606: 단추 순서 [주 동작, Cancel], danger 면 Cancel 이 기본 포커스(Enter = 취소)
function Dlg({ ask }: { ask: NonNullable<ReturnType<typeof useAsk.getState>["ask"]> }) {
  const t = useT();
  const ok = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const done = (v: boolean) => { ask.done(v); useAsk.setState({ ask: null }); };
  useModal(box, { onClose: () => done(false), initialFocus: () => (ask.danger ? cancel.current : ok.current) });
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 20000, display: "grid", placeItems: "center", background: "var(--scrim)" }}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={ask.title}
        style={{ minWidth: 320, maxWidth: 440, padding: 20, borderRadius: 10, background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)" }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>{ask.title}</h2>
        {ask.message && <p style={{ color: "var(--text-dim)", fontSize: 13, whiteSpace: "pre-line" }}>{ask.message}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button ref={ok} onClick={() => done(true)} style={{ background: ask.danger ? "var(--danger)" : "var(--accent)", color: "var(--accent-text)", border: 0, borderRadius: 6, padding: "4px 12px" }}>
            {ask.confirmLabel ?? t("OK")}
          </button>
          <button ref={cancel} onClick={() => done(false)}>{ask.cancelLabel ?? t("Cancel")}</button>
        </div>
      </div>
    </div>
  );
}
