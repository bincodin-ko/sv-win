// 5묶음 E7 S-2079: New skill — 이름(점검 ①과 같은 규칙으로 입력 중 검사)·설명·인자 힌트·범위·본문. 만들면 <범위 뿌리>/.claude/skills/<이름>/SKILL.md.
import { useState } from "react";
import { useT } from "../../i18n";
import { skillsCreate, type SkillScope } from "../../lib/ipc";
import { nameProblem } from "./checkup";
import { composeSkill } from "./parse";
import { btn, errText, field, mono, primary } from "./view";

const Label = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--text-dim)" }}>{t}{children}</label>
);

export default function NewForm({ repo, onCreated, onCancel }: { repo: string | null; onCreated: (path: string) => void; onCancel: () => void }) {
  const t = useT();
  const [name, setName] = useState(""), [desc, setDesc] = useState(""), [hint, setHint] = useState(""), [body, setBody] = useState("");
  const [scope, setScope] = useState<SkillScope>("personal");
  const [error, setError] = useState("");
  const problem = name ? nameProblem(name) : null;
  const create = async () => {
    try { onCreated(await skillsCreate(repo, scope, name, composeSkill({ name, description: desc, argumentHint: hint, body }))); }
    catch (e) { setError(String(e)); }
  };
  return (
    <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10, overflow: "auto" }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{t("New skill")}</div>
      <Label t={t("Name")}><input data-testid="new-name" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} style={field} autoFocus />
        {problem && <span data-testid="new-name-error" style={errText}>{problem}</span>}</Label>
      <Label t={t("Description")}><input data-testid="new-desc" value={desc} onChange={(e) => setDesc(e.target.value)} style={field} /></Label>
      <Label t={t("Argument hint (optional)")}><input data-testid="new-hint" value={hint} placeholder="[file]" onChange={(e) => setHint(e.target.value)} style={field} /></Label>
      <div style={{ display: "flex", gap: 16 }}>
        <label><input type="radio" data-testid="new-scope-personal" checked={scope === "personal"} onChange={() => setScope("personal")} /> {t("Personal (every repo)")}</label>
        <label style={{ opacity: repo ? 1 : 0.4 }}><input type="radio" data-testid="new-scope-project" disabled={!repo} checked={scope === "project"} onChange={() => setScope("project")} /> {t("Project (this repo only)")}</label>
      </div>
      <Label t={t("Body")}><textarea data-testid="new-body" value={body} rows={12} onChange={(e) => setBody(e.target.value)} style={{ ...field, ...mono, resize: "vertical" }} /></Label>
      {error && <div data-testid="new-error" style={errText}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button data-testid="new-create" style={primary} disabled={!name || !!problem} onClick={() => void create()}>{t("Create")}</button>
        <button data-testid="new-cancel" style={btn} onClick={onCancel}>{t("Cancel")}</button>
      </div>
    </div>
  );
}
