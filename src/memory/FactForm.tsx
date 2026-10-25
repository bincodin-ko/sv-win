// S-1364·S-1365: 사실 편집 폼. 종류 칩 6개 · 제목 · 본문 · APPLIED TO · Save memory · Delete(두 번 눌러야)
import { useState } from "react";
import { useT } from "../i18n";
import type { MemoryFact } from "../lib/ipc";
import { canSave, KINDS, kindVar, type Draft } from "./facts";
import { useMemory } from "./useMemory";

const lab: React.CSSProperties = { color: "var(--text-dim)", fontSize: 11, letterSpacing: 0.5, margin: "12px 0 4px" };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--well)", color: "var(--text)", border: "1px solid var(--bd)", borderRadius: 6, padding: "6px 8px", font: "13px system-ui" };
const pill = (on: boolean, color = "var(--accent)"): React.CSSProperties => ({ cursor: "pointer", padding: "3px 10px", borderRadius: 999, border: `1px solid ${on ? color : "var(--bd)"}`, background: on ? "var(--panel-2)" : "none", color: on ? color : "var(--text-dim)", font: "12px system-ui" });

export default function FactForm({ repo, initial, fact }: { repo: string | null; initial: Draft; fact?: MemoryFact }) {
  const t = useT();
  const [d, setD] = useState(initial);
  const armed = useMemory((s) => s.delArm) === fact?.id && !!fact;
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  return (
    <div data-testid="memory-form">
      <div style={lab}>{t("KIND")}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {KINDS.map((k) => <button key={k} data-testid={`memory-kind-${k}`} aria-pressed={d.kind === k} onClick={() => set({ kind: k })} style={pill(d.kind === k, `var(${kindVar(k)})`)}>{t(k)}</button>)}
      </div>
      <div style={lab}>{t("TITLE")}</div>
      <input data-testid="memory-title" value={d.title} onChange={(e) => set({ title: e.target.value })} style={field} autoFocus />
      <div style={lab}>{t("DETAILS")}</div>
      <textarea data-testid="memory-body" value={d.body} onChange={(e) => set({ body: e.target.value })} rows={5} style={{ ...field, resize: "vertical" }} />
      <div style={lab}>{t("APPLIED TO")}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <button data-testid="memory-scope-repo" aria-pressed={d.scope === "repo"} disabled={!repo} onClick={() => set({ scope: "repo" })} style={pill(d.scope === "repo")}>{t("This repo")}</button>
        <button data-testid="memory-scope-all" aria-pressed={d.scope === "all"} onClick={() => set({ scope: "all" })} style={pill(d.scope === "all")}>{t("All repos")}</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
        <button data-testid="memory-save" disabled={!canSave(d.title)} onClick={() => void useMemory.getState().save(repo, d)}
          style={{ ...pill(true), background: "var(--accent)", color: "var(--accent-text)", border: 0, padding: "6px 16px", fontWeight: 600, opacity: canSave(d.title) ? 1 : 0.4 }}>{t("Save memory")}</button>
        <button data-testid="memory-back" onClick={() => useMemory.getState().closeEdit()} style={pill(false)}>{t("Back")}</button>
        <span style={{ flex: 1 }} />
        {fact && <button data-testid="memory-delete" onClick={() => void useMemory.getState().del(repo, fact)} style={{ ...pill(armed, "var(--danger)"), color: "var(--danger)", borderColor: "var(--danger)" }}>{armed ? t("Delete?") : t("Delete")}</button>}
      </div>
    </div>
  );
}
