import { useLayoutEffect, useRef, useState } from "react";
import type { AgentInfo } from "../agents/api";
import type { Role } from "../commandbar/roles";
import { useEscClose } from "../board/menus/menuKit";
import { useT } from "../i18n";
import { composerTop } from "./composerPos";
import FillAllRow from "./FillAllRow";
import RoleChips from "./RoleChips";
import SlotAgentPicker from "./SlotAgentPicker";
import { MAX_SLOTS, gridLayout, resizeSlots, rolesDefaults, type Slot } from "./slots";

const step: React.CSSProperties = { width: 24, height: 24, border: "1px solid var(--bd)", borderRadius: 6, background: "none", color: "var(--fg-2)", cursor: "pointer" };

const barEl = () => document.querySelector<HTMLElement>('[data-testid="command-bar"]');

// S-521 "Compose group" 팝오버. 값은 열 때마다 새로(S-529)
export default function GroupComposer({ n, at, agents, defaultAgent, onSpawn, onClose }: {
  n: number; at?: { x: number; y: number }; agents: AgentInfo[]; defaultAgent: string;
  onSpawn: (t: { name: string; role: Role; agents: string[] }) => void; onClose: () => void;
}) {
  const t = useT();
  const installed = agents.filter((a) => a.installed).map((a) => a.id);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("general");
  const [slots, setSlots] = useState<Slot[]>(() => resizeSlots([], n, "general", installed, defaultAgent));
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useEscClose(onClose);
  useLayoutEffect(() => { // 화면 안으로: 누른 자리 근처, 없으면 아래 가운데
    const r = ref.current!.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    const left = at ? at.x - r.width / 2 : (W - r.width) / 2, top = at ? at.y - r.height / 2 : 0;
    const barTop = barEl()?.getBoundingClientRect().top;
    setPos({ left: Math.max(8, Math.min(left, W - r.width - 8)), top: !at && barTop !== undefined ? composerTop(barTop, r.height) : Math.max(8, Math.min(at ? top : H - r.height - 80, H - r.height - 8)) });
  }, [at, slots.length]);
  useLayoutEffect(() => {
    const out = (e: PointerEvent) => { const x = e.target as Node; if (!ref.current?.contains(x) && !barEl()?.contains(x)) onClose(); };
    window.addEventListener("pointerdown", out, true);
    return () => window.removeEventListener("pointerdown", out, true);
  }, [onClose]);

  const count = slots.length;
  const spawn = () => onSpawn({ name, role, agents: slots.map((s) => s.agent) });
  const resize = (k: number) => setSlots((s) => resizeSlots(s, k, role, installed, defaultAgent));
  return (
    <div ref={ref} data-testid="group-composer" role="dialog" aria-label={t("Compose group")} onContextMenu={(e) => e.preventDefault()}
      style={{ position: "fixed", ...pos, zIndex: 40, width: 460, display: "flex", flexDirection: "column", gap: 12, padding: 14, background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 12, boxShadow: "0 6px 24px var(--scrim-50)", font: "12px system-ui", color: "var(--fg-2)" }}>
      <input data-testid="composer-name" autoFocus value={name} placeholder={t("Team")} maxLength={24} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.nativeEvent.isComposing) spawn(); }} style={{ padding: "6px 8px", border: "1px solid var(--bd)", borderRadius: 6, background: "var(--accent-ink)", color: "inherit", font: "inherit" }} />
      <RoleChips role={role} onChange={(r) => { setRole(r); setSlots((s) => rolesDefaults(s, r, installed, defaultAgent)); }} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${gridLayout(count).cols}, 1fr)`, gap: 8 }}>
        {slots.map((s, i) => (
          <SlotAgentPicker key={i} agent={s.agent} agents={agents} onChange={(id) => setSlots((all) => all.map((x, j) => (j === i ? { agent: id, touched: true } : x)))} />
        ))}
      </div>
      <FillAllRow agents={agents} onFill={(id) => setSlots((all) => all.map(() => ({ agent: id, touched: true })))} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button data-testid="composer-minus" aria-label={t("Fewer")} style={step} disabled={count <= 1} onClick={() => resize(count - 1)}>−</button>
          <span data-testid="composer-count" style={{ minWidth: 16, textAlign: "center" }}>{count}</span>
          <button data-testid="composer-plus" aria-label={t("More")} style={step} disabled={count >= MAX_SLOTS} onClick={() => resize(count + 1)}>+</button>
        </div>
        <button data-testid="composer-spawn" onClick={spawn}
          style={{ padding: "6px 14px", border: 0, borderRadius: 8, background: "var(--accent)", color: "var(--accent-ink)", font: "600 13px system-ui", cursor: "pointer" }}>{t("Spawn {n}", { n: count })}</button>
      </div>
    </div>
  );
}
