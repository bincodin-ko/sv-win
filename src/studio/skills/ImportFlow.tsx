// 5묶음 E7 S-2080: Import — 폴더를 골랐고(SKILL.md 확인은 SkillsStudio 가 먼저 했다) 범위를 고른다. 같은 이름이 있으면 Rust 가 거절(덮어쓰지 않음).
import { useT } from "../../i18n";
import type { SkillScope } from "../../lib/ipc";
import { btn, errText, primary } from "./view";

export interface Imp { src: string; name?: string; error?: string }

export default function ImportFlow({ imp, hasRepo, onImport, onCancel }: { imp: Imp; hasRepo: boolean; onImport: (s: SkillScope) => void; onCancel: () => void }) {
  const t = useT();
  return (
    <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{t("Import a skill")}</div>
      <div style={{ color: "var(--text-dim)", overflowWrap: "anywhere" }}>{imp.src}</div>
      {imp.error && <div data-testid="import-error" style={errText}>{imp.error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        {imp.name && !imp.error?.includes("SKILL.md") && (
          <>
            <button data-testid="import-to-personal" style={primary} onClick={() => onImport("personal")}>{t("Import to Personal")}</button>
            <button data-testid="import-to-project" style={btn} disabled={!hasRepo} onClick={() => onImport("project")}>{t("Import to Project")}</button>
          </>
        )}
        <button data-testid="import-cancel" style={btn} onClick={onCancel}>{t("Cancel")}</button>
      </div>
    </div>
  );
}
