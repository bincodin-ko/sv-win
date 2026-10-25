// S-1306~S-1309 검사창: 콘솔·그룹·카드 하나를 자세히 + 버튼
import { useEffect, useReducer, useState } from "react";
import { t, tm, tp, useT } from "../i18n";
import { getSession } from "../console/session";
import { pauseSession, resumeSession } from "../console/pause";
import { sessionKey } from "../console/sessionKey";
import { click as killClick, idle as killIdle, isArmed, CONFIRM_MS } from "../commandbar/killAll";
import { useLive } from "../livestatus/useLive";
import { confirmDialog } from "../ui/ConfirmDialog";
import { elapsedMs, fmtElapsed } from "./since";
import { taskOf } from "./tasks";
import type { MCard, MConsole, MGroup, MModel } from "./model";
import { subStateText, type Sub } from "./subagents";

export type Sel = { kind: "con" | "group" | "card"; id: string } | null;
export const STATE_LABEL = { working: tm("Working"), needs: tm("Needs you"), idle: tm("Idle"), done: tm("Done") } as const;
export const STATE_COLOR = { working: "var(--ok)", needs: "var(--warn)", idle: "var(--mute-2)", done: "var(--mute-3)" } as const;
const label = (c: MConsole) => t(c.status === "PAUSED" ? tm("Paused") : STATE_LABEL[c.state]);

const row = { display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0" } as const;
const dim = { color: "var(--mute)" } as const;
const btn = (primary = false, danger = false) => ({ padding: "6px 10px", borderRadius: 6, border: `1px solid ${primary ? "var(--accent)" : danger ? "var(--danger)" : "var(--bd)"}`, background: primary ? "var(--accent)" : "var(--surface-2)", color: primary ? "var(--accent-text)" : "var(--fg)", cursor: "pointer", font: "12px system-ui" }) as const;

type Go = (s: NonNullable<Sel>) => void;

export default function Inspector({ sel, model, wsId, onGo, subs = {} }: { sel: Sel; model: MModel; wsId: string; onGo: Go; subs?: Record<string, Sub[]> }) {
  useT();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => { const t = setInterval(bump, 1000); return () => clearInterval(t); }, []); // "이 상태로 지낸 시간"
  if (!sel) return <div data-testid="mm-inspector-hint" style={{ ...dim, padding: "12px 0" }}>{t("Click a console, team or card to inspect it.")}</div>;
  if (sel.kind === "con") {
    const c = model.consoles.find((x) => x.id === sel.id);
    return c ? <ConsoleView c={c} wsId={wsId} onGo={onGo} subs={subs[c.id] ?? []} /> : null;
  }
  if (sel.kind === "group") {
    const g = model.groups.find((x) => x.id === sel.id);
    return g ? <GroupView g={g} model={model} wsId={wsId} onGo={onGo} /> : null;
  }
  const k = model.cards.find((x) => x.id === sel.id);
  return k ? <CardView k={k} onGo={onGo} /> : null;
}

