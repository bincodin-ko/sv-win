// D9 S-1453·S-1454·S-1456 Loop 폼. 칩·카드 모양은 추측, 구성은 영상(sheets/node-loops.jpg)
import { useEffect, useState } from "react";
import { agentsList, type AgentInfo } from "../agents/api";
import { pickerRows } from "../agents/transcriptSupport";
import { tm, useT } from "../i18n";
import { useSettings } from "../settings/useSettings";
import { openSettings } from "../ui/useUi";
import { canCreate, fixRanges, fromTemplate, outputError, TEMPLATES, toLoop, type Draft } from "./form";
import { summary } from "./summary";
import { PRESETS_MIN } from "./types";

export type Opt = { id: string; label: string };
const lab: React.CSSProperties = { font: "600 11px system-ui", color: "var(--mute)", letterSpacing: 0.6, margin: "14px 0 6px" };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--bd)", background: "var(--surface)", color: "var(--fg)", font: "13px system-ui" };
const chip = (on: boolean): React.CSSProperties => ({ padding: "4px 10px", borderRadius: 14, border: "1px solid var(--bd)", background: on ? "var(--accent)" : "var(--surface)", color: on ? "var(--accent-text)" : "var(--fg-2)", font: "12px system-ui", cursor: "pointer" });
const card = (on: boolean): React.CSSProperties => ({ flex: 1, padding: "8px 6px", borderRadius: 8, border: `1px solid ${on ? "var(--accent)" : "var(--bd)"}`, background: "var(--surface)", color: "var(--fg)", font: "12px system-ui", cursor: "pointer" });
const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const err: React.CSSProperties = { color: "var(--danger)", font: "12px system-ui", marginTop: 4 };

