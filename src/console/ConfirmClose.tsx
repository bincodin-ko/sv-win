import { useRef } from "react";
import { create } from "zustand";
import { useModal } from "../ui/useModal";
import { t, useT } from "../i18n";

// S-068 "Close running agents?" 확인창. 어디서든 `await confirmClose(이름들)` 로 부르고 <ConfirmCloseHost/> 를 앱에 한 번 둔다.
type Req = { names: string[]; resolve: (ok: boolean) => void } | null;
const useReq = create<{ req: Req }>(() => ({ req: null }));

export function confirmClose(names: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    useReq.getState().req?.resolve(false); // 이미 떠 있으면 그건 취소
    useReq.setState({ req: { names, resolve } });
  });
}

export const closeMessage = (names: string[]) =>
  names.length === 1 ? t("{name} is running. Closing ends its session.", { name: names[0]! }) : t("{n} consoles are running. Closing ends their sessions.", { n: names.length });

export function ConfirmCloseHost() {
  const req = useReq((s) => s.req);
  return req ? <Dlg req={req} /> : null;
}

function Dlg({ req }: { req: NonNullable<Req> }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const done = (ok: boolean) => {
    useReq.setState({ req: null });
    req.resolve(ok);
  };
  useModal(box, { onClose: () => done(false), initialFocus: () => cancel.current });
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "var(--scrim-50)", display: "grid", placeItems: "center", zIndex: 100000 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div ref={box} data-testid="confirm-close" role="dialog" aria-modal="true" style={{ width: 360, background: "var(--surface)", color: "var(--fg)", border: "1px solid var(--bd)", borderRadius: 12, padding: 20, font: "13px system-ui" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t("Close running agents?")}</div>
        <div style={{ color: "var(--fg-4)", marginBottom: 16 }}>{closeMessage(req.names)}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => done(true)} style={{ padding: "6px 14px", borderRadius: 6, border: 0, background: "var(--danger-btn)", color: "var(--on-fill)" }}>{t("Close")}</button>
          <button ref={cancel} onClick={() => done(false)} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--bd-2)", background: "var(--surface-2)", color: "var(--fg)" }}>{t("Cancel")}</button>
        </div>
      </div>
    </div>
  );
}
