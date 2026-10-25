// B14 카드: 이름 + 구성 요약(S-653), 건너뛰는 타일이 있으면 작은 표시(S-641)
import type { PresetDef } from "./defs";
import { registryOpts } from "./deploy";
import { cardSummary, skippedKinds } from "./ui";
import { tp, useT } from "../i18n";

export default function PresetCard({ def, selected, onSelect }: { def: PresetDef; selected: boolean; onSelect: () => void }) {
  const t = useT();
  const skipped = skippedKinds(def, registryOpts(def).knownKinds); // registry 에 없는 종류만 건너뜀(S-1164)
  return (
    <button data-testid="preset-card" data-name={def.name} aria-pressed={selected} onClick={onSelect}
      style={{ textAlign: "left", display: "grid", gap: 4, padding: 12, borderRadius: 10, border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`, background: "var(--panel-2)", color: "var(--text)", font: "13px system-ui", cursor: "pointer" }}>
      <span style={{ fontWeight: 600 }}>{t(def.name)}</span>
      <span style={{ color: "var(--text-dim)", fontSize: 12 }}>{cardSummary(def)}</span>
      {skipped.length > 0 && <span data-testid="preset-skipped" title={t("Not placed yet: {kinds}", { kinds: skipped.join(", ") })} style={{ color: "var(--text-dim)", fontSize: 11 }}>{tp("+ {n} helper tile skipped", "+ {n} helper tiles skipped", skipped.length)}</span>}
    </button>
  );
}
