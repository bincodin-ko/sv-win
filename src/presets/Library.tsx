// B14 S-650: Presets 라이브러리 큰 패널 — 카드 격자 · inspector · 저장 선반 · Deploy(보드) / Save preset(홈) · 닫기·Esc. 모양은 추측.
import { useEffect, useState } from "react";
import { agentsList, defaultAgent, type AgentInfo } from "../agents/api";
import type { BoardStore } from "../board/boards";
import { useArmedPreset } from "./armed";
import { PRESETS } from "./defs";
import { deployPreset, registryOpts, stampSaved, viewCenter } from "./deploy";
import Inspector from "./Inspector";
import PresetCard from "./PresetCard";
import SavedItem from "./SavedItem";
import { summaryOf } from "./ui";
import { useSaved } from "./useSaved";
import { useT } from "../i18n";

const btn: React.CSSProperties = { all: "unset", cursor: "pointer", padding: "6px 16px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-text)", fontWeight: 600, fontSize: 13 };

/** store = 지금 보는 보드(없으면 홈: Save preset) */
export default function Library({ store, onClose }: { store: BoardStore | null; onClose: () => void }) {
  const t = useT();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [dflt, setDflt] = useState("claude");
  const [pick, setPick] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const saved = useSaved((s) => s.list);
  useEffect(() => {
    void useSaved.getState().load();
    void Promise.all([agentsList(), defaultAgent()]).then(([a, d]) => (setAgents(a), setDflt(d)));
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);
  const def = PRESETS.find((p) => p.name === pick) ?? null;
  const select = (name: string) => (setPick(name), setOverrides({}));
  const go = () => {
    if (!def) return;
    if (store) deployPreset(store, def, { center: viewCenter(store), agentOverrides: overrides, defaultAgent: dflt, installed: agents.map((a) => a.id), ...registryOpts(def) });
    else useArmedPreset.getState().arm(def.name); // ponytail: 홈에서는 이름만 무장한다(레인 에이전트 고름은 버려짐). 필요하면 armed 에 overrides 를 더한다
    onClose();
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "grid", placeItems: "center", background: "var(--scrim-50)" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div data-testid="preset-library" role="dialog" aria-label={t("Presets")} style={{ width: "min(980px, 94vw)", height: "min(620px, 90vh)", display: "grid", gridTemplateColumns: "1fr 260px", gridTemplateRows: "auto 1fr auto", background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 14, font: "13px system-ui" }}>
        <div style={{ gridColumn: "1 / 3", display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <b style={{ flex: 1, fontSize: 15 }}>{t("Presets")}</b>
          <button data-testid="preset-close" aria-label={t("Close")} onClick={onClose} style={{ all: "unset", cursor: "pointer", padding: "2px 8px", fontSize: 18 }}>×</button>
        </div>
        <div style={{ overflow: "auto", padding: 16, display: "grid", gap: 16, alignContent: "start" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {PRESETS.map((p) => <PresetCard key={p.id} def={p} selected={p.name === pick} onSelect={() => select(p.name)} />)}
          </div>
          <div data-testid="preset-shelf">
            <div style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 4 }}>{t("Saved on this board")}</div>
            {saved.length === 0 && <div style={{ color: "var(--text-dim)" }}>{t("Nothing saved yet")}</div>}
            {saved.map((l) => (
              <SavedItem key={l.name} name={l.name} hint={summaryOf(l.nodes.filter((n) => n.kind === "console").length, 0)}
                onPick={() => { if (store) stampSaved(store, l, viewCenter(store)); else useArmedPreset.getState().arm(l.name); onClose(); }}
                onDelete={() => void useSaved.getState().remove(l.name)} />
            ))}
          </div>
        </div>
        <div style={{ padding: 16, borderLeft: "1px solid var(--border)", overflow: "auto" }}>
          <Inspector def={def} agents={agents} defaultAgent={dflt} overrides={overrides} onChange={setOverrides} />
        </div>
        <div style={{ gridColumn: "1 / 3", display: "flex", justifyContent: "flex-end", padding: "10px 16px", borderTop: "1px solid var(--border)" }}>
          <button data-testid={store ? "preset-deploy" : "preset-save"} disabled={!def} onClick={go} style={{ ...btn, opacity: def ? 1 : 0.4 }}>{store ? t("Deploy") : t("Save preset")}</button>
        </div>
      </div>
    </div>
  );
}
