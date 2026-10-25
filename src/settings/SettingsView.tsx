// S-350: 전체 화면 패널. role=dialog 라서 열려 있는 동안 보드 키는 쉰다(overlayOpen).
import { useRef } from "react";
import { PANES } from "./panes";
import { useUi } from "../ui/useUi";
import { useT } from "../i18n";
import { useModal } from "../ui/useModal";

export default function SettingsView() {
  const t = useT();
  const pane = useUi((s) => s.settings.pane);
  const ref = useRef<HTMLDivElement>(null);
  const close = useUi.getState().closeSettings;
  const cur = PANES.find((p) => p.id === pane) ?? PANES[0]!;
  useModal(ref, { onClose: close, initialFocus: () => ref.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') });
  // S-2607: pane 목록은 ↑↓(roving tabindex: 고른 탭만 Tab 정류장)
  const arrow = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
    tabs[(tabs.indexOf(document.activeElement as HTMLElement) + d + tabs.length) % tabs.length]?.focus();
  };
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={t("Settings")} tabIndex={-1}
      style={{ position: "fixed", inset: 0, zIndex: 15000, display: "flex", background: "var(--bg)", color: "var(--text)", outline: "none" }}>
      <div role="tablist" aria-orientation="vertical" onKeyDown={arrow} style={{ width: 200, padding: 12, borderRight: "1px solid var(--border)", background: "var(--panel)", display: "grid", alignContent: "start", gap: 2 }}>
        {PANES.map((p) => (
          <button key={p.id} role="tab" aria-selected={p.id === cur.id} tabIndex={p.id === cur.id ? 0 : -1} onClick={() => useUi.getState().openSettings(p.id)}
            style={{ textAlign: "left", padding: "6px 10px", border: 0, borderRadius: 6, color: "inherit", background: p.id === cur.id ? "var(--panel-2)" : "transparent" }}>
            {t(p.title)}
          </button>
        ))}
      </div>
      <div role="tabpanel" data-testid={`settings-pane-${cur.id}`} style={{ flex: 1, padding: 24, overflow: "auto" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>{t(cur.title)}</h2>
        <cur.Component />
      </div>
      <button data-testid="settings-close" aria-label={t("Close settings")} onClick={close} style={{ position: "absolute", top: 12, right: 16 }}>✕</button>
    </div>
  );
}
