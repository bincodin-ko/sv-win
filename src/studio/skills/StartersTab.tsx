// 5묶음 E7 S-2082·S-2083: Starters 탭 — 왼쪽 12개 목록, 오른쪽 미리보기(설명 + 본문)와 "Install to Personal"·"Install to Project".
// 이미 같은 이름이 어느 범위에든 있으면 "Installed" 로 표시하고 그 범위 버튼은 비활성.
import { useState } from "react";
import { useT } from "../../i18n";
import { skillsCreate, type SkillScope } from "../../lib/ipc";
import { composeSkill } from "./parse";
import { STARTERS, type Starter } from "./starters";
import { btn, errText, mono, primary, type Row } from "./view";

const has = (rows: Row[], name: string, scope?: SkillScope) => rows.some((r) => r.e.kind === "skill" && r.e.folderName === name && (scope ? r.e.scope === scope : r.e.scope !== "plugin"));

export function StarterList({ rows, selected, onSelect }: { rows: Row[]; selected: string; onSelect: (name: string) => void }) {
  const t = useT();
  return (
    <>
      {STARTERS.map((s) => (
        <button key={s.name} data-testid="starter-row" data-name={s.name} onClick={() => onSelect(s.name)}
          style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", border: 0, borderBottom: "1px solid var(--studio-line)", background: s.name === selected ? "var(--studio-sel)" : "transparent", color: "var(--fg)", font: "13px system-ui", cursor: "pointer" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ flex: 1, fontWeight: 600 }}>{t(s.title)}</span>
            {has(rows, s.name) && <span style={{ fontSize: 11, color: "var(--ok)" }}>{t("Installed")}</span>}
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 12 }}>/{s.name}</div>
        </button>
      ))}
    </>
  );
}

export function StarterPreview({ starter, rows, repo, onInstalled }: { starter: Starter; rows: Row[]; repo: string | null; onInstalled: () => void }) {
  const t = useT();
  const [error, setError] = useState("");
  const install = async (scope: SkillScope) => {
    try { setError(""); await skillsCreate(repo, scope, starter.name, composeSkill(starter)); onInstalled(); }
    catch (e) { setError(String(e)); }
  };
  const pers = has(rows, starter.name, "personal"), proj = has(rows, starter.name, "project");
  return (
    <div data-testid="starter-preview" style={{ padding: "14px 18px", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{t(starter.title)}</div>
        <code style={{ ...mono, color: "var(--text-dim)" }}>/{starter.name}</code>
        {(pers || proj) && <span data-testid="starter-installed" style={{ color: "var(--ok)" }}>{t("Installed")}</span>}
        <div style={{ flex: 1 }} />
        <button data-testid="starter-install-personal" style={pers ? btn : primary} disabled={pers} onClick={() => void install("personal")}>{t("Install to Personal")}</button>
        <button data-testid="starter-install-project" style={btn} disabled={proj || !repo} onClick={() => void install("project")}>{t("Install to Project")}</button>
      </div>
      <p style={{ color: "var(--fg-3)" }}>{t(starter.description)}</p>
      {error && <div data-testid="starter-error" style={errText}>{error}</div>}
      <pre style={{ ...mono, padding: 10, background: "var(--skill-code-bg)", borderRadius: 6, whiteSpace: "pre-wrap" }}>{starter.body}</pre>
    </div>
  );
}
