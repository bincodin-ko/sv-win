// S-356·S-357 + D10 S-1530(리셋 chime 세 줄)
import { SOUND_NAMES, playSound } from "../../usage/chime";
import { useSettings } from "../useSettings";
import { useLang, useT } from "../../i18n";
import { useEffect, useState } from "react";
import { usePlanner } from "../../planner/state";
import { PROVIDERS, baseUrlFor, isApi, modelFor } from "../../planner/providers";
import { apiReasonText } from "../../planner/fail";
import { plannerApiModels, plannerKeyClear, plannerKeyHas, plannerKeySet, type ApiErr } from "../../lib/ipc";
import { installedIds, plannerRowView } from "./plannerRow";

const sub = { color: "var(--mute)", font: "12px system-ui" } as const;
const rowStyle = { display: "flex", gap: 8, alignItems: "center", paddingLeft: 24 } as const;
const commit = (e: { key: string; currentTarget: HTMLInputElement }) => { if (e.key === "Enter") e.currentTarget.blur(); };

/** 모델·주소·키·연결 시험 줄 (S-3361~S-3365). 공급자가 바뀌면 key={id}로 새로 그려져 입력·결과가 지워진다 */
function PlannerExtra({ id }: { id: string }) {
  const t = useT();
  const st = useSettings((s) => s.s);
  const patch = useSettings.getState().patch;
  const api = isApi(id);
  const model = modelFor(st, id as never), url = baseUrlFor(st);
  const [m, setM] = useState(model), [u, setU] = useState(url);
  const [has, setHas] = useState(false), [key, setKey] = useState(""), [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false), [found, setFound] = useState<string[]>([]), [res, setRes] = useState("");
  useEffect(() => { if (api) void plannerKeyHas(id).then(setHas, () => setHas(false)); }, [id, api]);
  const stored = st.plannerModel && typeof st.plannerModel === "object" ? (st.plannerModel as Record<string, string>) : {};
  const save = async () => {
    const k = key;
    setKey(""); // 어떤 경우에도 입력란은 비운다 — 키는 이 호출 인자로만 남는다
    if (!k.trim()) return;
    try { await plannerKeySet(id, k); setHas(true); setErr(false); } catch { setErr(true); }
  };
  const test = async () => {
    setBusy(true); setRes("");
    try { const l = await plannerApiModels(id, id === "api:compat" ? url : undefined); setFound(l); setRes(t("Connected — {n} models", { n: l.length })); }
    catch (e) { setRes(apiReasonText((e && typeof e === "object" ? e : { kind: "bad" }) as ApiErr, id as never, model)); }
    setBusy(false);
  };
  const suggestions = [...new Set([...(PROVIDERS.find((p) => p.id === id)?.models ?? []), ...found])];
  return (
    <>
      <label style={rowStyle}>
        {t("Model")}
        <input data-testid="planner-model" list="planner-models" value={m} placeholder={t("CLI default")}
          onChange={(e) => setM(e.target.value)} onKeyDown={commit}
          onBlur={() => { const v = m.trim(); if (v !== model) patch({ plannerModel: { ...stored, [id]: v } }); }} />
        <datalist id="planner-models">{suggestions.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      {id === "api:compat" && (
        <>
          <label style={rowStyle}>
            {t("Server address")}
            <input data-testid="planner-baseurl" value={u} onChange={(e) => setU(e.target.value)} onKeyDown={commit}
              onBlur={() => { const v = u.trim(); if (v !== url) patch({ plannerBaseUrl: v }); }} />
          </label>
          <div style={{ ...sub, paddingLeft: 24 }}>{t("Ollama: http://localhost:11434/v1")}</div>
        </>
      )}
      {api && (
        <div style={rowStyle}>
          {has ? (
            <>
              <span data-testid="planner-key-state" style={sub}>{t("Key saved in Windows Credential Manager")}</span>
              <button data-testid="planner-key-clear" onClick={() => void plannerKeyClear(id).then(() => setHas(false))}>{t("Remove key")}</button>
            </>
          ) : (
            <>
              <input data-testid="planner-key" type="password" autoComplete="off" spellCheck={false} value={key}
                onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && key) void save(); }} />
              <button data-testid="planner-key-save" disabled={!key} onClick={() => void save()}>{t("Save key")}</button>
              {id === "api:compat" && <span style={sub}>{t("optional for local servers")}</span>}
              {err && <span data-testid="planner-key-error" style={sub}>{t("That key can't be saved")}</span>}
            </>
          )}
        </div>
      )}
      {api && (
        <div style={rowStyle}>
          <button data-testid="planner-test" disabled={busy} onClick={() => void test()}>{busy ? t("Testing…") : t("Test connection")}</button>
          {res && <span data-testid="planner-test-result" style={sub}>{res}</span>}
        </div>
      )}
    </>
  );
}

