// D9 S-1452 목록 한 줄: 이름 · "in 14:53"/"off" · ▶ · 토글 · 편집 · 삭제(두 번 클릭)
import { useState } from "react";
import { useT } from "../i18n";
import type { Rt } from "./store";
import { countdown } from "./trigger";
import type { Loop } from "./types";

const ib: React.CSSProperties = { all: "unset", cursor: "pointer", padding: "2px 7px", borderRadius: 6, color: "var(--fg-2)", font: "13px system-ui" };

export default function LoopRow({ loop, rt, now, onRun, onToggle, onEdit, onDelete }: { loop: Loop; rt?: Rt; now: number; onRun: () => void; onToggle: (on: boolean) => void; onEdit: () => void; onDelete: () => void }) {
  const t = useT();
  const [armed, setArmed] = useState(false);
  const when = !loop.enabled ? t("off") : rt?.nextAt != null ? countdown(rt.nextAt, now) : loop.trigger.kind === "idle" ? t("on idle") : t("watching");
  return (
    <div data-testid="loop-row" data-loop-id={loop.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: "1px solid var(--bd)" }}>
      <span data-testid="loop-name" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", font: "13px system-ui", color: "var(--fg)" }}>{loop.name}</span>
      <span data-testid="loop-countdown" style={{ font: "12px ui-monospace, monospace", color: "var(--mute)" }}>{when}</span>
      <button data-testid="loop-run" aria-label={t("Run now")} title={t("Run now")} style={ib} onClick={onRun}>▶</button>
      <input data-testid="loop-toggle" type="checkbox" aria-label={t("Enabled")} checked={loop.enabled} onChange={(e) => onToggle(e.target.checked)} />
      <button data-testid="loop-edit" aria-label={t("Edit")} title={t("Edit")} style={ib} onClick={onEdit}>✎</button>
      <button data-testid="loop-delete" aria-label={armed ? t("Click again to delete") : t("Delete")} title={armed ? t("Click again to delete") : t("Delete")} style={{ ...ib, color: armed ? "var(--danger)" : "var(--fg-2)" }}
        onBlur={() => setArmed(false)} onClick={() => (armed ? onDelete() : setArmed(true))}>×</button>
    </div>
  );
}
