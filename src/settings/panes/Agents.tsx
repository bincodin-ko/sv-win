// S-370~S-376: Default agent / Yolo / Default shell / Alt as Meta / Agent executables / Your agents
import { useCallback, useEffect, useState } from "react";
import { agentsList, currentShell, customAgentsGet, customAgentsSet, defaultAgent, type AgentInfo } from "../../agents/api";
import { validateAgent, type CustomAgent } from "../../agents/custom";
import { TITLES } from "../../console/AgentPicker";
import { useBoard } from "../../board/store";
import { registry } from "../../board/boards";
import { pickFile } from "../../lib/ipc";
import { useSettings } from "../useSettings";
import { useT } from "../../i18n";
import LiveStatusRow from "./LiveStatusRow";

const EXES = ["claude", "codex", "gemini", "grok", "opencode"];
const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center" };
const hint: React.CSSProperties = { color: "var(--mute)", fontSize: 12 };

export default function Agents() {
  const t = useT();
  const s = useSettings((st) => st.s);
  const patch = useSettings.getState().patch;
  const [list, setList] = useState<AgentInfo[]>([]);
  const [customs, setCustoms] = useState<CustomAgent[]>([]);
  const [eff, setEff] = useState("claude");
  const [shellPath, setShellPath] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [error, setError] = useState("");
  const reload = useCallback(async () => { setList(await agentsList()); setCustoms(await customAgentsGet()); }, []);
  useEffect(() => { void reload(); void defaultAgent().then(setEff); void currentShell().then(setShellPath); }, [reload]);
  const defaultShell = typeof s.defaultShell === "string" ? s.defaultShell : "";
  useEffect(() => void currentShell().then(setShellPath), [defaultShell]);

  const current = typeof s.defaultAgent === "string" && s.defaultAgent ? s.defaultAgent : eff;
  const paths = (s.agentPaths ?? {}) as Record<string, string>;
  const setDefault = (id: string) => { patch({ defaultAgent: id }); setEff(id); for (const st of [useBoard, ...registry.values()]) st.getState().setArmed(id); }; // S-370: 무장도 이것(워크스페이스마다 저장소가 따로)
  const setPath = (id: string, p: string | null) => {
    const next = { ...paths };
    if (p) next[id] = p; else delete next[id];
    patch({ agentPaths: next });
    return reload(); // 실제 Rust 가 agentPaths 를 반영해 path·구역을 돌려주므로 다시 읽는다
  };
  const browse = async (id: string) => { const p = await pickFile(); if (p) await setPath(id, p); };
  const save = async (next: CustomAgent[]) => { setCustoms(next); await customAgentsSet(next); setList(await agentsList()); };
  const add = async () => {
    const r = validateAgent(customs, list.map((a) => a.name), name, command);
    if (!r.ok) return setError(errText(r.error));
    setError(""); setAdding(false); setName(""); setCommand("");
    await save([...customs, r.agent]);
  };
  const errText = (e: string) => {
    const m = /^An agent named "(.*)" already exists\.$/.exec(e);
    return m ? t('An agent named "{name}" already exists.', { name: m[1]! }) : t(e); // 나머지 두 문구는 사전에 있음(custom.ts)
  };
  const nameOf = (id: string) => list.find((a) => a.id === id)?.name ?? id;

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 560 }}>
      <label style={{ display: "grid", gap: 4 }}>{t("Default agent")}
        <select value={current} onChange={(e) => setDefault(e.target.value)}>
          {(Object.keys(TITLES) as (keyof typeof TITLES)[]).map((sec) => (
            <optgroup key={sec} label={t(TITLES[sec])}>
              {list.filter((a) => a.section === sec).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </optgroup>
          ))}
        </select>
        <span style={hint}>{t("Currently {name}. New consoles and the Spawn agent tool use it.", { name: nameOf(current) })}</span>
      </label>

      <div style={{ display: "grid", gap: 4 }}>
        <label style={row}>
          <input type="checkbox" checked={s.yolo === true} onChange={(e) => patch({ yolo: e.target.checked })} />
          {t("Yolo: skip permission prompts")}
        </label>
        {s.yolo === true && <div data-testid="yolo-warning" style={{ color: "var(--err-text)", fontSize: 12 }}>{t("Agents run commands and edit files without asking.")}</div>}
        <span style={hint}>{t("Applies to new consoles. Restart a running console to apply it.")}</span>
      </div>

      <label style={{ display: "grid", gap: 4 }}>{t("Default shell")}
        <input value={defaultShell} placeholder={shellPath} onChange={(e) => patch({ defaultShell: e.target.value || null })} />
        <span style={hint}>{t("Leave empty to use {shell}.", { shell: shellPath || "pwsh, powershell, then cmd" })}</span>
      </label>

      <label style={row}>
        <input type="checkbox" checked={s.altAsMeta !== false} onChange={(e) => patch({ altAsMeta: e.target.checked })} />
        {t("Use Alt as Meta key")}
      </label>

      <LiveStatusRow />

      <fieldset style={{ border: 0, padding: 0, display: "grid", gap: 8 }}>
        <legend style={{ marginBottom: 8 }}>{t("Agent executables")}</legend>
        {EXES.map((id) => {
          const found = list.find((a) => a.id === id)?.path;
          return (
            <div key={id} data-testid={`exe-${id}`} style={row}>
              <span style={{ width: 80 }}>{id}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: found ? "inherit" : "var(--mute)" }}>{found || t("Not found on PATH")}</span>
              <button onClick={() => void browse(id)}>{t("Browse")}</button>
              <button onClick={() => void setPath(id, null)}>{t("Reset")}</button>
            </div>
          );
        })}
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, display: "grid", gap: 8 }}>
        <legend style={{ marginBottom: 8 }}>{t("Your agents")}</legend>
        {customs.map((c) => (
          <div key={c.id} data-testid="custom-row" style={row}>
            <span style={{ flex: 1 }}>{c.name} <span style={hint}>{c.command}</span></span>
            <button onClick={() => void save(customs.filter((x) => x.id !== c.id))}>{t("Remove")}</button>
          </div>
        ))}
        {adding ? (
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ display: "grid", gap: 2 }}>{t("Name")}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label style={{ display: "grid", gap: 2 }}>{t("Command")}<input value={command} placeholder="mytool --flag" onChange={(e) => setCommand(e.target.value)} /></label>
            {error && <div role="alert" style={{ color: "var(--err-text)", fontSize: 12 }}>{error}</div>}
            <div style={row}><button onClick={() => void add()}>{t("Add")}</button><button onClick={() => { setAdding(false); setError(""); }}>{t("Cancel")}</button></div>
          </div>
        ) : (
          <button style={{ justifySelf: "start" }} onClick={() => setAdding(true)}>{t("Add an agent")}</button>
        )}
      </fieldset>
    </div>
  );
}