/** consoles = 이 워크스페이스 콘솔, cards = wired[] 를 가진 카드(orchestrator), count = 대상 콘솔 수(요약문용) */
export default function LoopForm({ initial, editing, consoles, cards, count, unhooked, onSubmit, onCancel }: { initial: Draft; editing: boolean; consoles: Opt[]; cards: Opt[]; count: (d: Draft) => number; unhooked: (d: Draft) => boolean; onSubmit: (d: Draft) => void; onCancel: () => void }) {
  const t = useT();
  const [d, setD] = useState(initial);
  const [notes, setNotes] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentInfo[] | null>(null); // null = 아직 모름(모두 고를 수 있게 둔다)
  useEffect(() => void agentsList().then(setAgents).catch(() => undefined), []);
  const live = useSettings((s) => s.s.liveStatus === true);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const settle = () => { const r = fixRanges(d); setD(r.draft); setNotes(r.notes); return r; };
  const oe = outputError(d);
  const tg = d.target;
  const num = (key: "runs" | "minutes" | "everyMin", id: string) => (
    <input data-testid={id} type="number" value={d[key]} onChange={(e) => set({ [key]: Number(e.target.value) })} onBlur={settle} style={{ ...field, width: 80 }} />
  );
  return (
    <div data-testid="loops-form" style={{ padding: "0 16px 16px" }}>
      <div style={lab}>{t("TEMPLATES")}</div>
      <div style={row}>{TEMPLATES.map((tpl, i) => <button key={tpl.name} data-testid={`lf-chip-${i}`} style={chip(d.template === tpl.name)} onClick={() => setD(fromTemplate(tpl))}>{t(tpl.name)}</button>)}</div>
      <div style={lab}>{t("NAME")}</div>
      <input data-testid="lf-name" value={d.name} placeholder={d.template ? t(d.template) : t("Loop")} onChange={(e) => set({ name: e.target.value })} style={field} />
      <div style={lab}>{t("INSTRUCTION")}</div>
      <textarea data-testid="lf-instruction" rows={3} value={d.instruction} onChange={(e) => set({ instruction: e.target.value })} style={{ ...field, resize: "vertical" }} />
      <div style={lab}>{t("WHEN")}</div>
      <div role="radiogroup" style={{ display: "flex", gap: 6 }}>
        {([["schedule", tm("On a schedule")], ["idle", tm("When an agent goes idle")], ["output", tm("When output contains…")]] as const).map(([k, label]) => (
          <button key={k} role="radio" aria-checked={d.kind === k} data-testid={`lf-when-${k}`} style={card(d.kind === k)} onClick={() => set({ kind: k })}>{t(label)}</button>
        ))}
      </div>
      {d.kind === "schedule" && (
        <div style={{ ...row, marginTop: 8 }}>
          {PRESETS_MIN.map((m) => <button key={m} data-testid={`lf-every-${m}`} aria-pressed={d.everyMin === m} style={chip(d.everyMin === m)} onClick={() => set({ everyMin: m })}>{m >= 60 ? t("{n} h", { n: m / 60 }) : t("{n} min", { n: m })}</button>)}
          <span style={{ font: "12px system-ui", color: "var(--fg-2)" }}>{t("every")}</span>{num("everyMin", "lf-every-n")}<span style={{ font: "12px system-ui", color: "var(--fg-2)" }}>{t("min")}</span>
        </div>
      )}
      {d.kind === "output" && (
        <div style={{ marginTop: 8 }}>
          <input data-testid="lf-output" value={d.outputText} placeholder={t("text to look for")} onChange={(e) => set({ outputText: e.target.value })} style={field} />
          {oe && <div data-testid="lf-output-error" style={err}>{oe}</div>}
        </div>
      )}
      {d.kind === "idle" && (!live || unhooked(d)) && (
        <div data-testid="lf-live-hint" style={{ ...err, color: "var(--warn-fg, var(--fg-2))" }}>
          {t("Needs live agent status — turn it on in Settings › Agents.")} <button style={{ ...chip(false), padding: "1px 8px" }} onClick={() => openSettings("agents")}>{t("Settings")}</button>
        </div>
      )}
      <div style={lab}>{t("TARGET")}</div>
      <div style={{ display: "grid", gap: 4, font: "13px system-ui", color: "var(--fg)" }}>
        <label style={{ justifySelf: "start" }}><input type="radio" name="lf-target" data-testid="lf-target-all" checked={tg.kind === "all"} onChange={() => set({ target: { kind: "all" } })} /> {t("All consoles")}</label>
        <label><input type="radio" name="lf-target" data-testid="lf-target-pick" checked={tg.kind === "pick"} onChange={() => set({ target: { kind: "pick", ids: [] } })} /> {t("Pick consoles")}</label>
        {tg.kind === "pick" && consoles.map((c) => (
          <label key={c.id} style={{ marginLeft: 22 }}>
            <input type="checkbox" data-testid={`lf-pick-${c.id}`} checked={tg.ids.includes(c.id)} onChange={(e) => set({ target: { kind: "pick", ids: e.target.checked ? [...tg.ids, c.id] : tg.ids.filter((x) => x !== c.id) } })} /> {c.label}
          </label>
        ))}
        {cards.map((c) => (
          <label key={c.id}><input type="radio" name="lf-target" data-testid={`lf-target-card-${c.id}`} checked={tg.kind === "card" && tg.id === c.id} onChange={() => set({ target: { kind: "card", id: c.id } })} /> {c.label}</label>
        ))}
      </div>
      <div style={lab}>{t("STOP")}</div>
      <div style={{ display: "grid", gap: 6, font: "13px system-ui", color: "var(--fg)" }}>
        <div style={row}><label><input type="checkbox" data-testid="lf-stop-runs" checked={d.runsOn} onChange={(e) => set({ runsOn: e.target.checked })} /> {t("After a number of runs")}</label>{d.runsOn && num("runs", "lf-runs")}</div>
        <div style={row}><label><input type="checkbox" data-testid="lf-stop-minutes" checked={d.minutesOn} onChange={(e) => set({ minutesOn: e.target.checked })} /> {t("After a time limit")}</label>{d.minutesOn && <>{num("minutes", "lf-minutes")} {t("min")}</>}</div>
        <div><label><input type="checkbox" data-testid="lf-stop-goal" checked={d.goalOn} onChange={(e) => set({ goalOn: e.target.checked })} /> {t("When a goal is met")}</label></div>
        {d.goalOn && (
          <div style={{ marginLeft: 22, display: "grid", gap: 6 }}>
            <label><input type="radio" name="lf-gm" data-testid="lf-goal-mode-command" checked={d.goalMode === "command"} onChange={() => set({ goalMode: "command" })} /> {t("A command passes")}</label>
            <label>
              <input type="radio" name="lf-gm" data-testid="lf-goal-mode-agent" checked={d.goalMode === "agent"} onChange={() => set({ goalMode: "agent" })} /> {t("An agent judges")}{" "}
              {d.goalMode === "agent" && <select data-testid="lf-goal-agent" value={d.goalAgent} onChange={(e) => set({ goalAgent: e.target.value })}>{pickerRows(agents ?? [], ["claude", "codex", "gemini", "opencode"]).filter((r) => !r.why).map((r) => <option key={r.id} value={r.id} disabled={agents !== null && !r.enabled}>{r.name}</option>)}</select>}
            </label>
            {d.goalMode === "agent" && <div data-testid="lf-goal-note" style={{ font: "12px system-ui", color: "var(--fg-2)" }}>{t("Each check uses a turn on your plan.")}</div>}
            <input data-testid="lf-goal" value={d.goalText} placeholder={d.goalMode === "command" ? "npm test" : t("All tests pass")} onChange={(e) => set({ goalText: e.target.value })} style={field} />
          </div>
        )}
      </div>
      <div style={lab}>{t("BEHAVIOR")}</div>
      <label style={{ font: "13px system-ui", color: "var(--fg)" }}><input type="checkbox" data-testid="lf-keep" checked={d.keepBehind} onChange={(e) => set({ keepBehind: e.target.checked })} /> {t("Keep running behind other tabs")}</label>
      <p data-testid="lf-summary" style={{ font: "12px system-ui", color: "var(--fg-2)", margin: "14px 0 0", width: "fit-content" }}>{summary({ ...d2l(d), id: "", enabled: false, wsId: "", repo: "" }, count(d), d.goalAgent === "codex" ? "Codex" : "Claude")}</p>
      {notes.length > 0 && <div data-testid="lf-notes" style={{ ...err, color: "var(--fg-2)" }}>{notes.join(" · ")}</div>}
      <div style={{ ...row, justifyContent: "flex-end", marginTop: 14 }}>
        <button data-testid="lf-cancel" style={chip(false)} onClick={onCancel}>{t("Cancel")}</button>
        <button data-testid="lf-create" disabled={!canCreate(d)} style={{ ...chip(true), opacity: canCreate(d) ? 1 : 0.4 }} onClick={() => onSubmit(settle().draft)}>{editing ? t("Save") : t("Create loop")}</button>
      </div>
    </div>
  );
}

// 요약문은 Loop 모양을 받는다: 폼 초안을 그 모양으로 잠깐 바꾼다
const d2l = (d: Draft) => toLoop(d, { wsId: "", repo: "", n: 0 });
