// 5묶음 E1 S-1800: 열린 스튜디오 하나만 그린다(열림 상태 = useUi.studio). AppShell 에 한 줄. + 저장 안 한 편집 확인창(S-1810)
import { useRef } from "react";
import { create } from "zustand";
import { useT } from "../i18n";
import { useModal } from "../ui/useModal";
import { useUi } from "../ui/useUi";
import "./index";
import { getStudio } from "./registry";
import { registerTestStudios } from "./testStudios";
import { setUnsavedAsker, type Answer } from "./unsaved";

if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window) && window.location.search.includes("studioTest")) registerTestStudios();

const useAsk = create<{ ask: { label: string; done: (a: Answer) => void } | null }>(() => ({ ask: null }));
setUnsavedAsker((label) => new Promise<Answer>((resolve) => {
  useAsk.getState().ask?.done("cancel");
  useAsk.setState({ ask: { label, done: resolve } });
}));

const btn: React.CSSProperties = { padding: "6px 14px", borderRadius: 6, border: "1px solid var(--bd-2)", background: "var(--surface-2)", color: "var(--fg)", font: "13px system-ui", cursor: "pointer" };

function UnsavedDialog() {
  const ask = useAsk((s) => s.ask);
  return ask ? <Ask ask={ask} /> : null;
}

// S-2605·S-2606·S-2740: 주 동작(Save) 왼쪽 → Cancel 오른쪽, 기본 포커스 Save(위험 확인창이 아니다), Esc = Cancel
function Ask({ ask }: { ask: { label: string; done: (a: Answer) => void } }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const save = useRef<HTMLButtonElement>(null);
  const done = (a: Answer) => { useAsk.setState({ ask: null }); ask.done(a); };
  useModal(box, { onClose: () => done("cancel"), initialFocus: () => save.current });
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 20000, display: "grid", placeItems: "center", background: "var(--scrim-50)" }} onPointerDown={(e) => e.stopPropagation()}>
      <div ref={box} data-testid="unsaved-dialog" role="dialog" aria-modal="true" aria-label={t("Save your {label} changes?", { label: t(ask.label) })}
        style={{ width: 380, padding: 20, borderRadius: 12, background: "var(--surface)", color: "var(--fg)", border: "1px solid var(--bd)", font: "13px system-ui" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{t("Save your {label} changes?", { label: t(ask.label) })}</div>
        <div style={{ color: "var(--fg-4)", marginBottom: 16 }}>{t("Your changes will be lost if you don't save them.")}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button ref={save} onClick={() => done("save")} style={{ ...btn, border: 0, background: "var(--accent)", color: "var(--accent-text)" }}>{t("Save")}</button>
          <button onClick={() => done("discard")} style={btn}>{t("Don't Save")}</button>
          <button onClick={() => done("cancel")} style={btn}>{t("Cancel")}</button>
        </div>
      </div>
    </div>
  );
}

export default function StudioHost() {
  const s = useUi((u) => u.studio);
  const def = s.open ? getStudio(s.open) : undefined;
  return (
    <>
      {def && <def.Component key={def.id} arg={s.arg} />}
      <UnsavedDialog />
    </>
  );
}
