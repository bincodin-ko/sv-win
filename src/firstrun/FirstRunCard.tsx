// S-390~S-400·S-2700~S-2702: 홈 화면 위에 뜨는 첫 실행 설정 카드. 세 단계가 모두 마운트돼 있고 지금 단계만 보인다(입력이 단계를 벗어나도 남는다, S-400).
import { useEffect, useRef, useState } from "react";
import { agentsList, defaultAgent, type AgentInfo } from "../agents/api";
import { registry } from "../board/boards";
import { useBoard } from "../board/store";
import { useSettings } from "../settings/useSettings";
import { openRepo, useShell } from "../shell/useShell";
import { useModal } from "../ui/useModal";
import AgentStep from "./AgentStep";
import RepoStep from "./RepoStep";
import ThemeStep from "./ThemeStep";
import { back, header, next, type Step } from "./steps";
import { useT } from "../i18n";

/** 그 repo 의 보드가 불러와질 때까지 기다린 뒤 wsId (5초 안에 안 뜨면 null) */
const loadedWs = (path: string) =>
  new Promise<string | null>((res) => {
    const find = () => {
      const r = useShell.getState().openRepos.find((x) => x.path === path);
      return r?.workspaces.find((w) => w.id === r.activeWs && w.loaded)?.id ?? null;
    };
    const done = (v: string | null) => (off(), clearTimeout(tm), res(v));
    const off = useShell.subscribe(() => { const id = find(); if (id) done(id); });
    const tm = setTimeout(() => done(null), 5000);
    const id = find();
    if (id) done(id);
  });

const btn: React.CSSProperties = { padding: "7px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer" };

/** add: 폴더를 repo 로 등록(홈 목록에도 반영). onDone: 카드를 걷는다 */
export default function FirstRunCard({ add, onDone }: { add: (path: string) => Promise<void>; onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState<Step>(1);
  const [added, setAdded] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [sel, setSel] = useState("");
  useEffect(() => void Promise.all([agentsList(), defaultAgent()]).then(([l, d]) => (setAgents(l), setSel((s) => s || d))), []);

  const arm = (id: string) => {
    setSel(id);
    useSettings.getState().patch({ defaultAgent: id });
    for (const st of [useBoard, ...registry.values()]) st.getState().setArmed(id); // S-397: 고르면 기본 에이전트+무장
  };
  const addRepo = async (p: string) => {
    await add(p);
    setAdded((a) => (a.includes(p) ? a : [...a, p]));
  };
  const box = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null); // Next(마지막은 Start)
  useModal(box, { onClose: () => close(), initialFocus: () => action.current }); // S-2702: Tab 가두기·Esc = ×
  useEffect(() => action.current?.focus(), [step]);
  const close = () => {
    useSettings.getState().patch({ firstRunDone: true }); // S-399: 지금까지 고른 것은 유지, 기본 에이전트는 S-167 에 맡김
    onDone();
  };
  const start = async () => {
    if (sel) arm(sel);
    useSettings.getState().patch({ firstRunDone: true });
    onDone();
    if (!added[0] || !(await openRepo(added[0]))) return; // S-398: 처음 더한 repo 의 보드
    const ws = sel ? await loadedWs(added[0]) : null;
    if (ws) registry.get(ws)?.getState().spawnAgent(sel); // S-2700: 고른 에이전트 1개
  };
  const onKey = (e: React.KeyboardEvent) => {
    // Enter: 단추·입력칸이 아닌 곳이면 Next (단추는 자기 동작)
    if (e.key === "Enter" && step < 3 && !(e.target as HTMLElement).closest("button, a, select, textarea, input:not([type=radio]):not([type=checkbox])")) setStep(next(step));
  };
  const show = (n: Step) => ({ display: step === n ? "block" : "none" });
  const name = agents.find((a) => a.id === sel)?.name ?? sel;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, display: "grid", placeItems: "center", background: "var(--scrim-50)" }}>
      <div ref={box} onKeyDown={onKey} data-testid="firstrun" role="dialog" aria-modal="true" aria-label={t("Setup")}
        style={{ width: "min(520px, calc(100% - 48px))", maxHeight: "calc(100% - 48px)", overflow: "auto", boxSizing: "border-box", padding: 20, borderRadius: 12, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span data-testid="fr-step" style={{ fontSize: 12, color: "var(--text-dim)" }}>{header(step)}</span>
          <button data-testid="fr-close" aria-label={t("Close")} title={t("Skip setup")} onClick={close} style={{ all: "unset", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
        </div>
        <div style={show(1)}><ThemeStep /></div>
        <div style={show(2)}><RepoStep add={addRepo} added={added} /></div>
        <div style={show(3)}><AgentStep list={agents} sel={sel} onSel={arm} /></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {step > 1 ? <button data-testid="fr-back" style={btn} onClick={() => setStep(back(step))}>{t("Back")}</button> : <span />}
          {step < 3 ? (
            <button ref={action} data-testid="fr-next" style={btn} onClick={() => setStep(next(step))}>{t("Next")}</button>
          ) : (
            <button ref={action} data-testid="fr-start" style={{ ...btn, background: "var(--text)", color: "var(--bg)" }} onClick={() => void start()}>{t("Start with {name}", { name })}</button>
          )}
        </div>
      </div>
    </div>
  );
}
