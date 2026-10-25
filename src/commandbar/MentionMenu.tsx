// S-550: "Direct to" 메뉴. 열고 닫기·고르기 상태는 CommandBar 가 쥔다(입력란이 포커스를 가진 채 ↑↓/Tab/Return 을 받는다).
import { useT } from "../i18n";
import type { MentionTarget } from "./mention";

export default function MentionMenu({ items, active, onPick }: { items: MentionTarget[]; active: number; onPick: (t: MentionTarget) => void }) {
  const t = useT();
  return (
    <div data-testid="mention-menu" role="menu" aria-label={t("Direct to")}
      style={{ position: "absolute", left: 0, bottom: "calc(100% + 6px)", minWidth: 220, maxHeight: 260, overflowY: "auto", background: "var(--surface)", color: "var(--fg-2)", border: "1px solid var(--bd)", borderRadius: 10, boxShadow: "0 8px 28px var(--scrim)", padding: 4, font: "13px system-ui", zIndex: 5 }}>
      <div style={{ padding: "4px 8px", font: "600 10px system-ui", letterSpacing: ".08em", color: "var(--mute)" }}>{t("DIRECT TO")}</div>
      {items.map((it, i) => (
        <div key={it.kind + it.label} role="menuitem" data-testid="mention-item" data-active={i === active}
          onMouseDown={(e) => { e.preventDefault(); onPick(it); }} // 입력란이 포커스를 잃지 않게
          style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "5px 8px", borderRadius: 6, cursor: "pointer", background: i === active ? "var(--surface-2)" : undefined }}>
          <span>{it.label}</span>
          <span style={{ color: "var(--mute)" }}>{it.kind === "console" ? it.hint : it.kind === "group" ? t("group") : t("all consoles")}</span>
        </div>
      ))}
    </div>
  );
}