function Check({ k, label }: { k: "reopenLastRepo" | "resumeAgentChats" | "usageChime"; label: string }) {
  const on = useSettings((s) => s.s[k] !== false);
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input type="checkbox" checked={on} onChange={(e) => useSettings.getState().patch({ [k]: e.target.checked })} />
      {label}
    </label>
  );
}
export default function General() {
  const t = useT();
  const lang = useLang();
  const play = useSettings((s) => (s.s.chimePlay === "always" ? "always" : "only100"));
  const sound = useSettings((s) => (typeof s.s.chimeSound === "string" ? s.s.chimeSound : "Glass"));
  const patch = useSettings.getState().patch;
  const [installed, setInstalled] = useState<string[]>([]);
  useEffect(() => void installedIds().then(setInstalled), []);
  const setting = useSettings((s) => s.s.planner);
  const row = plannerRowView(setting, installed);
  const { status, lastFail } = usePlanner();
  const opt = (c: string) => <option key={c} value={c}>{t(PROVIDERS.find((p) => p.id === c)?.label ?? c)}</option>;
  const statusText = status === "ready" ? t("Ready") : status === "login" ? t("Sign in needed — run {cli} once in a console", { cli: row.value }) : status === "failed" ? t("Last try failed: {reason}", { reason: lastFail ?? "" }) : "";
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Check k="reopenLastRepo" label={t("Reopen last repo on launch")} />
      <Check k="resumeAgentChats" label={t("Resume agent chats")} />
      <Check k="usageChime" label={t("Chime when usage resets")} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 24 }}>
        {t("Play")}
        <select data-testid="chime-play" value={play} onChange={(e) => patch({ chimePlay: e.target.value })}>
          <option value="only100">{t("Only after 100%")}</option>
          <option value="always">{t("Always")}</option>
        </select>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 24 }}>
        {t("Sound")}
        <select data-testid="chime-sound" value={sound} onChange={(e) => patch({ chimeSound: e.target.value })}>
          {SOUND_NAMES.map((n) => <option key={n}>{n}</option>)}
        </select>
        <button data-testid="chime-preview" onClick={() => playSound(sound)}>{t("Preview")}</button>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {t("Language")}
        <select data-testid="set-language" value={lang} onChange={(e) => patch({ language: e.target.value })}>
          <option value="en">English</option>
          <option value="ko">한국어</option>
        </select>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {t("Planner")}
        <select data-testid="set-planner" value={row.value} onChange={(e) => patch({ planner: e.target.value })}>
          {row.cli.length > 0 && <optgroup label={t("CLI — uses your plan")}>{row.cli.map(opt)}</optgroup>}
          <optgroup label={t("API key — billed per use")}>{row.api.map(opt)}</optgroup>
          <option value="off">{t("Off")}</option>
        </select>
        {statusText && <span data-testid="planner-status" style={{ color: "var(--mute)", font: "12px system-ui" }}>{statusText}</span>}
      </label>
      {row.value !== "off" && <PlannerExtra key={row.value} id={row.value} />}
    </div>
  );
}

