// D9 S-1450~S-1458 가운데 Loops 모달(폭 860, 영상 node-loops.jpg; 뒤 보드는 그대로 조작됨): 빈 상태(템플릿 7장) · 목록 · 폼 · 기록
import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n";
import { getStore } from "../board/boards";
import { wiredTargets } from "../board/wired";
import { getSession } from "../console/session";
import { targetNodeIds } from "./targets";
import { useShell } from "../shell/useShell";
import { useUi } from "../ui/useUi";
import History from "./History";
import LoopForm, { type Opt } from "./LoopForm";
import LoopRow from "./LoopRow";
import { emptyDraft, fromLoop, fromTemplate, TEMPLATES, toLoop, type Draft } from "./form";
import { runNow } from "./start";
import { useLoops } from "./store";
import { loopNow } from "./trigger";

const head: React.CSSProperties = { font: "600 11px system-ui", color: "var(--mute)", letterSpacing: 0.6 };
const btn: React.CSSProperties = { padding: "6px 14px", borderRadius: 8, border: "1px solid var(--bd)", background: "var(--surface)", color: "var(--fg)", font: "13px system-ui", cursor: "pointer" };
type Form = { id: string | null; draft: Draft } | null;

export default function LoopsPanel() {
  const t = useT();
  const repo = useShell((s) => s.activeRepo) ?? "";
  const wsId = useShell((s) => s.openRepos.find((r) => r.path === s.activeRepo)?.activeWs) ?? "";
  const all = useLoops((s) => s.loops);
  const rt = useLoops((s) => s.rt);
  const history = useLoops((s) => s.history);
  const loops = useMemo(() => all.filter((l) => l.repo === repo), [all, repo]); // S-1457: repo 별 목록
  const store = getStore(wsId);
  const nodes = store((s) => s.nodes);
  const groups = store((s) => s.groups);
  const [form, setForm] = useState<Form>(null);
  const [now, setNow] = useState(loopNow());
  useEffect(() => {
    const h = setInterval(() => setNow(loopNow()), 500);
    return () => clearInterval(h);
  }, []);

  const consoles: Opt[] = Object.values(nodes).filter((n) => n.kind === "console").map((n) => ({ id: n.id, label: String(n.name ?? n.id) }));
  const cards: Opt[] = Object.values(nodes).filter((n) => n.kind === "orchestrator" && Array.isArray(n.wired)).map((n) => ({ id: n.id, label: `${String(n.name ?? n.kind)} (${n.id})` }));
  const count = (d: Draft) => (d.target.kind === "all" ? consoles.length : d.target.kind === "pick" ? d.target.ids.length : nodes[d.target.id] ? wiredTargets(nodes, groups, nodes[d.target.id]!).consoles.length : 0);

  // S-1456: 대상 콘솔 중 live status(hook)가 아직 없는 것이 있다
  const unhooked = (d: Draft) => targetNodeIds(d.target, nodes, groups).some((id) => !getSession(wsId, id)?.hooked());

  const submit = (d: Draft) => {
    const st = useLoops.getState();
    const fields = toLoop(d, { wsId, repo, n: loops.length + 1 });
    if (form?.id) {
      const { wsId: _w, repo: _r, ...rest } = fields; // 만든 곳은 그대로
      st.update(form.id, rest);
    } else st.setEnabled(st.add(fields), true); // S-1455: 저장하고 켠다
    setForm(null);
  };
  const names = new Map(all.map((l) => [l.id, l.name]));
  const mine = history.filter((e) => loops.some((l) => l.id === e.loop));

  return (
    <aside data-testid="loops-panel" aria-label={t("Loops")} style={{ position: "fixed", top: 120, left: "50%", transform: "translateX(-50%)", width: 860, maxHeight: "calc(100vh - 160px)", zIndex: 8000, display: "flex", flexDirection: "column", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 8px 32px var(--scrim-40)" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "12px 16px" }}>
        <span style={{ font: "600 15px system-ui", color: "var(--fg)" }}>{t("Loops")}</span>
        <button data-testid="loops-close" aria-label={t("Close")} onClick={() => useUi.getState().closeLoops()} style={{ all: "unset", marginLeft: "auto", cursor: "pointer", padding: "2px 8px", color: "var(--fg-2)", font: "16px system-ui" }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {form ? (
          <LoopForm key={form.id ?? "new"} initial={form.draft} editing={!!form.id} consoles={consoles} cards={cards} count={count} unhooked={unhooked} onSubmit={submit} onCancel={() => setForm(null)} />
        ) : loops.length === 0 ? (
          <div data-testid="loops-empty" style={{ padding: "0 16px 16px" }}>
            <div style={{ ...head, marginBottom: 8 }}>{t("TEMPLATES")}</div>
            <div style={{ display: "grid", gap: 8 }}>
              {TEMPLATES.map((tpl, i) => (
                <button key={tpl.name} data-testid={`loops-template-${i}`} onClick={() => setForm({ id: null, draft: fromTemplate(tpl) })} style={{ ...btn, textAlign: "left" }}>
                  <div style={{ fontWeight: 600 }}>{t(tpl.name)}</div>
                  <div style={{ color: "var(--fg-2)", fontSize: 12, marginTop: 2 }}>{t(tpl.instruction)}</div>
                </button>
              ))}
            </div>
            <button data-testid="loops-scratch" onClick={() => setForm({ id: null, draft: emptyDraft() })} style={{ ...btn, marginTop: 12 }}>{t("Start from scratch")}</button>
          </div>
        ) : (
          <>
            {loops.map((l) => (
              <LoopRow key={l.id} loop={l} rt={rt[l.id]} now={now} onRun={() => void runNow(l.id)} onToggle={(on) => useLoops.getState().setEnabled(l.id, on)}
                onEdit={() => setForm({ id: l.id, draft: fromLoop(l) })} onDelete={() => useLoops.getState().remove(l.id)} />
            ))}
            <div style={{ padding: "12px 16px" }}><button data-testid="loops-new" onClick={() => setForm({ id: null, draft: emptyDraft() })} style={btn}>{t("New loop")}</button></div>
            <History entries={mine} nameOf={(id) => names.get(id) ?? t("(deleted)")} />
          </>
        )}
      </div>
    </aside>
  );
}