function Head({ name, sub, color }: { name: string; sub?: string; color?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 14 }}>{color && <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />}{name}</div>
      {sub && <div style={{ ...dim, fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

function ConsoleView({ c, wsId, onGo, subs }: { c: MConsole; wsId: string; onGo: Go; subs: Sub[] }) {
  const key = sessionKey(wsId, c.id);
  const s = getSession(wsId, c.id);
  const detail = useLive((l) => l.detail[key]);
  const task = taskOf(key);
  const running = !!s?.isRunning(), paused = !!s?.isPaused();
  const secs = Math.floor(elapsedMs(key, c.status) / 1000);
  const [kill, setKill] = useState(killIdle);
  const armed = isArmed(kill, Date.now());
  const onKill = async () => {
    const r = killClick(kill, Date.now());
    setKill(r.state);
    if (!r.ask) return void setTimeout(() => setKill((k) => ({ ...k })), CONFIRM_MS + 50); // 3초 뒤 라벨을 되돌린다
    if (await confirmDialog({ title: t("Kill {name}'s session?", { name: c.name }), message: t("The console stays on the board and shows Done."), confirmLabel: t("Kill"), danger: true })) s?.kill();
  };
  return (
    <div data-testid="mm-inspector" data-kind="console">
      <Head name={c.name} sub={c.sub} color={STATE_COLOR[c.state]} />
      <div style={row}><span style={dim}>{t("Status")}</span><span data-testid="mm-status">{label(c)}</span></div>
      <div style={row}><span style={dim}>{t("Doing")}</span><span data-testid="mm-doing" style={{ textAlign: "right" }}>{detail || "—"}</span></div>
      <div style={row}><span style={dim}>{t("For")}</span><span data-testid="mm-since">{fmtElapsed(secs)}</span></div>
      <div style={{ ...row, flexDirection: "column", gap: 2 }}><span style={dim}>{t("Task")}</span><span data-testid="mm-task" style={{ wordBreak: "break-word" }}>{task ? task.text.slice(0, 60) : t("No task yet")}</span></div>
      {subs.length > 0 && (
        <div data-testid="mm-subs" style={{ marginTop: 8 }}>
          <div style={dim}>{t("Subagents ({n})", { n: subs.length })}</div>
          {[...subs].sort((a, b) => b.startedAt - a.startedAt).slice(0, 20).map((x) => (
            <div key={x.id} data-testid="mm-subs-row" data-state={x.state} style={{ padding: "3px 0", wordBreak: "break-word" }}>
              <div style={{ fontWeight: 600 }}>{x.name}</div>
              <div style={dim}>{x.title}</div>
              <div style={dim}>{subStateText(x, Date.now())} · {new Date(x.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        <button data-testid="mm-act-goto" style={btn(true)} onClick={() => onGo({ kind: "con", id: c.id })}>{t("Go to the console")}</button>
        {running && !paused && <button data-testid="mm-act-pause" style={btn()} onClick={() => s && pauseSession(s)}>{t("Pause")}</button>}
        {paused && <button data-testid="mm-act-resume" style={btn()} onClick={() => s && resumeSession(s)}>{t("Resume")}</button>}
        {s && !running && <button data-testid="mm-act-restart" style={btn()} onClick={() => s.restart()}>{t("Relaunch")}</button>}
        {running && <button data-testid="mm-act-kill" style={btn(false, true)} onClick={() => void onKill()}>{armed ? t("Confirm?") : t("Kill")}</button>}
      </div>
    </div>
  );
}

function GroupView({ g, model, wsId, onGo }: { g: MGroup; model: MModel; wsId: string; onGo: Go }) {
  const task = taskOf(sessionKey(wsId, g.id));
  const mem = model.consoles.filter((c) => g.memberIds.includes(c.id));
  const n = (st: MConsole["state"]) => mem.filter((c) => c.state === st).length;
  return (
    <div data-testid="mm-inspector" data-kind="group">
      <Head name={g.name} sub={tp("{n} console", "{n} consoles", g.total)} />
      <div style={{ ...row, flexDirection: "column", gap: 2 }}><span style={dim}>{t("Current or last task")}</span><span data-testid="mm-task" style={{ wordBreak: "break-word" }}>{task ? task.text.slice(0, 120) : t("No task yet")}</span></div>
      <div data-testid="mm-members" style={row}><span style={dim}>{t("Members")}</span><span>{t("{w} working · {n} needs you · {i} idle · {d} done", { w: n("working"), n: n("needs"), i: n("idle"), d: n("done") })}</span></div>
      <div style={{ marginTop: 10 }}><button data-testid="mm-act-goto" style={btn(true)} onClick={() => onGo({ kind: "group", id: g.id })}>{t("Freeze the team on the board")}</button></div>
    </div>
  );
}

function CardView({ k, onGo }: { k: MCard; onGo: Go }) {
  return (
    <div data-testid="mm-inspector" data-kind="card">
      <Head name={k.name} sub={tp("{n} agent", "{n} agents", k.agents)} />
      <div style={{ ...row, flexDirection: "column", gap: 2 }}><span style={dim}>{t("Last instruction")}</span><span data-testid="mm-task" style={{ wordBreak: "break-word" }}>{k.lastOrder || t("No instruction yet")}</span></div>
      <div style={row}><span style={dim}>{t("Directs")}</span><span>{tp("{n} console", "{n} consoles", k.agents)}</span></div>
      <div style={{ marginTop: 10 }}><button data-testid="mm-act-goto" style={btn(true)} onClick={() => onGo({ kind: "card", id: k.id })}>{t("Go to the card")}</button></div>
    </div>
  );
}
